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


import type { Logger } from 'pino';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand, UpdateCommandInput } from '@aws-sdk/lib-dynamodb';
import { createDelimitedAttribute, expandDelimitedAttribute } from '@sif/dynamodb-utils';
import type { LambdaClient } from '@aws-sdk/client-lambda';
import { GetEventSourceMappingCommand, UpdateEventSourceMappingCommand } from '@aws-sdk/client-lambda';
import { PkType, Queue } from './model';
import { ReturnValue } from '@aws-sdk/client-dynamodb';

export class QueueService {

	public constructor(private log: Logger, private documentClient: DynamoDBDocumentClient, private lockTable: string,
					   private lambdaClient: LambdaClient, private lockName: string) {
	}

	public async enableQueue() {
		this.log.trace(`QueueService > enableQueue > in:`);
		const queue = await this.getQueue();
		// do nothing if queue is already enabled
		if (!queue.enabled) {

			const request: UpdateCommandInput = {
				TableName: this.lockTable,
				Key: {
					pk: createDelimitedAttribute(PkType.Queue, this.lockName),
				},
				ExpressionAttributeNames: {
					'#enabled': 'enabled',
				},
				ExpressionAttributeValues: {
					':enabled': true,
				},
				UpdateExpression: 'SET #enabled = :enabled',
				ReturnValues: ReturnValue.UPDATED_NEW
			};

			let eventSourceMapping = await this.lambdaClient.send(new GetEventSourceMappingCommand({ UUID: queue.eventSourceMappingId }));
			if (eventSourceMapping.State === 'Disabled') {
				await this.lambdaClient.send(new UpdateEventSourceMappingCommand({ UUID: queue.eventSourceMappingId, Enabled: true }));
				while (eventSourceMapping.State !== 'Enabled') {
					await new Promise(r => setTimeout(r, 1000));
					eventSourceMapping = await this.lambdaClient.send(new GetEventSourceMappingCommand({ UUID: queue.eventSourceMappingId }));
				}

			}
			await this.documentClient.send(new UpdateCommand(request));
		}
		this.log.trace(`QueueService > enableQueue > exit>`);
	}

	public async disableQueue() {
		this.log.trace(`QueueService > disableQueue > in:`);

		const queue = await this.getQueue();
		// do nothing if queue is already disabled
		if (queue.enabled) {
			const request: UpdateCommandInput = {
				TableName: this.lockTable,
				Key: {
					pk: createDelimitedAttribute(PkType.Queue, this.lockName),
				},
				ExpressionAttributeNames: {
					'#enabled': 'enabled',
				},
				ExpressionAttributeValues: {
					':enabled': false,
				},
				UpdateExpression: 'SET #enabled = :enabled',
				ReturnValues: ReturnValue.UPDATED_NEW
			};

			let eventSourceMapping = await this.lambdaClient.send(new GetEventSourceMappingCommand({ UUID: queue.eventSourceMappingId }));
			if (eventSourceMapping.State === 'Enabled') {
				await this.lambdaClient.send(new UpdateEventSourceMappingCommand({ UUID: queue.eventSourceMappingId, Enabled: false }));
				while (eventSourceMapping.State !== 'Disabled') {
					await new Promise(r => setTimeout(r, 1000));
					eventSourceMapping = await this.lambdaClient.send(new GetEventSourceMappingCommand({ UUID: queue.eventSourceMappingId }));
				}
			}
			await this.documentClient.send(new UpdateCommand(request));
		}

		this.log.trace(`QueueService > disableQueue > exit>`);
	}

	private async getQueue(): Promise<Queue> {
		this.log.trace(`QueueService > getQueue > in:`);

		const result = await this.documentClient.send(new GetCommand({
			TableName: this.lockTable,
			Key: {
				pk: createDelimitedAttribute(PkType.Queue, this.lockName)
			}
		}));

		const queue = result?.Item ? {
			name: expandDelimitedAttribute(result.Item['pk'])?.[1],
			enabled: result.Item['enabled'],
			eventSourceMappingId: result.Item['eventSourceMappingId']
		} : undefined;

		this.log.trace(`QueueService > getQueue > queue: ${queue}`);

		return queue;
	}
}
