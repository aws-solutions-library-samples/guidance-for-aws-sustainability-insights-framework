import type { PipelineExecution } from './schemas.js';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getPipelineErrorKey, getPipelineOutputKey } from '../../utils/helper.utils.js';
import type { BaseLogger } from 'pino';
import type {
	CalculatorClient,
	CalculatorInlineTransformResponse,
	CalculatorRequest,
	Pipeline,
	Transform,
	MetricClient,
	LambdaRequestContext,
	PipelineType,
	Transformer,
	S3Location,
	ActionType
} from '@sif/clients';
import { validateNotEmpty } from '@sif/validators';
import type { SecurityContext } from '@sif/authz';
import type { PipelineProcessorsRepository } from './repository.js';
import type { InlineExecutionOutputs } from './schemas.js';
import dayjs from 'dayjs';
import type { CalculationContext, ProcessedTaskEvent } from '../../stepFunction/tasks/model.js';
import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import type { ImpactCreationTask } from '../../stepFunction/tasks/impactCreationTask.js';
import type { InsertActivityBulkService } from '../../stepFunction/tasks/insertActivityBulk.service.js';
import type { InsertLatestValuesTaskService } from '../../stepFunction/tasks/insertLatestValues.service.js';
import type { SqlResultProcessorTask } from '../../stepFunction/tasks/sqlResultProcessorTask.js';
import type { PipelineAggregationTaskService } from '../../stepFunction/tasks/pipelineAggregationTask.service.js';
import type { ResultProcessorTask } from '../../stepFunction/tasks/resultProcessorTask.js';
import type { SaveAggregationJobTaskService } from '../../stepFunction/tasks/saveAggregationJobTask.service.js';
import type { EventPublisher } from '@sif/events';

export class InlineExecutionService {
	public constructor(private log: BaseLogger,
					   private pipelineProcessorsRepository: PipelineProcessorsRepository,
					   private calculatorClient: CalculatorClient,
					   private s3Client: S3Client,
					   private bucketName: string,
					   private bucketPrefix: string,
					   private metricClient: MetricClient,
					   private sfnClient: SFNClient,
					   private metricAggregationStateMachineArn: string,
					   private impactCreationService: ImpactCreationTask,
					   private insertActivityBulkService: InsertActivityBulkService,
					   private sqlResultProcessorTask: SqlResultProcessorTask,
					   private insertLatestValuesTaskService: InsertLatestValuesTaskService,
					   private pipelineAggregationTaskService: PipelineAggregationTaskService,
					   private resultProcessorTask: ResultProcessorTask,
					   private saveAggregationJobTaskService: SaveAggregationJobTaskService,
					   private eventPublisher: EventPublisher
	) {
	}

	private buildLambdaRequestContext(groupId: string): LambdaRequestContext {
		return {
			authorizer: {
				claims: {
					email: '',
					'cognito:groups': `${groupId}|||reader`,
					groupContextId: groupId
				}
			}
		};
	}

	private async assembleProcessedTaskEvent(pipelineId: string, executionId: string, pipelineType: PipelineType, transformer: Transformer, triggerMetricAggregations: boolean, security: SecurityContext): Promise<ProcessedTaskEvent> {
		this.log.trace(`InlineExecutionService> assembleProcessedTaskEvent> pipelineId: ${pipelineId}, executionId: ${executionId}, transformer: ${JSON.stringify(transformer)}`);

		const metrics = Array.from(new Set(transformer.transforms.flatMap((t) => t.outputs.flatMap((o) => o.metrics ?? []))));
		const metricQueue = await this.metricClient.sortMetricsByDependencyOrder(metrics, this.buildLambdaRequestContext(security.groupId));

		const outputs = transformer.transforms.flatMap((t) =>
			t.outputs.filter(o => !o.includeAsUnique && t.index > 0)        // needs values only (no keys, and no timestamp)
				.map((o) => ({ name: o.key, type: o.type })));
		const requiresAggregation = transformer.transforms.some(o => o.outputs.some(o => o.aggregate));
		const processedTaskEvent: ProcessedTaskEvent = {
			metricQueue,
			pipelineId,
			executionId,
			security,
			requiresAggregation,
			triggerMetricAggregations,
			outputs,
			pipelineType,
			sequenceList: [],
			errorLocationList: []
		};
		this.log.trace(`InlineExecutionService> assembleProcessedTaskEvent> exit > processedTaskEvent: ${JSON.stringify(processedTaskEvent)} `);

		return processedTaskEvent;
	}

