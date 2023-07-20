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

import type { FastifyBaseLogger } from 'fastify';
import { ulid } from 'ulid';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { atLeastContributor, atLeastReader, GroupPermissions, SecurityContext } from '@sif/authz';
import { InvalidRequestError, NotImplementedError, UnauthorizedError } from '@sif/resource-api-base';
import type { EventPublisher } from '@sif/events';
import { getPipelineErrorKey, getPipelineInputKey, getPipelineOutputKey } from '../../utils/helper.utils.js';
import type { PipelineExecution, PipelineExecutionList, PipelineExecutionRequest, PipelineExecutionUpdateParams, SignedUrlResponse } from './schemas.js';
import type { PipelineProcessorsRepository } from './repository.js';
import type { ConnectorUtility } from '../../utils/connectorUtility';
import type { GetLambdaRequestContext, GetSignedUrl } from '../../plugins/module.awilix';
import type { Pipeline, PipelineClient } from '@sif/clients';
import type { PipelineExecutionUtils } from './utils.js';
import type { InlineExecutionService } from './inlineExecution.service.js';

const FIVE_MINUTES = 5 * 60;

export class PipelineProcessorsService {
	public constructor(
		private log: FastifyBaseLogger,
		private authChecker: GroupPermissions,
		private s3Client: S3Client,
		private getSignedUrl: GetSignedUrl,
		private pipelineProcessorsRepository: PipelineProcessorsRepository,
		private bucketName: string,
		private bucketPrefix: string,
		private eventPublisher: EventPublisher,
		private pipelineClient: PipelineClient,
		private connectorUtility: ConnectorUtility,
		private getLambdaRequestContext: GetLambdaRequestContext,
		private utils: PipelineExecutionUtils,
		private inlineExecutionService: InlineExecutionService,
		private auditVersion: number
	) {
	}

	private async run(sc: SecurityContext, pipeline: Pipeline, newExecution: PipelineExecution, params: { expiration: number }): Promise<PipelineExecution> {
		this.log.trace(`PipelineProcessorService> runJobMode> pipeline: ${pipeline}, newExecution: ${newExecution}`);

		const { id: pipelineId } = pipeline;
		const { id: executionId } = newExecution;

		const connector = await this.connectorUtility.resolveConnectorFromPipeline(sc, pipeline);
		await this.connectorUtility.validateConnectorParameters(connector, pipeline, newExecution);

		await this.pipelineProcessorsRepository.put(newExecution);
		// publish pipeline execution created event
		await this.eventPublisher.publishTenantEvent({
			resourceType: 'pipelineExecution',
			eventType: 'created',
			id: executionId,
		});

		// let's add the rawInputUploadUrl to the execution response
		if (connector.requiresFileUpload) {
			newExecution.inputUploadUrl = await this.generatePipelineExecutionInputUrl(sc, pipelineId, executionId, params.expiration, 'raw');
		} else {
			// since the connector doesn't require a file to be uploaded, we will fire the connector integration event
			await this.connectorUtility.publishConnectorIntegrationEvent(pipeline, newExecution, connector, sc);
		}
		this.log.trace(`PipelineProcessorService> runJobMode> newExecution: ${newExecution}`);
		return newExecution;
	}

	public async create(sc: SecurityContext, pipelineId: string, executionParams: PipelineExecutionRequest): Promise<PipelineExecution> {
		this.log.info(`PipelineProcessorService> create> pipelineId: ${pipelineId}, executionParams: ${JSON.stringify(executionParams)}`);

		// authorization role check
		const isAuthorized = this.authChecker.isAuthorized([sc.groupId], sc.groupRoles, atLeastContributor, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not an \`contributor\` of the group in context \`${JSON.stringify(sc.groupId)}`);
		}

		// check if the pipeline exists
		const pipeline = await this.pipelineClient.get(pipelineId, undefined, this.getLambdaRequestContext(sc));

