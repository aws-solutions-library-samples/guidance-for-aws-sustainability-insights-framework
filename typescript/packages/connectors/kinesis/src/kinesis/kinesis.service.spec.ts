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

import { beforeEach, expect, describe, it } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';
import pino from 'pino';
import type { ConnectorConfig, Execution, ExecutionClient, ExecutionList } from '@sif/clients';
import { KinesisService } from './kinesis.service';
import { TransformService } from './transform.service';
import type { S3Client } from '@aws-sdk/client-s3';
import type { ConnectorEvents } from '@sif/connector-utils/dist';
import dayjs from 'dayjs';

describe('kinesisService', () => {
	const pipelineId = '11111';
	const groupId = '/test';
	const bucketName = 'testBucket';
	const bucketPrefix = 'pipelines';

	const connectorConfig: ConnectorConfig = {
		name:'testConnector'
	} as ConnectorConfig;

	let mockedS3Client: MockProxy<S3Client>;
	let mockedExecutionClient: MockProxy<ExecutionClient>;
	let mockedConnectorEvent: MockProxy<ConnectorEvents>;

	const logger = pino(
		pino.destination({
			sync: true, // test frameworks must use pino logger in sync mode!
		})
	);
	logger.level = 'debug';

	const executionList = {
		executions: [
			{
				connectorOverrides: {
					'sif-kinesis-pipeline-input-connector': {
						parameters: {
							executionParam1: 'executionParam1Val1',
							connectorParam3: 'connectorParam3ValExecution',
							executionParam2: 'param not in connector config'
						}
					}
				},
				// ignore the rest below
				id: 'execid',
				pipelineId: 'pipeId',
				actionType: 'create',
				createdBy: 'someone@somewhere.com',
				createdAt: 'timestamp',
				pipelineVersion: 1,
				status: 'success',
				groupContextId: '/'
			}]
	} as unknown as ExecutionList;

	const kinesisFirehoseRecords: any = {
		'invocationId': 'invocationIdExample',
		'deliveryStreamArn': 'arn:aws:kinesis:EXAMPLE',
		'region': 'us-west-2',
		'records': [
			{
				'recordId': '1',
				'approximateArrivalTimestamp': 1495072949453,
				'data': 'eyJyZWFkaW5nIGRhdGUiOiIxLzQvMjIiLCJhIjoiQSIsImIiOjEwLCJjIjoxfQ=='
			},
			{
				'recordId': '2',
				'approximateArrivalTimestamp': 1495072949453,
				'data': 'eyJyZWFkaW5nIGRhdGUiOiIxLzQvMjIiLCJhIjoiQSIsImIiOjEwLCJjIjoxfQ=='
			},
			{
				'recordId': '3',
				'approximateArrivalTimestamp': 1495072949453,
				'data': 'eyJyZWFkaW5nIGRhdGUiOiIxLzQvMjIiLCJhIjoiQyIsImIiOjMwLCJjIjozfQ=='
			},
			{
				'recordId': '4',
				'approximateArrivalTimestamp': 1495072949453,
				'data': 'eyJyZWFkaW5nIGRhdGUiOiIxLzQvMjIiLCJhIjoiRCIsImIiOjQwLCJjIjo0fQ=='
			},
			{
				'recordId': '5',
				'approximateArrivalTimestamp': 1495072949453,
				'data': 'eyJyZWFkaW5nIGRhdGUiOiIxLzQvMjIiLCJhIjoiRSIsImIiOjUwLCJjIjo1fQ=='
			},
			{
				'recordId': '6',
				'approximateArrivalTimestamp': 1495072949453,
				'data': 'eyJyZWFkaW5nIGRhdGUiOiIxLzQvMjIiLCJhIjoiRiIsImIiOjYwLCJjIjo2fQ=='
			}

		]
	} as any;

	beforeEach(() => {

		mockedS3Client = mock<S3Client>();
		mockedExecutionClient = mock<ExecutionClient>();
		mockedConnectorEvent = mock<ConnectorEvents>();

		mockedS3Client.send.mockReset();
		mockedExecutionClient.create.mockReset();
		mockedExecutionClient.list.mockReset();

		mockedExecutionClient.create.mockResolvedValueOnce({
			id: 'dummyExecution'
		} as unknown as Execution);

		mockedExecutionClient.list.mockResolvedValueOnce(executionList);
	});

	it('happy path', async () => {
		const transformService = new TransformService(logger, `{ "reading date": "{{'reading date'}}" , "meter":"{{a}}" }`);

		const underTest = new KinesisService(logger, bucketName, bucketPrefix, mockedS3Client, mockedExecutionClient, transformService, connectorConfig, pipelineId, groupId, mockedConnectorEvent);

		await underTest.process(kinesisFirehoseRecords);

		const startOfDayTag = `${pipelineId}_${dayjs().startOf('day').unix()}`;

		// should check if there is pipeline execution for the day
		expect(mockedExecutionClient.list).toBeCalledWith('11111', {
			'authorizer': {
				'claims': {
					'email': '',
					'cognito:groups': '/test|||contributor',
					'groupContextId': '/test'
				}
			}
		}, {
			tags: { key: 'daily-tag', value: startOfDayTag }
		});
		const payloadUploadToPipelineProcessor = mockedS3Client.send.mock.calls[0][0]['input']['Body'];
		expect(payloadUploadToPipelineProcessor).toEqual('{"reading date":"1/4/22","meter":"A","pipelineId":"11111","executionId":"execid"}\r\n' +
			'{"reading date":"1/4/22","meter":"A","pipelineId":"11111","executionId":"execid"}\r\n' +
			'{"reading date":"1/4/22","meter":"C","pipelineId":"11111","executionId":"execid"}\r\n' +
			'{"reading date":"1/4/22","meter":"D","pipelineId":"11111","executionId":"execid"}\r\n' +
			'{"reading date":"1/4/22","meter":"E","pipelineId":"11111","executionId":"execid"}\r\n' +
			'{"reading date":"1/4/22","meter":"F","pipelineId":"11111","executionId":"execid"}\r\n');

		await underTest.process(kinesisFirehoseRecords);
		// second call to process should retrieve the execution from cache
		expect(mockedExecutionClient.list).toHaveBeenCalledOnce();
	});

	it('invalid handle bars template', async () => {
		const transformService = new TransformService(logger, `{ "reading date": "{{reading date}}" , "meter":"{{a}}" }`);

		const underTest = new KinesisService(logger, bucketName, bucketPrefix, mockedS3Client, mockedExecutionClient, transformService, connectorConfig, pipelineId, groupId, mockedConnectorEvent);

		await underTest.process(kinesisFirehoseRecords);

		expect(mockedConnectorEvent.publishResponse).not.toBeCalled();
		expect(mockedS3Client.send).not.toBeCalled();
	});

	it('should not perform any transformation when empty template is specified', async () => {
		const transformService = new TransformService(logger, ``);

		const underTest = new KinesisService(logger, bucketName, bucketPrefix, mockedS3Client, mockedExecutionClient, transformService, connectorConfig, pipelineId, groupId, mockedConnectorEvent);

		await underTest.process(kinesisFirehoseRecords);

		const payloadUploadToPipelineProcessor = mockedS3Client.send.mock.calls[0][0]['input']['Body'];
		expect(payloadUploadToPipelineProcessor).toEqual('{"reading date":"1/4/22","a":"A","b":10,"c":1,"pipelineId":"11111","executionId":"execid"}\r\n' +
			'{"reading date":"1/4/22","a":"A","b":10,"c":1,"pipelineId":"11111","executionId":"execid"}\r\n' +
			'{"reading date":"1/4/22","a":"C","b":30,"c":3,"pipelineId":"11111","executionId":"execid"}\r\n' +
			'{"reading date":"1/4/22","a":"D","b":40,"c":4,"pipelineId":"11111","executionId":"execid"}\r\n' +
			'{"reading date":"1/4/22","a":"E","b":50,"c":5,"pipelineId":"11111","executionId":"execid"}\r\n' +
			'{"reading date":"1/4/22","a":"F","b":60,"c":6,"pipelineId":"11111","executionId":"execid"}\r\n'
		);
	});

});
