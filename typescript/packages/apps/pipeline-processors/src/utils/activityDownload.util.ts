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
import type { FastifyBaseLogger } from 'fastify';
import type { ListObjectsCommandInput, S3Client } from '@aws-sdk/client-s3';
import type { ActivitiesDownloadState, ActivitiesDownloadStatus } from '../api/activities/models.js';
import type { ActivitiesRepository } from '../api/activities/repository.js';
import { PutObjectCommand, ListObjectsCommand } from '@aws-sdk/client-s3';
import { getQueriesDownloadStatusKey } from './helper.utils.js';
import type { IMetricsRepository } from '../api/metrics/models.js';
import { validateNotEmpty } from '@sif/validators';
import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import type { ActivityDownloadEvent, ActivityDownloadTaskResponse } from '../stepFunction/tasks/model.js';

export class ActivityDownloadUtil {
	public constructor(
		private log: FastifyBaseLogger,
		private s3Client: S3Client,
		private sfnClient: SFNClient,
		private bucketName: string,
		private bucketPrefix: string,
		private activitiesRepository: ActivitiesRepository,
		private metricsRepository: IMetricsRepository,
		private activitiesDownloadStateMachineArn: string
	) {
	}

	public async process(event: ActivityDownloadEvent): Promise<void> {
		this.log.info(`ActivityDownloadUtility > process > event: ${JSON.stringify(event)}`);

		let executionArn;
		try {
			validateNotEmpty(event, 'event');
			validateNotEmpty(event.id, 'eventId');
			validateNotEmpty(event.type, 'eventType');
			if ( event.type === 'activity'){
				validateNotEmpty(event.activityRequest, 'eventActivityRequest');
			} else {
				validateNotEmpty(event.metricRequest, 'eventMetricRequest');
			}

			// Trigger State Machine
			const command = await this.sfnClient.send(
				new StartExecutionCommand({
					stateMachineArn: this.activitiesDownloadStateMachineArn,
					input: JSON.stringify(event),
				})
			);
			executionArn = command.executionArn;

			// once we trigger the step function, we also need to update the state of the execution to in_progress
			await this.updateDownloadStatus(event.id,'in_progress', executionArn);

		} catch (e) {
			// if anything bombs, we catch and update the execution :)
			this.log.error(`ActivityDownloadUtility > process > event: ${e.message}`);
			await this.updateDownloadStatus(event.id,'failed', executionArn, e.message);
		}
		this.log.info(`ActivityDownloadUtility > process > exit:`);
	}


	public async processMetricsDownloadRequest(message: ActivityDownloadTaskResponse): Promise<void> {
		this.log.info(`ActivityDownloadUtility> processMetricsDownloadRequest> in> message: ${JSON.stringify(message)}`);

			const id = message.id;
			const { metric, queryRequest: req } = message.metricRequest;

			const downloadParams= {
				queryId: id,
				bucket: this.bucketName,
				bucketPrefix: this.bucketPrefix,
				unlimited:true
			}
			if (message.metricRequest.queryRequest.members) {
				await this.metricsRepository.listMembersMetrics(metric, req.groupId, req.timeUnit, { from: req.dateFrom, to: req.dateTo }, req.version, downloadParams);
			} else {
				await this.metricsRepository.listCollectionMetrics(metric, req.groupId, req.timeUnit, { from: req.dateFrom, to: req.dateTo }, req.version,downloadParams);
			}

		this.log.info(`ActivityDownloadUtility> processMetricsDownloadRequest> exit>`);
	}

	public async processActivitiesDownloadRequest(message: ActivityDownloadTaskResponse): Promise<void> {
		this.log.info(`ActivityDownloadUtility> processActivitiesDownloadRequest> in> message: ${JSON.stringify(message)}`);
			message.activityRequest.queryRequest['download'] ={
				bucket: this.bucketName,
				queryId: message.id,
				bucketPrefix: this.bucketPrefix
			}
			message.activityRequest.queryRequest['unlimited'] = true;

			await this.activitiesRepository.get(message.activityRequest.queryRequest, message.activityRequest.pipelineMetadata);

		this.log.info(`ActivityDownloadUtility> processActivitiesDownloadRequest> exit>`);
	}

	public async updateDownloadStatus(messageId:string, state:ActivitiesDownloadState, executionArn:string, errorMessage?:string): Promise<void> {
		this.log.info(`ActivityDownloadUtility> updateDownloadStatus> in> messageId:${messageId},executionArn:${executionArn}, state: ${state}, errorMessage:${errorMessage}`);

		await this.s3Client.send(new PutObjectCommand({
			Bucket: this.bucketName,
			Key: getQueriesDownloadStatusKey(this.bucketPrefix, messageId), Body: JSON.stringify({
				executionArn,
				state,
				errorMessage
			} as ActivitiesDownloadStatus)
		}));

		this.log.info(`ActivityDownloadUtility> updateDownloadStatus> exit>`);
	}

	public async verifyQueryStatus(messageId:string): Promise<boolean> {
		this.log.debug(`ActivityDownloadUtility> verifyQueryStatus> in> messageId:${messageId}`);
		let isCompleted = false;
		const response = await this.activitiesRepository.getMatchingQueries(messageId);
		this.log.debug(`ActivityDownloadUtility> verifyQueryStatus> in> response:${JSON.stringify(response)}`);
		if (response.length === 0){
			isCompleted = true;
		}
		this.log.debug(`ActivityDownloadUtility> verifyQueryStatus> exit`);
		return isCompleted;
	}

	public async verifyExportFile(messageId:string): Promise<boolean> {
		this.log.debug(`ActivityDownloadUtility> verifyExportFile> in> messageId:${messageId}`);
		let isExported = false;

		const input:ListObjectsCommandInput ={
			Bucket: this.bucketName,
			Prefix: `this.bucketPrefix/${messageId}/*`
		}

		const results = await this.s3Client.send(new ListObjectsCommand(input));
		this.log.debug(`ActivityDownloadUtility> verifyExportFile> results : ${JSON.stringify(results)}`);
		const file = results.Contents?.filter(c => c.Key.endsWith('.csv'))[0];
		(file) ? isExported = true : '' ;
		this.log.debug(`ActivityDownloadUtility> verifyExportFile> exit`);
		return isExported;
	}

}
