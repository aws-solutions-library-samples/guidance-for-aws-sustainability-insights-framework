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
import type { GroupPermissions } from '@sif/authz';
import type { MetadataBearer, RequestPresigningArguments } from '@aws-sdk/types';
import type { Client, Command } from '@aws-sdk/smithy-client';
import { ulid } from 'ulid';
import { GetObjectCommand, ListObjectsCommand, ListObjectsCommandInput, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { atLeastContributor, atLeastReader } from '@sif/authz';
import { NotFoundError, UnauthorizedError } from '@sif/resource-api-base';
import { getPipelineAuditKey, getPipelineErrorKey, getPipelineInputKey } from '../../utils/helper.utils.js';
import type { SecurityContext } from '@sif/authz';
import type { PipelineExecutionUpdate, PipelineExecutionList, PipelineExecutionWithMetadata, SignedUrlResponse, UploadSignedUrlResponse, SignedUrlListResponse, ActionType } from './schemas.js';
import type { PipelineProcessorsRepository } from './repository.js';
import type { EventPublisher } from '@sif/events';
import type { PipelineClient, LambdaRequestContext } from '@sif/clients';
import { AuditFilePendingError } from '../../common/errors.js';
import pLimit from 'p-limit';
import dayjs from 'dayjs';

const FIVE_MINUTES = 5 * 60;

export class PipelineProcessorsService {
	private readonly log: FastifyBaseLogger;
	private readonly s3Client: S3Client;
	private readonly authChecker: GroupPermissions;
	private readonly pipelineClient: PipelineClient;
	private readonly pipelineProcessorsRepository: PipelineProcessorsRepository;
	private readonly bucketName: string;
	private readonly eventPublisher: EventPublisher;
	private readonly bucketPrefix: string;
	private readonly auditFileProcessingTimeInMinutes: number;
	private readonly concurrencyLimit: number;

	private readonly getSignedUrl: <InputTypesUnion extends object, InputType extends InputTypesUnion, OutputType extends MetadataBearer = MetadataBearer>(
		client: Client<any, InputTypesUnion, MetadataBearer, any>,
		command: Command<InputType, OutputType, any, InputTypesUnion, MetadataBearer>,
		options?: RequestPresigningArguments
	) => Promise<string>;


	public constructor(
		log: FastifyBaseLogger,
		authChecker: GroupPermissions,
		s3Client: S3Client,
		getSignedUrl: <InputTypesUnion extends object, InputType extends InputTypesUnion, OutputType extends MetadataBearer = MetadataBearer>(
			client: Client<any, InputTypesUnion, MetadataBearer, any>,
			command: Command<InputType, OutputType, any, InputTypesUnion, MetadataBearer>,
			options?: RequestPresigningArguments
		) => Promise<string>,
		pipelineProcessorsRepository: PipelineProcessorsRepository,
		bucketName: string,
		bucketPrefix: string,
		eventPublisher: EventPublisher,
		pipelineClient: PipelineClient,
		concurrencyLimit: number,
		auditFileProcessingTimeInMinutes: number
	) {
		this.concurrencyLimit = concurrencyLimit;
		this.pipelineClient = pipelineClient;
		this.log = log;
		this.s3Client = s3Client;
		this.authChecker = authChecker;
		this.getSignedUrl = getSignedUrl;
		this.bucketName = bucketName;
		this.pipelineProcessorsRepository = pipelineProcessorsRepository;
		this.eventPublisher = eventPublisher;
		this.bucketPrefix = bucketPrefix;
		this.auditFileProcessingTimeInMinutes = auditFileProcessingTimeInMinutes;
	}

	public async get(securityContext: SecurityContext, pipelineId: string, id: string): Promise<PipelineExecutionWithMetadata | undefined> {
		this.log.info(`PipelineProcessorsService>  get> id:${id}`);

		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId], securityContext.groupRoles, atLeastReader, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller's role should be at least a \`reader\` of the group in context \`${JSON.stringify(securityContext.groupId)}`);
		}

		const pipelineExecution = await this.pipelineProcessorsRepository.get(pipelineId, id);

		if (!pipelineExecution) {
			throw new NotFoundError(`Pipeline Execution ${id} cannot be found`);
		}

		this.log.info(`PipelineProcessorsService> get> exit> pipelineExecution:${JSON.stringify(pipelineExecution)}`);
		return pipelineExecution;
	}

	public async getById(securityContext: SecurityContext, executionId: string): Promise<PipelineExecutionWithMetadata> {
		this.log.info(`PipelineProcessorsService>  getById> id:${executionId}`);

		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId], securityContext.groupRoles, atLeastReader, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller's role should be at least a \`reader\` of the group in context \`${JSON.stringify(securityContext.groupId)}`);
		}

		const pipelineExecution = await this.pipelineProcessorsRepository.getById(executionId);

		if (!pipelineExecution) {
			throw new NotFoundError(`Pipeline Execution ${executionId} cannot be found`);
		}

		this.log.info(`PipelineProcessorsService> getById> exit> pipelineExecution:${JSON.stringify(pipelineExecution)}`);
		return pipelineExecution;
	}

	public async update(securityContext: SecurityContext, pipelineId: string, id: string, toUpdate: PipelineExecutionUpdate): Promise<void> {
		this.log.info(`PipelineProcessorsService>  update> pipelineId:${pipelineId}, id:${id}, toUpdate:${toUpdate}`);

		const existing = await this.get(securityContext, pipelineId, id);

		// if status is no longer in waiting that means execution has started
		if (toUpdate.status !== 'waiting') {
			delete existing['ttl'];
		}

		await this.pipelineProcessorsRepository.put({
			...existing,
			...toUpdate,
			updatedBy: securityContext.email,
			updatedAt: new Date(Date.now()).toISOString(),
		});

		this.log.info(`PipelineProcessorsService> update> exit>`);
	}

	public async list(securityContext: SecurityContext, pipelineId: string, fromId?: string, count?: number): Promise<PipelineExecutionList> {
		this.log.info(`PipelineProcessorsService> list> pipelineId: ${JSON.stringify(pipelineId)}, count: ${count}, fromId: ${fromId}`);

		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId], securityContext.groupRoles, atLeastReader, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller's role should be at least a \`reader\` of the group in context \`${JSON.stringify(securityContext.groupId)}`);
		}

		let pipelineExecutionList: PipelineExecutionList;

		const [pipelineExecutions, paginationKey] = await this.pipelineProcessorsRepository.list(pipelineId, fromId ? { id: fromId } : undefined, count);

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

	public async generatePipelineAuditUrl(securityContext: SecurityContext, pipelineId: string, executionId: string, expiresIn = FIVE_MINUTES): Promise<SignedUrlListResponse> {
		this.log.info(` > generatePipelineAuditUrl > pipelineId: ${pipelineId}, executionId: ${executionId} `);
		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId], securityContext.groupRoles, atLeastReader, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not an \`reader\` of the group in context \`${JSON.stringify(securityContext.groupId)}`);
		}

		// check to see if pipeline execution exists (will throw NotFoundError if not)
		const { status, updatedAt } = await this.pipelineProcessorsRepository.get(pipelineId, executionId);

		if (!['success', 'failed'].includes(status)) {
			throw new AuditFilePendingError(`pipeline execution is not finished yet.`);
		}

		const listObjectParams: ListObjectsCommandInput = {
			Bucket: this.bucketName,
			Prefix: getPipelineAuditKey(this.bucketPrefix, pipelineId, executionId),
		};

		const results = await this.s3Client.send(new ListObjectsCommand(listObjectParams));

		if (!results.Contents || results.Contents.length < 1 || (dayjs(Date.now()).diff(dayjs(updatedAt), 'minutes') < this.auditFileProcessingTimeInMinutes)) {
			throw new AuditFilePendingError(`audit files are still being processed.`);
		}

		const limit = pLimit(this.concurrencyLimit);

		const getSignedUrlFutures = results.Contents.map((o) => {
			return limit(async () => {
				const params: GetObjectCommand = new GetObjectCommand({
					Bucket: this.bucketName,
					Key: o.Key
				});
				const signedUrl = await this.getSignedUrl(this.s3Client, params, { expiresIn: expiresIn });
				return signedUrl;
			});
		});

		const signedUrlList = (await Promise.all(getSignedUrlFutures)).flat();

		this.log.info(` > generatePipelineAuditUrl > exit`);
		return { urls: signedUrlList };
	}

	public async generatePipelineErrorUrl(securityContext: SecurityContext, pipelineId: string, executionId: string, expiresIn = FIVE_MINUTES): Promise<SignedUrlResponse> {
		this.log.info(` > generatePipelineErrorUrl > pipelineId: ${pipelineId}, executionId: ${executionId} `);
		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId], securityContext.groupRoles, atLeastContributor, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not an \`contributor\` of the group in context \`${JSON.stringify(securityContext.groupId)}`);
		}

		// check to see if pipeline execution exists (will throw NotFoundError if not)
		await this.pipelineProcessorsRepository.get(pipelineId, executionId);

		const params: GetObjectCommand = new GetObjectCommand({
			Bucket: this.bucketName,
			Key: getPipelineErrorKey(this.bucketPrefix, pipelineId, executionId),
		});
		const signedUrl = await this.getSignedUrl(this.s3Client, params, { expiresIn: expiresIn });

		this.log.info(` > generatePipelineErrorUrl > exit`);
		return { url: signedUrl };
	}

	public async generatePipelineExecutionInputUrl(securityContext: SecurityContext, pipelineId: string, expiresIn = FIVE_MINUTES, actionType?: ActionType): Promise<UploadSignedUrlResponse> {
		this.log.info(` > generatePipelineUploadUrl > securityContext: ${JSON.stringify(securityContext)}, pipelineId: ${pipelineId}`);

		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId], securityContext.groupRoles, atLeastContributor, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not an \`contributor\` of the group in context \`${JSON.stringify(securityContext.groupId)}`);
		}

		const requestContext: LambdaRequestContext = {
			authorizer: {
				claims: {
					email: securityContext.email,
					'cognito:groups': `${securityContext.groupId}|||reader`,
					groupContextId: securityContext.groupId,
				},
			},
		};

		const existingPipeline = await this.pipelineClient.get(pipelineId, undefined, requestContext);

		if (!existingPipeline) {
			throw new NotFoundError(`pipeline ${pipelineId} not found`);
		}

		// ensure that execution id is always lower case
		const executionId = ulid().toLowerCase();

		const params: PutObjectCommand = new PutObjectCommand({
			Bucket: this.bucketName,
			Key: getPipelineInputKey(this.bucketPrefix, pipelineId, executionId),
		});

		const signedUrl = await this.getSignedUrl(this.s3Client, params, { expiresIn });

		const secondsSinceEpoch = Math.round(Date.now() / 1000);
		const expirationTime = secondsSinceEpoch + expiresIn;

		await this.pipelineProcessorsRepository.put({
			pipelineId,
			id: executionId,
			pipelineVersion: existingPipeline.version,
			createdBy: securityContext.email,
			createdAt: new Date(Date.now()).toISOString(),
			groupContextId: securityContext.groupId,
			actionType: actionType,
			status: 'waiting',
			// If no file is uploaded against this execution resource, the data will be removed automatically by DynamoDB
			ttl: expirationTime,
		});

		await this.eventPublisher.publishEvent({
			resourceType: 'pipelineExecution',
			eventType: 'created',
			id: executionId,
		});

		this.log.info(` > generatePipelineUploadUrl > exit`);
		return { url: signedUrl, id: executionId, pipelineId };
	}
}
