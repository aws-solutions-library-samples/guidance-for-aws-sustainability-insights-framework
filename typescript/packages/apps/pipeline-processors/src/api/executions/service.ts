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
import { NotImplementedError, UnauthorizedError } from '@sif/resource-api-base';
import type { EventPublisher } from '@sif/events';
import { getPipelineErrorKey, getPipelineInputKey } from '../../utils/helper.utils.js';
import type { InlineExecutionOutputs, PipelineExecution, PipelineExecutionList, PipelineExecutionRequest, PipelineExecutionUpdateParams, SignedUrlResponse } from './schemas.js';
import type { PipelineProcessorsRepository } from './repository.js';
import type { ConnectorUtility } from '../../utils/connectorUtility';
import type { GetLambdaRequestContext, GetSignedUrl } from '../../plugins/module.awilix';
import type { CalculatorClient, CalculatorInlineTransformResponse, CalculatorRequest, Pipeline, PipelineClient, Transform, Transformer } from '@sif/clients';
import { validateNotEmpty } from '@sif/validators';
import dayjs from 'dayjs';
import type { AggregationTaskEvent } from '../../stepFunction/tasks/model.js';
import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';

const FIVE_MINUTES = 5 * 60;

export class PipelineProcessorsService {
	private readonly log: FastifyBaseLogger;
	private readonly s3Client: S3Client;
	private readonly authChecker: GroupPermissions;
	private readonly pipelineClient: PipelineClient;
	private readonly connectorUtility: ConnectorUtility;
	private readonly pipelineProcessorsRepository: PipelineProcessorsRepository;
	private readonly bucketName: string;
	private readonly eventPublisher: EventPublisher;
	private readonly bucketPrefix: string;
	private readonly getLambdaRequestContext: GetLambdaRequestContext;
	private readonly getSignedUrl: GetSignedUrl;
	private readonly calculatorClient: CalculatorClient;
	private readonly sfnClient: SFNClient;
	private readonly inlineStateMachineArn: string;

	public constructor(
		log: FastifyBaseLogger,
		authChecker: GroupPermissions,
		s3Client: S3Client,
		getSignedUrl: GetSignedUrl,
		pipelineProcessorsRepository: PipelineProcessorsRepository,
		bucketName: string,
		bucketPrefix: string,
		eventPublisher: EventPublisher,
		pipelineClient: PipelineClient,
		connectorUtility: ConnectorUtility,
		getLambdaRequestContext: GetLambdaRequestContext,
		calculatorClient: CalculatorClient,
		sfnClient: SFNClient,
		inlineStateMachineArn: string
	) {
		this.pipelineClient = pipelineClient;
		this.log = log;
		this.s3Client = s3Client;
		this.authChecker = authChecker;
		this.getSignedUrl = getSignedUrl;
		this.bucketName = bucketName;
		this.pipelineProcessorsRepository = pipelineProcessorsRepository;
		this.eventPublisher = eventPublisher;
		this.bucketPrefix = bucketPrefix;
		this.connectorUtility = connectorUtility;
		this.getLambdaRequestContext = getLambdaRequestContext;
		this.calculatorClient = calculatorClient;
		this.sfnClient = sfnClient;
		this.inlineStateMachineArn = inlineStateMachineArn;
	}

	private validatePipelineExecutionAccess(resourceGroups: string[], groupContextId, executionId: string) {
		this.log.trace(`PipelineProcessorsService>  validatePipelineExecutionAccess> resourceGroups:${resourceGroups}, groupContextId: ${groupContextId}, executionId: ${executionId}`);
		const isAllowed = this.authChecker.matchGroup(resourceGroups, groupContextId);
		if (!isAllowed) {
			throw new UnauthorizedError(`The caller does not have access to the group(s) that pipeline execution '${executionId}' is part of.`);
		}
		this.log.trace(`PipelineProcessorsService>  validatePipelineExecutionAccess> exit> isAllowed:${isAllowed}`);
	}

