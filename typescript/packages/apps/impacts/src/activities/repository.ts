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
import { BatchGetCommandInput, DynamoDBDocumentClient, GetCommand, GetCommandInput, QueryCommand, QueryCommandInput, TransactWriteCommand, TransactWriteCommandInput } from '@aws-sdk/lib-dynamodb';

import type { Activity } from './schemas.js';
import { createDelimitedAttribute, DocumentDbClientItem, expandDelimitedAttribute, DynamoDbUtils, createDelimitedAttributePrefix } from '@sif/dynamodb-utils';
import { TagRepository, GroupRepository, Tags, DatabaseTransactionError, TransactionCancellationReason } from '@sif/resource-api-base';
import { PkType } from '../common/pkTypes.js';
import { getActivityTransactionWriteCommandInput } from '../common/dbUtils.util.js';
import type { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import dayjs from 'dayjs';

export class ActivityRepository {
	private readonly log: FastifyBaseLogger;
	private readonly dc: DynamoDBDocumentClient;
	private readonly tableName: string;
	private readonly tagRepository: TagRepository;
	private readonly groupRepository: GroupRepository;
	private readonly dynamoDbUtils: DynamoDbUtils;

	public constructor(log: FastifyBaseLogger, dc: DynamoDBDocumentClient, tableName: string, tagRepository: TagRepository, groupRepository: GroupRepository, dynamoDbUtils: DynamoDbUtils) {
		this.log = log;
		this.dc = dc;
		this.tableName = tableName;
		this.tagRepository = tagRepository;
		this.groupRepository = groupRepository;
		this.dynamoDbUtils = dynamoDbUtils;
	}

	public async create(activity: Activity): Promise<void> {
		this.log.debug(`ActivityRepository> create> activity:${JSON.stringify(activity)}`);

		// keys
		const groupId = activity.groups[0] as string;

		const transaction = getActivityTransactionWriteCommandInput(this.tableName, activity);

		// create tag items
		transaction.TransactItems.push(...this.tagRepository.getTagTransactWriteCommandInput(activity.id, PkType.Activity, activity.groups, activity.tags, {}).TransactItems);

		// group membership
		transaction.TransactItems.push(
			...this.groupRepository.getGrantGroupTransactWriteCommandInput(
				{
					id: activity.id,
					keyPrefix: PkType.Activity,
					alternateId: activity.name,
				},
				{ id: groupId }
			).TransactItems
		);

		try {
			const response = await this.dc.send(new TransactWriteCommand(transaction));
			this.log.debug(`ActivityRepository> create> response:${JSON.stringify(response)}`);
		} catch (err) {
			if (err instanceof Error) {
				if (err.name === 'TransactionCanceledException') {
					this.log.error(`ActivityRepository> create> err> ${JSON.stringify((err as TransactionCanceledException).CancellationReasons)}`);
					throw new DatabaseTransactionError((err as TransactionCanceledException).CancellationReasons as TransactionCancellationReason[]);
				} else {
					this.log.error(err);
					throw err;
				}
			}
		}
		this.log.debug(`ActivityRepository> create> exit>`);
	}

	public async get(id: string, version?: number): Promise<Activity> {
		this.log.debug(`ActivityRepository> get> id:${id}, version:${version}}`);

		const activityDbId = createDelimitedAttribute(PkType.Activity, id);
		const params: GetCommandInput = {
			TableName: this.tableName,
			Key: {
				pk: activityDbId,
				sk: version ? createDelimitedAttribute(PkType.ActivityVersion, version) : activityDbId,
			},
		};
		this.log.debug(`ActivityRepository> get> params: ${JSON.stringify(params)}`);
		const response = await this.dc.send(new GetCommand(params));
		this.log.debug(`ActivityRepository> get> response: ${JSON.stringify(response)}`);
		if (response.Item === undefined) {
			this.log.debug(`ActivityRepository> get> early exit: undefined`);
			return undefined;
		}

		// assemble before returning
		const activity = this.assemble(response.Item);

		this.log.debug(`ActivityRepository> get> exit:${JSON.stringify(activity)}`);
		return activity;
	}

	public async update(activity: Activity, tagsToAdd: Tags, tagsToDelete: Tags): Promise<void> {
		this.log.debug(`ActivityRepository> update> i:${JSON.stringify(activity)}, tagsToAdd:${JSON.stringify(tagsToAdd)}, tagsToDelete:${JSON.stringify(tagsToDelete)}`);

		// create a new latest and versioned items
		const transaction = getActivityTransactionWriteCommandInput(this.tableName, activity);

		// add/delete tag items
		transaction.TransactItems.push(...this.tagRepository.getTagTransactWriteCommandInput(activity.id, PkType.Activity, activity.groups, tagsToAdd, tagsToDelete).TransactItems);

		try {
			this.log.debug(`ActivityRepository> update> transaction:${JSON.stringify(transaction)}`);
			const response = await this.dc.send(new TransactWriteCommand(transaction));
			this.log.debug(`ActivityRepository> update> response:${JSON.stringify(response)}`);
		} catch (err) {
			if (err instanceof Error) {
				if (err.name === 'TransactionCanceledException') {
					this.log.error(`ActivityRepository> update> err> ${JSON.stringify((err as TransactionCanceledException).CancellationReasons)}`);
					throw new DatabaseTransactionError((err as TransactionCanceledException).CancellationReasons as TransactionCancellationReason[]);
				} else {
					this.log.error(err);
					throw err;
				}
			}
		}
		this.log.debug(`ActivityRepository> update> exit`);
	}

	public async listVersions(id: string, options: ActivityListVersionsOptions): Promise<[Activity[], ActivityListVersionPaginationKey]> {
		this.log.info(`ActivityRepository > listVersions > Id: ${id} options:${JSON.stringify(options)} `);

		let exclusiveStartKey;
		if (options?.exclusiveStart?.version) {
			exclusiveStartKey = {
				pk: createDelimitedAttribute(PkType.Activity, id),
				sk: createDelimitedAttribute(PkType.ActivityVersion, options.exclusiveStart.version),
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
				':hash': createDelimitedAttribute(PkType.Activity, id),
				':sortKey': createDelimitedAttributePrefix(PkType.ActivityVersion),
			},
			Limit: options.count as number,
			ExclusiveStartKey: exclusiveStartKey,
			ScanIndexForward: false,
		};

		if (options.versionAsAt) {
			params.KeyConditionExpression = `#hash=:hash AND #sortKey<=:sortKey`;
			params.ExpressionAttributeValues[':sortKey'] = createDelimitedAttribute(PkType.ActivityActivationTime, dayjs(options.versionAsAt).unix());
			params.Limit = 1;
		}

		const items = await this.dc.send(new QueryCommand(params));
		this.log.info(`ActivityRepository > listVersions > response: ${JSON.stringify(items)}`);
		if ((items.Items?.length ?? 0) === 0) {
			return [[], undefined];
		}

		let paginationKey: ActivityListVersionPaginationKey;
		if (!options.versionAsAt && items.LastEvaluatedKey) {
			const lastEvaluatedVersion = Number(expandDelimitedAttribute(items.LastEvaluatedKey['sk'])[1]);
			paginationKey = {
				version: lastEvaluatedVersion,
			};
		}

		const activities: Activity[] = [];
		for (const i of items.Items) {
			activities.push(this.assemble(i));
		}

		this.log.debug(`ActivityRepository> list> exit:${JSON.stringify([activities, paginationKey])}`);
		return [activities, paginationKey];
	}

	public async listByIds(activityIds: string[]): Promise<Activity[]> {
		this.log.debug(`ActivityRepository> listByIds> in> activityIds:${JSON.stringify(activityIds)}`);

		if ((activityIds?.length ?? 0) === 0) {
			this.log.debug(`ActivityRepository> listByIds> early exit:[]`);
			return [];
		}

		const originalActivityIds = [...activityIds];
		const activityIdsSet = new Set(activityIds);
		activityIds = Array.from(activityIdsSet);

		// retrieve the activity items
		const params: BatchGetCommandInput = {
			RequestItems: {},
		};
		params.RequestItems[this.tableName] = {
			Keys: activityIds.map((i) => ({
				pk: createDelimitedAttribute(PkType.Activity, i),
				sk: createDelimitedAttribute(PkType.Activity, i),
			})),
		};

		this.log.debug(`ActivityRepository> listByIds> params:${JSON.stringify(params)}`);
		const items = await this.dynamoDbUtils.batchGetAll(params);
		this.log.debug(`ActivityRepository> listByIds> items:${JSON.stringify(items)}`);

		if (items?.Responses?.[this.tableName] === undefined) {
			this.log.debug('ActivityRepository> listByIds> exit: commands:undefined');
			return [];
		}

		const activityDict = items.Responses[this.tableName]
			.sort((a, b) => (a['pk'] as string).localeCompare(b['pk']) || (a['sk'] as string).localeCompare(b['sk']))
			.map((i) => this.assemble(i))
			.reduce((prev, curr) => {
				prev[curr.id] = curr;
				return prev;
			}, {});

		const activities = originalActivityIds.map((id) => activityDict[id]);

		this.log.debug(`ActivityRepository> listByIds> exit:${JSON.stringify(activities)}`);
		return activities;
	}

	public async delete(id: string): Promise<void> {
		this.log.debug(`ActivityRepository> delete> id:${id}`);

		// keys
		const dbId = createDelimitedAttribute(PkType.Activity, id);

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
			this.log.debug(`ActivityRepository> delete> params1:${JSON.stringify(params1)}`);
			params1.ExclusiveStartKey = exclusiveStartKey;
			const data = await this.dc.send(new QueryCommand(params1));
			this.log.debug(`ActivityRepository> delete> data:${JSON.stringify(data)}`);
			if (data.Count > 0) {
				dbIds.push(...data.Items.map((i) => ({ pk: i['pk'], sk: i['sk'] })));
			}
			exclusiveStartKey = data.LastEvaluatedKey;
		} while (exclusiveStartKey !== undefined);
		this.log.debug(`ActivityRepository> delete> dbIds:${JSON.stringify(dbIds)}`);

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
			this.log.debug(`ActivityRepository> delete> transaction:${JSON.stringify(transaction)}`);
			const response = await this.dc.send(new TransactWriteCommand(transaction));
			this.log.debug(`ActivityRepository> delete> response:${JSON.stringify(response)}`);
		} catch (err) {
			if (err instanceof Error) {
				if (err.name === 'TransactionCanceledException') {
					this.log.error(`ActivityRepository> delete> err> ${JSON.stringify((err as TransactionCanceledException).CancellationReasons)}`);
					throw new DatabaseTransactionError((err as TransactionCanceledException).CancellationReasons as TransactionCancellationReason[]);
				} else {
					this.log.error(err);
					throw err;
				}
			}
		}

		this.log.debug(`ActivityRepository> delete> exit>`);
	}

	private assemble(i: DocumentDbClientItem): Activity | undefined {
		this.log.debug(`ActivityRepository> assemble> i:${JSON.stringify(i)}`);

		if (i === undefined) {
			return undefined;
		}

		const activity: Activity = {
			id: i['id'],
			name: i['name'],
			description: i['description'],
			attributes: i['attributes'],
			impacts: i['impacts'],
			version: i['version'],
			state: i['state'],
			groups: i['groups'],
			tags: i['tags'],
			createdBy: i['createdBy'],
			createdAt: i['createdAt'],
			updatedBy: i['updatedBy'],
			updatedAt: i['updatedAt'],
			activeAt: i['activeAt'],
		};

		this.log.debug(`ActivityRepository> assemble> exit: ${JSON.stringify(activity)}`);
		return activity;
	}
}

export interface ActivityListOptions {
	count?: number;
	exclusiveStart?: ActivityListPaginationKey;
	name?: string;
	tags?: Tags;
	includeChildGroups?: boolean;
	includeParentGroups?: boolean;
}

export interface ActivityListPaginationKey {
	paginationToken: string;
}

export interface ActivityListVersionsOptions {
	count?: number;
	exclusiveStart?: ActivityListVersionPaginationKey;
	versionAsAt?: string;
}

export interface ActivityListVersionPaginationKey {
	version: number;
}

export interface GetOptions {
	stateOnly?: boolean;
	impactsOnly?: boolean;
	impactName?: string;
	componentsOnly?: boolean;
	componentKey?: string;
}
