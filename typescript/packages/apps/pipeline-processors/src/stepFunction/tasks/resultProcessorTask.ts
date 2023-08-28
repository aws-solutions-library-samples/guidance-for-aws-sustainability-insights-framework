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

import { GetObjectCommand, GetObjectCommandInput, PutObjectCommand, PutObjectCommandInput, S3Client } from '@aws-sdk/client-s3';
import { GetExecutionHistoryCommand, GetExecutionHistoryCommandInput, HistoryEvent, SFNClient } from '@aws-sdk/client-sfn';
import { CloudWatchClient, PutMetricDataCommand, PutMetricDataCommandInput } from '@aws-sdk/client-cloudwatch';
import { sdkStreamMixin } from '@aws-sdk/util-stream-node';
import { getPipelineErrorKey } from '../../utils/helper.utils.js';
import type { BaseLogger } from 'pino';
import type { Dimension, Metric, ProcessedTaskEventWithExecutionDetails, StepFunctionEvent } from './model.js';
import { validateNotEmpty } from '@sif/validators';
import type { PipelineClient } from '@sif/clients/dist/index.js';
import type { GetLambdaRequestContext, GetSecurityContext } from '../../plugins/module.awilix.js';
import type { PipelineProcessorsService } from '../../api/executions/service.js';
import { SecurityScope } from '@sif/authz';

import dayjs from 'dayjs';
import merge from "deepmerge";

const expectedMetrics = [
	'AcquireLockInsertActivityValues', 'ReleaseLockInsertActivityValuesSuccess','ReleaseLockInsertActivityValuesFail',
	'Map State',
	'AcquireLockInsertLatestActivityValues', 'ReleaseLockInsertLatestActivityValues',
	'JobInsertLatestValuesTask',
	'Post Processing Tasks',
	'AcquireLockMetricAggregation','ReleaseLockMetricAggregation',
	'AcquireLockPipelineAggregation','ReleaseLockPipelineAggregation'
];

export class ResultProcessorTask {

	constructor(protected log: BaseLogger, protected s3Client: S3Client, protected sfnClient: SFNClient, protected cloudWatchClient: CloudWatchClient, protected pipelineClient: PipelineClient, protected dataBucket: string, protected dataPrefix: string, protected getSecurityContext: GetSecurityContext, protected getLambdaRequestContext: GetLambdaRequestContext, protected pipelineProcessorsService: PipelineProcessorsService) {
	}

	private async storeCalculationOutput(combinedOutput: string, pipelineId: string, executionId: string, key: string): Promise<void> {
		this.log.trace(`ResultProcessorTask > storeCalculationOutput > in > pipelineId: ${pipelineId}, executionId: ${executionId}, key: ${key}`);

		const params: PutObjectCommandInput = {
			Bucket: this.dataBucket,
			Key: key,
			Body: combinedOutput,
		};
		await this.s3Client.send(new PutObjectCommand(params));
		this.log.trace(`ResultProcessorTask > storeCalculationOutput > exit:`);
	}

	protected async getContentFromFile(bucket: string, key: string): Promise<string> {
		const getObjectParams: GetObjectCommandInput = {
			Key: key,
			Bucket: bucket,
		};
		const response = await this.s3Client.send(new GetObjectCommand(getObjectParams));
		return await sdkStreamMixin(response.Body).transformToString();
	}

	protected async concatenateS3Error(pipelineId: string, executionId: string, errorS3LocationList: { bucket: string, key: string }[]): Promise<void> {
		this.log.trace(`ResultProcessorTask > concatenateS3Error > pipelineId: ${JSON.stringify(pipelineId)}, executionId: ${executionId}, errorS3LocationList: ${errorS3LocationList}`);
		const concatenatedErrors = [];
		for (const errorS3Location of errorS3LocationList) {
			concatenatedErrors.push(await this.getContentFromFile(errorS3Location.bucket, errorS3Location.key));
		}
		if (concatenatedErrors.length > 0) {
			const concatenatedErrorMessage = concatenatedErrors.join('\r\n');
			await this.storeCalculationOutput(concatenatedErrorMessage, pipelineId, executionId, getPipelineErrorKey(this.dataPrefix, pipelineId, executionId));
		}
		this.log.trace(`ResultProcessorTask > concatenateS3Error > exit >`);
	}

