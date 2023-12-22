/*
 *  Copyright Amazon.com Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import type { BaseLogger } from 'pino';
import { validateHasSome, validateNotEmpty } from '@sif/validators';
import { atLeastReader, GroupPermissions, SecurityContext } from '@sif/authz';
import { InvalidRequestError, UnauthorizedError } from '@sif/resource-api-base';
import type { Pipeline, LambdaRequestContext, PipelineClient } from '@sif/clients';
import type { PipelineExecution } from '../executions/schemas.js';
import type { ActivitiesDownloadStatus, DownloadQueryRequest, PipelineMetadata, QueryRequest, QueryResponse } from './models.js';
import type { ActivitiesRepository } from './repository.js';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import { HOUR_IN_SECONDS, getQueriesDownloadStatusKey, getPipelineMetadata } from '../../utils/helper.utils.js';
import { ulid } from 'ulid';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { GetObjectCommand, ListObjectsCommand, ListObjectsCommandInput, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import type { GetSignedUrl } from '../../plugins/module.awilix.js';
import type { ActivitiesDownloadList } from './schemas.js';
import type { ActivityDownloadTaskResponse } from '../../stepFunction/tasks/model.js';
import type { PipelineProcessorsService } from '../executions/service.js';
import type { AuroraStatus, PlatformResourceUtility } from '../../utils/platformResource.utility.js';
import { AuroraResourceName } from '../../utils/platformResource.utility.js';

dayjs.extend(utc);

export class ActivityService {
	public constructor(private log: BaseLogger,
					   private repo: ActivitiesRepository,
					   private authChecker: GroupPermissions,
					   private pipelineClient: PipelineClient,
					   private pipelineProcessorService: PipelineProcessorsService,
					   private sqsQueueUrl: string,
					   private sqsClient: SQSClient,
					   private s3Client: S3Client,
					   private bucketName: string,
					   private bucketPrefix: string,
					   private getSignedUrl: GetSignedUrl,
					   private platformResourceUtility: PlatformResourceUtility) {
	}

	private validateQueryRequest(sc: SecurityContext, req: QueryRequest) {
		this.log.debug(`ActivityService> validateQueryRequest> req: ${JSON.stringify(req)}`);
		const isAuthorized = this.authChecker.isAuthorized([sc.groupId], sc.groupRoles, atLeastReader, 'any');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not authorized of the group in context \`${JSON.stringify(sc.groupId)}`);
		}

		validateNotEmpty(req.groupId, 'groupId');
		validateHasSome([req.pipelineId, req.executionId], ['pipelineId', 'executionId']);

		// if the user is trying to get history, you can do that for a particular date
		if (req.showHistory) {
			validateNotEmpty(req.date, 'date');
		}
	}

	private async getPipelineMetadata(sc: SecurityContext, req: QueryRequest): Promise<[PipelineMetadata, QueryRequest]> {
		const requestContext: LambdaRequestContext = {
			authorizer: {
				claims: {
					email: '',
					'cognito:groups': `${sc.groupId}|||reader`,
					groupContextId: sc.groupId
				}
			}
		};

		// get the pipeline, so we can figure out what are its outputs
		let pipeline: Pipeline;
		if (req.executionId) {
			// if the filter is for executions, we have to retrieve the pipeline from the execution itself, then get the outputs for a pipeline
			// the version for pipeline is retrieved for from the execution itself
			const execution = await this.getPipelineExecution(req.executionId, sc);
			pipeline = await this.pipelineClient.get(execution.pipelineId, execution.pipelineVersion, requestContext);
			req.pipelineId = pipeline.id;

		} else if (req.pipelineId) {
			// if only the pipelineId filter is specified, then we will retrieve the metadata for the latest pipeline without providing the version
			pipeline = await this.pipelineClient.get(req.pipelineId, undefined, requestContext);
		}

		const pipelineMetadata = getPipelineMetadata(pipeline);
		this.log.debug(`ActivityService> query> pipelineMetadata: ${JSON.stringify(pipelineMetadata)}`);

		// we need to do a check if the showHistory Parameter is set to true, we then need to verify if the transformKeyMap has any keys.
		if (req.showHistory && !req.showAggregate && Object.keys(pipelineMetadata.transformKeyMap).length > 0) {
			// if it does, then we need to validate that user has specified the uniqueKeyAttributes
			validateNotEmpty(req.uniqueKeyAttributes, 'uniqueKeyAttributes');

			// this is done so no changes are required for downstream repository code.
			// we create a new query string parameter called 'uniqueKeyAttributes', this is a required parameter if showHistory=true param is specified
			// since the repository code can handle req.attributes and build out the filters, what we do here is set the req.attributes to equal to req.uniqueKeyAttribute.
			// The other options would be, use the same name "attributes" or change the repository layer code to reference `uniqueKeyAttributes` when building the query filters
			req.attributes = req.uniqueKeyAttributes;
		}

		return [pipelineMetadata, req];
	}

	public async getActivities(sc: SecurityContext, req: QueryRequest): Promise<QueryResponse> {
		this.log.debug(`ActivityService> query> req: ${JSON.stringify(req)}`);
		this.validateQueryRequest(sc, req);
		await this.platformResourceUtility.checkPlatformResourceState<AuroraStatus>(AuroraResourceName, 'available');
		const [pipelineMetadata, transformedRequest] = await this.getPipelineMetadata(sc, req);
		const result = await this.repo.get(transformedRequest, pipelineMetadata);
		this.log.info(`ActivityService> query> exit:`);
		return result;
	}

	private async getPipelineExecution(executionId: string, sc: SecurityContext): Promise<PipelineExecution> {
		this.log.debug(`ActivityService> getPipelineExecution executionId:${executionId}`);
		let execution = await this.pipelineProcessorService.get(sc, executionId);
		this.log.debug(`ActivityService> getPipelineExecution out> execution:${JSON.stringify(execution)}`);
		return execution;
	}

	public async getActivitiesDownload(sc: SecurityContext, id: string, expiresIn = HOUR_IN_SECONDS): Promise<ActivitiesDownloadList | undefined> {
		this.log.debug(`ActivityService> getActivitiesDownload> id: ${JSON.stringify(id)}`);
		const isAuthorized = this.authChecker.isAuthorized([sc.groupId], sc.groupRoles, atLeastReader, 'any');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not authorized of the group in context \`${JSON.stringify(sc.groupId)}`);
		}

		const statusResponse = await this.s3Client.send(new GetObjectCommand({
			Bucket: this.bucketName,
			Key: getQueriesDownloadStatusKey(this.bucketPrefix, id)
		}));

		const activitiesDownloadStatus: ActivitiesDownloadStatus = JSON.parse(await statusResponse.Body.transformToString());

		const results: ActivitiesDownloadList = {
			downloads: []
		};
		switch (activitiesDownloadStatus.state) {
			case 'success':
				const input: ListObjectsCommandInput = {
					Bucket: this.bucketName,
					Prefix: `${this.bucketPrefix}/${id}/`
				};

				const files = await this.s3Client.send(new ListObjectsCommand(input));

				if (files?.Contents) {
					const csvFiles = files.Contents?.filter(c => c.Key.endsWith('.csv'));
					// eslint-disable-next-line @typescript-eslint/no-for-in-array, guard-for-in
					for (const file of csvFiles) {
						const params: GetObjectCommand = new GetObjectCommand({
							Bucket: this.bucketName,
							Key: file.Key
						});
						const url = await this.getSignedUrl(this.s3Client, params, { expiresIn: expiresIn });
						results.downloads.push({ url });
					}
				}
				break;
			case 'failed':
				throw new InvalidRequestError(`Could not create activities download for query ${id}, error: ${activitiesDownloadStatus.errorMessage}`);
			default:
				break;
		}
		return results;
	}

	public async createActivitiesDownload(sc: SecurityContext, req: DownloadQueryRequest): Promise<string> {
		this.log.debug(`ActivityService> createActivitiesDownload> req: ${JSON.stringify(req)}`);
		this.validateQueryRequest(sc, req);
		await this.platformResourceUtility.checkPlatformResourceState<AuroraStatus>(AuroraResourceName, 'available');
		const [pipelineMetadata, transformedRequest] = await this.getPipelineMetadata(sc, req);
		const payload: ActivityDownloadTaskResponse = {
			id: ulid().toLowerCase(),
			type: 'activity',
			state: 'in_progress',
			activityRequest: {
				queryRequest: transformedRequest,
				pipelineMetadata
			}
		};

		await Promise.all([
			this.s3Client.send(new PutObjectCommand({
				Bucket: this.bucketName,
				Key: getQueriesDownloadStatusKey(this.bucketPrefix, payload.id), Body: JSON.stringify({
					state: 'in_progress'
				})
			})),
			this.sqsClient.send(new SendMessageCommand({
				QueueUrl: this.sqsQueueUrl,
				MessageBody: JSON.stringify(payload),
				MessageAttributes: {
					messageType: {
						DataType: 'String',
						StringValue: `ActivitiesDownload`
					}
				}
			}))]);
		this.log.debug(`ActivityService> createActivitiesDownload> exit> id: ${payload.id}`);
		return payload.id;
	}
}
