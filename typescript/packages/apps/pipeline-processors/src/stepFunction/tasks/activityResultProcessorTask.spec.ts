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

import type { LambdaRequestContext, Pipeline, PipelineClient, ReferenceDatasetClient } from '@sif/clients';
import pino from 'pino';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';
import { mockClient } from 'aws-sdk-client-mock';
import { ActivityResultProcessorTask } from './activityResultProcessorTask';
import { CopyObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { DescribeExecutionCommand, SFNClient } from '@aws-sdk/client-sfn';
import type { GetLambdaRequestContext } from '../../plugins/module.awilix.js';
import type { ProcessedTaskEventWithExecutionDetails } from './model.js';
import type { SecurityContext } from '@sif/authz';
import type { CalculatorResultUtil } from '../../utils/calculatorResult.util.js';
import type { PipelineProcessorsRepository } from '../../api/executions/repository.js';
import type { EventPublisher } from '@sif/events';
import type { PipelineExecution } from '../../api/executions/schemas.js';
import type { ConnectorUtility } from '../../utils/connectorUtility.js';
import type { CloudWatchMetricService } from '../services/cloudWatchMetric.service.js';
import type { ResourceTagsService } from '../services/resourceTags.service.js';

describe('ActivitRResultProcessorTaskService', () => {
	let mockedPipelineClient: MockProxy<PipelineClient>;
	let mockedReferenceDatasetClient: MockProxy<ReferenceDatasetClient>;
	let mockedCloudWatchMetricService: MockProxy<CloudWatchMetricService>;
	let mockCalculatorUtil: MockProxy<CalculatorResultUtil>;
	let underTest: ActivityResultProcessorTask;
	let mockedPipelineProcessorRepository: MockProxy<PipelineProcessorsRepository>;
	let mockedEventPublisher: MockProxy<EventPublisher>;
	let mockedConnectorUtility: MockProxy<ConnectorUtility>;
	let mockedResourceTagsService: MockProxy<ResourceTagsService>;

	mockedCloudWatchMetricService = mock<CloudWatchMetricService>();
	mockedConnectorUtility = mock<ConnectorUtility>();
	mockedPipelineClient = mock<PipelineClient>();
	mockedReferenceDatasetClient = mock<ReferenceDatasetClient>();
	mockedResourceTagsService = mock<ResourceTagsService>();
	mockCalculatorUtil = mock<CalculatorResultUtil>();
	mockedEventPublisher = mock<EventPublisher>();
	mockedPipelineProcessorRepository = mock<PipelineProcessorsRepository>();
	const mockedSfnClient = mockClient(SFNClient);
	const mockedS3Client = mockClient(S3Client);

	const pipelineName = 'test-pipeline';
	const pipelineId = 'testPipelineId';
	const executionId = 'testExecutionId';
	const security = {} as SecurityContext;

	beforeEach(() => {
		const logger = pino(
			pino.destination({
				sync: true // test frameworks must use pino logger in sync mode!
			})
		);
		logger.level = 'info';
		process.env['TENANT_ID'] = 'test-tenant';
		process.env['NODE_ENV'] = 'test-env';

		mockedPipelineClient.get.mockReset();
		mockedPipelineProcessorRepository.create.mockReset();
		mockedPipelineProcessorRepository.get.mockReset();
		mockedReferenceDatasetClient.getByAlias.mockReset();
		mockedReferenceDatasetClient.get.mockReset();

		mockedPipelineClient.get.mockResolvedValueOnce({
			id: pipelineId,
			name: pipelineName,
			createdBy: 'unitTest',
			createdAt: new Date(),
			updatedAt: new Date(),
			transformer: {
				transforms: [],
				parameters: []
			},
			version: 1,
			_aggregatedOutputKeyAndTypeMap: { 'month': 'timestamp', 'a': 'string', 'b*c': 'number' },
			type: 'activities'
		} as unknown as Pipeline);

		const mockGetLambdaRequestContext: GetLambdaRequestContext = (): LambdaRequestContext => {
			return {} as unknown as LambdaRequestContext;
		};

		mockedPipelineProcessorRepository.get.mockResolvedValue({ id: executionId } as PipelineExecution);

		underTest = new ActivityResultProcessorTask(logger, mockedS3Client as unknown as S3Client, mockedSfnClient as unknown as SFNClient, mockedCloudWatchMetricService, mockedPipelineClient, mockGetLambdaRequestContext, mockCalculatorUtil, mockedPipelineProcessorRepository, mockedEventPublisher, mockedResourceTagsService, mockedConnectorUtility);

		mockedSfnClient.on(DescribeExecutionCommand).resolves({
			input: JSON.stringify({ source: { key: 'pipeline1/input/someInputData', bucket: 'testBucket' } })
		});


	});


	const processEvent: ProcessedTaskEventWithExecutionDetails = {
		input: {
			security,
			'metricQueue': [],
			sequenceList: [],
			errorLocationList: [],
			pipelineId,
			executionId,
			'outputs': [{ 'name': 'month', 'type': 'timestamp' }, { 'name': 'b*c', 'type': 'number' }],
			'requiresAggregation': true,
			'pipelineType': 'activities',
			'status': 'SUCCEEDED',
			activities: {},
			referenceDatasets: {}
		},
		'executionArn': 'testArn', 'executionStartTime': '2023-08-07T03:18:14.088Z'
	};


	it('Should update execution status to success', async () => {
		await underTest.process(processEvent);
		expect(mockedPipelineClient.get).toBeCalledTimes(1);
		expect(mockedPipelineProcessorRepository.create.mock.calls[0][0].status).toEqual('success');
		expect(mockedEventPublisher.publishTenantEvent.mock.calls[0][0]).toContain({
			'eventType': 'updated',
			'id': 'testExecutionId',
			'resourceType': 'pipelineExecution',
		});
	});


	it('Should update execution status to failed when there is failed calculation', async () => {
		await underTest.process({
			...processEvent,
			input: {
				...processEvent.input,
				errorLocationList: [{ bucket: 'testBucket', key: 'testKey' }]
			}
		});
		expect(mockedPipelineClient.get).toBeCalledTimes(1);
		expect(mockedPipelineProcessorRepository.create).toBeCalledTimes(1);
		expect(mockedPipelineProcessorRepository.create.mock.calls[0][0].status).toEqual('failed');
		expect(mockedPipelineProcessorRepository.create.mock.calls[0][0].statusMessage).toEqual('error when performing calculation, review the pipeline execution error log for further info');
		expect(mockedS3Client.commandCalls(CopyObjectCommand)[0].args[0].input).toEqual({
			'Bucket': 'testBucket',
			'CopySource': 'testBucket/pipeline1/input/someInputData',
			'Key': 'pipeline1/deliveryFailures/postTransformed/someInputData',
		});
		expect(mockedEventPublisher.publishTenantEvent.mock.calls[0][0]).toContain({
			'eventType': 'updated',
			'id': 'testExecutionId',
			'resourceType': 'pipelineExecution',
		});
	});


	it('Should update execution status to failed when there is failed sql insert', async () => {
		await underTest.process({
			...processEvent,
			input: {
				...processEvent.input,
				status: 'FAILED'
			}
		});
		expect(mockedPipelineClient.get).toBeCalledTimes(1);
		expect(mockedPipelineProcessorRepository.create).toBeCalledTimes(1);
		expect(mockedPipelineProcessorRepository.create.mock.calls[0][0].status).toEqual('failed');
		expect(mockedPipelineProcessorRepository.create.mock.calls[0][0].statusMessage).toEqual('error when inserting activities to database');
		expect(mockedEventPublisher.publishTenantEvent.mock.calls[0][0]).toContain({
			'eventType': 'updated',
			'id': 'testExecutionId',
			'resourceType': 'pipelineExecution',
		});
	});

	it('Should update execution status to failed when there are failed calculation and sql inserts', async () => {
		await underTest.process({
			...processEvent,
			input: {
				...processEvent.input,
				status: 'FAILED',
				errorLocationList: [{ bucket: 'testBucket', key: 'testKey' }]
			}
		});
		expect(mockedPipelineClient.get).toBeCalledTimes(1);
		expect(mockedPipelineProcessorRepository.create).toBeCalledTimes(1);
		expect(mockedPipelineProcessorRepository.create.mock.calls[0][0].status).toEqual('failed');
		expect(mockedPipelineProcessorRepository.create.mock.calls[0][0].statusMessage).toEqual('error when performing calculation, review the pipeline execution error log for further info\nerror when inserting activities to database');
		expect(mockedEventPublisher.publishTenantEvent.mock.calls[0][0]).toContain({
			'eventType': 'updated',
			'id': 'testExecutionId',
			'resourceType': 'pipelineExecution',
		});
	});


});