		// create pipeline execution object
		// ensure that execution id is always lower case
		const executionId = ulid().toLowerCase();
		const execution: PipelineExecution = {
			actionType: executionParams.actionType,
			createdBy: sc.email,
			createdAt: new Date(Date.now()).toISOString(),
			id: executionId,
			pipelineId,
			pipelineVersion: pipeline.version,
			auditVersion: this.auditVersion,
			connectorOverrides: executionParams.connectorOverrides,
			groupContextId: sc.groupId,
			status: 'waiting',
			// If no file is uploaded against this execution resource, the data will be removed automatically by DynamoDB
			// TODO: Ticket(349) need to rethink the ttl part here, does the user need to know there is a ttl on this ? if this is being removed by dynamodb, we might have to consume the stream and update the status of a an expired
			// TODO: execution to show its failed with a message that "expired because no file uploaded etc"
			// ttl: expirationTime,
		};

		let updatedExecution;
		switch (executionParams.mode) {
			case 'inline' :
				updatedExecution = await this.inlineExecutionService.run(sc, pipeline, execution, executionParams.inlineExecutionOptions);
				break;
			case 'job':
				updatedExecution = await this.run(sc, pipeline, execution, { expiration: executionParams.expiration });
				break;
			default:
				throw new NotImplementedError(`Execution mode ${executionParams.mode} is not supported.`);
		}

