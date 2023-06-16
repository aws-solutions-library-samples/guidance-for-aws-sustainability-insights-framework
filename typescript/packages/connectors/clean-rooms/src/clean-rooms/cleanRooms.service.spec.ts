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
import { mock } from 'vitest-mock-extended';
import pino from 'pino';
import { mockClient } from 'aws-sdk-client-mock';
import { CleanRoomsService } from './cleanRooms.service';
import type { ConnectorEvents } from '@sif/connector-utils';
import type { CleanRoomsRepository } from './cleanRooms.repository';
import { CleanRoomsClient, StartProtectedQueryCommand, StartProtectedQueryCommandInput } from '@aws-sdk/client-cleanrooms';
import { S3Client } from '@aws-sdk/client-s3';
import type { ConnectorIntegrationRequestEvent } from '@sif/clients';

describe('cleanRoomsService', () => {
	const executionId = '111';
	const pipelineId = '2222';
	const transformedInputUploadUrl = 'fakeInputUploadUrl';
	const bucketName = 'testBucket';
	const bucketPrefix = 'cleanRooms';
	const membershipId = '3333';

	const mockedCleanRoomsClient = mockClient(CleanRoomsClient);
	const mockedS3Client = mockClient(S3Client);
	let cleanRoomsService: CleanRoomsService;
	let mockedRepository: CleanRoomsRepository;
	let mockedConnectorEvents: ConnectorEvents;

	beforeEach(() => {
		const logger = pino(
			pino.destination({
				sync: true, // test frameworks must use pino logger in sync mode!
			})
		);
		logger.level = 'debug';

		mockedS3Client.reset();
		mockedCleanRoomsClient.reset();

		mockedConnectorEvents = mock<ConnectorEvents>();
		mockedRepository = mock<CleanRoomsRepository>();
		cleanRoomsService = new CleanRoomsService(logger, mockedCleanRoomsClient as unknown as CleanRoomsClient, bucketName, bucketPrefix, mockedRepository, mockedS3Client as unknown as S3Client, mockedConnectorEvents);

		mockedCleanRoomsClient.on(StartProtectedQueryCommand).resolves({
			protectedQuery: {
				id: '1234'
			}
		} as any);
	});


	it('happy path', async () => {
		const event: ConnectorIntegrationRequestEvent = {
			executionId,
			transformedInputUploadUrl,
			connector: {
				name: 'sample-cleanrooms-connector',
				parameters: {
					query: 'SELECT "timestamp" as "date",  SUM(fuelamount) fuelamount FROM cleanrooms WHERE "date" > \'#date\' GROUP BY "date"',
					parameters: {
						date: '1/1/2022'
					},
					membershipId: membershipId
				}
			},
			pipeline: {
				id: pipelineId,
			}
		} as any;

		await cleanRoomsService.startQueryExecution(event);
		const queryCommandInput = mockedCleanRoomsClient.calls()[0].args[0].input as StartProtectedQueryCommandInput;

		expect(queryCommandInput.sqlParameters.queryString).toBe('SELECT "timestamp" as "date",  SUM(fuelamount) fuelamount FROM cleanrooms WHERE "date" > \'1/1/2022\' GROUP BY "date"');
		expect(queryCommandInput.membershipIdentifier).toBe(membershipId);
		expect(mockedRepository.create).toBeCalledWith({ executionId, membershipId, pipeline: { id: pipelineId }, queryId: '1234', transformedInputUploadUrl });
	});

	it('should throws exception when membershipId is not being set', async () => {
		const event: ConnectorIntegrationRequestEvent = {
			executionId,
			transformedInputUploadUrl,
			connector: {
				name: 'sample-cleanrooms-connector',
				parameters: {
					query: 'SELECT "timestamp" as "date",  SUM(fuelamount) fuelamount FROM cleanrooms WHERE "date" > \'#date\' GROUP BY "date"',
					parameters: {
						date: '1/1/2022'
					}
				}
			},
			pipeline: {
				id: pipelineId,
			}
		} as any;
		await cleanRoomsService.startQueryExecution(event);
		expect(mockedConnectorEvents.publishResponse).toBeCalledWith({
			'executionId': '111',
			'pipelineId': '2222',
			'status': 'error',
			'statusMessage': 'Missing required parameter \'membershipId\''
		});
	});

	it('should throws exception when placeholder multiple parameters are not being set', async () => {
		const event: ConnectorIntegrationRequestEvent = {
			executionId,
			transformedInputUploadUrl,
			connector: {
				name: 'sample-cleanrooms-connector',
				parameters: {
					query: 'SELECT "timestamp" as "date",  SUM(fuelamount) fuelamount FROM cleanrooms WHERE "date" > \'#date\' AND "fuelAmount" < \'#fuelAmount\'  GROUP BY "date"',
					parameters: {},
					membershipId: membershipId
				}
			},
			pipeline: {
				id: pipelineId,
			}
		} as any;

		await cleanRoomsService.startQueryExecution(event);

		expect(mockedConnectorEvents.publishResponse).toBeCalledWith({
			'executionId': '111',
			'pipelineId': '2222',
			'status': 'error',
			'statusMessage': 'These parameters are not being specified: #date,#fuelAmount'
		});
	});

	it('should throws exception when placeholder parameter are not being set', async () => {
		const event: ConnectorIntegrationRequestEvent = {
			executionId,
			transformedInputUploadUrl,
			connector: {
				name: 'sample-cleanrooms-connector',
				parameters: {
					query: 'SELECT "timestamp" as "date",  SUM(fuelamount) fuelamount FROM cleanrooms WHERE "date" > \'#date\' GROUP BY "date"',
					parameters: {},
					membershipId: membershipId
				}
			},
			pipeline: {
				id: pipelineId,
			}
		} as any;

		await cleanRoomsService.startQueryExecution(event);

		expect(mockedConnectorEvents.publishResponse).toBeCalledWith({
			'executionId': '111',
			'pipelineId': '2222',
			'status': 'error',
			'statusMessage': 'These parameters are not being specified: #date'
		});
	});


});
