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

import type { S3Client } from '@aws-sdk/client-s3';
import { DescribeExecutionCommand, GetExecutionHistoryCommand, GetExecutionHistoryCommandInput, HistoryEvent, SFNClient } from '@aws-sdk/client-sfn';
import { CloudWatchClient, PutMetricDataCommand, PutMetricDataCommandInput } from '@aws-sdk/client-cloudwatch';
import type { BaseLogger } from 'pino';
import type { Dimension, Metric, ProcessedTaskEventWithExecutionDetails, StepFunctionEvent, VerificationTaskEvent } from './model.js';
import { validateNotEmpty } from '@sif/validators';
import type { PipelineClient } from '@sif/clients';
import type { GetLambdaRequestContext } from '../../plugins/module.awilix.js';
import { SecurityScope } from '@sif/authz';
import dayjs from 'dayjs';
import merge from 'deepmerge';
import type { CalculatorResultUtil } from '../../utils/calculatorResult.util.js';
import { CopyObjectCommand } from '@aws-sdk/client-s3';
import type { Status } from '../../api/executions/schemas.js';
import type { PipelineProcessorsRepository } from '../../api/executions/repository.js';
import type { EventPublisher } from '@sif/events';

const expectedMetrics = [
	'AcquireLockInsertActivityValues', 'ReleaseLockInsertActivityValuesSuccess', 'ReleaseLockInsertActivityValuesFail',
	'Map State',
	'AcquireLockInsertLatestActivityValues', 'ReleaseLockInsertLatestActivityValues',
	'JobInsertLatestValuesTask',
	'Post Processing Tasks',
	'AcquireLockMetricAggregation', 'ReleaseLockMetricAggregation',
	'AcquireLockPipelineAggregation', 'ReleaseLockPipelineAggregation'
];

export class ResultProcessorTask {

	constructor(protected log: BaseLogger, protected s3Client: S3Client, protected sfnClient: SFNClient, protected cloudWatchClient: CloudWatchClient, protected pipelineClient: PipelineClient, protected getLambdaRequestContext: GetLambdaRequestContext, private calculatorUtil: CalculatorResultUtil, private pipelineProcessorsRepository: PipelineProcessorsRepository, private eventPublisher: EventPublisher) {
	}

	public async process(event: ProcessedTaskEventWithExecutionDetails): Promise<void> {
		this.log.info(`ResultProcessorTask > process > event: ${JSON.stringify(event)}`);

		validateNotEmpty(event, 'event');
		validateNotEmpty(event.input?.executionId, 'executionId');
		validateNotEmpty(event.input?.pipelineId, 'pipelineId');

		const { executionId, pipelineId, status, errorLocationList } = event.input;
		await this.calculatorUtil.concatenateS3Error(pipelineId, executionId, errorLocationList);

		let taskStatus: Status = 'success';
		const errors = [];

		if (errorLocationList.length > 0) {
			errors.push('error when performing calculation, review the pipeline execution error log for further info');
			taskStatus = 'failed';
		}

		if (status === 'FAILED') {
			errors.push('error when inserting activities to database');
			taskStatus = 'failed';
		}

		// update the pipeline execution status
		const execution = await this.pipelineProcessorsRepository.get(executionId);
		await this.pipelineProcessorsRepository.create({
			...execution,
			status: taskStatus, statusMessage: errors.length === 0 ? undefined : errors.join('\n'),
			updatedBy: event.input?.security?.email,
			updatedAt: new Date(Date.now()).toISOString()
		});

		if (event.executionArn && event.executionStartTime) {
			if (taskStatus === 'failed') {
				await this.archiveExecutionInputData(event.executionArn);
			}
			// We publish the metrics
			await this.publishCloudWatchMetrics(event);
		}

		await this.eventPublisher.publishTenantEvent({
			resourceType: 'pipelineExecution',
			eventType: 'updated',
			id: execution.id
		});

		this.log.info(`ResultProcessorTask > process > exit >`);
	}

