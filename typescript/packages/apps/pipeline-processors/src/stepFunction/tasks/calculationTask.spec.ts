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

import { CalculationTask } from './calculationTask';
import pino from 'pino';
import { describe, expect, it, beforeEach } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';
import type { CalculationContext } from './model';
import type { PipelineProcessorsService } from '../../api/executions/service';
import type { CalculatorClient } from '@sif/clients';
import type { SecurityContext } from '@sif/authz';

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
		formula: "if(:one=='ok',50,1)",
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
	let underTest: CalculationTask, mockedCalculatorClient: MockProxy<CalculatorClient>, mockedPipelineProcessorsService: MockProxy<PipelineProcessorsService>;

	let sampleChunkFirst = { startByte: 0, endByte: 100 };
	let sampleChunkSecond = { startByte: 101, endByte: 200 };

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
		mockedCalculatorClient.process.mockReset();
		mockedCalculatorClient.process.mockResolvedValue({
			auditLogLocation: { bucket: 'unit-test-bucket', key: 'audit-test-key' },
			errorLocation: { bucket: 'unit-test-bucket', key: 'error-test-key' },
		});
		underTest = new CalculationTask(logger, mockedPipelineProcessorsService, mockedCalculatorClient, {} as SecurityContext);
	});

	it('happy path first chunk', async () => {
		const context: CalculationContext = {
			fileHeaders: ['one', 'two'],
			transformer: {
				transforms: sampleTransforms,
				parameters: sampleParameters,
			},
			groupContextId: '/unit/test/group',
			pipelineId: 'unit-test-pipeline',
			pipelineExecutionId: 'unit-test-pipeline-execution',
		} as CalculationContext;

		const result = await underTest.process({ context, chunk: sampleChunkFirst, source: sampleSource, sequence: 0 });

		expect(mockedCalculatorClient.process).toHaveBeenCalledWith({
			groupContextId: '/unit/test/group',
			pipelineId: 'unit-test-pipeline',
			executionId: 'unit-test-pipeline-execution',
			parameters: sampleParameters,
			transforms: sampleTransforms,
			csvHeader: 'one,two',
			csvSourceDataLocation: {
				bucket: sampleSource.bucket,
				key: sampleSource.key,
				startByte: sampleChunkFirst.startByte,
				endByte: sampleChunkFirst.endByte,
				containsHeader: true,
			},
			chunkNo: 0,
		});

		expect(result.pipelineId).toEqual('unit-test-pipeline');
		expect(result.pipelineExecutionId).toEqual('unit-test-pipeline-execution');
		expect(result.sequence).toEqual(0);
		expect(result.output).toEqual({
			auditLogLocation: { bucket: 'unit-test-bucket', key: 'audit-test-key' },
			errorLocation: { bucket: 'unit-test-bucket', key: 'error-test-key' },
		});
	});

	it('happy path second chunk', async () => {
		const context: CalculationContext = {
			fileHeaders: ['one', 'two'],
			transformer: {
				transforms: sampleTransforms,
				parameters: sampleParameters,
			},
			groupContextId: '/unit/test/group',
			pipelineId: 'unit-test-pipeline',
			pipelineExecutionId: 'unit-test-pipeline-execution',
		} as CalculationContext;

		const result = await underTest.process({ context, chunk: sampleChunkSecond, source: sampleSource, sequence: 1 });

		expect(mockedCalculatorClient.process).toHaveBeenCalledWith({
			groupContextId: '/unit/test/group',
			pipelineId: 'unit-test-pipeline',
			executionId: 'unit-test-pipeline-execution',
			parameters: sampleParameters,
			transforms: sampleTransforms,
			csvHeader: 'one,two',
			csvSourceDataLocation: {
				bucket: sampleSource.bucket,
				key: sampleSource.key,
				startByte: sampleChunkSecond.startByte,
				endByte: sampleChunkSecond.endByte,
				containsHeader: false,
			},
			chunkNo: 1,
		});

		expect(result.pipelineId).toEqual('unit-test-pipeline');
		expect(result.pipelineExecutionId).toEqual('unit-test-pipeline-execution');
		expect(result.sequence).toEqual(1);
		expect(result.output).toEqual({
			auditLogLocation: { bucket: 'unit-test-bucket', key: 'audit-test-key' },
			errorLocation: { bucket: 'unit-test-bucket', key: 'error-test-key' },
		});
	});
});
