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

import { BatchGetCommandInput, DynamoDBDocumentClient, GetCommand, GetCommandInput, TransactWriteCommand, TransactWriteCommandInput, PutCommandInput, PutCommand, DeleteCommandInput, DeleteCommand } from '@aws-sdk/lib-dynamodb';

import { DatabaseTransactionError, TagRepository, Tags, TransactionCancellationReason, Utils, CommonPkType as ResourceBasePkType } from '@sif/resource-api-base';

import type { FastifyBaseLogger } from 'fastify';
import type { Group } from './schemas.js';
import { createDelimitedAttribute, DynamoDbUtils } from '@sif/dynamodb-utils';
import type { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { PkType } from '../common/pkTypes.js';

export class GroupModuleRepository {
	private readonly log: FastifyBaseLogger;
	private readonly dc: DynamoDBDocumentClient;
	private readonly tableName: string;
	private readonly dynamoDbUtils: DynamoDbUtils;
	private readonly tagRepository: TagRepository;
	private readonly utils: Utils;

	public constructor(log: FastifyBaseLogger, dc: DynamoDBDocumentClient, tableName: string, dynamoDbUtils: DynamoDbUtils, tagRepository: TagRepository, utils: Utils) {
		this.utils = utils;
		this.log = log;
		this.dc = dc;
		this.tableName = tableName;
		this.dynamoDbUtils = dynamoDbUtils;
		this.tagRepository = tagRepository;
	}

	private getPutGroupTransactionWriteCommandInput(group: Group): TransactWriteCommandInput {
		const groupDbId = createDelimitedAttribute(PkType.Group, group.id);

		const transaction: TransactWriteCommandInput = {
			TransactItems: [
				// main item
				{
					Put: {
						TableName: this.tableName,
						Item: {
							pk: groupDbId,
							sk: groupDbId,
							siKey1: PkType.Group,
							id: group.id,
							name: group.name,
							description: group.description,
							state: group.state,
							tags: group.tags,
							createdBy: group.createdBy,
							createdAt: group.createdAt,
							configuration: group.configuration,
						},
					},
				},
			],
		};
		return transaction;
	}

	public async create(parentId: string, group: Group): Promise<void> {
		this.log.debug(`GroupModuleRepository> create> in> parentId:${parentId}, group:${JSON.stringify(group)}`);

		const groupDbId = createDelimitedAttribute(PkType.Group, group.id);

		// main item
		const transaction = this.getPutGroupTransactionWriteCommandInput(group);

		// create tag items
		transaction.TransactItems.push(...this.tagRepository.getTagTransactWriteCommandInput(group.id, PkType.Group, [group.id], group.tags, {}).TransactItems);

		// hierarchy
		const parentGroupDbId = createDelimitedAttribute(PkType.Group, parentId);
		transaction.TransactItems.push({
			Put: {
				TableName: this.tableName,
				Item: {
					pk: groupDbId,
					sk: parentGroupDbId,
					siKey1: parentGroupDbId,
					siKey3: createDelimitedAttribute(ResourceBasePkType.Partition, this.utils.getRandomPartition()),
					siSort3: createDelimitedAttribute(PkType.Group, PkType.Group, this.utils.appendDelimiter(parentId), PkType.Group, group.id),
				},
			},
		});

		try {
			this.log.debug(`GroupModuleRepository> create> transaction:${JSON.stringify(transaction)}`);
			const response = await this.dc.send(new TransactWriteCommand(transaction));
			this.log.debug(`GroupModuleRepository> create> response:${JSON.stringify(response)}`);
		} catch (err) {
			if (err instanceof Error) {
				if (err.name === 'TransactionCanceledException') {
					this.log.error(`GroupModuleRepository> create> err> ${JSON.stringify((err as TransactionCanceledException).CancellationReasons)}`);
					throw new DatabaseTransactionError((err as TransactionCanceledException).CancellationReasons as TransactionCancellationReason[]);
				} else {
					this.log.error(err);
					throw err;
				}
			}
		}
	}

	public async update(group: Group, tagsToAdd: Tags, tagsToDelete: Tags): Promise<void> {
		this.log.debug(`GroupModuleRepository> update> group:${JSON.stringify(group)}, tagsToAdd:${JSON.stringify(tagsToAdd)}, tagsToDelete:${JSON.stringify(tagsToDelete)}`);

		// update main item
		const transaction = this.getPutGroupTransactionWriteCommandInput(group);

		// add/delete tag items
		transaction.TransactItems.push(...this.tagRepository.getTagTransactWriteCommandInput(group.id, PkType.Group, [group.id], tagsToAdd, tagsToDelete).TransactItems);

		try {
			this.log.debug(`GroupModuleRepository> update> transaction:${JSON.stringify(transaction)}`);
			const response = await this.dc.send(new TransactWriteCommand(transaction));
			this.log.debug(`GroupModuleRepository> create> response:${JSON.stringify(response)}`);
		} catch (err) {
			if (err instanceof Error) {
				if (err.name === 'TransactionCanceledException') {
					this.log.error(`GroupModuleRepository> create> err> ${JSON.stringify((err as TransactionCanceledException).CancellationReasons)}`);
					throw new DatabaseTransactionError((err as TransactionCanceledException).CancellationReasons as TransactionCancellationReason[]);
				} else {
					this.log.error(err);
					throw err;
				}
			}
		}

		this.log.debug(`GroupModuleRepository> update> exit:`);
	}

	public async get(groupId: string): Promise<Group> {
		this.log.debug(`GroupModuleRepository> get> groupId:${groupId}`);

		const groupDbId = createDelimitedAttribute(PkType.Group, groupId);
		const params: GetCommandInput = {
			TableName: this.tableName,
			Key: {
				pk: groupDbId,
				sk: groupDbId,
			},
		};

		this.log.debug(`GroupModuleRepository> get> params:${JSON.stringify(params)}`);
		const item = await this.dc.send(new GetCommand(params));
		this.log.debug(`GroupModuleRepository> get> item:${JSON.stringify(item)}`);

		const i = item?.Item;
		if (i === undefined) {
			this.log.debug(`GroupModuleRepository> get> exit>`);
			return undefined;
		}

		const group = this.assembleGroup(i);

		this.log.debug(`GroupModuleRepository> get> exit> ${JSON.stringify(group)}`);
		return group;
	}

	public async delete(groupId: string): Promise<void> {
		this.log.debug(`GroupModuleRepository> delete> groupId:${groupId}`);

		const groupDbId = createDelimitedAttribute(PkType.Group, groupId);
		let parentGroupId = groupId.substring(0, groupId.lastIndexOf('/'));
		if (parentGroupId.length === 0) {
			parentGroupId = '/';
		}
		const parentGroupDbId = createDelimitedAttribute(PkType.Group, parentGroupId);

		const params: TransactWriteCommandInput = {
			TransactItems: [
				// main item
				{
					Delete: {
						TableName: this.tableName,
						Key: {
							pk: groupDbId,
							sk: groupDbId,
						},
					},
				},
				// hierarchy item
				{
					Delete: {
						TableName: this.tableName,
						Key: {
							pk: groupDbId,
							sk: parentGroupDbId,
						},
					},
				},
			],
		};

		try {
			this.log.debug(`GroupModuleRepository> delete> params:${JSON.stringify(params)}`);
			const response = await this.dc.send(new TransactWriteCommand(params));
			this.log.debug(`GroupModuleRepository> delete> response:${JSON.stringify(response)}`);
		} catch (err) {
			if (err instanceof Error) {
				if (err.name === 'TransactionCanceledException') {
					this.log.error(`GroupModuleRepository> delete> err> ${JSON.stringify((err as TransactionCanceledException).CancellationReasons)}`);
					throw new DatabaseTransactionError((err as TransactionCanceledException).CancellationReasons as TransactionCancellationReason[]);
				} else {
					this.log.error(err);
					throw err;
				}
			}
		}

		this.log.debug(`GroupModuleRepository> delete> exit>`);
	}

	public async listByIds(groupIds: string[]): Promise<Group[]> {
		this.log.debug(`GroupModuleRepository> listByIds> groupIds:${JSON.stringify(groupIds)}`);

		if ((groupIds?.length ?? 0) === 0) {
			this.log.debug(`GroupModuleRepository> listByIds> early exit:[]`);
			return [];
		}

		// retrieve the group items
		const params: BatchGetCommandInput = {
			RequestItems: {},
		};
		params.RequestItems[this.tableName] = {
			Keys: groupIds.map((i) => ({
				pk: createDelimitedAttribute(PkType.Group, i),
				sk: createDelimitedAttribute(PkType.Group, i),
			})),
		};

		this.log.debug(`GroupModuleRepository> listByIds> params:${JSON.stringify(params)}`);
		const items = await this.dynamoDbUtils.batchGetAll(params);
		this.log.debug(`GroupModuleRepository> listByIds> items:${JSON.stringify(items)}`);

		if (items?.Responses?.[this.tableName] === undefined) {
			this.log.debug('GroupModuleRepository> listByIds> exit: commands:undefined');
			return [];
		}

		const groups = items.Responses[this.tableName].sort((a, b) => (a['pk'] as string).localeCompare(b['pk']) || (a['sk'] as string).localeCompare(b['sk'])).map((i) => this.assembleGroup(i));

		this.log.debug(`GroupModuleRepository> listByIds> exit:${JSON.stringify([groups])}`);
		return groups;
	}

	public async getMembership(email: string, groupId: string): Promise<GroupMembership> {
		this.log.debug(`GroupModuleRepository> getMembership> in> email:${email}, groupId:${groupId}`);

		const params: GetCommandInput = {
			TableName: this.tableName,
			Key: {
				pk: createDelimitedAttribute(PkType.User, email),
				sk: createDelimitedAttribute(PkType.Group, groupId),
			},
		};

		this.log.debug(`GroupModuleRepository> getMembership> params:${JSON.stringify(params)}`);
		const item = await this.dc.send(new GetCommand(params));
		this.log.debug(`GroupModuleRepository> getMembership> item:${JSON.stringify(item)}`);

		const i = item?.Item;
		if (i === undefined) {
			this.log.debug(`GroupModuleRepository> getMembership> exit>`);
			return undefined;
		}

		const membership = this.assembleGroupMembership(i);

		this.log.debug(`GroupModuleRepository> getMembership> exit> ${JSON.stringify(membership)}`);
		return membership;
	}

	public async saveMembership(membership: GroupMembership): Promise<void> {
		this.log.debug(`GroupModuleRepository> saveMembership> in> membership:${JSON.stringify(membership)}`);

		const groupDbId = createDelimitedAttribute(PkType.Group, membership.groupId);
		const params: PutCommandInput = {
			TableName: this.tableName,
			Item: {
				pk: createDelimitedAttribute(PkType.User, membership.email),
				sk: groupDbId,
				siKey1: groupDbId,
				email: membership.email,
				groupId: membership.groupId,
				role: membership.role,
				createdBy: membership.createdBy,
				createdAt: membership.createdAt,
				// Below keys are used to search users up and down the hierarchy
				siKey3: createDelimitedAttribute(ResourceBasePkType.Partition, this.utils.getRandomPartition()),
				siSort3: createDelimitedAttribute(PkType.Group, PkType.User, this.utils.appendDelimiter(membership.groupId), PkType.User, membership.email),
			},
		};

		try {
			this.log.debug(`GroupModuleRepository> saveMembership> params:${JSON.stringify(params)}`);
			const response = await this.dc.send(new PutCommand(params));
			this.log.debug(`GroupModuleRepository> saveMembership> response:${JSON.stringify(response)}`);
		} catch (err) {
			this.log.error(err);
			throw err;
		}
	}

	public async deleteMembership(email: string, groupId: string): Promise<void> {
		this.log.debug(`GroupModuleRepository> deleteMembership> in> email:${email}, groupId:${groupId}`);

		const params: DeleteCommandInput = {
			TableName: this.tableName,
			Key: {
				pk: createDelimitedAttribute(PkType.User, email),
				sk: createDelimitedAttribute(PkType.Group, groupId),
			},
		};

		try {
			this.log.debug(`GroupModuleRepository> deleteMembership> params:${JSON.stringify(params)}`);
			const response = await this.dc.send(new DeleteCommand(params));
			this.log.debug(`GroupModuleRepository> deleteMembership> response:${JSON.stringify(response)}`);
		} catch (err) {
			this.log.error(err);
			throw err;
		}
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private assembleGroup(i: Record<string, any>): Group {
		return {
			id: i['id'],
			name: i['name'],
			description: i['description'],
			state: i['state'],
			createdBy: i['createdBy'],
			createdAt: i['createdAt'],
			updatedBy: i['updatedBy'],
			updatedAt: i['updatedAt'],
			configuration: i['configuration'],
			tags: i['tags'],
		};
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private assembleGroupMembership(i: Record<string, any>): GroupMembership {
		return {
			email: i['email'],
			groupId: i['groupId'],
			role: i['role'],
			createdBy: i['createdBy'],
			createdAt: i['createdAt'],
		};
	}
}

export interface GroupListOptions {
	count?: number;
	exclusiveStart?: GroupListPaginationKey;
	tags?: Tags;
	includeChildGroups?: boolean;
	includeParentGroups?: boolean;
}

export interface GroupListPaginationKey {
	paginationToken?: string;
}

export interface GroupMembership {
	email: string;
	groupId: string;
	role: string;
	createdAt: string;
	createdBy: string;
}