	private async runJobMode(sc: SecurityContext, pipeline: Pipeline, newExecution: PipelineExecution, params: { expiration: number }): Promise<PipelineExecution> {
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

	private async triggerAggregationStateMachine(groupContextId: string, pipelineId: string, pipelineExecutionId: string, transformer: Transformer) {
		this.log.trace(`PipelineProcessorService> triggerAggregationStateMachine> groupContextId: ${groupContextId}, pipelineId: ${pipelineId}, pipelineExecutionId: ${pipelineExecutionId}, transformer: ${transformer}`);

		const aggregationTaskEvent: AggregationTaskEvent[] = [{
			pipelineId,
			transformer,
			groupContextId,
			pipelineExecutionId,
		}];

		const executionCommandResponse = await this.sfnClient.send(
			new StartExecutionCommand({
				stateMachineArn: this.inlineStateMachineArn,
				input: JSON.stringify(aggregationTaskEvent),
			})
		);

		this.log.trace(`PipelineProcessorService> triggerAggregationStateMachine> exit> executionCommandResponse: ${executionCommandResponse}`);
	}

	private assembleCalculatorInlineResponse(response: CalculatorInlineTransformResponse, transforms: Transform[]): InlineExecutionOutputs {
		this.log.trace(`PipelineProcessorService> assembleCalculatorInlineResponse> response: ${response}, transforms: ${JSON.stringify(transforms)}`);

		// we need to figure which output field is timestamp, so we can format it as ISO string
		const timestampFields = transforms
			.filter(o => o?.outputs?.[0].type === 'timestamp' && o?.outputs?.[0].key !== undefined)
			.map(o => o.outputs[0].key);

		const outputs = {
			errors: response.errors.length === 0 ? undefined : response.errors,
			outputs: response.data.length === 0 ? undefined : response.data
				// data is array of JSON string
				.map(d => JSON.parse(d))
				// properly format the timestamp field to ISO string
				.map(d => {
					for (const key in d) {
						if (timestampFields.includes(key) && dayjs.utc(d[key]).isValid()) {
							d[key] = dayjs.utc(d[key]).toISOString();
						}
					}
					return d;
				})
		};

		this.log.trace(`PipelineProcessorService> assembleCalculatorInlineResponse> outputs: ${outputs}`);
		return outputs;
	}

	private async runInlineMode(sc: SecurityContext, pipeline: Pipeline, newExecution: PipelineExecution, options: { inputs: unknown[] }): Promise<PipelineExecution> {
		this.log.trace(`PipelineProcessorService> runInlineMode> pipelineId: ${pipeline}, newExecution: ${newExecution}`);

		const { id: pipelineId, transformer } = pipeline;
		const { id: executionId } = newExecution;
		const { groupId: groupContextId, email } = sc;

		validateNotEmpty(options.inputs, 'inputs');

		// create the initial pipeline execution in waiting state
		await this.pipelineProcessorsRepository.put(newExecution);

		const calculatorRequest: CalculatorRequest = {
			pipelineId,
			executionId,
			groupContextId,
			actionType: 'create',
			username: email,
			sourceData: options.inputs.map((d) => JSON.stringify(d)),
			parameters: transformer.parameters,
			transforms: transformer.transforms,
			dryRun: false
		};

		try {
			const calculatorResponse = await this.calculatorClient.process(calculatorRequest) as CalculatorInlineTransformResponse;
			// store the error using the appropriate error object key (similar with job mode)
			if (calculatorResponse.errors.length > 0) {
				await this.s3Client.send(
					new PutObjectCommand({
						Body: calculatorResponse.errors.join('\r\n'),
						Bucket: this.bucketName,
						Key: getPipelineErrorKey(this.bucketPrefix, pipelineId, executionId),
					})
				);
			}
			// set the execution status based on errors
			newExecution.status = calculatorResponse.errors.length > 0 ? 'failed' : 'success';
			// set the execution outputs from the calculator response
			newExecution.inlineExecutionOutputs = this.assembleCalculatorInlineResponse(calculatorResponse, transformer.transforms);
			// Trigger pipeline/metric aggregation state machine
			await this.triggerAggregationStateMachine(groupContextId, pipelineId, executionId, transformer);
		} catch (Exception) {
			this.log.error(`PipelineProcessorService> runInlineMode> error> Exception: ${Exception}`);
			newExecution.status = 'failed';
			newExecution.inlineExecutionOutputs = {
				errors: [Exception]
			};
		} finally {
			// we will not store the inlineExecutionOutputs because DynamoDB limit issue
			const { inlineExecutionOutputs, ...executionWithoutInlineExecutionOutputs } = newExecution;
			// update the pipeline execution status
			await this.pipelineProcessorsRepository.put(executionWithoutInlineExecutionOutputs);
		}

		this.log.trace(`PipelineProcessorService> runInlineMode> exit> newExecution: ${newExecution}`);
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
				updatedExecution = await this.runInlineMode(sc, pipeline, execution, executionParams.inlineExecutionOptions);
				break;
			case 'job':
				updatedExecution = await this.runJobMode(sc, pipeline, execution, { expiration: executionParams.expiration });
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
		await this.validatePipelineExecutionAccess([pipelineExecution.groupContextId], securityContext.groupId, pipelineExecution.id);

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
		await this.validatePipelineExecutionAccess([pipelineExecution.groupContextId], securityContext.groupId, pipelineExecution.id);

		this.log.info(`PipelineProcessorsService> getById> exit> pipelineExecution:${JSON.stringify(pipelineExecution)}`);
		return pipelineExecution;
	}

	public async generatePipelineErrorUrl(securityContext: SecurityContext, pipelineId: string, executionId: string, expiresIn = FIVE_MINUTES): Promise<SignedUrlResponse> {
		this.log.info(` > generatePipelineErrorUrl > pipelineId: ${pipelineId}, executionId: ${executionId} `);
		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId], securityContext.groupRoles, atLeastContributor, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not an \`contributor\` of the group in context \`${JSON.stringify(securityContext.groupId)}`);
		}

		// check to see if pipeline execution exists (will throw NotFoundError if not)
		const pipelineExecution = await this.pipelineProcessorsRepository.get(pipelineId, executionId);
		await this.validatePipelineExecutionAccess([pipelineExecution.groupContextId], securityContext.groupId, pipelineExecution.id);

		const params: GetObjectCommand = new GetObjectCommand({
			Bucket: this.bucketName,
			Key: getPipelineErrorKey(this.bucketPrefix, pipelineId, executionId),
		});
		const signedUrl = await this.getSignedUrl(this.s3Client, params, { expiresIn: expiresIn });

		this.log.info(` > generatePipelineErrorUrl > exit`);
		return { url: signedUrl };
	}

	private async generatePipelineExecutionInputUrl(securityContext: SecurityContext, pipelineId: string, executionId: string, expiresIn = FIVE_MINUTES, type?: 'raw' | 'transformed'): Promise<string> {
		this.log.info(` > generatePipelineInputUploadUrl > , pipelineId: ${pipelineId}, executionId: ${executionId}, expiresIn: ${expiresIn}`);


		// This will throw Exception if user does not have access to the pipeline
		const pipeline = await this.pipelineClient.get(pipelineId, undefined, this.getLambdaRequestContext(securityContext));

		const params: PutObjectCommand = new PutObjectCommand({
			Bucket: this.bucketName,
			Key: getPipelineInputKey(this.bucketPrefix, pipeline.id, executionId, type),
		});

		const url = await this.getSignedUrl(this.s3Client, params, { expiresIn });

		this.log.info(` > generatePipelineUploadUrl > exit`);
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

		await this.validatePipelineExecutionAccess([execution.groupContextId], sc.groupId, id);

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

