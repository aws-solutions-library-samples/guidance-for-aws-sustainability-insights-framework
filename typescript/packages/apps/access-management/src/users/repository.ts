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

import { BatchGetCommandInput, DynamoDBDocumentClient, GetCommand, GetCommandInput, QueryCommand, QueryCommandInput, TransactWriteCommand, TransactWriteCommandInput } from '@aws-sdk/lib-dynamodb';

import type { FastifyBaseLogger } from 'fastify';
import { createDelimitedAttribute, DynamoDbUtils } from '@sif/dynamodb-utils';
import { DatabaseTransactionError, TagRepository, Tags, TransactionCancellationReason } from '@sif/resource-api-base';
import type { User } from './schemas.js';
import { PkType } from '../common/pkTypes.js';
import type { TransactionCanceledException } from '@aws-sdk/client-dynamodb';

export class UserRepository {
	private readonly log: FastifyBaseLogger;
	private readonly dc: DynamoDBDocumentClient;
	private readonly tableName: string;
	private readonly tagRepository: TagRepository;
	private readonly dynamoDbUtils: DynamoDbUtils;

	public constructor(log: FastifyBaseLogger, dc: DynamoDBDocumentClient, tableName: string, tagRepository: TagRepository, dynamoDbUtils: DynamoDbUtils) {
		this.log = log;
		this.dc = dc;
		this.tableName = tableName;
		this.tagRepository = tagRepository;
		this.dynamoDbUtils = dynamoDbUtils;
	}

	public async update(user: User, tagsToAdd: Tags, tagsToDelete: Tags): Promise<void> {
		this.log.debug(`UserRepository> update> in> user:${JSON.stringify(user)}, tagsToAdd:${JSON.stringify(tagsToAdd)}, tagsToDelete:${JSON.stringify(tagsToDelete)}`);

		// main item
		const transaction = this.getPutUserTransactionWriteCommandInput(user);

		const groupIds = Object.keys(user.groups);

		// add/delete tag items
		transaction.TransactItems.push(...this.tagRepository.getTagTransactWriteCommandInput(user.email, PkType.User, groupIds, tagsToAdd, tagsToDelete).TransactItems);

		try {
			this.log.debug(`UserRepository> update> transaction:${JSON.stringify(transaction)}`);
			const response = await this.dc.send(new TransactWriteCommand(transaction));
			this.log.debug(`UserRepository> update> response:${JSON.stringify(response)}`);
		} catch (err) {
			if (err instanceof Error) {
				if (err.name === 'TransactionCanceledException') {
					this.log.error(`UserRepository> update> err> ${JSON.stringify((err as TransactionCanceledException).CancellationReasons)}`);
					throw new DatabaseTransactionError((err as TransactionCanceledException).CancellationReasons as TransactionCancellationReason[]);
				} else {
					this.log.error(err);
					throw err;
				}
			}
		}

		this.log.debug(`UserRepository> update> exit:`);
	}

	public async listByIds(userIds: string[]): Promise<User[]> {
		this.log.debug(`UserRepository> listByIds> userIds:${JSON.stringify(userIds)}`);

		const originalUserIds = [...userIds];

		const userIdsSet = new Set(userIds);
		userIds = Array.from(userIdsSet);
		// retrieve the user items
		const params: BatchGetCommandInput = {
			RequestItems: {},
		};
		params.RequestItems[this.tableName] = {
			Keys: userIds.map((i) => ({
				pk: createDelimitedAttribute(PkType.User, i),
				sk: createDelimitedAttribute(PkType.User, i),
			})),
		};

		this.log.debug(`UserRepository> listByIds> params:${JSON.stringify(params)}`);
		const items = await this.dynamoDbUtils.batchGetAll(params);
		this.log.debug(`UserRepository> listByIds> items:${JSON.stringify(items)}`);

		if (items?.Responses?.[this.tableName] === undefined) {
			this.log.debug('UserRepository> listByIds> exit: commands:undefined');
			return [];
		}

		const userDict = items.Responses[this.tableName]
			.sort((a, b) => (a['pk'] as string).localeCompare(b['pk']) || (a['sk'] as string).localeCompare(b['sk']))
			.map((i) => this.assemble(i))
			.reduce((prev, curr) => {
				prev[curr.email] = curr;
				return prev;
			}, {});

		const users = originalUserIds.map((email) => userDict[email]);

		this.log.debug(`UserRepository> listByIds> exit:${JSON.stringify([users])}`);
		return users;
	}

	public async get(email: string): Promise<User> {
		this.log.debug(`UserRepository> get> email:${email}`);

		const userDbId = createDelimitedAttribute(PkType.User, email);
		const params: GetCommandInput = {
			TableName: this.tableName,
			Key: {
				pk: userDbId,
				sk: userDbId,
			},
		};

		this.log.debug(`UserRepository> get> params:${JSON.stringify(params)}`);
		const item = await this.dc.send(new GetCommand(params));
		this.log.debug(`UserRepository> get> item:${JSON.stringify(item)}`);

		const i = item?.Item;
		if (i === undefined) {
			return undefined;
		}

		const user = this.assemble(i);

		this.log.debug(`UserRepository> get> exit> ${JSON.stringify(user)}`);
		return user;
	}

