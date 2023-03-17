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

import type { S3NotificationEvent } from 'aws-lambda';
import { CopyObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';

import { FileError } from '../../common/errors.js';

import type { BaseLogger } from 'pino';
import type { PipelineProcessorsService } from '../../api/executions/service.js';
import type { SecurityContext } from '@sif/authz';
import type { EventPublisher } from '@sif/events/dist';
export class TriggerTask {
	private readonly log: BaseLogger;
	private readonly sfnClient: SFNClient;
	private readonly pipelineProcessorsService: PipelineProcessorsService;
	private readonly eventPublisher: EventPublisher;
	private readonly adminSecurityContext: SecurityContext;
	private readonly dataBucket: string;
	private readonly dataPrefix: string;
	private readonly stateMachineArn: string;
	private readonly s3Client: S3Client;

	constructor(
		log: BaseLogger,
		sfnClient: SFNClient,
		pipelineProcessorsService: PipelineProcessorsService,
		dataBucket: string,
		dataPrefix: string,
		stateMachineArn: string,
		adminSecurityContext: SecurityContext,
		s3Client: S3Client,
		eventPublisher: EventPublisher
	) {
		this.eventPublisher = eventPublisher;
		this.adminSecurityContext = adminSecurityContext;
		this.log = log;
		this.sfnClient = sfnClient;
		this.pipelineProcessorsService = pipelineProcessorsService;
		this.dataBucket = dataBucket;
		this.dataPrefix = dataPrefix;
		this.stateMachineArn = stateMachineArn;
		this.s3Client = s3Client;
	}

	private getPipelineAndExecutionIdFromKey(path: string): [string, string] {
		const keyMinusPrefix = path.replace(`${this.dataPrefix}/`, '');
		const [pipelineId, _executionPath, executionId, _file] = keyMinusPrefix.split('/');
		return [pipelineId, executionId];
	}

	public async process(event: S3NotificationEvent): Promise<void> {
		this.log.info(`TriggerTask > process > event: ${JSON.stringify(event)}`);
		if (
			event['detail-type'] === 'Object Created' &&
			event.detail.bucket.name === this.dataBucket &&
			// We only trigger state machine when processing the data and not result
			event.detail.object.key.includes('/input.csv') &&
			event.detail.object.key.includes(this.dataPrefix)
		) {
			const [pipelineId, executionId] = this.getPipelineAndExecutionIdFromKey(event.detail.object.key);

			const existing = await this.pipelineProcessorsService.get(this.adminSecurityContext, pipelineId, executionId);

			// Check if this object had been used to run previous pipeline execution
			if (existing.status !== 'waiting') {
				const error = new FileError(`file: ${event.detail.object.key.split('/').pop()} is uploaded using signed url for pipeline: ${pipelineId}, executionId: ${executionId} with status ${existing.status}`);

				await this.eventPublisher.publishEvent({
					resourceType: 'pipelineExecution',
					eventType: 'updated',
					id: executionId,
					error,
				});

				throw error;
			}

			// Make a copy so user could not replace the previously uploaded input
			const copiedKey = event.detail.object.key.replace('input.csv', 'input_archived.csv');

			await this.s3Client.send(
				new CopyObjectCommand({
					CopySource: `${event.detail.bucket.name}/${event.detail.object.key}`,
					Bucket: this.dataBucket,
					Key: copiedKey,
				})
			);

			this.log.debug(`TriggerTask > process > input archive file ${copiedKey} is created`);

			// Trigger State Machine
			const { executionArn } = await this.sfnClient.send(
				new StartExecutionCommand({
					stateMachineArn: this.stateMachineArn,
					input: JSON.stringify({
						source: {
							bucket: event.detail.bucket.name,
							key: copiedKey,
						},
						pipelineId: pipelineId as string,
						pipelineExecutionId: executionId as string,
					}),
				})
			);

			if (!executionArn) {
				throw new Error('Could not start State Machine');
			}

			this.log.debug(`TriggerTask > process > execution ${executionArn} is started`);

			await this.pipelineProcessorsService.update(this.adminSecurityContext, pipelineId as string, executionId as string, {
				status: 'in_progress',
				executionArn,
			});
		} else {
			this.log.info(`TriggerTask > process > skip file : s3://${event.detail.bucket}/${event.detail.object}`);
		}

		this.log.info(`TriggerTask > process > exit:`);
	}
}
