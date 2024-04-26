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

import { beforeEach, describe, expect, it } from 'vitest';
import pino from 'pino';
import type { StepFunctionEvent } from '../tasks/model.js';
import { CloudWatchMetricService } from './cloudWatchMetric.service.js';
import { mockClient } from 'aws-sdk-client-mock';
import { SFNClient } from '@aws-sdk/client-sfn';
import { CloudWatchClient } from '@aws-sdk/client-cloudwatch';

describe('CloudWatchMetricService', () => {

	const successfulStepFunctionEvent: StepFunctionEvent[] = [{
		'id': 5,
		'previousEventId': 4,
		'taskSucceededEventDetails': { 'resource': 'invoke', 'resourceType': 'lambda' },
		'timestamp': new Date('2023-08-07T03:18:16.010Z'),
		'type': 'TaskSucceeded'
	}, {
		'id': 7,
		'previousEventId': 6,
		'stateEnteredEventDetails': { 'name': 'AcquireLockInsertActivityValues' },
		'timestamp': new Date('2023-08-07T03:18:16.027Z'),
		'type': 'ParallelStateEntered',
		'name': 'AcquireLockInsertActivityValues'
	}, { 'id': 16, 'previousEventId': 14, 'taskSucceededEventDetails': { 'resource': 'putEvents', 'resourceType': 'events' }, 'timestamp': new Date('2023-08-07T03:18:16.237Z'), 'type': 'TaskSucceeded' }, {
		'id': 18,
		'previousEventId': 15,
		'taskSucceededEventDetails': { 'resource': 'sendMessage.waitForTaskToken', 'resourceType': 'sqs' },
		'timestamp': new Date('2023-08-07T03:18:18.192Z'),
		'type': 'TaskSucceeded'
	}, { 'id': 20, 'previousEventId': 19, 'timestamp': new Date('2023-08-07T03:18:18.213Z'), 'type': 'ParallelStateSucceeded' }, {
		'id': 21,
		'previousEventId': 19,
		'stateExitedEventDetails': { 'name': 'AcquireLockInsertActivityValues' },
		'timestamp': new Date('2023-08-07T03:18:18.213Z'),
		'type': 'ParallelStateExited',
		'name': 'AcquireLockInsertActivityValues'
	}, { 'id': 22, 'previousEventId': 21, 'stateEnteredEventDetails': { 'name': 'Map State' }, 'timestamp': new Date('2023-08-07T03:18:18.213Z'), 'type': 'MapStateEntered', 'name': 'Map State' }, {
		'id': 28,
		'previousEventId': 27,
		'taskSucceededEventDetails': { 'resource': 'invoke', 'resourceType': 'lambda' },
		'timestamp': new Date('2023-08-07T03:18:21.163Z'),
		'type': 'TaskSucceeded'
	}, { 'id': 31, 'previousEventId': 30, 'timestamp': new Date('2023-08-07T03:18:21.184Z'), 'type': 'MapStateSucceeded' }, {
		'id': 32,
		'previousEventId': 30,
		'stateExitedEventDetails': { 'name': 'Map State' },
		'timestamp': new Date('2023-08-07T03:18:21.184Z'),
		'type': 'MapStateExited',
		'name': 'Map State'
	}, { 'id': 38, 'previousEventId': 37, 'taskSucceededEventDetails': { 'resource': 'invoke', 'resourceType': 'lambda' }, 'timestamp': new Date('2023-08-07T03:18:31.810Z'), 'type': 'TaskSucceeded' }, {
		'id': 42,
		'previousEventId': 41,
		'stateEnteredEventDetails': { 'name': 'ReleaseLockInsertActivityValuesSuccess' },
		'timestamp': new Date('2023-08-07T03:18:31.830Z'),
		'type': 'ParallelStateEntered',
		'name': 'ReleaseLockInsertActivityValuesSuccess'
	}, { 'id': 50, 'previousEventId': 48, 'taskSucceededEventDetails': { 'resource': 'sendMessage', 'resourceType': 'sqs' }, 'timestamp': new Date('2023-08-07T03:18:32.001Z'), 'type': 'TaskSucceeded' }, {
		'id': 51,
		'previousEventId': 49,
		'taskSucceededEventDetails': { 'resource': 'putEvents', 'resourceType': 'events' },
		'timestamp': new Date('2023-08-07T03:18:32.021Z'),
		'type': 'TaskSucceeded'
	}, { 'id': 54, 'previousEventId': 53, 'timestamp': new Date('2023-08-07T03:18:32.027Z'), 'type': 'ParallelStateSucceeded' }, {
		'id': 55,
		'previousEventId': 53,
		'stateExitedEventDetails': { 'name': 'ReleaseLockInsertActivityValuesSuccess' },
		'timestamp': new Date('2023-08-07T03:18:32.027Z'),
		'type': 'ParallelStateExited',
		'name': 'ReleaseLockInsertActivityValuesSuccess'
	}, {
		'id': 56,
		'previousEventId': 55,
		'stateEnteredEventDetails': { 'name': 'AcquireLockInsertLatestActivityValues' },
		'timestamp': new Date('2023-08-07T03:18:32.027Z'),
		'type': 'ParallelStateEntered',
		'name': 'AcquireLockInsertLatestActivityValues'
	}, { 'id': 64, 'previousEventId': 62, 'taskSucceededEventDetails': { 'resource': 'putEvents', 'resourceType': 'events' }, 'timestamp': new Date('2023-08-07T03:18:32.193Z'), 'type': 'TaskSucceeded' }, {
		'id': 67,
		'previousEventId': 65,
		'taskSucceededEventDetails': { 'resource': 'sendMessage.waitForTaskToken', 'resourceType': 'sqs' },
		'timestamp': new Date('2023-08-07T03:18:32.953Z'),
		'type': 'TaskSucceeded'
	}, { 'id': 69, 'previousEventId': 68, 'timestamp': new Date('2023-08-07T03:18:32.976Z'), 'type': 'ParallelStateSucceeded' }, {
		'id': 70,
		'previousEventId': 68,
		'stateExitedEventDetails': { 'name': 'AcquireLockInsertLatestActivityValues' },
		'timestamp': new Date('2023-08-07T03:18:32.976Z'),
		'type': 'ParallelStateExited',
		'name': 'AcquireLockInsertLatestActivityValues'
	}, { 'id': 71, 'previousEventId': 70, 'stateEnteredEventDetails': { 'name': 'JobInsertLatestValuesTask' }, 'timestamp': new Date('2023-08-07T03:18:32.976Z'), 'type': 'TaskStateEntered', 'name': 'JobInsertLatestValuesTask' }, {
		'id': 74,
		'previousEventId': 73,
		'taskSucceededEventDetails': { 'resource': 'invoke', 'resourceType': 'lambda' },
		'timestamp': new Date('2023-08-07T03:18:33.347Z'),
		'type': 'TaskSucceeded'
	}, { 'id': 75, 'previousEventId': 74, 'stateExitedEventDetails': { 'name': 'JobInsertLatestValuesTask' }, 'timestamp': new Date('2023-08-07T03:18:33.371Z'), 'type': 'TaskStateExited', 'name': 'JobInsertLatestValuesTask' }, {
		'id': 76,
		'previousEventId': 75,
		'stateEnteredEventDetails': { 'name': 'ReleaseLockInsertLatestActivityValues' },
		'timestamp': new Date('2023-08-07T03:18:33.371Z'),
		'type': 'ParallelStateEntered',
		'name': 'ReleaseLockInsertLatestActivityValues'
	}, { 'id': 84, 'previousEventId': 82, 'taskSucceededEventDetails': { 'resource': 'putEvents', 'resourceType': 'events' }, 'timestamp': new Date('2023-08-07T03:18:33.537Z'), 'type': 'TaskSucceeded' }, {
		'id': 85,
		'previousEventId': 83,
		'taskSucceededEventDetails': { 'resource': 'sendMessage', 'resourceType': 'sqs' },
		'timestamp': new Date('2023-08-07T03:18:33.544Z'),
		'type': 'TaskSucceeded'
	}, { 'id': 88, 'previousEventId': 87, 'timestamp': new Date('2023-08-07T03:18:33.563Z'), 'type': 'ParallelStateSucceeded' }, {
		'id': 89,
		'previousEventId': 87,
		'stateExitedEventDetails': { 'name': 'ReleaseLockInsertLatestActivityValues' },
		'timestamp': new Date('2023-08-07T03:18:33.563Z'),
		'type': 'ParallelStateExited',
		'name': 'ReleaseLockInsertLatestActivityValues'
	}, { 'id': 90, 'previousEventId': 89, 'stateEnteredEventDetails': { 'name': 'Post Processing Tasks' }, 'timestamp': new Date('2023-08-07T03:18:33.563Z'), 'type': 'ParallelStateEntered', 'name': 'Post Processing Tasks' }, {
		'id': 92,
		'previousEventId': 91,
		'stateEnteredEventDetails': { 'name': 'AcquireLockMetricAggregation' },
		'timestamp': new Date('2023-08-07T03:18:33.563Z'),
		'type': 'ParallelStateEntered',
		'name': 'AcquireLockMetricAggregation'
	}, {
		'id': 94,
		'previousEventId': 91,
		'stateEnteredEventDetails': { 'name': 'AcquireLockPipelineAggregation' },
		'timestamp': new Date('2023-08-07T03:18:33.563Z'),
		'type': 'ParallelStateEntered',
		'name': 'AcquireLockPipelineAggregation'
	}, { 'id': 109, 'previousEventId': 106, 'taskSucceededEventDetails': { 'resource': 'putEvents', 'resourceType': 'events' }, 'timestamp': new Date('2023-08-07T03:18:33.702Z'), 'type': 'TaskSucceeded' }, {
		'id': 110,
		'previousEventId': 105,
		'taskSucceededEventDetails': { 'resource': 'putEvents', 'resourceType': 'events' },
		'timestamp': new Date('2023-08-07T03:18:33.708Z'),
		'type': 'TaskSucceeded'
	}, { 'id': 114, 'previousEventId': 108, 'taskSucceededEventDetails': { 'resource': 'sendMessage.waitForTaskToken', 'resourceType': 'sqs' }, 'timestamp': new Date('2023-08-07T03:18:34.273Z'), 'type': 'TaskSucceeded' }, {
		'id': 116,
		'previousEventId': 115,
		'timestamp': new Date('2023-08-07T03:18:34.295Z'),
		'type': 'ParallelStateSucceeded'
	}, {
		'id': 117,
		'previousEventId': 115,
		'stateExitedEventDetails': { 'name': 'AcquireLockMetricAggregation' },
		'timestamp': new Date('2023-08-07T03:18:34.295Z'),
		'type': 'ParallelStateExited',
		'name': 'AcquireLockMetricAggregation'
	}, { 'id': 121, 'previousEventId': 120, 'taskSucceededEventDetails': { 'resource': 'invoke', 'resourceType': 'lambda' }, 'timestamp': new Date('2023-08-07T03:18:34.393Z'), 'type': 'TaskSucceeded' }, {
		'id': 125,
		'previousEventId': 124,
		'stateEnteredEventDetails': { 'name': 'ReleaseLockMetricAggregation' },
		'timestamp': new Date('2023-08-07T03:18:34.413Z'),
		'type': 'ParallelStateEntered',
		'name': 'ReleaseLockMetricAggregation'
	}, { 'id': 131, 'previousEventId': 111, 'taskSucceededEventDetails': { 'resource': 'sendMessage.waitForTaskToken', 'resourceType': 'sqs' }, 'timestamp': new Date('2023-08-07T03:18:34.470Z'), 'type': 'TaskSucceeded' }, {
		'id': 134,
		'previousEventId': 132,
		'taskSucceededEventDetails': { 'resource': 'sendMessage', 'resourceType': 'sqs' },
		'timestamp': new Date('2023-08-07T03:18:34.504Z'),
		'type': 'TaskSucceeded'
	}, { 'id': 135, 'previousEventId': 133, 'taskSucceededEventDetails': { 'resource': 'putEvents', 'resourceType': 'events' }, 'timestamp': new Date('2023-08-07T03:18:34.541Z'), 'type': 'TaskSucceeded' }, {
		'id': 139,
		'previousEventId': 136,
		'timestamp': new Date('2023-08-07T03:18:34.564Z'),
		'type': 'ParallelStateSucceeded'
	}, {
		'id': 140,
		'previousEventId': 136,
		'stateExitedEventDetails': { 'name': 'AcquireLockPipelineAggregation' },
		'timestamp': new Date('2023-08-07T03:18:34.564Z'),
		'type': 'ParallelStateExited',
		'name': 'AcquireLockPipelineAggregation'
	}, { 'id': 141, 'previousEventId': 138, 'timestamp': new Date('2023-08-07T03:18:34.564Z'), 'type': 'ParallelStateSucceeded' }, {
		'id': 142,
		'previousEventId': 138,
		'stateExitedEventDetails': { 'name': 'ReleaseLockMetricAggregation' },
		'timestamp': new Date('2023-08-07T03:18:34.564Z'),
		'type': 'ParallelStateExited',
		'name': 'ReleaseLockMetricAggregation'
	}, { 'id': 148, 'previousEventId': 147, 'taskSucceededEventDetails': { 'resource': 'invoke', 'resourceType': 'lambda' }, 'timestamp': new Date('2023-08-07T03:18:35.759Z'), 'type': 'TaskSucceeded' }, {
		'id': 150,
		'previousEventId': 149,
		'stateEnteredEventDetails': { 'name': 'ReleaseLockPipelineAggregation' },
		'timestamp': new Date('2023-08-07T03:18:35.777Z'),
		'type': 'ParallelStateEntered',
		'name': 'ReleaseLockPipelineAggregation'
	}, { 'id': 158, 'previousEventId': 156, 'taskSucceededEventDetails': { 'resource': 'putEvents', 'resourceType': 'events' }, 'timestamp': new Date('2023-08-07T03:18:35.884Z'), 'type': 'TaskSucceeded' }, {
		'id': 159,
		'previousEventId': 157,
		'taskSucceededEventDetails': { 'resource': 'sendMessage', 'resourceType': 'sqs' },
		'timestamp': new Date('2023-08-07T03:18:35.919Z'),
		'type': 'TaskSucceeded'
	}, { 'id': 162, 'previousEventId': 161, 'timestamp': new Date('2023-08-07T03:18:35.939Z'), 'type': 'ParallelStateSucceeded' }, {
		'id': 163,
		'previousEventId': 161,
		'stateExitedEventDetails': { 'name': 'ReleaseLockPipelineAggregation' },
		'timestamp': new Date('2023-08-07T03:18:35.939Z'),
		'type': 'ParallelStateExited',
		'name': 'ReleaseLockPipelineAggregation'
	}, { 'id': 164, 'previousEventId': 163, 'timestamp': new Date('2023-08-07T03:18:35.939Z'), 'type': 'ParallelStateSucceeded' }, {
		'id': 165,
		'previousEventId': 163,
		'stateExitedEventDetails': { 'name': 'Post Processing Tasks' },
		'timestamp': new Date('2023-08-07T03:18:35.939Z'),
		'type': 'ParallelStateExited',
		'name': 'Post Processing Tasks'
	}];

	let underTest: CloudWatchMetricService;
	const mockedSfnClient: SFNClient = mockClient(SFNClient) as unknown as SFNClient;
	const mockedCloudWatchClient: CloudWatchClient = mockClient(CloudWatchClient) as unknown as CloudWatchClient;

	const pipelineName = 'test-pipeline';
	const pipelineId = 'testPipelineId';
	const executionId = 'testExecutionId';

	beforeEach(() => {
		const logger = pino(
			pino.destination({
				sync: true // test frameworks must use pino logger in sync mode!
			})
		);
		logger.level = 'info';
		process.env['TENANT_ID'] = 'test-tenant';
		process.env['NODE_ENV'] = 'test-env';

		underTest = new CloudWatchMetricService(logger, mockedCloudWatchClient, mockedSfnClient);
	});

	it('Should return cloudwatch metrics for a successful execution', async () => {
		const result = underTest.constructCloudWatchMetrics(successfulStepFunctionEvent, pipelineName, pipelineId, executionId);
		expect(result.MetricData.length).toEqual(42);
		expect(result.MetricData[0]).toEqual({
			'Dimensions': [{ 'Name': 'tenant', 'Value': 'test-tenant' }, { 'Name': 'environment', 'Value': 'test-env' }, { 'Name': 'pipelineName', 'Value': 'test-pipeline' }, {
				'Name': 'executionId',
				'Value': 'testExecutionId'
			}, { 'Name': 'task', 'Value': 'AcquireLockInsertActivityValues' }, { 'Name': 'module', 'Value': 'PipelineProcessor' }], 'MetricName': 'Runtime', 'Unit': 'Seconds', 'Value': 2
		});
		expect(result.MetricData[41]).toEqual({
			'Dimensions': [{ 'Name': 'tenant', 'Value': 'test-tenant' }, { 'Name': 'environment', 'Value': 'test-env' }, { 'Name': 'pipelineName', 'Value': 'test-pipeline' }, {
				'Name': 'executionId',
				'Value': 'testExecutionId'
			}, { 'Name': 'task', 'Value': 'PipelineAggregation' }, { 'Name': 'module', 'Value': 'PipelineProcessor' }], 'MetricName': 'Failure', 'Unit': 'Count', 'Value': 0
		});
	});
});
