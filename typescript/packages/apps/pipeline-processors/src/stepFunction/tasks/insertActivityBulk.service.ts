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
import { S3Client, HeadObjectCommand, SelectObjectContentCommandInput, SelectObjectContentCommand } from '@aws-sdk/client-s3';
import { validateDefined, validateNotEmpty } from '@sif/validators';
import type { ActivitiesRepository } from '../../api/activities/repository.js';
import type { InsertActivityBulkEvent, InsertActivityBulkResult, SqlExecutionResultStatus } from './model.js';
import type { Client } from 'pg';
import { toUtf8 } from '@aws-sdk/util-utf8-node';
import type { SFNClient } from '@aws-sdk/client-sfn';
import { SendTaskSuccessCommand } from '@aws-sdk/client-sfn';

export class InsertActivityBulkService {
	public constructor(private log: BaseLogger, private activitiesRepository: ActivitiesRepository, private s3Client: S3Client, private bucket: string,
					   private bucketPrefix: string, private auditVersion: number, private sfnClient: SFNClient) {
	}

	public async process(event: InsertActivityBulkEvent): Promise<InsertActivityBulkResult> {
		this.log.info(`InsertActivityBulk> process> event: ${JSON.stringify(event)}`);

		validateDefined(event, 'event');

		const { pipelineId, executionId } = event.context;
		const { activityValueKey, sequence } = event.calculatorTransformResponse;

		this.log.info(`InsertActivityBulk> process> pipelineId: ${pipelineId}, executionId: ${executionId}, sequence:${sequence}`);

		validateDefined(event, 'event');
		validateNotEmpty(pipelineId, 'pipelineId');
		validateNotEmpty(executionId, 'executionId');
		validateNotEmpty(sequence, 'sequence');

		let insertActivityBulkResult: InsertActivityBulkResult;

		// check if we have a duplicate event if so skip
		const isDuplicate = await this.isDuplicateRequest({ executionId, sequence, pipelineId });
		if (isDuplicate) {
			this.log.info(`InsertActivityBulk> process> exit: duplicate event detected skip`);
		}
		await this.validateFilesExists(activityValueKey);

		let status = 'success';
		let sharedDbConnection: Client;
		try {
			sharedDbConnection = await this.activitiesRepository.getConnection();
			// create the temporary tables
			await this.activitiesRepository.createTempTables({ executionId, sequence }, sharedDbConnection);

			// create the Activity Load statements to load data into the temporary tables
			await this.activitiesRepository.loadDataFromS3({ executionId, sequence, activityValueKey }, this.bucket, sharedDbConnection);

			// start the transactional migration process
			await this.activitiesRepository.moveActivities({ executionId, sequence }, this.auditVersion, sharedDbConnection);
			await this.activitiesRepository.moveActivityValues({ executionId, sequence }, sharedDbConnection);
		} catch (Exception) {
			this.log.error(`InsertActivityBulk> process> error: ${JSON.stringify(Exception)}`);

			if ((Exception as Error).message === 'Import from S3 failed, 0 rows were copied successfully') {

				// Check if activity file has any content if it does we return a failed status
				for await (let statement of this.validateFileHasContent(activityValueKey)) {
					const statements = statement.split(`\n`).filter(o => o !== '');
					const firstStatement = Number(statements[0]);

					// fail if the activity file has any value record
					if (firstStatement > 0) {
						status = 'failed';
					}
				}
			} else {
				status = 'failed';
			}
		} finally {
			if (sharedDbConnection !== null) {
				await sharedDbConnection.end();
			}

			insertActivityBulkResult = {
				// only return context on the first event to avoid excessive payload
				context: sequence === 0 ? event.context : undefined,
				calculatorTransformResponse: event.calculatorTransformResponse,
				sqlExecutionResult: {
					status: status as SqlExecutionResultStatus
				}
			};

			this.log.debug(`InsertActivityBulkTask> process> exit > insertActivityBulkResult: ${JSON.stringify(insertActivityBulkResult)}`);
		}

		if (event.stateMachine?.taskToken) {
			try {
				await this.sfnClient.send(new SendTaskSuccessCommand({ output: JSON.stringify(insertActivityBulkResult), taskToken: event.stateMachine?.taskToken }));
				this.log.debug(`InsertActivityBulkTask> process > callback to State Machine`);
			} catch (err) {
				if (err instanceof Error && err.name === 'TaskTimedOut') {
					this.log.warn(`InsertActivityBulkTask> process> exit > StepFunction task timed out, error: ${JSON.stringify(err)}`);
				} else {
					throw err;
				}
			}
		}
		return insertActivityBulkResult;
	}

