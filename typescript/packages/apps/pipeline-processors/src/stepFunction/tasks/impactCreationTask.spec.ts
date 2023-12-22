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

import { beforeEach, describe, test, expect } from 'vitest';
import { ImpactCreationTask } from './impactCreationTask';
import pino from 'pino';
import { GetObjectCommand, GetObjectCommandOutput, S3Client } from '@aws-sdk/client-s3';
import type { ImpactClient } from '@sif/clients';
import type { GetLambdaRequestContext } from '../../plugins/module.awilix';
import { mock, MockProxy, mockReset } from 'vitest-mock-extended';
import { mockClient } from 'aws-sdk-client-mock';
import { sdkStreamMixin } from '@aws-sdk/util-stream-node';
import { Readable } from 'stream';
import type { ProcessedTaskEvent } from './model';

describe('ImpactCreationTask', () => {

	let underTest: ImpactCreationTask;
	const mockedS3Client = mockClient(S3Client);
	let mockImpactClient: MockProxy<ImpactClient>;

	let mockGetLambdaRequestContext: GetLambdaRequestContext = (() => {
	}) as any;

	beforeEach(() => {
		const logger = pino(
			pino.destination({
				sync: true // test frameworks must use pino logger in sync mode!
			})
		);
		logger.level = 'info';
		mockedS3Client.reset();
		mockImpactClient = mock<ImpactClient>();
		underTest = new ImpactCreationTask(logger, mockedS3Client as unknown as S3Client, 'bucket', mockImpactClient, mockGetLambdaRequestContext);
		mockReset(mockImpactClient);
	});

	const rowWithNoTagsOrAttributes =
		['activityName,impactName,componentKey,componentValue,componentType\ntestActivity,testImpact,co2e,2,carbon,advance,admin_test,emission\n', {
			'name': 'testActivity',
			'attributes': {},
			'tags': {
				'pipelineId': 'pipe1',
				'executionId': 'exec1'
			},
			'impacts': {
				'testImpact': {
					'name': 'testImpact',
					'attributes': {},
					'components': {
						'co2e': {
							'key': 'co2e',
							'value': 2,
							'type': 'carbon'
						}
					}
				}
			}
		}
		];

	const rowWithTagsAndAttributes = ['activityName,impactName,componentKey,componentValue,componentType,activity_attribute_level,activity_tag_createdBy,impact_attribute_type\ntestActivity,testImpact,co2e,2,carbon,advance,admin_test,emission\n', {
		'name': 'testActivity',
		'attributes': {
			'level': 'advance'
		},
		'tags': {
			'pipelineId': 'pipe1',
			'executionId': 'exec1',
			'createdBy': 'admin_test'
		},
		'impacts': {
			'testImpact': {
				'name': 'testImpact',
				'attributes': {
					'type': 'emission'
				},
				'components': {
					'co2e': {
						'key': 'co2e',
						'value': 2,
						'type': 'carbon'
					}
				}
			}
		}
	}];

	test.each([rowWithNoTagsOrAttributes, rowWithTagsAndAttributes])
	('update activity [happy path', async (data, expectedNewActivity) => {
		const outputChunk: GetObjectCommandOutput = {
			$metadata: {},
			Body: sdkStreamMixin(Readable.from([data]))
		};
		mockedS3Client.on(GetObjectCommand, {
			Bucket: 'bucket',
			Key: 'pipelines/pipe1/executions/exec1/output/result.csv'
		}).resolves(outputChunk);

		mockImpactClient.getByAlias.mockResolvedValue({ id: '123' } as any);

		await underTest.process({
			pipelineId: 'pipe1', executionId: 'exec1', errorLocationList: []
		} as ProcessedTaskEvent);
		expect(mockImpactClient.update).toHaveBeenCalledWith('123', expectedNewActivity, undefined);
	});

	test.each([rowWithNoTagsOrAttributes, rowWithTagsAndAttributes])
	('create activity happy path', async (data, expectedNewActivity) => {
		const outputChunk: GetObjectCommandOutput = {
			$metadata: {},
			Body: sdkStreamMixin(Readable.from([data]))
		};
		mockedS3Client.on(GetObjectCommand, {
			Bucket: 'bucket',
			Key: 'pipelines/pipe1/executions/exec1/output/result.csv'
		}).resolves(outputChunk);

		await underTest.process({
			pipelineId: 'pipe1', executionId: 'exec1', errorLocationList: []
		} as ProcessedTaskEvent);
		expect(mockImpactClient.create).toHaveBeenCalledWith(expectedNewActivity, undefined);
	});

});
