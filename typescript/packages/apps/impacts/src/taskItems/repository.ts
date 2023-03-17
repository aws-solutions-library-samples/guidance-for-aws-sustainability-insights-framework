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

import { DatabaseTransactionError, NotFoundError, TransactionCancellationReason } from '@sif/resource-api-base';
import type { FastifyBaseLogger } from 'fastify';
import {
	DynamoDBDocumentClient,
	GetCommand,
	GetCommandInput,
	QueryCommand,
	QueryCommandInput,
	TransactWriteCommand,
	TransactWriteCommandInput,
} from '@aws-sdk/lib-dynamodb';

import { createDelimitedAttribute, expandDelimitedAttribute, DocumentDbClientItem, createDelimitedAttributePrefix } from '@sif/dynamodb-utils';
import { PkType } from '../common/pkTypes.js';
import type { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { getTaskItemTransactionWriteCommandInput } from '../common/dbUtils.util.js';
import type { TaskItemResource, TaskItemStatus } from './schemas.js';

export class ActivityTaskItemRepository {
	private readonly GSI2 = 'siKey2-pk-index';

	private readonly defaultCount = 20;

	private readonly log: FastifyBaseLogger;
	private readonly dc: DynamoDBDocumentClient;
	private readonly tableName: string;

	public constructor(log: FastifyBaseLogger, dc: DynamoDBDocumentClient, tableName: string) {
		this.log = log;
		this.dc = dc;
		this.tableName = tableName;
	}

	public async create(taskItems: TaskItemResource[]): Promise<void> {
		this.log.debug(`ActivityTaskItemRepository> create> taskItems:${JSON.stringify(taskItems)}`);

		const transaction = getTaskItemTransactionWriteCommandInput(this.tableName, taskItems);

		this.log.debug(`ActivityTaskItemRepository> create> transaction:${JSON.stringify(transaction)}`);
		await this.dc.send(new TransactWriteCommand(transaction));

		this.log.debug(`ActivityTaskItemRepository> create> exit>`);
	}

	public async get(taskId: string, name: string): Promise<TaskItemResource | undefined> {
		this.log.debug(`ActivityTaskItemRepository> get> taskId: ${taskId} id:${name}`);

		const activityTaskDbId = createDelimitedAttribute(PkType.ActivityTask, taskId);
		const taskItemDbId = createDelimitedAttribute(PkType.TaskItem, name);

		const params: GetCommandInput = {
			TableName: this.tableName,
			Key: {
				pk: activityTaskDbId,
				sk: taskItemDbId,
			},
		};
		const response = await this.dc.send(new GetCommand(params));
		if (response.Item === undefined) {
			throw new NotFoundError(`Task item with TaskId: ${taskId} and name:${name} not found`);
		}

		// assemble before returning
		const taskItem = this.assemble(response.Item);
		this.log.debug(`ActivityTaskItemRepository> get> exit:${JSON.stringify(taskItem)}`);
		return taskItem;
	}

	public async list(taskId: string, options: TaskItemListOptions): Promise<[TaskItemResource[], TaskItemListPaginationKey]> {
		this.log.info(`ActivityTaskItemRepository > list > TaskId: ${taskId} options:${JSON.stringify(options)} `);

		if (!options.count) {
			options.count = this.defaultCount;
		}

		let exclusiveStartKey;
		if (options?.exclusiveStart?.name) {
			exclusiveStartKey = {
				pk: createDelimitedAttribute(PkType.ActivityTask, taskId),
				sk: createDelimitedAttribute(PkType.TaskItem, options.exclusiveStart.name),
			};
		}

		const params: QueryCommandInput = {
			TableName: this.tableName,
			KeyConditionExpression: `#hash=:hash  AND begins_with(#sortKey,:sortKey)`,
			ExpressionAttributeNames: {
				'#hash': 'pk',
				'#sortKey': 'sk',
			},
			ExpressionAttributeValues: {
				':hash': createDelimitedAttribute(PkType.ActivityTask, taskId),
				':sortKey': createDelimitedAttributePrefix(PkType.TaskItem),
			},
			Limit: options.count as number,
			ExclusiveStartKey: exclusiveStartKey,
		};

		if (options.status) {
			params.IndexName = this.GSI2;
			params.ExpressionAttributeNames = {
				'#hash': 'siKey2',
				'#sortKey': 'pk',
			};
			params.ExpressionAttributeValues = {
				':hash': createDelimitedAttribute(PkType.TaskItem, options.status, taskId),
				':sortKey': createDelimitedAttributePrefix(PkType.ActivityTask),
			};

			if (options?.exclusiveStart?.name) {
				exclusiveStartKey.siKey2 = createDelimitedAttribute(PkType.TaskItem, options.status, taskId);
			}
		}

		const items = await this.dc.send(new QueryCommand(params));
		if ((items.Items?.length ?? 0) === 0) {
			return [[], undefined];
		}

		let paginationKey: TaskItemListPaginationKey;
		if (items.LastEvaluatedKey) {
			const lastEvaluatedName = String(expandDelimitedAttribute(items.LastEvaluatedKey['sk'])[1]);
			paginationKey = {
				name: lastEvaluatedName,
			};
		}

		const taskItems: TaskItemResource[] = [];
		for (const i of items.Items) {
			taskItems.push(this.assemble(i));
		}

		this.log.debug(`ActivityTaskItemRepository> list> exit:${JSON.stringify([taskItems, paginationKey])}`);
		return [taskItems, paginationKey];
	}

	private assemble(i: DocumentDbClientItem): TaskItemResource | undefined {
		this.log.debug(`ActivityTaskRepository> assemble ${JSON.stringify(i)}`);
		if (i === undefined) {
			return undefined;
		}
		const taskItem: TaskItemResource = {
			taskId: expandDelimitedAttribute(i['pk'])[1],
			name: i['name'],
			activityId: i['activityId'],
			status: i['status'],
			statusMessage: i['statusMessage'],
		};

		return taskItem;
	}

	public async delete(id: string): Promise<void> {
		this.log.debug(`ActivityTaskItemRepository> delete> id:${id}`);

		// keys
		const dbId = createDelimitedAttribute(PkType.ActivityTask, id);

		// list all items directly relating to the task item
		const params1: QueryCommandInput = {
			TableName: this.tableName,
			KeyConditionExpression: `#hash=:hash`,
			ExpressionAttributeNames: {
				'#hash': 'pk',
			},
			ExpressionAttributeValues: {
				':hash': dbId,
			},
		};

		const dbIds: { pk: string; sk: string }[] = [];
		let exclusiveStartKey: Record<string, any>;
		do {
			this.log.debug(`ActivityTaskItemRepository> delete> params1:${JSON.stringify(params1)}`);
			params1.ExclusiveStartKey = exclusiveStartKey;
			const data = await this.dc.send(new QueryCommand(params1));
			this.log.debug(`ActivityTaskItemRepository> delete> data:${JSON.stringify(data)}`);
			if (data.Count > 0) {
				dbIds.push(...data.Items.map((i) => ({ pk: i['pk'], sk: i['sk'] })));
			}
			exclusiveStartKey = data.LastEvaluatedKey;
		} while (exclusiveStartKey !== undefined);
		this.log.debug(`ActivityTaskItemRepository> delete> dbIds:${JSON.stringify(dbIds)}`);

		// delete all the activity related items
		const transaction: TransactWriteCommandInput = {
			TransactItems: dbIds.map((i) => ({
				Delete: {
					TableName: this.tableName,
					Key: {
						pk: i.pk,
						sk: i.sk,
					},
				},
			})),
		};

		try {
			this.log.debug(`ActivityTaskItemRepository> delete> transaction:${JSON.stringify(transaction)}`);
			const response = await this.dc.send(new TransactWriteCommand(transaction));
			this.log.debug(`ActivityTaskItemRepository> delete> response:${JSON.stringify(response)}`);
		} catch (err) {
			if (err instanceof Error) {
				if (err.name === 'TransactionCanceledException') {
					this.log.error(`ActivityTaskItemRepository> delete> err> ${JSON.stringify((err as TransactionCanceledException).CancellationReasons)}`);
					throw new DatabaseTransactionError((err as TransactionCanceledException).CancellationReasons as TransactionCancellationReason[]);
				} else {
					this.log.error(err);
					throw err;
				}
			}
		}

		this.log.debug(`ActivityTaskItemRepository> delete> exit>`);
	}
}

export interface TaskItemListOptions {
	count?: number;
	exclusiveStart?: TaskItemListPaginationKey;
	status?: TaskItemStatus;
}

export interface TaskItemListPaginationKey {
	name: string;
}
