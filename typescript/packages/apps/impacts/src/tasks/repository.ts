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
import { BatchGetCommandInput, DynamoDBDocumentClient, GetCommand, GetCommandInput, QueryCommand, QueryCommandInput, TransactWriteCommand, TransactWriteCommandInput, PutCommandInput, UpdateCommandInput } from '@aws-sdk/lib-dynamodb';
import type { TransactionCanceledException } from '@aws-sdk/client-dynamodb';

import { createDelimitedAttribute, DocumentDbClientItem, DynamoDbUtils } from '@sif/dynamodb-utils';
import { DatabaseTransactionError, GroupRepository, NotFoundError, TransactionCancellationReason } from '@sif/resource-api-base';

import type { ActivityTaskResource, TaskBatchProgress } from './schemas.js';
import { PkType } from '../common/pkTypes.js';

export class ActivityTaskRepository {
	private readonly log: FastifyBaseLogger;
	private readonly dc: DynamoDBDocumentClient;
	private readonly tableName: string;
	private readonly groupRepository: GroupRepository;
	private readonly dynamoDbUtils: DynamoDbUtils;

	public constructor(log: FastifyBaseLogger, dc: DynamoDBDocumentClient, tableName: string, groupRepository: GroupRepository, dynamoDbUtils: DynamoDbUtils) {
		this.log = log;
		this.dc = dc;
		this.tableName = tableName;
		this.groupRepository = groupRepository;
		this.dynamoDbUtils = dynamoDbUtils;
	}

	public async create(task: ActivityTaskResource): Promise<void> {
		this.log.debug(`ActivityTaskRepository> create> task:${JSON.stringify(task)}`);

		// keys
		const dbId = createDelimitedAttribute(PkType.ActivityTask, task.id);
		const groupId = task.groups[0] as string;
		const params: TransactWriteCommandInput = {
			TransactItems: [
				{
					Put: {
						TableName: this.tableName,
						Item: {
							pk: dbId,
							sk: dbId,
							...task,
						},
					},
				},
			],
		};

		// group membership
		params.TransactItems.push(
			...this.groupRepository.getGrantGroupTransactWriteCommandInput(
				{
					id: task.id,
					keyPrefix: PkType.ActivityTask,
				},
				{ id: groupId }
			).TransactItems
		);

		await this.dc.send(new TransactWriteCommand(params));

		this.log.debug(`ActivityTaskRepository> create> exit>`);
	}

	public async get(taskId: string): Promise<ActivityTaskResource | undefined> {
		this.log.debug(`ActivityTaskRepository> get> taskId:${taskId}`);

		const dbId = createDelimitedAttribute(PkType.ActivityTask, taskId);
		const params: GetCommandInput = {
			TableName: this.tableName,
			Key: {
				pk: dbId,
				sk: dbId,
			},
		};
		const response = await this.dc.send(new GetCommand(params));
		if (response.Item === undefined) {
			throw new NotFoundError(`Activity task with id: ${taskId} not found`);
		}

		// assemble before returning
		const activityTask = this.assemble(response.Item);
		this.log.debug(`ActivityTaskRepository> get> exit:${JSON.stringify(activityTask)}`);
		return activityTask;
	}

	public async listByIds(taskIds: string[]): Promise<ActivityTaskResource[]> {
		this.log.debug(`ActivityTaskRepository> listByIds> in> taskIds:${JSON.stringify(taskIds)}`);

		if ((taskIds?.length ?? 0) === 0) {
			this.log.debug(`ActivityTaskRepository> listByIds> early exit:[]`);
			return [];
		}

		// retrieve the activity items
		const params: BatchGetCommandInput = {
			RequestItems: {},
		};
		params.RequestItems[this.tableName] = {
			Keys: taskIds.map((i) => ({
				pk: createDelimitedAttribute(PkType.ActivityTask, i),
				sk: createDelimitedAttribute(PkType.ActivityTask, i),
			})),
		};

		this.log.debug(`ActivityTaskRepository> listByIds> params:${JSON.stringify(params)}`);
		const items = await this.dynamoDbUtils.batchGetAll(params);
		this.log.debug(`ActivityTaskRepository> listByIds> items:${JSON.stringify(items)}`);

		if (items?.Responses?.[this.tableName] === undefined) {
			this.log.debug('ActivityTaskRepository> listByIds> exit: commands:undefined');
			return [];
		}

		const tasks = items.Responses[this.tableName].sort((a, b) => (a['pk'] as string).localeCompare(b['pk']) || (a['sk'] as string).localeCompare(b['sk'])).map((i) => this.assemble(i));

		this.log.debug(`ActivityTaskRepository> listByIds> exit:${JSON.stringify(tasks)}`);
		return tasks;
	}

	public async update(taskId: string, task: ActivityTaskResource): Promise<void> {
		this.log.debug(`ActivityTaskRepository> update> task:${JSON.stringify(task)}`);

		const dbId = createDelimitedAttribute(PkType.ActivityTask, taskId);
		const command: PutCommandInput = {
			TableName: this.tableName,
			Item: {
				pk: dbId,
				sk: dbId,
				...task,
			},
		};

		await this.dynamoDbUtils.put(command);

		this.log.debug(`ActivityTaskRepository> update> exit`);
	}

