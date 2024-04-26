import type { PipelineExecution } from './schemas.js';
import type { BaseLogger } from 'pino';
import type { ActionType, CalculatorClient, CalculatorInlineTransformResponse, CalculatorReferencedResource, CalculatorRequest, LambdaRequestContext, MetricClient, Pipeline, PipelineType, S3Location, Transformer } from '@sif/clients';
import { validateNotEmpty } from '@sif/validators';
import type { SecurityContext } from '@sif/authz';
import type { PipelineProcessorsRepository } from './repository.js';
import type { CalculationContext, ProcessedTaskEvent } from '../../stepFunction/tasks/model.js';
import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import type { InsertActivityBulkTask } from '../../stepFunction/tasks/insertActivityBulkTask';
import type { InsertLatestValuesTask } from '../../stepFunction/tasks/insertLatestValuesTask.js';
import type { SqlResultProcessorTask } from '../../stepFunction/tasks/sqlResultProcessorTask.js';
import type { PipelineAggregationTask } from '../../stepFunction/tasks/pipelineAggregationTask';
import type { ActivityResultProcessorTask } from '../../stepFunction/tasks/activityResultProcessorTask';
import type { SaveAggregationJobTask } from '../../stepFunction/tasks/saveAggregationJobTask';
import type { EventPublisher } from '@sif/events';
import { InvalidRequestError } from '@sif/resource-api-base';
import type { CalculatorResultUtil } from '../../utils/calculatorResult.util.js';
import type { DataResultProcessorTask } from '../../stepFunction/tasks/dataResultProcessorTask.js';
import type { ImpactCreationTask } from '../../stepFunction/tasks/impactCreationTask';

export class InlineExecutionService {
	public constructor(private log: BaseLogger,
					   private pipelineProcessorsRepository: PipelineProcessorsRepository,
					   private calculatorClient: CalculatorClient,
					   private metricClient: MetricClient,
					   private sfnClient: SFNClient,
					   private metricAggregationStateMachineArn: string,
					   private insertActivityBulkService: InsertActivityBulkTask,
					   private sqlResultProcessorTask: SqlResultProcessorTask,
					   private dataResultProcessorTask: DataResultProcessorTask,
					   private insertLatestValuesTaskService: InsertLatestValuesTask,
					   private pipelineAggregationTaskService: PipelineAggregationTask,
					   private activityResultProcessorTask: ActivityResultProcessorTask,
					   private saveAggregationJobTaskService: SaveAggregationJobTask,
					   private eventPublisher: EventPublisher,
					   private calculatorResultUtil: CalculatorResultUtil,
					   private impactCreationTask: ImpactCreationTask
	) {
	}

	public async run(sc: SecurityContext, pipeline: Pipeline, newExecution: PipelineExecution, options: { inputs: unknown[] }): Promise<PipelineExecution> {
		this.log.trace(`InlineExecutionService> run> pipeline: ${JSON.stringify(pipeline)}, newExecution: ${JSON.stringify(newExecution)}`);

		const { id: pipelineId, transformer, type: pipelineType, createdBy } = pipeline;
		const { id: executionId, actionType, triggerMetricAggregations } = newExecution;

		validateNotEmpty(options.inputs, 'inputs');

		// not all pipeline type support inline execution
		const validPipelineTypes = ['activities', 'data', 'impacts'];
		if (!validPipelineTypes.includes(pipeline.type)) {
			throw new InvalidRequestError(`Inline execution does not support ${pipeline.type} pipeline type, it only supports [${validPipelineTypes}]`);
		}

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
			newExecution.inlineExecutionOutputs = this.calculatorResultUtil.assembleInlineExecutionOutputs(calculatorResponse, transformer.transforms);
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
						const aggregationTaskEvent = await this.assembleProcessedTaskEvent(
							pipelineId, executionId, pipeline.type, transformer, newExecution.triggerMetricAggregations, sc, calculatorResponse.referenceDatasets, calculatorResponse.activities);
						await this.dataResultProcessorTask.process(aggregationTaskEvent);
						const { taskStatus, taskStatusMessage } = await this.impactCreationTask.process(aggregationTaskEvent);
						newExecution.status = taskStatus;
						newExecution.statusMessage = taskStatusMessage;
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

	private async assembleProcessedTaskEvent(pipelineId: string, executionId: string, pipelineType: PipelineType, transformer: Transformer, triggerMetricAggregations: boolean, security: SecurityContext, referenceDatasets: Record<string, CalculatorReferencedResource>, activities: Record<string, CalculatorReferencedResource>): Promise<ProcessedTaskEvent> {
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
			referenceDatasets,
			activities,
			requiresAggregation,
			triggerMetricAggregations,
			outputs,
			pipelineType,
			// For inline pipeline execution, there should only be 1 result file.
			sequenceList: [0],
			errorLocationList: []
		};
		this.log.trace(`InlineExecutionService> assembleProcessedTaskEvent> exit > processedTaskEvent: ${JSON.stringify(processedTaskEvent)} `);

		return processedTaskEvent;
	}

	private async processCalculation(pipeline: Pipeline, executionId: string, { groupId: groupContextId, email: username }: SecurityContext, inputs: unknown[]): Promise<CalculatorInlineTransformResponse & {
		sequence: number,
		errorLocation: S3Location
	}> {
		this.log.trace(`InlineExecutionService> processCalculation> pipeline: ${JSON.stringify(pipeline)}, executionId: ${executionId}, inputs: ${JSON.stringify(inputs)}`);

		const { id: pipelineId, transformer } = pipeline;

		const labelToKeyMap = pipeline.transformer.parameters.reduce((a, b) => {
			/**
			 * Provide mapping from label to key if specified, if label is not specified we will use the key.
			 */
			a[b.label ?? b.key] = b.key;
			return a;
		}, {});

		const calculatorRequest: CalculatorRequest = {
			pipelineId,
			executionId,
			groupContextId,
			username,
			actionType: 'create',
			dryRun: false,
			/**
			 * Map the input object properties to SIF format key and only include column that are included in the parameters
			 */
			sourceData: inputs.map((preMap) => {
				const postMap = {};
				Object.keys(preMap).forEach(p => {
					const key = labelToKeyMap[p];
					if (key) {
						postMap[key] = preMap[p];
					}
				});
				return JSON.stringify(postMap);
			}),
			parameters: transformer.parameters,
			transforms: transformer.transforms,
			pipelineType: pipeline.type
		};
		const calculatorResponse = await this.calculatorClient.process(calculatorRequest) as CalculatorInlineTransformResponse;

		const [_, errorLocation] = await this.calculatorResultUtil.storeInlineTransformResponse(pipelineId, executionId, pipeline.transformer.transforms, calculatorResponse);

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
		await this.activityResultProcessorTask.process({ input: processedTaskEvent });
		this.log.trace(`InlineExecutionService> executeInlineActivityPipeline> exit:`);
	}
}
