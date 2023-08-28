import type { PipelineExecution } from './schemas.js';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getPipelineErrorKey, getPipelineOutputKey } from '../../utils/helper.utils.js';
import type { BaseLogger } from 'pino';
import type { CalculatorClient, CalculatorInlineTransformResponse, CalculatorRequest, Pipeline, Transform, MetricClient, LambdaRequestContext, PipelineType, Transformer } from '@sif/clients';
import { validateNotEmpty } from '@sif/validators';
import type { SecurityContext } from '@sif/authz';
import type { PipelineProcessorsRepository } from './repository.js';
import type { InlineExecutionOutputs } from './schemas.js';
import dayjs from 'dayjs';
import type { ProcessedTaskEvent } from '../../stepFunction/tasks/model.js';
import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import type { ImpactCreationTask } from '../../stepFunction/tasks/impactCreationTask.js';

export class InlineExecutionService {
	public constructor(private log: BaseLogger,
					   private pipelineProcessorsRepository: PipelineProcessorsRepository,
					   private calculatorClient: CalculatorClient,
					   private s3Client: S3Client,
					   private bucketName: string,
					   private bucketPrefix: string,
					   private metricClient: MetricClient,
					   private sfnClient: SFNClient,
					   private inlineStateMachineArn: string,
					   private impactCreationService: ImpactCreationTask) {
	}

	private buildLambdaRequestContext(groupId: string): LambdaRequestContext {
		return {
			authorizer: {
				claims: {
					email: '',
					'cognito:groups': `${groupId}|||reader`,
					groupContextId: groupId,
				},
			},
		};
	}

	private async assembleProcessedTaskEvent(pipelineId: string, executionId: string, pipelineType: PipelineType, groupContextId: string, transformer: Transformer): Promise<ProcessedTaskEvent> {
		this.log.trace(`InlineExecutionService> assembleProcessedTaskEvent> groupContextId: ${groupContextId}, pipelineId: ${pipelineId}, executionId: ${executionId}, transformer: ${transformer}`);

		const metrics = Array.from(new Set(transformer.transforms.flatMap((t) => t.outputs.flatMap((o) => o.metrics ?? []))));
		const metricQueue = await this.metricClient.sortMetricsByDependencyOrder(metrics, this.buildLambdaRequestContext(groupContextId));

		const outputs = transformer.transforms.flatMap((t) =>
			t.outputs.filter(o => !o.includeAsUnique && t.index > 0)        // needs values only (no keys, and no timestamp)
				.map((o) => ({ name: o.key, type: o.type })));
		const requiresAggregation = transformer.transforms.some(o => o.outputs.some(o => o.aggregate));
		const processedTaskEvent: ProcessedTaskEvent = {
			metricQueue,
			groupContextId,
			pipelineId,
			executionId,
			requiresAggregation,
			outputs,
			pipelineType,
			sequence: 0,
		};
		this.log.trace(`InlineExecutionService> assembleProcessedTaskEvent> exit > processedTaskEvent: ${processedTaskEvent} `);

		return processedTaskEvent;
	}

	private assembleCalculatorInlineResponse(response: CalculatorInlineTransformResponse, transforms: Transform[]): InlineExecutionOutputs {
		this.log.trace(`InlineExecutionService> assembleCalculatorInlineResponse> response: ${response}, transforms: ${JSON.stringify(transforms)}`);

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

		this.log.trace(`InlineExecutionService> assembleCalculatorInlineResponse> outputs: ${outputs}`);
		return outputs;
	}

	private async processCalculation(pipeline: Pipeline, executionId: string, { groupId: groupContextId, email: username }: SecurityContext, inputs: unknown[]): Promise<CalculatorInlineTransformResponse> {
		this.log.trace(`InlineExecutionService> processCalculation> pipelineId: ${pipeline}, executionId: ${executionId}, inputs: ${inputs}`);

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
				Key: getPipelineOutputKey(this.bucketPrefix, pipelineId, executionId),
			})
		);
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
		this.log.trace(`InlineExecutionService> processCalculation> calculatorResponse: ${calculatorResponse}`);
		return calculatorResponse;
	}

	public async run(sc: SecurityContext, pipeline: Pipeline, newExecution: PipelineExecution, options: { inputs: unknown[] }): Promise<PipelineExecution> {
		this.log.trace(`InlineExecutionService> run> pipelineId: ${pipeline}, newExecution: ${newExecution}`);

		const { id: pipelineId, transformer } = pipeline;
		const { id: executionId } = newExecution;
		const { groupId } = sc;

		validateNotEmpty(options.inputs, 'inputs');
		// create the initial pipeline execution in waiting state
		await this.pipelineProcessorsRepository.create(newExecution);
		try {
			const calculatorResponse = await this.processCalculation(pipeline, executionId, sc, options.inputs);
			if (calculatorResponse.errors.length > 0) {
				// set the execution status based on errors
				newExecution.status = 'failed';
				newExecution.statusMessage = 'error when calculating the input';
			} else {
				newExecution.status = 'success';
			}
			// create ProcessedTaskEvent need for ImpactCreationTask
			const aggregationTaskEvent = [await this.assembleProcessedTaskEvent(pipelineId, executionId, pipeline.type, groupId, transformer)];
			// set the execution outputs from the calculator response
			newExecution.inlineExecutionOutputs = this.assembleCalculatorInlineResponse(calculatorResponse, transformer.transforms);
			if (newExecution.status !== 'failure') {
				switch (pipeline.type) {
					case 'activities':
						// trigger the state machine that aggregates pipeline or metrics
						await this.sfnClient.send(new StartExecutionCommand({ stateMachineArn: this.inlineStateMachineArn, input: JSON.stringify(aggregationTaskEvent) }));
						break;
					case 'impacts':
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
		this.log.trace(`InlineExecutionService> run> exit> newExecution: ${newExecution}`);
		return newExecution;
	}
}