	private async archiveExecutionInputData(executionArn: string): Promise<void> {
		this.log.trace(`ResultProcessorTask > archiveExecutionInputData > in > executionArn: ${executionArn}`);
		const stateMachineExecution = await this.sfnClient.send(new DescribeExecutionCommand({ executionArn }));
		const stateMachineInput = JSON.parse(stateMachineExecution.input) as VerificationTaskEvent;
		if (stateMachineInput.source) {
			const { key, bucket } = stateMachineInput.source;
			await this.s3Client.send(new CopyObjectCommand({ Bucket: bucket, CopySource: `${bucket}/${key}`, Key: key.replace('/input/', '/deliveryFailures/postTransformed/') }));
		}
		this.log.trace(`ResultProcessorTask > archiveExecutionInputData > in > exit:`);
	}

	private async publishCloudWatchMetrics(event: ProcessedTaskEventWithExecutionDetails): Promise<void> {
		this.log.trace(`ResultProcessorTask > publishCloudWatchMetrics > in > event: ${JSON.stringify(event)}`);
		const { input, executionArn } = event;
		const { security: securityContext, executionId, pipelineId } = input;
		try {
			const lambdaRequestContext = this.getLambdaRequestContext({
				...event.input.security,
				groupId: securityContext.groupId,
				groupRoles: { [securityContext.groupId]: SecurityScope.reader }
			});

			const [pipeline, events] = await Promise.all([
				this.pipelineClient.get(pipelineId, undefined, lambdaRequestContext),
				this.getStepFunctionHistory(executionArn)
			]);

			const pipelineName = pipeline.name;
			const filteredEvents = this.filterEventHistory(events);

			/*
			 * Publish CloudWatch Metrics
			 * 1 - calculator metrics from Map
			 * 2 - Insert Activity from Task
			 * 3 - Release Lock Insert Activity Failure from Parallel
			 * 3 - Release Lock Insert Activity Success from Parallel
			 * 4 - Acquire Lock Insert Latest Activity from Parallel
			 * 5 - Insert Latest Activity from Task
			 * 7 - Release Lock Insert Latest Activity from Parallel
			 * 8 - POST Processing from Parallel
			 */
			const cloudWatchMetrics = this.constructCloudWatchMetrics(filteredEvents, pipelineName, pipelineId, executionId);

			// Publish CloudWatch Metrics
			const metricCommand = new PutMetricDataCommand(cloudWatchMetrics);
			await this.cloudWatchClient.send(metricCommand);

		} catch (Exception) {
			this.log.error(`ResultProcessorTask > publishCloudWatchMetrics > error: ${JSON.stringify(Exception)}`);
		}


		this.log.trace(`ResultProcessorTask > publishCloudWatchMetrics > exit >`);

	}

	private async getStepFunctionHistory(executionArn: string): Promise<HistoryEvent[]> {
		this.log.trace(`ResultProcessorTask > getStepFunctionHistory > in > executionArn: ${JSON.stringify(executionArn)}`);
		const allExecutionHistory: HistoryEvent[] = [];
		let nextToken: string | undefined = undefined;


		do {
			const params: GetExecutionHistoryCommandInput = {
				executionArn,
				includeExecutionData: false,
				nextToken
			};

			const command = new GetExecutionHistoryCommand(params);
			const { events, nextToken: newNextToken } = await this.sfnClient.send(command);

			if (events) {
				allExecutionHistory.push(...events);
			}
			nextToken = newNextToken;

		} while (nextToken);

		this.log.trace(`ResultProcessorTask > getStepFunctionHistory > exit`);
		return allExecutionHistory;

	}