		return updatedExecution;
	}

	public async get(securityContext: SecurityContext, pipelineId: string, id: string): Promise<PipelineExecution | undefined> {
		this.log.info(`PipelineProcessorsService>  get> id:${id}`);

		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId], securityContext.groupRoles, atLeastReader, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller's role should be at least a \`reader\` of the group in context \`${JSON.stringify(securityContext.groupId)}`);
		}

		const pipelineExecution = await this.pipelineProcessorsRepository.get(pipelineId, id);
		this.utils.validatePipelineExecutionAccess([pipelineExecution.groupContextId], securityContext.groupId, pipelineExecution.id);

		this.log.info(`PipelineProcessorsService> get> exit> pipelineExecution:${JSON.stringify(pipelineExecution)}`);
		return pipelineExecution;
	}

	public async getById(securityContext: SecurityContext, executionId: string): Promise<PipelineExecution> {
		this.log.info(`PipelineProcessorService>  getById> id:${executionId}`);

		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId], securityContext.groupRoles, atLeastReader, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller's role should be at least a \`reader\` of the group in context \`${JSON.stringify(securityContext.groupId)}`);
		}

		const pipelineExecution = await this.pipelineProcessorsRepository.getById(executionId);
		this.utils.validatePipelineExecutionAccess([pipelineExecution.groupContextId], securityContext.groupId, pipelineExecution.id);

		this.log.info(`PipelineProcessorsService> getById> exit> pipelineExecution:${JSON.stringify(pipelineExecution)}`);
		return pipelineExecution;
	}

	public async generatePipelineOutputUrl(securityContext: SecurityContext, pipelineId: string, executionId: string, expiresIn = FIVE_MINUTES): Promise<SignedUrlResponse> {
		this.log.info(` > generatePipelineOutputUrl > pipelineId: ${pipelineId}, executionId: ${executionId} `);
		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId], securityContext.groupRoles, atLeastContributor, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not an \`contributor\` of the group in context \`${JSON.stringify(securityContext.groupId)}`);
		}

		const pipeline = await this.pipelineClient.get(pipelineId, undefined, this.getLambdaRequestContext(securityContext));
		if (pipeline.type === 'activities') {
			throw new InvalidRequestError(`Pipeline ${pipeline.id} does not generate raw output file.`);
		}

		// check to see if pipeline execution exists (will throw NotFoundError if not)
		const pipelineExecution = await this.pipelineProcessorsRepository.get(pipelineId, executionId);
		this.utils.validatePipelineExecutionAccess([pipelineExecution.groupContextId], securityContext.groupId, pipelineExecution.id);

		const params: GetObjectCommand = new GetObjectCommand({
			Bucket: this.bucketName,
			Key: getPipelineOutputKey(this.bucketPrefix, pipelineId, executionId),
		});
		const signedUrl = await this.getSignedUrl(this.s3Client, params, { expiresIn: expiresIn });

		this.log.info(` > generatePipelineOutputUrl > exit`);
		return { url: signedUrl };
	}

	public async generatePipelineErrorUrl(securityContext: SecurityContext, pipelineId: string, executionId: string, expiresIn = FIVE_MINUTES): Promise<SignedUrlResponse> {
		this.log.info(` PipelineProcessorsService > generatePipelineErrorUrl > pipelineId: ${pipelineId}, executionId: ${executionId} `);
		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId], securityContext.groupRoles, atLeastContributor, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not an \`contributor\` of the group in context \`${JSON.stringify(securityContext.groupId)}`);
		}

		// check to see if pipeline execution exists (will throw NotFoundError if not)
		const pipelineExecution = await this.pipelineProcessorsRepository.get(pipelineId, executionId);
		this.utils.validatePipelineExecutionAccess([pipelineExecution.groupContextId], securityContext.groupId, pipelineExecution.id);

		const params: GetObjectCommand = new GetObjectCommand({
			Bucket: this.bucketName,
			Key: getPipelineErrorKey(this.bucketPrefix, pipelineId, executionId),
		});
		const url = await this.getSignedUrl(this.s3Client, params, { expiresIn: expiresIn });

		this.log.info(` PipelineProcessorsService > generatePipelineErrorUrl > exit`);
		return { url };
	}

	private async generatePipelineExecutionInputUrl(securityContext: SecurityContext, pipelineId: string, executionId: string, expiresIn = FIVE_MINUTES, type?: 'raw' | 'transformed'): Promise<string> {
		this.log.info(` PipelineProcessorsService > generatePipelineInputUploadUrl > , pipelineId: ${pipelineId}, executionId: ${executionId}, expiresIn: ${expiresIn}`);

		// This will throw Exception if user does not have access to the pipeline
		const pipeline = await this.pipelineClient.get(pipelineId, undefined, this.getLambdaRequestContext(securityContext));

		const params: PutObjectCommand = new PutObjectCommand({
			Bucket: this.bucketName,
			Key: getPipelineInputKey(this.bucketPrefix, pipeline.id, executionId, type),
		});

		const url = await this.getSignedUrl(this.s3Client, params, { expiresIn });

		this.log.info(` PipelineProcessorsService > generatePipelineUploadUrl > exit`);
		return url;
	}

	public async list(securityContext: SecurityContext, pipelineId: string, fromId?: string, count?: number): Promise<PipelineExecutionList> {
		this.log.info(`PipelineProcessorsService> list> pipelineId: ${JSON.stringify(pipelineId)}, count: ${count}, fromId: ${fromId}`);

		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId], securityContext.groupRoles, atLeastReader, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller's role should be at least a \`reader\` of the group in context \`${JSON.stringify(securityContext.groupId)}`);
		}

		// This will throw exception if user does not have access to the pipeline
		const pipeline = await this.pipelineClient.get(pipelineId, undefined, this.getLambdaRequestContext(securityContext));

		let pipelineExecutionList: PipelineExecutionList;

		const [pipelineExecutions, paginationKey] = await this.pipelineProcessorsRepository.list(pipeline.id, fromId ? { id: fromId } : undefined, count);

		pipelineExecutionList = {
			executions: pipelineExecutions,
		};

		if (paginationKey) {
			pipelineExecutionList.pagination = {
				lastEvaluated: {
					executionId: paginationKey?.id,
				},
			};
		}
		this.log.info(`PipelineProcessorsService> list>  pipelineExecutionList: ${JSON.stringify(pipelineExecutionList)}`);
		return pipelineExecutionList;
	}

	public async update(sc: SecurityContext, pipelineId: string, id: string, params: PipelineExecutionUpdateParams): Promise<void> {
		this.log.info(`PipelineProcessorsService>  update> pipelineId:${pipelineId}, id:${id}, toUpdate:${params}`);

		// authorization role check
		const isAuthorized = this.authChecker.isAuthorized([sc.groupId], sc.groupRoles, atLeastContributor, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not an \`contributor\` of the group in context \`${JSON.stringify(sc.groupId)}`);
		}

		const execution = await this.get(sc, pipelineId, id);

		this.utils.validatePipelineExecutionAccess([execution.groupContextId], sc.groupId, id);

		await this.pipelineProcessorsRepository.put({
			...execution,
			...params,
			updatedBy: sc.email,
			updatedAt: new Date(Date.now()).toISOString(),
		});

		await this.eventPublisher.publishTenantEvent({
			resourceType: 'pipelineExecution',
			eventType: 'updated',
			id: execution.id
		});

		this.log.info(`PipelineProcessorsService> update> exit>`);
	}
}