	private async validateFilesExists(activityValueFileName: string) {
		this.log.debug(`InsertActivityBulk> validateFilesExists> in: ${JSON.stringify(activityValueFileName)}`);

		try {
			const activityValueResp = await this.s3Client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: `${activityValueFileName}` }));
			const activityValueSize = activityValueResp.ContentLength;

			if (activityValueSize < 0) {
				this.log.error(`InsertActivityBulk> validateFilesExists> error: file with keys : [${activityValueFileName}] is invalid`);
				throw new InvalidFileError(`file with keys : [${activityValueFileName}] is invalid`);
			}

		} catch (Exception) {
			if ((Exception as Error).name === 'NotFound') {
				this.log.error(`InsertActivityBulk> validateFilesExists> error: file with keys : [${activityValueFileName}] not found`);
				throw new InvalidFileError(`file with keys : [${activityValueFileName}] is invalid`);
			} else {
				throw Exception;
			}
		}
		this.log.trace(`InsertActivityBulk> validateFilesExists> exit`);
		return;
	}

	private async isDuplicateRequest(event: { executionId: string, sequence: number, pipelineId: string }): Promise<boolean> {
		this.log.trace(`InsertActivityBulk> isDuplicateRequest> in: ${JSON.stringify(event)}`);
		let isDuplicate = false;
		try {
			const previousExecutionResp = await this.s3Client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: `${this.bucketPrefix}/${event.pipelineId}/executions/${event.executionId}/output/${event.sequence}.json` }));
			const previousExecutionSize = previousExecutionResp.ContentLength;

			if (previousExecutionSize >= 0) {
				this.log.error(`InsertActivityBulk> isDuplicateRequest> error: sequence has already been processed, key exists: ${this.bucketPrefix}/${event.pipelineId}/executions/${event.executionId}/output/${event.sequence}.json`);
				isDuplicate = true;
			}

		} catch (Exception) {
			if ((Exception as Error).name === 'NotFound') {
				this.log.trace(`InsertActivityBulk> isDuplicateRequest> no previous executions found continue`);
			}
		}
		this.log.trace(`InsertActivityBulk> isDuplicateRequest> exit`);
		return isDuplicate;
	}

	private async* validateFileHasContent(activityValueFileName: string) {
		this.log.debug(`InsertActivityBulk> validateFileHasContent> in: ${JSON.stringify(activityValueFileName)}`);

		const s3Params: SelectObjectContentCommandInput = {
			Bucket: this.bucket,
			Key: `${activityValueFileName}`,
			ExpressionType: 'SQL',
			Expression: 'SELECT count(*) as c FROM s3object s Limit 5',
			InputSerialization: {
				CSV: {
					FileHeaderInfo: 'IGNORE',
					RecordDelimiter: '\n'
				},
				CompressionType: 'NONE'
			},
			OutputSerialization: {
				CSV: {
					RecordDelimiter: '\n'
				}
			},
			ScanRange: {
				Start: 0,
				End: 1000
			}
		};
		const result = await this.s3Client.send(new SelectObjectContentCommand(s3Params));

		if (result.Payload) {
			for await (const event of result.Payload) {
				if (event.Records?.Payload) {
					yield toUtf8(event.Records.Payload);
				}
			}
		}
		this.log.debug(`InsertActivityBulk> validateFileHasContent> result: ${JSON.stringify(result)}`);
	}
}


export class InvalidFileError extends Error {
	public constructor(message: string) {
		super(message);
		this.name = 'InvalidFileError';
	}
}