	private assembleCalculatorResponse(response: CalculatorInlineTransformResponse, transforms: Transform[]): InlineExecutionOutputs {
		this.log.trace(`InlineExecutionService> assembleCalculatorInlineResponse> response: ${JSON.stringify(response)}, transforms: ${JSON.stringify(transforms)}`);

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

		this.log.trace(`InlineExecutionService> assembleCalculatorInlineResponse> outputs: ${JSON.stringify(outputs)}`);
		return outputs;
	}

	private async processCalculation(pipeline: Pipeline, executionId: string, { groupId: groupContextId, email: username }: SecurityContext, inputs: unknown[]): Promise<CalculatorInlineTransformResponse & {
		sequence: number,
		errorLocation: S3Location
	}> {
		this.log.trace(`InlineExecutionService> processCalculation> pipeline: ${JSON.stringify(pipeline)}, executionId: ${executionId}, inputs: ${JSON.stringify(inputs)}`);

		const { id: pipelineId, transformer } = pipeline;

		const calculatorRequest: CalculatorRequest = {
			pipelineId,
			executionId,
			groupContextId,
			username,
			actionType: 'create',
			dryRun: false,
			sourceData: inputs.map((d) => JSON.stringify(d)),
			parameters: transformer.parameters,
			transforms: transformer.transforms,
			pipelineType: pipeline.type
		};
		const calculatorResponse = await this.calculatorClient.process(calculatorRequest) as CalculatorInlineTransformResponse;

		// create map to get the type of output given the key
		const outputTypeMapping: { [key: string]: string } = transformer.transforms.reduce((prev, curr) => {
			prev[curr.outputs[0].key] = curr.outputs[0].type;
			return prev;
		}, {});

		// store the output
		await this.s3Client.send(
			new PutObjectCommand({
				Body: [calculatorResponse.headers.join(','), ...calculatorResponse.data
					// for string output insert double quote at the beginning and end of value
					// so value that contains comma is treated as single value
					.map(o => Object.entries(JSON.parse(o)).map(([key, value]) => {
						return outputTypeMapping[key] === 'string' ? `"${value}"` : value;
					}).join(','))]
					.join('\n')
					.concat(`\n`),
				Bucket: this.bucketName,
				Key: getPipelineOutputKey(this.bucketPrefix, pipelineId, executionId)
			})
		);

		let errorLocation: S3Location;

		// store the error using the appropriate error object key (similar with job mode)
		if (calculatorResponse.errors.length > 0) {
			errorLocation = {
				bucket: this.bucketName,
				key: getPipelineErrorKey(this.bucketPrefix, pipelineId, executionId)
			};

			await this.s3Client.send(
				new PutObjectCommand({
					Body: calculatorResponse.errors.join('\r\n'),
					Bucket: this.bucketName,
					Key: getPipelineErrorKey(this.bucketPrefix, pipelineId, executionId)
				})
			);
		}
		this.log.trace(`InlineExecutionService> processCalculation> calculatorResponse: ${JSON.stringify(calculatorResponse)}`);
		return {
			...calculatorResponse,
			errorLocation,
			sequence: 0
		};
	}

