import type { Context, EventBridgeEvent } from 'aws-lambda';
import pino from 'pino';
import type { ReleaseLockMessage, StateChangeEventDetail } from './model';
import { LockService } from './lockService';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { validateDefined, validateNotEmpty } from '@sif/validators';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { SemaphoreLockEventName } from './model';

const logger = pino();
logger.level = process.env['LOG_LEVEL'] ?? 'info';
const region: string = process.env['AWS_REGION'];
const lockTable: string = process.env['LOCK_MANAGER_TABLE'];
const lockName: string = process.env['LOCK_NAME'];
const releaseLockQueueUrl: string = process.env['RELEASE_LOCK_QUEUE_URL'];
const concurrencyLimit = parseInt(process.env['RDS_CONCURRENCY_LIMIT']);
const environmentEventBus = process.env['ENVIRONMENT_EVENT_BUS'];

logger.info(`region: ${region}, lockTable: ${lockTable}, lockName: ${lockTable}, releaseLockQueueUrl: ${releaseLockQueueUrl}, concurrencyLimit: ${concurrencyLimit}`);

const eventBridgeClient = new EventBridgeClient({ region });
const dynamoDBClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region }), { marshallOptions: { removeUndefinedValues: true } });
const sqsClient = new SQSClient({ region });
const lockService = new LockService(logger, dynamoDBClient, lockTable, concurrencyLimit, lockName);

export const handler = async (event: EventBridgeEvent<'Step Functions Execution Status Change', StateChangeEventDetail>, _context: Context): Promise<void> => {
	logger.debug(`handler> in> event: ${JSON.stringify(event)}`);

	validateDefined(event, 'event');
	validateNotEmpty(event.detail, 'event.detail');

	const { name: executionName, status } = event.detail;

	const lock = await lockService.getLock();

	const executionLocks = lock.executionLocks.filter(o => o.name === executionName);
	// if there is a lock held by the execution that is aborted, timed out or failed
	if (['ABORTED', 'TIMED_OUT', 'FAILED'].includes(status) && executionLocks.length > 0) {

		for (const lock of executionLocks) {
			const releaseLockEvent: ReleaseLockMessage = {
				executionName,
				tenantId: lock.tenantId,
				taskName: lock.taskName
			};

			logger.info(`handler> sending message to release lock queue for execution : ${executionName}`);
			// queue the release message
			await sqsClient.send(new SendMessageCommand({
				MessageBody: JSON.stringify(releaseLockEvent),
				QueueUrl: releaseLockQueueUrl,
				MessageDeduplicationId: executionName,
				MessageGroupId: lock.taskName
			}));
			// trigger te queue manager to process the queue
			await eventBridgeClient.send(new PutEventsCommand({
				Entries: [{
					EventBusName: environmentEventBus,
					DetailType: SemaphoreLockEventName,
					Source: 'com.aws.sif.queueGarbageCollector',
					Detail: JSON.stringify({
						tenantId: lock.tenantId,
						taskName: lock.taskName,
						executionName
					})
				}]
			}));
		}
	}

	logger.debug(`handler> exit> ${JSON.stringify(lock)}`);
};
