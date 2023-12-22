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
import type { QueryRequest, IMetricsRepository, DownloadQueryRequest, MetricsDownloadStatus } from './models.js';
import { validateHasSome, validateNotEmpty } from '@sif/validators';
import { atLeastReader, GroupPermissions, SecurityContext } from '@sif/authz';
import { NotFoundError, UnauthorizedError, InvalidRequestError } from '@sif/resource-api-base';
import type { Metric, MetricsDownloadList } from './schemas.js';
import type { MetricClient, Metric as MetricResource } from '@sif/clients';
import { GetObjectCommand, ListObjectsCommand, ListObjectsCommandInput, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { HOUR_IN_SECONDS, getQueriesDownloadStatusKey } from '../../utils/helper.utils.js';
import { ulid } from 'ulid';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import type { GetSignedUrl } from '../../plugins/module.awilix.js';
import type { ActivityDownloadTaskResponse } from '../../stepFunction/tasks/model.js';
import type { PlatformResourceUtility } from '../../utils/platformResource.utility.js';

export class MetricsService {

	public constructor(private log: BaseLogger, private repo: IMetricsRepository,
					   private authChecker: GroupPermissions, private metricClient: MetricClient, private bucketName: string,
					   private bucketPrefix: string, private s3Client: S3Client, private getSignedUrl: GetSignedUrl, private sqsClient: SQSClient, private sqsQueueUrl: string, private platformResourceUtility: PlatformResourceUtility) {
	}


	private async validateQueryRequest(sc: SecurityContext, req: QueryRequest, metric: MetricResource) {
		this.log.debug(`MetricsService> validateQueryRequest> req: ${JSON.stringify(req)}`);
		const isAuthorized = this.authChecker.isAuthorized([sc.groupId], sc.groupRoles, atLeastReader, 'any');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not authorized of the group in context \`${JSON.stringify(sc.groupId)}`);
		}

		validateNotEmpty(req.groupId, 'groupId');
		validateNotEmpty(req.name, 'name');
		validateHasSome([req.dateFrom, req.dateTo], ['dateFrom', 'dateTo']);

		if (metric === undefined) {
			throw new NotFoundError(`Metric with name '${req.name}' not found`);
		}
		this.log.debug(`MetricsService> validateQueryRequest> exit>`);
	}

	public async list(sc: SecurityContext, req: QueryRequest): Promise<Metric[]> {
		this.log.info(`MetricsService> list> req: ${JSON.stringify(req)}`);
		await this.platformResourceUtility.checkPlatformResourceState('aurora-cluster', 'available');
		const metric: MetricResource = await this.metricClient.getByName(req.name, req.version, {
			authorizer: {
				claims: {
					email: '',
					'cognito:groups': `${sc.groupId}|||reader`,
					groupContextId: sc.groupId
				}
			}
		});

		await this.validateQueryRequest(sc, req, metric);

		let result: Metric[];
		if (req.members) {
			result = await this.repo.listMembersMetrics(metric, req.groupId, req.timeUnit, { from: req.dateFrom, to: req.dateTo }, req.version) as Metric[];
		} else {
			result = await this.repo.listCollectionMetrics(metric, req.groupId, req.timeUnit, { from: req.dateFrom, to: req.dateTo }, req.version) as Metric[];
		}

		this.log.info(`MetricsService> list> exit:`);
		return result;
	}

	public async createMetricsDownload(sc: SecurityContext, req: DownloadQueryRequest): Promise<string> {
		this.log.debug(`MetricsService> createMetricsDownload> req: ${JSON.stringify(req)}`);
		await this.platformResourceUtility.checkPlatformResourceState('aurora-cluster', 'available');
		const metric: MetricResource = await this.metricClient.getByName(req.name, req.version, {
			authorizer: {
				claims: {
					email: '',
					'cognito:groups': `${sc.groupId}|||reader`,
					groupContextId: sc.groupId
				}
			}
		});

		await this.validateQueryRequest(sc, req, metric);

		const payload: ActivityDownloadTaskResponse = {
			id: ulid().toLowerCase(),
			type: 'metric',
			state: 'in_progress',
			metricRequest: {
				queryRequest: req,
				metric
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
		this.log.debug(`ActivityService> createMetricsDownload> exit> id: ${payload.id}`);
		return payload.id;
	}

	public async getMetricsDownload(sc: SecurityContext, id: string, expiresIn = HOUR_IN_SECONDS): Promise<MetricsDownloadList | undefined> {
		this.log.debug(`MetricsService> getMetricsDownload> id: ${JSON.stringify(id)}`);

		const isAuthorized = this.authChecker.isAuthorized([sc.groupId], sc.groupRoles, atLeastReader, 'any');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not authorized of the group in context \`${JSON.stringify(sc.groupId)}`);
		}

		const statusResponse = await this.s3Client.send(new GetObjectCommand({
			Bucket: this.bucketName,
			Key: getQueriesDownloadStatusKey(this.bucketPrefix, id)
		}));

		const metricsDownloadStatus: MetricsDownloadStatus = JSON.parse(await statusResponse.Body.transformToString());

		const results: MetricsDownloadList = {
			downloads: []
		};
		switch (metricsDownloadStatus.state) {
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
				throw new InvalidRequestError(`Could not create metrics download for query ${id}, error: ${metricsDownloadStatus.errorMessage}`);
			default:
				break;
		}
		return results;
	}
}
