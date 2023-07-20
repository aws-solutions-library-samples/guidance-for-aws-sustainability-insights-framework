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

import type { SecurityContext } from '@sif/authz';
import type { CalculatorClient, MetricClient, LambdaRequestContext } from '@sif/clients';
import pino from 'pino';
import { beforeEach, describe, expect, it } from 'vitest';
import { MockProxy, mock } from 'vitest-mock-extended';
import type { PipelineProcessorsService } from '../../api/executions/service.js';
import type { GetLambdaRequestContext, GetSecurityContext } from '../../plugins/module.awilix.js';
import { CalculationTask } from './calculationTask';
import type { CalculationChunk, CalculationContext } from './model.js';

const sampleParameters = [
	{
		key: 'one',
		type: 'string',
	},
	{
		key: 'two',
		type: 'number',
	},
];
const sampleTransforms = [
	{
		index: 0,
		formula: 'if(:one==\'ok\',50,1)',
		outputs: [
			{
				index: 0,
				key: 'sum',
				type: 'number',
			},
		],
	},
	{
		index: 1,
		formula: 'if(:two==10,50,1)',
		outputs: [
			{
				index: 0,
				key: 'sumtwo',
				type: 'number',
			},
		],
	},
];

describe('Calculation Task', () => {
	let underTest: CalculationTask,
		mockedCalculatorClient: MockProxy<CalculatorClient>,
		mockedPipelineProcessorsService: MockProxy<PipelineProcessorsService>,
		mockMetricClient: MockProxy<MetricClient>;

	let sampleChunkFirst: CalculationChunk = { sequence: 0, range: [0, 100] };
	let sampleChunkSecond: CalculationChunk = { sequence: 1, range: [101, 200] };

	let sampleSource = {
		key: 'pipelines/1/executions/1/input.csv',
		bucket: 'test_bucket',
	};

	beforeEach(() => {
		const logger = pino(
			pino.destination({
				sync: true, // test frameworks must use pino logger in sync mode!
			})
		);
		logger.level = 'debug';
		mockedPipelineProcessorsService = mock<PipelineProcessorsService>();
		mockedCalculatorClient = mock<CalculatorClient>();
		mockedPipelineProcessorsService = mock<PipelineProcessorsService>();
		mockMetricClient = mock<MetricClient>();
		mockedCalculatorClient.process.mockReset();
		mockedCalculatorClient.process.mockResolvedValue({
			data: [],
			auditLogLocation: { bucket: 'unit-test-bucket', key: 'audit-test-key' },
			errorLocation: { bucket: 'unit-test-bucket', key: 'error-test-key' },
		});

		const mockGetContext: GetSecurityContext = async (): Promise<SecurityContext> => {
			return {} as unknown as SecurityContext;
		};

		const mockGetLambdaRequestContext: GetLambdaRequestContext = (): LambdaRequestContext => {
			return {} as unknown as LambdaRequestContext;
		};


		underTest = new CalculationTask(logger, mockedPipelineProcessorsService, mockedCalculatorClient, mockGetContext, mockGetLambdaRequestContext, mockMetricClient);
	});

	it('happy path first chunk', async () => {
		const context: CalculationContext = {
			actionType: 'create',
			transformer: {
				transforms: sampleTransforms,
				parameters: sampleParameters,
			},
			pipelineType: 'activities',
			groupContextId: '/unit/test/group',
			pipelineId: 'unit-test-pipeline',
			executionId: 'unit-test-pipeline-execution',
			pipelineCreatedBy: 'admin',
		} as CalculationContext;

		const result = await underTest.process({ context, chunk: sampleChunkFirst, source: sampleSource });

		expect(mockedCalculatorClient.process).toHaveBeenCalledWith({
			groupContextId: '/unit/test/group',
			pipelineId: 'unit-test-pipeline',
			pipelineType: 'activities',
			executionId: 'unit-test-pipeline-execution',
			parameters: sampleParameters,
			transforms: sampleTransforms,
			sourceDataLocation: {
				bucket: sampleSource.bucket,
				key: sampleSource.key,
				startByte: sampleChunkFirst.range[0],
				endByte: sampleChunkFirst.range[1],
			},
			chunkNo: 0,
			actionType: 'create',
			username: 'admin',
		});

		expect(result.pipelineId).toEqual('unit-test-pipeline');
		expect(result.executionId).toEqual('unit-test-pipeline-execution');
		expect(result.sequence).toEqual(0);
		expect(result.errorLocation).toEqual({ bucket: 'unit-test-bucket', key: 'error-test-key' });
	});

	it('happy path second chunk', async () => {
		const context: CalculationContext = {
			actionType: 'create',
			pipelineType: 'activities',
			transformer: {
				transforms: sampleTransforms,
				parameters: sampleParameters,
			},
			groupContextId: '/unit/test/group',
			pipelineId: 'unit-test-pipeline',
			executionId: 'unit-test-pipeline-execution',
			pipelineCreatedBy: 'admin',
		} as CalculationContext;

		const result = await underTest.process({ context, chunk: sampleChunkSecond, source: sampleSource });

		expect(mockedCalculatorClient.process).toHaveBeenCalledWith({
			actionType: 'create',
			username: 'admin',
			groupContextId: '/unit/test/group',
			pipelineId: 'unit-test-pipeline',
			pipelineType: 'activities',
			executionId: 'unit-test-pipeline-execution',
			parameters: sampleParameters,
			transforms: sampleTransforms,
			sourceDataLocation: {
				bucket: sampleSource.bucket,
				key: sampleSource.key,
				startByte: sampleChunkSecond.range[0],
				endByte: sampleChunkSecond.range[1],
			},
			chunkNo: 1,
		});
		expect(result.sequence).toEqual(1);
	});
});
