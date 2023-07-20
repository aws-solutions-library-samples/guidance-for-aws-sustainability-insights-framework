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

import type { BaseLogger } from 'pino';
import type { ConnectorIntegrationRequestEvent } from '@sif/clients';
import { CleanRoomsClient, StartProtectedQueryCommand } from '@aws-sdk/client-cleanrooms';
import type { S3Client } from '@aws-sdk/client-s3';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { convertCsvReadableStreamToSifFormat, HandleEmptyCellTypes } from '@sif/connector-utils';
import type { ConnectorEvents } from '@sif/connector-utils';
import type { CleanRoomsRepository } from './cleanRooms.repository';
import axios from 'axios';
import fs from 'fs';
import { validateDefined } from '@sif/validators';
import { InvalidQueryError } from './cleanRooms.model';

export class CleanRoomsService {
	public constructor(
		private readonly log: BaseLogger,
		private readonly cleanRoomsClient: CleanRoomsClient,
		private readonly bucketName: string,
		private readonly bucketPrefix: string,
		private readonly repository: CleanRoomsRepository,
		private readonly s3Client: S3Client,
		private readonly connectorEvents: ConnectorEvents
	) {
	}

	private async uploadTransformedData(url: string, path: string): Promise<void> {
		this.log.info(`cleanRoomsService> uploadTransformedData> in> url: ${url}`);

		if (!url) {
			throw new Error(`Unable to upload transformed input data file: url: ${url}`);
		}

		try {
			await axios.put(url, fs.readFileSync(path));
		} catch (e) {
			throw new Error(`Unable to upload transformed input data file: error${JSON.stringify(e)}`);
		}

		this.log.info(`csvService> uploadTransformedData> in> url: ${url}`);
	}

	public async processQueryExecutionResult(queryId: string, bucketName: string, key: string) {
		this.log.info(`cleanRoomsService > processQueryExecutionResult > queryId: ${JSON.stringify(queryId)}, bucketName: ${bucketName}, key: ${key}`);
		const { pipeline, executionId, transformedInputUploadUrl } = await this.repository.get(queryId);
		try {
			const getObjectResponse = await this.s3Client.send(new GetObjectCommand({ Bucket: bucketName, Key: key }));

			// convert cleanrooms output to sif format
			const transformedFilePath = await convertCsvReadableStreamToSifFormat(getObjectResponse.Body as any, pipeline.transformer.parameters, {
				delimiter: ',',
				handleEmptyCells: HandleEmptyCellTypes.setToEmptyString,
				skipParsingErrors: false
			});

			// upload the result to the bucket
			await this.uploadTransformedData(transformedInputUploadUrl, transformedFilePath);

			// publish the event to start the state machine
			await this.connectorEvents.publishResponse({
				executionId: executionId,
				pipelineId: pipeline.id,
				pipelineType: pipeline.type,
				status: 'success',
				statusMessage: `successfully queried input from cleanrooms for pipeline: ${pipeline.id}, execution: ${executionId}`
			});
			this.log.info(`cleanRoomsService > processQueryExecutionResult > transformedFilePath: ${transformedFilePath}`);
		} catch (error) {
			this.log.error(`cleanRoomsService> processQueryExecutionResult> error: ${JSON.stringify(error)}`);

			// if anything fails, publish an error response back
			await this.connectorEvents.publishResponse({
				executionId: executionId,
				pipelineId: pipeline.id,
				status: 'error',
				pipelineType: pipeline.type,
				statusMessage: error.message
			});
		}
	}

	public async startQueryExecution(event: ConnectorIntegrationRequestEvent) {
		this.log.info(`cleanRoomsService > startQueryExecution > event: ${JSON.stringify(event)}`);

		let { query, membershipId, parameters } = event?.connector?.parameters;

		try {
			validateDefined(query, 'query');
			validateDefined(membershipId, 'membershipId');
			validateDefined(parameters, 'parameters');

			for (const [key, value] of Object.entries(parameters)) {
				query = query.replaceAll(`#${key}`, value);
			}

			// check if there are placeholder parameters that are not being satisfied by the provided connector parameter
			const invalidParameters = Array.from(query.matchAll(/#[A-Za-z0-9]+/g));
			if (invalidParameters.length > 0) {
				throw new InvalidQueryError(`These parameters are not being specified: ${invalidParameters.join(',')}`);
			}

			const queryCommandResult = await this.cleanRoomsClient.send(new StartProtectedQueryCommand(
				{
					membershipIdentifier: membershipId,
					resultConfiguration: {
						outputConfiguration: {
							s3: {
								resultFormat: 'CSV',
								bucket: this.bucketName,
								keyPrefix: this.bucketPrefix
							}
						}
					},
					sqlParameters: {
						queryString: query
					},
					type: 'SQL'
				}));

			await this.repository.create({
				queryId: queryCommandResult.protectedQuery.id,
				executionId: event.executionId,
				pipeline: event.pipeline,
				transformedInputUploadUrl: event.transformedInputUploadUrl,
				membershipId: membershipId
			});
		} catch (Exception) {
			this.log.error(`cleanRoomsService > startQueryExecution > error : ${Exception.message}`);
			await this.connectorEvents.publishResponse({
				executionId: event.executionId,
				pipelineId: event.pipeline.id,
				pipelineType: event.pipeline.type,
				status: 'error',
				statusMessage: Exception.message
			});
		}
		this.log.info(`cleanRoomsService > startQueryExecution > exit`);
	}

}
