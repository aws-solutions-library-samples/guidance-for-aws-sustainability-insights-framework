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

import { it, beforeEach, describe, expect } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';
import type { PipelineProcessorsService } from '../../api/executions/service';
import { VerifyTask } from './verifyTask';
import pino from 'pino';
import { HeadObjectCommand, S3Client, SelectObjectContentCommand, SelectObjectContentEventStream } from '@aws-sdk/client-s3';
import type { PipelineClient } from '@sif/clients';
import { mockClient } from 'aws-sdk-client-mock';
import type { SecurityContext } from '@sif/authz';
import type { VerificationTaskEvent } from './model';
import { fromUtf8 } from '@aws-sdk/util-utf8-node';
import type { Pipeline } from '@sif/clients';

function getIterable(data: string[]): AsyncIterable<SelectObjectContentEventStream> {
	const iterableDataRows = {
		async *[Symbol.asyncIterator]() {
			yield {
				Records: {
					Payload: fromUtf8(data.join('\r\n')),
				},
			};
		},
	};
	return iterableDataRows;
}

describe('Verify Task', () => {
	const mockedS3Client = mockClient(S3Client);

	let underTest: VerifyTask, mockedPipelineClient: MockProxy<PipelineClient>, mockedPipelineProcessorsService: MockProxy<PipelineProcessorsService>;

	const ONE_MB = 1000000;
	const chunkSize = 1;

	beforeEach(() => {
		const logger = pino(
			pino.destination({
				sync: true, // test frameworks must use pino logger in sync mode!
			})
		);
		logger.level = 'debug';
		mockedPipelineProcessorsService = mock<PipelineProcessorsService>();
		mockedPipelineClient = mock<PipelineClient>();
		mockedS3Client.reset();

		underTest = new VerifyTask(logger, mockedPipelineClient, mockedPipelineProcessorsService, mockedS3Client as unknown as S3Client, {} as SecurityContext, chunkSize);
	});

	const sampleEvent: VerificationTaskEvent = {
		source: {
			bucket: 'testBucket',
			key: 'testKey',
		},
		pipelineExecutionId: '55555',
		pipelineId: '111111',
	};

	const mockPipeline = {
		transformer: {
			parameters: [
				{
					key: 'one',
				},
				{
					key: 'two',
				},
			],
		},
	};

	const mockPipelineExecution = {
		groupContextId: '/groupId1',
		pipelineVersionId: 2,
	};
	beforeEach(() => {
		mockedPipelineClient.get.mockResolvedValue(mockPipeline as Pipeline);
		mockedPipelineProcessorsService.get.mockResolvedValue(mockPipelineExecution as any);
	});

	it('should split the tasks based on chunk size', async () => {
		const expectedChunkNum = 5;

		mockedS3Client.on(HeadObjectCommand).resolves({
			ContentLength: ONE_MB * expectedChunkNum,
		});

		mockedS3Client.on(SelectObjectContentCommand).resolves({
			Payload: getIterable(['one,two', '10,30']),
		});

		const result = await underTest.process(sampleEvent);

		expect(result.tasks.length).toBe(5);
		// Check the first chunk
		expect(result.tasks[0].chunk.startByte).toBe(0);
		expect(result.tasks[0].chunk.endByte).toBe(1000000);
		// Check that context is being inserted correctly
		expect(result.tasks[0].context).toEqual({
			fileHeaders: ['one', 'two'],
			pipelineId: sampleEvent.pipelineId,
			pipelineExecutionId: sampleEvent.pipelineExecutionId,
			groupContextId: mockPipelineExecution.groupContextId,
			transformer: mockPipeline.transformer,
		});
		// Check the last chunk
		expect(result.tasks[expectedChunkNum - 1].chunk.startByte).toBe(4000004);
		expect(result.tasks[expectedChunkNum - 1].chunk.endByte).toBe(ONE_MB * expectedChunkNum);
	});

	it('should throws exception if file header differs than configuration', async () => {
		const expectedChunkNum = 1;
		mockedS3Client.on(HeadObjectCommand).resolves({
			ContentLength: ONE_MB * expectedChunkNum,
		});

		const invalidHeaders = 'three,four';

		mockedS3Client.on(SelectObjectContentCommand).resolves({
			Payload: getIterable([invalidHeaders, '10,30']),
		});

		await expect(underTest.process(sampleEvent)).rejects.toThrowError(new Error('file header is invalid, expected : one,two, actual: three,four'));
	});
});
