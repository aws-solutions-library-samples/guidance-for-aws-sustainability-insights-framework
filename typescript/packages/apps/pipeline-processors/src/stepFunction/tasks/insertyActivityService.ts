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
import { S3Client, HeadObjectCommand, PutObjectCommand, SelectObjectContentCommand, SelectObjectContentCommandInput } from '@aws-sdk/client-s3';
import { validateDefined, validateNotEmpty } from '@sif/validators';
import type { S3ObjectCreatedNotificationEventDetail } from 'aws-lambda';
import type { ActivitiesRepository } from '../../api/activities/repository.js';
import type { InsertActivityResult } from './model.js';
import type { Client } from 'pg';

export class InsertActivityTaskService {
	private readonly log: BaseLogger;
	private readonly activitiesRepository: ActivitiesRepository;
	private readonly s3Client: S3Client;
	private readonly chunkSizeBytes: number;

	public constructor(log: BaseLogger, activitiesRepository: ActivitiesRepository, s3Client: S3Client) {
		this.log = log;
		this.activitiesRepository = activitiesRepository;
		this.s3Client = s3Client;
		// the maximum supported by s3 select is 1MB
		this.chunkSizeBytes = 1000000;
	}

	public async process(event: S3ObjectCreatedNotificationEventDetail): Promise<void> {
		this.log.info(`InsertActivityTask> process> event: ${JSON.stringify(event)}`);
		const { bucket, object } = event;

		validateDefined(event, 'event');
		validateNotEmpty(event.bucket, 'event.bucket');
		validateNotEmpty(event.object, 'event.object');

		const [pipelinePath, pipelineId, executionPath, executionId, outputPath, filename] = object.key.split('/');

		validateNotEmpty(pipelineId, 'pipelineId');
		validateNotEmpty(executionId, 'executionId');
		validateNotEmpty(filename, 'filename');

		const result: InsertActivityResult = {
			pipelineId,
			executionId,
			sqlExecutionResult: 'success',
		};

		let sharedDbConnection: Client;
		try {
			sharedDbConnection = await this.activitiesRepository.getConnection();
			const response = await this.s3Client.send(new HeadObjectCommand({ Bucket: event.bucket.name, Key: event.object.key }));
			const objectSize = response.ContentLength;
			// should not process empty file
			if (objectSize > 0) {
				for await (let statement of this.getStatementsByChunk(event.bucket.name, event.object.key, objectSize)) {
					this.log.debug(`processing file ${event.object.key} with size ${objectSize} bytes`);
					await this.activitiesRepository.createRawActivities(statement, sharedDbConnection);
				}
			}
		} catch (Exception) {
			result.sqlExecutionResult = 'failed';
			result.errorMessage = Exception;
			this.log.error(`InsertActivityTask> process> error: ${JSON.stringify(Exception)}`);
		} finally {
			if (sharedDbConnection !== undefined) {
				await sharedDbConnection.end();
			}
			const taskExecutionResult = `${pipelinePath}/${pipelineId}/${executionPath}/${executionId}/${outputPath}/${filename.replace('.sql', '.json')}`;
			await this.s3Client.send(new PutObjectCommand({ Bucket: bucket.name, Key: taskExecutionResult, Body: JSON.stringify(result) }));
		}
		this.log.info(`InsertActivityTask> process> exit:`);
	}

	public async* getStatementsByChunk(bucket: string, key: string, objectSize: number) {
		this.log.debug(`InsertActivityTask> getStatementsByChunk> in: bucket ${bucket}, key: ${key}, objectSize: ${objectSize}`);

		let startBytes = 0;
		while (true) {
			const s3Params: SelectObjectContentCommandInput = {
				Bucket: bucket,
				Key: key,
				ExpressionType: 'SQL',
				Expression: 'SELECT * FROM s3object s',
				InputSerialization: {
					CSV: {},
					CompressionType: 'NONE',
				},
				OutputSerialization: {
					CSV: {},
				},
				ScanRange: {
					Start: startBytes,
					End: startBytes + this.chunkSizeBytes - 1
				},
			};

			const result = await this.s3Client.send(new SelectObjectContentCommand(s3Params));
			const records = [];
			if (result.Payload) {
				for await (const event of result.Payload) {
					if (event.Records?.Payload) {
						records.push(event.Records?.Payload);
					}
				}
				yield Buffer.concat(records).toString('utf8');
			}
			startBytes = startBytes + this.chunkSizeBytes;
			if (startBytes > objectSize) break;
		}

		this.log.debug(`InsertActivityTask> getStatementsByChunk> exit:`);
	}
}
