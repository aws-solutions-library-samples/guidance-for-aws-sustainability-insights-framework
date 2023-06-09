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
import { HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { PipelineClient } from '@sif/clients';
import { mockClient } from 'aws-sdk-client-mock';
import type { SecurityContext } from '@sif/authz';
import type { VerificationTaskEvent } from './model';
import type { Pipeline } from '@sif/clients';
import type { GetLambdaRequestContext, GetSecurityContext } from '../../plugins/module.awilix';
import type { LambdaRequestContext } from '@sif/clients/dist';

describe('Verify Task', () => {
	const mockedS3Client = mockClient(S3Client);

	let underTest: VerifyTask, mockedPipelineClient: MockProxy<PipelineClient>, mockedPipelineProcessorsService: MockProxy<PipelineProcessorsService>;

	const ONE_MB = 1000000;
	const chunkSize = 1;

	const mockGetContext: GetSecurityContext = async (): Promise<SecurityContext> => {
		return {} as unknown as SecurityContext;
	};

	const mockGetLambdaRequestContext: GetLambdaRequestContext = (): LambdaRequestContext => {
		return {
			authorizer: {
				claims: {
					email: 'email',
					'cognito:groups': `/|||reader`,
					groupContextId: '/',
				},
			},
		};
	};

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

		underTest = new VerifyTask(logger, mockedPipelineClient, mockedPipelineProcessorsService, mockedS3Client as unknown as S3Client, mockGetContext, chunkSize, mockGetLambdaRequestContext);
	});

	const sampleEvent: VerificationTaskEvent = {
		source: {
			bucket: 'testBucket',
			key: 'testKey',
		},
		executionId: '55555',
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

		const result = await underTest.process(sampleEvent);

		expect(result.chunks.length).toBe(5);
		// Check the first chunk
		expect(result.chunks[0].range[0]).toBe(0);
		expect(result.chunks[0].range[1]).toBe(1000000);
		// Check that context is being inserted correctly
		expect(result.context).toEqual({
			pipelineId: sampleEvent.pipelineId,
			executionId: sampleEvent.executionId,
			groupContextId: mockPipelineExecution.groupContextId,
			transformer: mockPipeline.transformer,
		});
		// Check the last chunk
		expect(result.chunks[expectedChunkNum - 1].range[0]).toBe(4000004);
		expect(result.chunks[expectedChunkNum - 1].range[1]).toBe(ONE_MB * expectedChunkNum);
	});
});