	private filterEventHistory(events: HistoryEvent[]): StepFunctionEvent[] {
		this.log.trace(`ResultProcessorTask > filterEventHistory > in> events:${JSON.stringify(events)}`);
		const expectedEventTypes = [
			'ParallelStateEntered', 'ParallelStateSucceeded', 'ParallelStateFailed', 'ParallelStateExited',
			'TaskStateEntered', 'TaskSucceeded', 'TaskFailed', 'TaskStateExited',
			'MapStateEntered', 'MapStateSucceeded', 'MapStateFailed', 'MapStateExited'
		];

		const succeededEvents = ['ParallelStateSucceeded', 'TaskSucceeded', 'MapStateSucceeded'];
		const failedEvents = ['ParallelStateFailed', 'TaskFailed', 'MapStateFailed'];
		try {
			const filteredEvents = events.map(event => {
					if (expectedEventTypes.includes(event.type)) {
						if (event?.stateEnteredEventDetails && expectedMetrics.includes(event?.stateEnteredEventDetails?.name)) {
							event['name'] = event?.stateEnteredEventDetails?.name;
							return event;
						} else if (event?.stateExitedEventDetails && expectedMetrics.includes(event?.stateExitedEventDetails?.name)) {
							event['name'] = event?.stateExitedEventDetails?.name;
							return event;
						} else if (succeededEvents.includes(event.type)) {
							return event;
						} else if (failedEvents.includes(event.type)) {
							return event;
						} else {
							return null;
						}
					} else {
						return null;
					}

				}
			).filter(o => o); // filter out null values
			return filteredEvents;
		} catch (Exception) {
			this.log.error(`ResultProcessorTask > filterEventHistory > error: ${JSON.stringify(Exception)}`);
			return [];
		}
	}


	public constructCloudWatchMetrics(events: StepFunctionEvent[], pipelineName: string, pipelineId: string, executionId: string): PutMetricDataCommandInput {
		this.log.trace(`ResultProcessorTask > constructCloudWatchMetrics > in: ${JSON.stringify(events)}, pipelineName:${pipelineName}, pipelineId:${pipelineId}, executionId:${executionId}`);

		const { TENANT_ID, NODE_ENV } = process.env;
		const enteredEvents = ['ParallelStateEntered', 'TaskStateEntered', 'MapStateEntered'];
		const succeededEvents = ['ParallelStateSucceeded', 'TaskSucceeded', 'MapStateSucceeded'];
		const exitedEvents = ['ParallelStateExited', 'TaskStateExited', 'MapStateExited'];

		// Generic Dimensions
		const genericDimensions = [
			{
				Name: 'tenant',
				Value: TENANT_ID
			},
			{
				Name: 'environment',
				Value: NODE_ENV
			},
			{
				Name: 'pipelineName',
				Value: pipelineName
			},
			{
				Name: 'executionId',
				Value: executionId
			}
		];

		const runDetails = {};

		const cloudWatchMetrics: PutMetricDataCommandInput = {
			Namespace: 'activityPipeline',
			MetricData: []
		};

		try {

			// Construct the run details of different segments of the state machine that can be used to construct the cloudwatch metrics
			for (let metric of expectedMetrics) {

				// Get the metrics events
				const metricEvents = events.filter(event => event.name === metric);
				const enteredEvent = metricEvents.find(event => enteredEvents.includes(event.type));
				const exitedEvent = metricEvents.find(event => exitedEvents.includes(event.type));

				// Capture metric when event exists
				if (enteredEvent && exitedEvent) {
					let statusEvent;
					// IF its a Task previousEventId will contain the Event status
					if (exitedEvent.type === 'TaskStateExited') {
						statusEvent = events.find(event => event.id === exitedEvent.previousEventId);
					} else { // IF its a Map or parallel event then the previousId of the status and exit events will be the same
						statusEvent = events.filter(event => event.previousEventId === exitedEvent.previousEventId)[0];

					}

					// establish status
					const isSucceeded = succeededEvents.includes(statusEvent.type);

					const startTime = dayjs(enteredEvent.timestamp, 'YYYY-MM-ddTHH:mm:ss.SSSZ');
					const endTime = dayjs(exitedEvent.timestamp, 'YYYY-MM-ddTHH:mm:ss.SSSZ');

					// Construct the runDetails
					if (metric !== 'Map State') {
						runDetails[metric] = {
							startTime,
							endTime,
							isSucceeded,
							dimensions: [{ Name: 'task', Value: metric }, { Name: 'module', Value: 'PipelineProcessor' }]
						};
					} else {
						metric = 'Calculation';
						runDetails[metric] = {
							startTime,
							endTime,
							isSucceeded,
							dimensions: [{ Name: 'task', Value: metric }, { Name: 'module', Value: 'Calculator' }]
						};
					}

					const runTime = endTime.diff(startTime, 'seconds');
					const dimensions = merge(genericDimensions, runDetails[metric].dimensions);
					const cwMetrics = this.getMetric(dimensions, runTime, isSucceeded);
					cloudWatchMetrics.MetricData.push(...cwMetrics);
				}
			}

		} catch (Exception) {
			this.log.error(`ResultProcessorTask > constructCloudWatchMetrics > error: ${JSON.stringify(Exception)}`);
			return undefined;
		}

		const activityInsertMetrics = this.getActivityInsertMetrics(runDetails, genericDimensions);
		const metricAggregationMetrics = this.getMetricAggregationMetrics(runDetails, genericDimensions);
		const pipelineAggregationMetrics = this.getPipelineAggregationMetrics(runDetails, genericDimensions);
		cloudWatchMetrics.MetricData.push(...activityInsertMetrics, ...metricAggregationMetrics, ...pipelineAggregationMetrics);

		this.log.trace(`ResultProcessorTask > constructDimensions > exit`);
		return cloudWatchMetrics;
	}

