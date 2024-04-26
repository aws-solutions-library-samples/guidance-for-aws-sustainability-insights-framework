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

import type { Pipeline } from '@sif/clients';
import { CloudWatchClient, PutMetricDataCommand, PutMetricDataCommandInput } from '@aws-sdk/client-cloudwatch';
import { GetExecutionHistoryCommand, GetExecutionHistoryCommandInput, HistoryEvent, SFNClient } from '@aws-sdk/client-sfn';
import type { Dimension, Metric, StepFunctionEvent } from '../tasks/model.js';
import merge from 'deepmerge';
import dayjs from 'dayjs';
import type { BaseLogger } from 'pino';

export class CloudWatchMetricService {

	private expectedMetrics: string[] = [
		'AcquireLockInsertActivityValues', 'ReleaseLockInsertActivityValuesSuccess', 'ReleaseLockInsertActivityValuesFail',
		'Map State',
		'AcquireLockInsertLatestActivityValues', 'ReleaseLockInsertLatestActivityValues',
		'JobInsertLatestValuesTask',
		'Post Processing Tasks',
		'AcquireLockMetricAggregation', 'ReleaseLockMetricAggregation',
		'AcquireLockPipelineAggregation', 'ReleaseLockPipelineAggregation'
	];

	constructor(private readonly log: BaseLogger, private readonly cloudWatchClient: CloudWatchClient, private sfnClient: SFNClient) {
	}

	public async publish(pipeline: Pipeline, executionArn: string, executionId: string): Promise<void> {
		this.log.trace(`CloudWatchMetricService > publish > in > pipeline: ${JSON.stringify(pipeline)}, executionArn: ${executionArn}`);
		try {
			const events = await this.getStepFunctionHistory(executionArn);
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
			const cloudWatchMetrics = this.constructCloudWatchMetrics(filteredEvents, pipelineName, pipeline.id, executionId);

			// Publish CloudWatch Metrics
			const metricCommand = new PutMetricDataCommand(cloudWatchMetrics);
			await this.cloudWatchClient.send(metricCommand);

		} catch (Exception) {
			this.log.error(`CloudWatchMetricService > publish > error: ${JSON.stringify(Exception)}`);
		}

		this.log.trace(`CloudWatchMetricService > publish > exit >`);
	}

	public constructCloudWatchMetrics(events: StepFunctionEvent[], pipelineName: string, pipelineId: string, executionId: string): PutMetricDataCommandInput {
		this.log.trace(`CloudWatchMetricService > constructCloudWatchMetrics > in: ${JSON.stringify(events)}, pipelineName:${pipelineName}, pipelineId:${pipelineId}, executionId:${executionId}`);

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
			for (let metric of this.expectedMetrics) {

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
			this.log.error(`CloudWatchMetricService > constructCloudWatchMetrics > error: ${JSON.stringify(Exception)}`);
			return undefined;
		}

		const activityInsertMetrics = this.getActivityInsertMetrics(runDetails, genericDimensions);
		const metricAggregationMetrics = this.getMetricAggregationMetrics(runDetails, genericDimensions);
		const pipelineAggregationMetrics = this.getPipelineAggregationMetrics(runDetails, genericDimensions);
		cloudWatchMetrics.MetricData.push(...activityInsertMetrics, ...metricAggregationMetrics, ...pipelineAggregationMetrics);

		this.log.trace(`CloudWatchMetricService > constructDimensions > exit`);
		return cloudWatchMetrics;
	}

	private async getStepFunctionHistory(executionArn: string): Promise<HistoryEvent[]> {
		this.log.trace(`CloudWatchMetricService > getStepFunctionHistory > in > executionArn: ${JSON.stringify(executionArn)}`);
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

		this.log.trace(`CloudWatchMetricService > getStepFunctionHistory > exit`);
		return allExecutionHistory;

	}

	private filterEventHistory(events: HistoryEvent[]): StepFunctionEvent[] {
		this.log.trace(`CloudWatchMetricService > filterEventHistory > in> events:${JSON.stringify(events)}`);
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
						if (event?.stateEnteredEventDetails && this.expectedMetrics.includes(event?.stateEnteredEventDetails?.name)) {
							event['name'] = event?.stateEnteredEventDetails?.name;
							return event;
						} else if (event?.stateExitedEventDetails && this.expectedMetrics.includes(event?.stateExitedEventDetails?.name)) {
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
			this.log.error(`CloudWatchMetricService > filterEventHistory > error: ${JSON.stringify(Exception)}`);
			return [];
		}
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