	private getPutUserTransactionWriteCommandInput(user: User): TransactWriteCommandInput {
		const userDbId = createDelimitedAttribute(PkType.User, user.email);
		const transaction: TransactWriteCommandInput = {
			TransactItems: [
				{
					// The calculation item (current version)
					Put: {
						TableName: this.tableName,
						Item: {
							pk: userDbId,
							sk: userDbId,
							siKey1: PkType.User,
							email: user.email,
							state: user.state,
							tags: user.tags,
							groups: user.groups,
							defaultGroup: user.defaultGroup,
							createdAt: user.createdAt,
							createdBy: user.createdBy,
						},
					},
				},
			],
		};
		return transaction;
	}

	public async create(user: User): Promise<void> {
		this.log.debug(`UserRepository> create> user:${JSON.stringify(user)}`);

		// main item
		const transaction = this.getPutUserTransactionWriteCommandInput(user);

		const groupIds = Object.keys(user.groups);

		// create tag items
		transaction.TransactItems.push(...this.tagRepository.getTagTransactWriteCommandInput(user.email, PkType.User, groupIds, user.tags, {}).TransactItems);

		// note: group membership is handled as part of groupModuleRepository rather than resource-api-base due to different handling of groups

		try {
			this.log.debug(`UserRepository> create> params:${JSON.stringify(transaction)}`);
			const response = await this.dc.send(new TransactWriteCommand(transaction));
			this.log.debug(`UserRepository> create> response:${JSON.stringify(response)}`);
		} catch (err) {
			if (err instanceof Error) {
				if (err.name === 'TransactionCanceledException') {
					this.log.error(`CalculationRepository> create> err> ${JSON.stringify((err as TransactionCanceledException).CancellationReasons)}`);
					throw new DatabaseTransactionError((err as TransactionCanceledException).CancellationReasons as TransactionCancellationReason[]);
				} else {
					this.log.error(err);
					throw err;
				}
			}
		}

		this.log.debug(`UserRepository> create> exit>`);
	}

	public async delete(email: string): Promise<void> {
		this.log.debug(`UserRepository> delete> email:${email}`);

		// keys
		const userDbId = createDelimitedAttribute(PkType.User, email);

		// list all items directly relating to the user
		const params1: QueryCommandInput = {
			TableName: this.tableName,
			KeyConditionExpression: `#hash=:hash`,
			ExpressionAttributeNames: {
				'#hash': 'pk',
			},
			ExpressionAttributeValues: {
				':hash': userDbId,
			},
		};

		const dbIds: { pk: string; sk: string }[] = [];
		let exclusiveStartKey: Record<string, any>;
		do {
			this.log.debug(`UserRepository> delete> params1:${JSON.stringify(params1)}`);
			params1.ExclusiveStartKey = exclusiveStartKey;
			const data = await this.dc.send(new QueryCommand(params1));
			this.log.debug(`UserRepository> delete> data:${JSON.stringify(data)}`);
			if (data.Count > 0) {
				dbIds.push(...data.Items.map((i) => ({ pk: i['pk'], sk: i['sk'] })));
			}
			exclusiveStartKey = data.LastEvaluatedKey;
		} while (exclusiveStartKey !== undefined);
		this.log.debug(`UserRepository> delete> dbIds:${JSON.stringify(dbIds)}`);

		// delete all the user related items
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
			this.log.debug(`UserRepository> delete> transaction:${JSON.stringify(transaction)}`);
			const response = await this.dc.send(new TransactWriteCommand(transaction));
			this.log.debug(`UserRepository> delete> response:${JSON.stringify(response)}`);
		} catch (err) {
			if (err instanceof Error) {
				if (err.name === 'TransactionCanceledException') {
					this.log.error(`UserRepository> delete> err> ${JSON.stringify((err as TransactionCanceledException).CancellationReasons)}`);
					throw new DatabaseTransactionError((err as TransactionCanceledException).CancellationReasons as TransactionCancellationReason[]);
				} else {
					this.log.error(err);
					throw err;
				}
			}
		}

		this.log.debug(`UserRepository> delete> exit>`);
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private assemble(i: Record<string, any>): User {
		return {
			email: i['email'],
			state: i['state'],
			groups: i['groups'],
			defaultGroup: i['defaultGroup'],
			createdAt: i['createdAt'],
			createdBy: i['createdBy'],
			updatedAt: i['updatedAt'],
			updatedBy: i['updatedBy'],
			tags: i['tags'],
		};
	}
}