	private getMetric(dimensions: Dimension[], runTime: number, isSucceeded): Metric[] {
		const metrics: Metric[] = [];
		// Add runTime metric
		metrics.push(
			{
				MetricName: 'Runtime',
				Dimensions: dimensions,
				Unit: 'Seconds',
				Value: runTime
			}
		);

		// Add success metric
		metrics.push(
			{
				MetricName: 'Success',
				Dimensions: dimensions,
				Unit: 'Count',
				Value: (isSucceeded) ? 1 : 0
			}
		);

		// Add failure metric
		metrics.push(
			{
				MetricName: 'Failure',
				Dimensions: dimensions,
				Unit: 'Count',
				Value: (isSucceeded) ? 0 : 1
			}
		);

		return metrics;
	}

	/*
	 * Derive Activity Insert from other metrics
	 * For this we get the exit time of the calculator and the enter time of failed/success ReleaseLockInsertActivityValues
	 * Status will also be determined by wether we have a failed or success ReleaseLockInsertActivityValues
	*/
	private getActivityInsertMetrics(runDetails: object, genericDimensions: object) {

		const activityInsertDimensions = merge(genericDimensions, [{ Name: 'task', Value: 'ActivityInsertValues' }, { Name: 'module', Value: 'PipelineProcessor' }]);
		const startTime = dayjs(runDetails['Calculation'].startTime);
		let succeeded = false;
		let endTime;

		// Get Activity Insert status
		if (runDetails?.['ReleaseLockInsertActivityValuesSuccess']) {
			succeeded = true;
			endTime = dayjs(runDetails['ReleaseLockInsertActivityValuesSuccess'].startTime);

		} else {
			endTime = dayjs(runDetails['ReleaseLockInsertActivityValuesFail'].startTime);
		}
		const runTime = endTime.diff(startTime, 'seconds');

		const metrics = this.getMetric(activityInsertDimensions, runTime, succeeded);

		return metrics;
	}


	/*
	 * Derive Metric Aggregation metrics from other metrics
	*/
	private getMetricAggregationMetrics(runDetails: object, genericDimensions: object) {

		const newDimensions = merge(genericDimensions, [{ Name: 'task', Value: 'MetricAggregation' }, { Name: 'module', Value: 'PipelineProcessor' }]);
		const startTime = dayjs(runDetails['AcquireLockMetricAggregation'].endTime);
		let succeeded = true;
		const endTime = dayjs(runDetails['ReleaseLockMetricAggregation'].startTime);

		const runTime = endTime.diff(startTime, 'seconds');
		const metrics = this.getMetric(newDimensions, runTime, succeeded);

		return metrics;
	}

	/*
	 * Derive pipeline Aggregation metrics from other metrics
	*/
	private getPipelineAggregationMetrics(runDetails: object, genericDimensions: object) {

		const newDimensions = merge(genericDimensions, [{ Name: 'task', Value: 'PipelineAggregation' }, { Name: 'module', Value: 'PipelineProcessor' }]);
		const startTime = dayjs(runDetails['AcquireLockPipelineAggregation'].endTime);
		let succeeded = true;
		const endTime = dayjs(runDetails['ReleaseLockPipelineAggregation'].startTime);

		const runTime = endTime.diff(startTime, 'seconds');
		const metrics = this.getMetric(newDimensions, runTime, succeeded);
		return metrics;
	}


}
