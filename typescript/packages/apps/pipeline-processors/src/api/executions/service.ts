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
import { AccessManagementClient, ConflictError, NotImplementedError, ResourceService, TagService, UnauthorizedError } from '@sif/resource-api-base';
import type { EventPublisher } from '@sif/events';
import { getPipelineErrorKey, getPipelineInputKey, getPipelineOutputKey } from '../../utils/helper.utils.js';
import type { PipelineExecution, PipelineExecutionList, PipelineExecutionRequest, PipelineExecutionUpdateParams, SignedUrlResponse } from './schemas.js';
import type { PipelineExecutionListOptions, PipelineExecutionListPaginationKey, PipelineProcessorsRepository } from './repository.js';
import type { ConnectorUtility } from '../../utils/connectorUtility';
import type { GetLambdaRequestContext, GetSignedUrl } from '../../plugins/module.awilix';
import type { Pipeline, PipelineClient } from '@sif/clients';
import type { PipelineExecutionUtils } from './utils.js';
import type { InlineExecutionService } from './inlineExecution.service.js';
import { PkType } from '../../common/pkUtils.js';
import type { AuroraStatus, PlatformResourceUtility } from '../../utils/platformResource.utility.js';

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
	  private auditVersion: number,
	  private resourceService: ResourceService,
	  private tagService: TagService,
	  private accessManagementClient: AccessManagementClient,
	  private triggerMetricAggregations: boolean,
	  private platformResourceUtility: PlatformResourceUtility
	) {
	}

	public async create(sc: SecurityContext, pipelineId: string, executionParams: PipelineExecutionRequest): Promise<PipelineExecution> {
		this.log.info(`PipelineProcessorService> create> pipelineId: ${pipelineId}, executionParams: ${JSON.stringify(executionParams)}`);

		// authorization role check
		const isAuthorized = this.authChecker.isAuthorized([sc.groupId], sc.groupRoles, atLeastContributor, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not an \`contributor\` of the group in context \`${JSON.stringify(sc.groupId)}`);
		}

		await this.platformResourceUtility.checkPlatformResourceState<AuroraStatus>('aurora-cluster', 'available');

		// check if the pipeline exists
		const pipeline = await this.pipelineClient.get(pipelineId, undefined, this.getLambdaRequestContext(sc));

		const group = await this.accessManagementClient.getGroup(sc.groupId);

		// create pipeline execution object
		const executionId = ulid().toLowerCase();
		const execution: PipelineExecution = {
			actionType: executionParams.actionType,
			createdBy: sc.email,
			createdAt: new Date(Date.now()).toISOString(),
			id: executionId,
			pipelineId,
			pipelineVersion: pipeline.version,
			auditVersion: this.auditVersion,
			triggerMetricAggregations: executionParams.triggerMetricAggregations ?? pipeline?.processorOptions?.triggerMetricAggregations ?? group?.configuration?.pipelineProcessor?.triggerMetricAggregations ?? this.triggerMetricAggregations,
			connectorOverrides: executionParams.connectorOverrides,
			// for other type of resources, the groups field contains the list of security group that can access the resouces
			// so we can query all resources based on a group id (the implementation logic in @sif/resource-api-base module)
			// but for pipeline execution, the group will point to the pipeline to allow us to query executions based on a pipeline id
			groups: [pipelineId],
			groupContextId: sc.groupId,
			status: 'waiting',
			tags: executionParams.tags
		};

		let updatedExecution;
		switch (executionParams.mode) {
			case 'inline':
				updatedExecution = await this.inlineExecutionService.run(sc, pipeline, execution, executionParams.inlineExecutionOptions);
				break;
			case 'job':
				updatedExecution = await this.run(sc, pipeline, execution, { expiration: executionParams.expiration });
				break;
			default:
				throw new NotImplementedError(`Execution mode ${executionParams.mode} is not supported.`);
		}
		await this.tagService.submitGroupSummariesProcess(sc.groupId, PkType.PipelineExecution, execution.tags, {});
		return updatedExecution;
	}

	public async get(securityContext: SecurityContext, id: string): Promise<PipelineExecution | undefined> {
		this.log.info(`PipelineProcessorsService>  get> id:${id}`);

		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId], securityContext.groupRoles, atLeastReader, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller's role should be at least a \`reader\` of the group in context \`${JSON.stringify(securityContext.groupId)}`);
		}

		const pipelineExecution = await this.pipelineProcessorsRepository.get(id);
		this.utils.validatePipelineExecutionAccess(pipelineExecution, securityContext.groupId);

		this.log.info(`PipelineProcessorsService> get> exit> pipelineExecution:${JSON.stringify(pipelineExecution)}`);
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
			throw new ConflictError(`Pipeline ${pipeline.id} does not generate raw output file.`);
		}

		const pipelineExecution = await this.pipelineProcessorsRepository.get(executionId);
		this.utils.validatePipelineExecutionAccess(pipelineExecution, securityContext.groupId);

		const params: GetObjectCommand = new GetObjectCommand({
			Bucket: this.bucketName,
			Key: getPipelineOutputKey(this.bucketPrefix, pipelineId, executionId)
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
		const pipelineExecution = await this.pipelineProcessorsRepository.get(executionId);
		this.utils.validatePipelineExecutionAccess(pipelineExecution, securityContext.groupId);

		const params: GetObjectCommand = new GetObjectCommand({
			Bucket: this.bucketName,
			Key: getPipelineErrorKey(this.bucketPrefix, pipelineId, executionId)
		});
		const url = await this.getSignedUrl(this.s3Client, params, { expiresIn: expiresIn });

		this.log.info(` PipelineProcessorsService > generatePipelineErrorUrl > exit`);
		return { url };
	}

	public async list(securityContext: SecurityContext, pipelineId: string, options: PipelineExecutionListOptions): Promise<[PipelineExecution[], PipelineExecutionListPaginationKey]> {
		this.log.info(`PipelineProcessorsService> list> pipelineId: ${JSON.stringify(pipelineId)}, options: ${options}`);

		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId], securityContext.groupRoles, atLeastReader, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller's role should be at least a \`reader\` of the group in context \`${JSON.stringify(securityContext.groupId)}`);
		}

		// This will throw exception if user does not have access to the pipeline
		const pipeline = await this.pipelineClient.get(pipelineId, undefined, this.getLambdaRequestContext(securityContext));

		let pipelineExecutionList: PipelineExecutionList;

		const executions: PipelineExecution[] = [];
		let executionIds, paginationKey: PipelineExecutionListPaginationKey;

		[executionIds, paginationKey] = await this.resourceService.listIds(pipeline.id, PkType.PipelineExecution, {
			tagFilter: options?.tags,
			pagination: {
				count: options?.count,
				from: {
					paginationToken: options?.exclusiveStart?.paginationToken
				}
			},
			includeParentGroups: false,
			includeChildGroups: false
		});

		executions.push(...(await this.pipelineProcessorsRepository.listByIds(executionIds)));

		this.log.info(`PipelineProcessorsService> list>  pipelineExecutionList: ${JSON.stringify(pipelineExecutionList)}`);
		return [executions, paginationKey];
	}

	public async update(sc: SecurityContext, pipelineId: string, id: string, params: PipelineExecutionUpdateParams): Promise<void> {
		this.log.info(`PipelineProcessorsService>  update> pipelineId:${pipelineId}, id:${id}, toUpdate:${JSON.stringify(params)}`);

		// authorization role check
		const isAuthorized = this.authChecker.isAuthorized([sc.groupId], sc.groupRoles, atLeastContributor, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not an \`contributor\` of the group in context \`${JSON.stringify(sc.groupId)}`);
		}

		const execution = await this.get(sc, id);
		this.utils.validatePipelineExecutionAccess(execution, sc.groupId);

		await this.pipelineProcessorsRepository.create({
			...execution,
			...params,
			updatedBy: sc.email,
			updatedAt: new Date(Date.now()).toISOString()
		});

		await this.eventPublisher.publishTenantEvent({
			resourceType: 'pipelineExecution',
			eventType: 'updated',
			id: execution.id
		});

		this.log.info(`PipelineProcessorsService> update> exit>`);
	}

	private async run(sc: SecurityContext, pipeline: Pipeline, newExecution: PipelineExecution, params: { expiration: number }): Promise<PipelineExecution> {
		this.log.trace(`PipelineProcessorService> runJobMode> pipeline: ${pipeline}, newExecution: ${newExecution}`);

		const { id: pipelineId } = pipeline;
		const { id: executionId } = newExecution;

		const connector = await this.connectorUtility.resolveConnectorFromPipeline(sc, pipeline, 'input');
		this.connectorUtility.validateConnectorParameters(connector, pipeline, newExecution);

		await this.pipelineProcessorsRepository.create(newExecution);
		// publish pipeline execution created event
		await this.eventPublisher.publishTenantEvent({
			resourceType: 'pipelineExecution',
			eventType: 'created',
			id: executionId
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

	private async generatePipelineExecutionInputUrl(securityContext: SecurityContext, pipelineId: string, executionId: string, expiresIn = FIVE_MINUTES, type?: 'raw' | 'transformed'): Promise<string> {
		this.log.info(` PipelineProcessorsService > generatePipelineInputUploadUrl > , pipelineId: ${pipelineId}, executionId: ${executionId}, expiresIn: ${expiresIn}`);

		// This will throw Exception if user does not have access to the pipeline
		const pipeline = await this.pipelineClient.get(pipelineId, undefined, this.getLambdaRequestContext(securityContext));

		const params: PutObjectCommand = new PutObjectCommand({
			Bucket: this.bucketName,
			Key: getPipelineInputKey(this.bucketPrefix, pipeline.id, executionId, type)
		});

		const url = await this.getSignedUrl(this.s3Client, params, { expiresIn });

		this.log.info(` PipelineProcessorsService > generatePipelineUploadUrl > exit`);
		return url;
	}
}