	public async updateProgress(taskBatchProgress: TaskBatchProgress): Promise<void> {
		this.log.debug(`ActivityTaskRepository> incrementBatches> in: taskResource:${JSON.stringify(taskBatchProgress)}`);

		const dbId = createDelimitedAttribute(PkType.ActivityTask, taskBatchProgress.taskId);
		const command: UpdateCommandInput = {
			TableName: this.tableName,
			Key: {
				pk: dbId,
				sk: dbId,
			},
			UpdateExpression: 'set batchesCompleted = batchesCompleted + :val, itemsFailed = itemsFailed + :failed, itemsSucceeded = itemsSucceeded + :succeeded, updatedAt = :updatedAt',
			ExpressionAttributeValues: {
				':succeeded': taskBatchProgress.itemsSucceeded,
				':failed': taskBatchProgress.itemsFailed,
				':updatedAt': new Date(Date.now()).toISOString(),
				':val': 1,
			},
			ReturnValues: 'ALL_NEW',
		};

		await this.dynamoDbUtils.update(command);

		this.log.debug(`ActivityTaskRepository> incrementBatches> exit`);
	}

	public async updateStatus(taskId: string, status: string): Promise<void> {
		this.log.debug(`ActivityTaskRepository> updateStatus> in:`);

		const dbId = createDelimitedAttribute(PkType.ActivityTask, taskId);
		const command: UpdateCommandInput = {
			TableName: this.tableName,
			Key: {
				pk: dbId,
				sk: dbId,
			},
			UpdateExpression: 'set taskStatus = :s, updatedAt = :updatedAt',
			ExpressionAttributeValues: {
				':s': status,
				':updatedAt': new Date(Date.now()).toISOString(),
			},
			ReturnValues: 'ALL_NEW',
		};

		if (status === 'inProgress') {
			command.ConditionExpression = 'batchesCompleted < batchesTotal';
		}

		if (status === 'success') {
			command.ConditionExpression = 'batchesCompleted = batchesTotal';
		}

		await this.dynamoDbUtils.update(command);

		this.log.debug(`ActivityTaskRepository> incrementBatches> exit`);
	}

	private assemble(i: DocumentDbClientItem): ActivityTaskResource | undefined {
		if (i === undefined) {
			return undefined;
		}
		const task: ActivityTaskResource = {
			id: i['id'],
			groups: i['groups'],
			type: i['type'],
			taskStatus: i['taskStatus'],
			statusMessage: i['statusMessage'],
			itemsTotal: i['itemsTotal'],
			itemsSucceeded: i['itemsSucceeded'],
			itemsFailed: i['itemsFailed'],
			// possibly remove the batchesCompleted/batchesTotal attributes if no longer needed
			batchesCompleted: i['batchesCompleted'],
			batchesTotal: i['batchesTotal'],
			progress: i['progress'],
			createdAt: i['createdAt'],
			createdBy: i['createdBy'],
			updatedAt: i['updatedAt'],
			updatedBy: i['updatedBy'],
		};
		// calculate progress within the assembler
		task.progress = (task.batchesCompleted / task.batchesTotal) * 100;

		return task;
	}

	public async delete(id: string): Promise<void> {
		this.log.debug(`ActivityTaskRepository> delete> id:${id}`);

		// keys
		const dbId = createDelimitedAttribute(PkType.ActivityTask, id);

		// list all items directly relating to the activity
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
			this.log.debug(`ActivityTaskRepository> delete> params1:${JSON.stringify(params1)}`);
			params1.ExclusiveStartKey = exclusiveStartKey;
			const data = await this.dc.send(new QueryCommand(params1));
			this.log.debug(`ActivityTaskRepository> delete> data:${JSON.stringify(data)}`);
			if (data.Count > 0) {
				dbIds.push(...data.Items.map((i) => ({ pk: i['pk'], sk: i['sk'] })));
			}
			exclusiveStartKey = data.LastEvaluatedKey;
		} while (exclusiveStartKey !== undefined);
		this.log.debug(`ActivityTaskRepository> delete> dbIds:${JSON.stringify(dbIds)}`);

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
			this.log.debug(`ActivityTaskRepository> delete> transaction:${JSON.stringify(transaction)}`);
			const response = await this.dc.send(new TransactWriteCommand(transaction));
			this.log.debug(`ActivityTaskRepository> delete> response:${JSON.stringify(response)}`);
		} catch (err) {
			if (err instanceof Error) {
				if (err.name === 'TransactionCanceledException') {
					this.log.error(`ActivityTaskRepository> delete> err> ${JSON.stringify((err as TransactionCanceledException).CancellationReasons)}`);
					throw new DatabaseTransactionError((err as TransactionCanceledException).CancellationReasons as TransactionCancellationReason[]);
				} else {
					this.log.error(err);
					throw err;
				}
			}
		}

		this.log.debug(`ActivityTaskRepository> delete> exit>`);
	}
}

export interface ActivityTaskListOptions {
	count?: number;
	exclusiveStart?: ActivityTaskListPaginationKey;
}

export interface ActivityTaskListPaginationKey {
	paginationToken: string;
}
