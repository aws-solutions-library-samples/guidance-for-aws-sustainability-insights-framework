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

import { GetObjectCommand, S3Client,DeleteObjectsCommand } from '@aws-sdk/client-s3';
import type { ActivitiesRepository } from '../../api/activities/repository.js';

import pLimit from 'p-limit';
import type { BaseLogger } from 'pino';
import type { PipelineProcessorsService } from '../../api/executions/service.js';
import type { GetSecurityContext } from '../../plugins/module.awilix.js';
import type { InsertActivityResult, ProcessedTaskEvent, ProcessedTaskEventWithStartTime } from './model.js';
import type { Client } from 'pg';
import dayjs from 'dayjs';
import { TimeoutError } from '../../common/errors.js';

// TODO: make configurable
const concurrencyLimit = 10;

export class SqlResultProcessorTask {
	private readonly log: BaseLogger;
	private readonly pipelineProcessorsService: PipelineProcessorsService;
	private readonly activitiesRepository: ActivitiesRepository;
	private readonly s3: S3Client;
	private readonly bucket: string;
	private readonly getSecurityContext: GetSecurityContext;
	private cleanupFiles:string[];
	private readonly timeout:number;

	constructor(log: BaseLogger, getSecurityContext: GetSecurityContext, pipelineProcessorsService: PipelineProcessorsService, s3: S3Client, bucket: string, activitiesRepository: ActivitiesRepository) {
		this.log = log;
		this.pipelineProcessorsService = pipelineProcessorsService;
		this.s3 = s3;
		this.bucket = bucket;
		this.getSecurityContext = getSecurityContext;
		this.activitiesRepository =activitiesRepository;
		this.cleanupFiles = [];
		this.timeout = 7200;

	}

	public async process(taskEvent: ProcessedTaskEventWithStartTime): Promise<ProcessedTaskEvent[]> {
		this.log.debug(`SqlResultProcessorTask > process > event: ${JSON.stringify(taskEvent)}`);

		const event = taskEvent.input;


		const sortedResults = event.sort((a, b) => {
			return a.sequence - b.sequence;
		});

		const firstResult = sortedResults[0];
		const { pipelineId, executionId } = firstResult;

		let status;
		let sharedDbConnection :Client;

		try {

			//Check the total execution time of the step function exceeds our timeout of 2 hours
			const startTime = dayjs(taskEvent.startTime,'YYYY-MM-ddTHH:mm:ss.SSSZ');
			const now = dayjs();
			const runtime = now.diff(startTime,'seconds');
			this.log.error(`SqlResultProcessorTask > process >step function execution execution has been running for ${runtime} seconds`);
			if( runtime >= this.timeout){
				this.log.error(`SqlResultProcessorTask > process > step function execution exceeded timeout: ${this.timeout} seconds`);
				throw new TimeoutError(`step function execution exceeded timeout: ${this.timeout} seconds`)

			}

			sharedDbConnection = await this.activitiesRepository.getConnection();
			// Confirm #temp tables matches #chunks
			const countTables = await this.activitiesRepository.getCountTempTables(executionId, sharedDbConnection);
			this.log.trace(`sqlResultProcessor> count tables: ${JSON.stringify(countTables)}, event size:${event.length}`);
			if(countTables >= event.length) {
				this.log.trace(`sqlResultProcessor> number of tables matches expected event size start processing!!`);
				// Confirm the migration of all the chunks has completed
				const limit = pLimit(concurrencyLimit);
				const s3GetFutures = sortedResults.map((e) => {
					return limit(async () => {
						const taskExecutionResult = `pipelines/${pipelineId}/executions/${executionId}/output/${e.sequence}.json`;
						const obj = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: taskExecutionResult }));
						const body = await obj.Body.transformToString();
						return JSON.parse(body);
					});
				});

				const results = await Promise.all(s3GetFutures);
				const failedResult = results.filter((o: InsertActivityResult) => o.sqlExecutionResult === 'failed');
				status = failedResult.length > 0 ? 'FAILED' : 'SUCCEEDED';

				// set activity keys
				for (const result  of results){
					this.cleanupFiles.push(result['activityValuesKey']);
				}
			} else {
				this.log.trace(`sqlResultProcessor> number of tables is less than the expected event size skip processing!!`);
				status = 'IN_PROGRESS';
			}

		} catch (Exception) {
			if(Exception.name === 'TimeoutError'){
				status = 'FAILED';

			} else{
				this.log.error(`sqlResultProcessor > handler > result not available : ${JSON.stringify(Exception)}`);
				status = 'IN_PROGRESS';
			}

		} finally{
			// close the db connection if established
			if (sharedDbConnection !== null){
				sharedDbConnection.end();
			}
			// cleanup on success or failure
			if (status !== 'IN_PROGRESS'){
				await this.cleanup(event);
			}
		}

		// if finished and success, transition the status
		if (status === 'SUCCEEDED') {
			this.log.debug(`sqlResultProcessor > handler > transitioning status to SUCCEEDED`);
			const securityContext = await this.getSecurityContext(executionId);
			await this.pipelineProcessorsService.update(securityContext, pipelineId, executionId, { status: 'calculating_metrics' });
		}

		// add the status to the first result so that the first result is the only result that contains the common
		// data therefore reducing the size of the state machine payload
		firstResult.status = status;

		this.log.debug(`sqlResultProcessor > handler > exit> ${JSON.stringify(sortedResults)}`);
		return sortedResults;
	}


	// This function will truncate and drop all temp resources related to the events and will act as a garbage collector
	private async cleanup(events: ProcessedTaskEvent[]){
		this.log.info(`sqlResultProcessor> cleanup> events: ${JSON.stringify(events)}, cleanupFiles:${JSON.stringify(this.cleanupFiles)}`);

		let sharedDbConnection :Client;

		try{
			sharedDbConnection = await this.activitiesRepository.getConnection();
			// Confirm #temp tables matches #chunks
			const count = await this.activitiesRepository.getCountTempTables(events[0].executionId, sharedDbConnection);
			this.log.debug(`sqlResultProcessor> cleanup> Number of tables: ${count}`);

			// cleanup the temporary tables
			await this.activitiesRepository.cleanupTempTables(events,sharedDbConnection, true);

			// cleanup S3 files

			const input = { // DeleteObjectsRequest
				Bucket: this.bucket,
				Delete: {
				  Objects: [],
				  Quiet: false,
				}
			  };
			for (const key of this.cleanupFiles){
				input.Delete.Objects.push({ Key: `${key}` });
			}

			const command = new DeleteObjectsCommand(input);
			await this.s3.send(command);

		} catch( Exception) {
			this.log.error(`sqlResultProcessor> cleanup> error: ${JSON.stringify(Exception)}`);
		}

	}
}