	private async executeInlineActivityPipeline(calculationContext: CalculationContext, calculatorResponse: CalculatorInlineTransformResponse & {
		sequence: number,
		errorLocation: S3Location
	}): Promise<void> {
		this.log.trace(`InlineExecutionService> executeInlineActivityPipeline> calculationContext: ${JSON.stringify(calculationContext)}, calculatorResponse: ${JSON.stringify(calculatorResponse)}`);
		// Insert Activities to Values Table
		const insertActivityBulkResponse = await this.insertActivityBulkService.process({
			context: calculationContext,
			calculatorTransformResponse: calculatorResponse
		});
		// Check if the SQL inserts are being done successfully
		const processedTaskEvent = await this.sqlResultProcessorTask.process([insertActivityBulkResponse]);
		// Insert Activities to Latest Values Table
		await this.insertLatestValuesTaskService.process(processedTaskEvent);
		// Perform pipeline aggregation if necessary
		if (processedTaskEvent.requiresAggregation) {
			await this.pipelineAggregationTaskService.process(processedTaskEvent);
		}
		// Perform metric aggregation (or save metric aggregation job) if necessary
		if (processedTaskEvent.metricQueue.length > 0) {
			if (processedTaskEvent.triggerMetricAggregations) {
				await this.sfnClient.send(new StartExecutionCommand({ stateMachineArn: this.metricAggregationStateMachineArn, input: JSON.stringify(processedTaskEvent) }));
			} else {
				await this.saveAggregationJobTaskService.process(processedTaskEvent);
			}
		}
		// Should process the result of all the operations above
		await this.resultProcessorTask.process({ input: processedTaskEvent });
		this.log.trace(`InlineExecutionService> executeInlineActivityPipeline> exit:`);
	}

	public async run(sc: SecurityContext, pipeline: Pipeline, newExecution: PipelineExecution, options: { inputs: unknown[] }): Promise<PipelineExecution> {
		this.log.trace(`InlineExecutionService> run> pipeline: ${JSON.stringify(pipeline)}, newExecution: ${JSON.stringify(newExecution)}`);

		const { id: pipelineId, transformer, type: pipelineType, createdBy } = pipeline;
		const { id: executionId, actionType, triggerMetricAggregations } = newExecution;

		validateNotEmpty(options.inputs, 'inputs');
		// create the initial pipeline execution in waiting state
		await this.pipelineProcessorsRepository.create(newExecution);

		// publish the created event
		await this.eventPublisher.publishTenantEvent({
			resourceType: 'pipelineExecution',
			eventType: 'created',
			id: executionId
		});

		try {
			const calculatorResponse = await this.processCalculation(pipeline, executionId, sc, options.inputs);
			this.log.trace(`InlineExecutionService> run> calculatorResponse: ${JSON.stringify(calculatorResponse)}`);
			if (calculatorResponse.errors.length > 0) {
				// set the execution status based on errors
				newExecution.status = 'failed';
				newExecution.statusMessage = 'error when calculating the input, review the pipeline execution error log for further info';
			} else {
				newExecution.status = pipelineType === 'activities' ? 'calculating_metrics' : 'success';
			}
			// set the execution outputs from the calculator response
			newExecution.inlineExecutionOutputs = this.assembleCalculatorResponse(calculatorResponse, transformer.transforms);
			if (newExecution.status !== 'failed') {
				switch (pipeline.type) {
					case 'activities':
						const calculationContext: CalculationContext = {
							triggerMetricAggregations,
							transformer,
							pipelineType,
							pipelineId,
							executionId,
							security: sc,
							pipelineCreatedBy: createdBy,
							actionType: actionType as ActionType
						};
						await this.executeInlineActivityPipeline(calculationContext, calculatorResponse);
						break;
					case 'impacts':
						// create ProcessedTaskEvent need for ImpactCreationTask
						const aggregationTaskEvent = await this.assembleProcessedTaskEvent(pipelineId, executionId, pipeline.type, transformer, newExecution.triggerMetricAggregations, sc);
						const [status, statusMessage] = await this.impactCreationService.process(aggregationTaskEvent);
						newExecution.status = status;
						newExecution.statusMessage = statusMessage;
						break;
					default:
						break;
				}
			}
		} catch (Exception) {
			this.log.error(`InlineExecutionService> run> error> Exception: ${Exception}`);
			newExecution.status = 'failed';
			newExecution.inlineExecutionOutputs = {
				errors: [Exception]
			};
		} finally {
			// we will not store the inlineExecutionOutputs because DynamoDB limit issue
			const { inlineExecutionOutputs, ...executionWithoutInlineExecutionOutputs } = newExecution;
			// update the pipeline execution status
			await this.pipelineProcessorsRepository.create(executionWithoutInlineExecutionOutputs);
		}
		this.log.trace(`InlineExecutionService> run> exit> newExecution: ${JSON.stringify(newExecution)}`);
		return newExecution;
	}
}
