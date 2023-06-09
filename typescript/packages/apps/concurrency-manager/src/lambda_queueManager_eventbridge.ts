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


import type { Context, EventBridgeEvent } from 'aws-lambda';
import pino from 'pino';
import { DeleteMessageCommand, ReceiveMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { LockService } from './lockService';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { ConditionalCheckFailedException, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import type { AcquireLockMessage, LockEvent, ReleaseLockMessage } from './model.js';
import { validateNotEmpty } from '@sif/validators';
import { DescribeExecutionCommand, SendTaskSuccessCommand, SFNClient } from '@aws-sdk/client-sfn';
import { SemaphoreLockEventName } from './model.js';

const logger = pino();
logger.level = process.env['LOG_LEVEL'] ?? 'info';
const region: string = process.env['AWS_REGION'];
const lockTable: string = process.env['LOCK_MANAGER_TABLE'];
const lockName: string = process.env['LOCK_NAME'];
const sqsClient = new SQSClient({ region });
const dynamoDBClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
const rdsConcurrencyLimit: number = parseInt(process.env['RDS_CONCURRENCY_LIMIT']);
const sfnClient = new SFNClient({ region });
const releaseLockQueueUrl: string = process.env['RELEASE_LOCK_QUEUE_URL'];
const acquireLockQueueUrl: string = process.env['ACQUIRE_LOCK_QUEUE_URL'];

const lockService = new LockService(logger, dynamoDBClient, lockTable, rdsConcurrencyLimit, lockName);

export const handler = async (event: EventBridgeEvent<'SIF>com.aws.sif.pipelineProcessors>semaphoreLock', LockEvent>, _context: Context): Promise<void> => {
	logger.info(`handler> in> event: ${JSON.stringify(event)}`);

	// can only be triggered by the pipeline processors state machine and queue garbage collector
	if (event['detail-type'] !== SemaphoreLockEventName || !['com.aws.sif.pipelineProcessors', 'com.aws.sif.queueGarbageCollector'].includes(event['source']))
		return;

	// release all the locks in releaseLockQueue
	const receiveMessageResponse = await sqsClient.send(new ReceiveMessageCommand({ QueueUrl: releaseLockQueueUrl, MaxNumberOfMessages: rdsConcurrencyLimit }));
	for (const message of receiveMessageResponse.Messages ?? []) {
		const { executionName, taskName } = JSON.parse(message.Body) as ReleaseLockMessage;
		validateNotEmpty(taskName, 'taskName');
		validateNotEmpty(executionName, 'executionName');
		try {
			await lockService.releaseLock(executionName, taskName);
		} catch (error) {
			if (error instanceof ConditionalCheckFailedException) {
				logger.error(`lock for ${executionName} does not exists`);
			} else {
				throw error;
			}
		} finally {
			await sqsClient.send(new DeleteMessageCommand({
				QueueUrl: releaseLockQueueUrl, ReceiptHandle: message.ReceiptHandle
			}));
		}
	}

	// get all the lock request from acquireLockQueue up to the concurrency limit
	const currentLock = await lockService.getLock();
	if (currentLock.currentLockCount < rdsConcurrencyLimit) {
		// acquire Lock
		const receiveMessageResponse = await sqsClient.send(new ReceiveMessageCommand({ QueueUrl: acquireLockQueueUrl, MaxNumberOfMessages: rdsConcurrencyLimit - currentLock.currentLockCount }));
		for (const message of receiveMessageResponse.Messages ?? []) {
			const { token, execution, taskName, tenantId } = JSON.parse(message.Body) as AcquireLockMessage;
			validateNotEmpty(token, 'token');
			validateNotEmpty(execution, 'execution');
			validateNotEmpty(taskName, 'taskName');
			validateNotEmpty(tenantId, 'tenantId');
			const stateMachineExecution = await sfnClient.send(new DescribeExecutionCommand({ executionArn: execution.Id }));
			// if state machine is not in running mode, no need to acquire the lock
			if (stateMachineExecution.status === 'RUNNING') {
				logger.trace(`acquiring lock for execution ${execution.Name}`);
				await lockService.acquireLock(execution, tenantId, taskName);
				await sfnClient.send(new SendTaskSuccessCommand({ output: JSON.stringify({ lockName, execution: execution.Name }), taskToken: token }));
			}
			await sqsClient.send(new DeleteMessageCommand({
				QueueUrl: acquireLockQueueUrl, ReceiptHandle: message.ReceiptHandle
			}));
		}
	}

	logger.info(`handler> exit> `);
};