	public async process(event: ProcessedTaskEventWithExecutionDetails): Promise<[string, string]> {
		this.log.info(`ResultProcessorTask > process > event: ${JSON.stringify(event)}`);
		validateNotEmpty(event, 'event');
		validateNotEmpty(event.executionStartTime, 'executionStartTime');
		validateNotEmpty(event.executionArn, 'executionArn');
		validateNotEmpty(event.inputs, 'inputs');
		validateNotEmpty(event.inputs[0].executionId, 'executionId');
		validateNotEmpty(event.inputs[0].pipelineId, 'pipelineId');

		// first result is where common and overall metadata is stored
		const inputs = event.inputs;
		const { executionId, pipelineId, status } = inputs[0];
		const errorS3LocationList = inputs.filter(o => o.errorLocation).map(o => o.errorLocation);
		await this.concatenateS3Error(pipelineId, executionId, errorS3LocationList);

		const taskStatus = (status === 'FAILED' || errorS3LocationList.length > 0) ? 'failed' : 'success';
		const taskStatusMessage = taskStatus == 'failed' ? 'error when performing calculation' : undefined;
		const taskResult: [string, string] = [taskStatus, taskStatusMessage];

		// We publish the metrics
		await this.publishCloudWatchMetrics(event);

		this.log.info(`ResultProcessorTask > process > exit > result: ${taskResult}`);
		return taskResult;
	}

	private async publishCloudWatchMetrics(event: ProcessedTaskEventWithExecutionDetails): Promise<void> {
		this.log.trace(`ResultProcessorTask > publishCloudWatchMetrics > in > event: ${JSON.stringify(event)}`);
		try {

			const securityContext = await this.getSecurityContext(event.inputs[0].executionId);
			const execution = await this.pipelineProcessorsService.get(securityContext, event.inputs[0].executionId);
			const pipeline = await this.pipelineClient.get(event.inputs[0].pipelineId, undefined, this.getLambdaRequestContext({
				...securityContext,
				groupId: execution.groupContextId,
				groupRoles: { [execution.groupContextId]: SecurityScope.reader }
			}));


			const pipelineName = pipeline.name;
			const events = await this.getStepFunctionHistory(event.executionArn);
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
			const cloudWatchMetrics = this.constructCloudWatchMetrics(filteredEvents, pipelineName, event.inputs[0].pipelineId, event.inputs[0].executionId);

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
			}

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

	private filterEventHistory(events: HistoryEvent[]):StepFunctionEvent[] {
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
		const exitedEvents = ['ParallelStateExited', 'TaskStateExited', 'MapStateExited']

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
			},
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
				const metricEvents = events.filter(event => event.name === metric)
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
					if (metric !=='Map State') {
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

		const activityInsertMetrics = this.getActivityInsertMetrics(runDetails,genericDimensions);
		const metricAggregationMetrics = this.getMetricAggregationMetrics(runDetails,genericDimensions);
		const pipelineAggregationMetrics = this.getPipelineAggregationMetrics(runDetails,genericDimensions);
		cloudWatchMetrics.MetricData.push(...activityInsertMetrics, ... metricAggregationMetrics, ...pipelineAggregationMetrics);

		this.log.trace(`ResultProcessorTask > constructDimensions > exit`);
		return cloudWatchMetrics;
	}

	private getMetric(dimensions: Dimension[], runTime: number, isSucceeded):Metric[] {
		const metrics:Metric[] = [];
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

		return metrics
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

		return metrics
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

	return metrics
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
