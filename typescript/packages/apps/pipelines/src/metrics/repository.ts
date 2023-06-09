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
import clone from 'just-clone';
import { DynamoDBDocumentClient, GetCommandInput, QueryCommandInput, TransactWriteCommandInput, BatchGetCommandInput, GetCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { createDelimitedAttribute, createDelimitedAttributePrefix, DynamoDbUtils, expandDelimitedAttribute } from '@sif/dynamodb-utils';
import { TagRepository, GroupRepository, Tags, DatabaseTransactionError, TransactionCancellationReason } from '@sif/resource-api-base';
import type { Metric } from './schemas.js';
import type { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { PkType } from '../utils/pkUtils.utils.js';

export class MetricRepository {
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

	public async delete(id: string): Promise<void> {
		this.log.debug(`MetricRepository> delete> id:${id}`);

		// keys
		const dbId = createDelimitedAttribute(PkType.Metric, id);

		// list all items directly relating to the Metric
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
			this.log.debug(`MetricRepository> delete> params1:${JSON.stringify(params1)}`);
			params1.ExclusiveStartKey = exclusiveStartKey;
			const data = await this.dc.send(new QueryCommand(params1));
			this.log.debug(`MetricRepository> delete> data:${JSON.stringify(data)}`);
			if (data.Count > 0) {
				dbIds.push(...data.Items.map((i) => ({ pk: i['pk'], sk: i['sk'] })));
			}
			exclusiveStartKey = data.LastEvaluatedKey;
		} while (exclusiveStartKey !== undefined);
		this.log.debug(`MetricRepository> delete> dbIds:${JSON.stringify(dbIds)}`);

		// delete all the metric related items
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
			this.log.debug(`MetricRepository> delete> transaction:${JSON.stringify(transaction)}`);
			const response = await this.dc.send(new TransactWriteCommand(transaction));
			this.log.debug(`MetricRepository> delete> response:${JSON.stringify(response)}`);
		} catch (err) {
			if (err instanceof Error) {
				if (err.name === 'TransactionCanceledException') {
					this.log.error(`MetricRepository> delete> err> ${JSON.stringify((err as TransactionCanceledException).CancellationReasons)}`);
					throw new DatabaseTransactionError((err as TransactionCanceledException).CancellationReasons as TransactionCancellationReason[]);
				} else {
					this.log.error(err);
					throw err;
				}
			}
		}

		this.log.debug(`MetricRepository> delete> exit>`);
	}

	public async update(metric: Metric, tagsToAdd: Tags = {}, tagsToDelete: Tags = {}): Promise<void> {
		this.log.debug(`MetricRepository> update> metric:${JSON.stringify(metric)}, tagsToAdd:${JSON.stringify(tagsToAdd)}, tagsToDelete:${JSON.stringify(tagsToDelete)}`);

		// create metric latest version and versioned items
		const transaction = this.getPutResourceTransactionWriteCommandInput(metric);

		// add/delete tag items
		transaction.TransactItems.push(...this.tagRepository.getTagTransactWriteCommandInput(metric.id, PkType.Metric, metric.groups, tagsToAdd, tagsToDelete).TransactItems);

		try {
			this.log.debug(`MetricRepository> update> transaction:${JSON.stringify(transaction)}`);
			const response = await this.dc.send(new TransactWriteCommand(transaction));
			this.log.debug(`MetricRepository> update> response:${JSON.stringify(response)}`);
		} catch (err) {
			if (err instanceof Error) {
				if (err.name === 'TransactionCanceledException') {
					this.log.error(`MetricRepository> update> err> ${JSON.stringify((err as TransactionCanceledException).CancellationReasons)}`);
					throw new DatabaseTransactionError((err as TransactionCanceledException).CancellationReasons as TransactionCancellationReason[]);
				} else {
					this.log.error(err);
					throw err;
				}
			}
		}

		this.log.debug(`MetricRepository> update> exit>`);
	}

	public async get(metricId: string, version?: number): Promise<Metric> {
		this.log.info(`MetricRepository> get> in: metricId:${metricId}, version:${version}`);

		let result: Metric;
		const dbId = createDelimitedAttribute(PkType.Metric, metricId);
		const command: GetCommandInput = {
			TableName: this.tableName,
			Key: {
				pk: dbId,
				sk: version ? createDelimitedAttribute(PkType.MetricVersion, version) : dbId,
			},
		};

		const response = await this.dc.send(new GetCommand(command));
		if (response.Item) {
			result = this.assembleMetric(response.Item);
		}

		this.log.debug(`MetricRepository > get > exit: ${JSON.stringify(result)}`);
		return result;
	}

	public async getByIds(metricIds: string[]): Promise<Metric[]> {
		this.log.debug(`MetricRepository> getByIds> metricIds:${metricIds}`);

		let result: Metric[] = [];

		if ((metricIds?.length ?? 0) === 0) {
			this.log.debug(`MetricRepository> getByIds> early exit:[]`);
			return result;
		}

		const command: BatchGetCommandInput = {
			RequestItems: {
				[this.tableName]: {
					Keys: metricIds.map((id) => ({
						pk: createDelimitedAttribute(PkType.Metric, id),
						sk: createDelimitedAttribute(PkType.Metric, id),
					})),
				},
			},
		};

		this.log.debug(`MetricRepository> getByIds> command:${JSON.stringify(command)}`);
		const items = await this.dynamoDbUtils.batchGetAll(command);
		this.log.debug(`MetricRepository> getByIds> items:${JSON.stringify(items)}`);

		if (items?.Responses?.[this.tableName]) {
			result = this.assembleMetricList(items.Responses[this.tableName] as Record<string, any>[]);
		}
		this.log.debug(`MetricRepository> getByIds> exit:${result}`);
		return result;
	}

	public async listVersions(metricId: string, count?: number, exclusiveStart?: MetricVersionPaginationKey): Promise<[Metric[], MetricVersionPaginationKey]> {
		this.log.debug(`MetricRepository> listPVersions> in: metricId:${metricId}, count:${count}, exclusiveStart: ${exclusiveStart}`);

		let exclusiveStartKey;
		if (exclusiveStart?.version) {
			exclusiveStartKey = {
				pk: createDelimitedAttribute(PkType.Metric, metricId),
				sk: createDelimitedAttribute(PkType.MetricVersion, exclusiveStart.version),
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
				':hash': createDelimitedAttribute(PkType.Metric, metricId),
				':sortKey': createDelimitedAttributePrefix(PkType.MetricVersion),
			},
			Limit: count as number,
			ExclusiveStartKey: exclusiveStartKey,
			ScanIndexForward: false,
		};

		this.log.debug(`MetricRepository> listVersions> params:${JSON.stringify(params)}`);
		const items = await this.dc.send(new QueryCommand(params));
		this.log.debug(`MetricRepository> listVersions> items:${JSON.stringify(items)}`);
		if ((items.Items?.length ?? 0) === 0) {
			return [[], undefined];
		}

		let paginationKey: MetricVersionPaginationKey;
		if (items.LastEvaluatedKey) {
			const lastEvaluatedVersion = Number(expandDelimitedAttribute(items.LastEvaluatedKey['sk'])[1]);
			paginationKey = {
				version: lastEvaluatedVersion,
			};
		}

		const metrics: Metric[] = [];
		for (const i of items.Items) {
			metrics.push(this.assembleMetric(i));
		}

		this.log.debug(`MetricRepository> listVersions> exit:${JSON.stringify([metrics, paginationKey])}`);
		return [metrics, paginationKey];
	}

	private getPutResourceTransactionWriteCommandInput(p: Metric): TransactWriteCommandInput {
		const metricDbId = createDelimitedAttribute(PkType.Metric, p.id);
		const metricVersionDbId = createDelimitedAttribute(PkType.MetricVersion, p.version);

		const transaction: TransactWriteCommandInput = {
			TransactItems: [
				{
					// The Metric item (current version)
					Put: {
						TableName: this.tableName,
						Item: {
							pk: metricDbId,
							sk: metricDbId,
							...p,
						},
					},
				},
			],
		};

		// The Metric item (versioned)
		const versionedStatement = clone(transaction.TransactItems[0]);
		versionedStatement.Put.Item['sk'] = metricVersionDbId;
		transaction.TransactItems.push(versionedStatement);
		return transaction;
	}

	public async create(metric: Metric): Promise<void> {
		this.log.debug(`MetricRepository> create> in: metric:${JSON.stringify(metric)}`);

		// keys
		const groupId = metric.groups[0] as string;

		// create Metric latest version and versioned items
		const transaction = this.getPutResourceTransactionWriteCommandInput(metric);

		// create tag items
		transaction.TransactItems.push(...this.tagRepository.getTagTransactWriteCommandInput(metric.id, PkType.Metric, metric.groups, metric.tags, {}).TransactItems);

		// group membership
		transaction.TransactItems.push(
			...this.groupRepository.getGrantGroupTransactWriteCommandInput(
				{
					id: metric.id,
					keyPrefix: PkType.Metric,
					alternateId: metric.name,
				},
				{ id: groupId }
			).TransactItems
		);

		try {
			this.log.debug(`MetricRepository> create> params:${JSON.stringify(transaction)}`);
			const response = await this.dc.send(new TransactWriteCommand(transaction));
			this.log.debug(`MetricRepository> create> response:${JSON.stringify(response)}`);
		} catch (err) {
			if (err instanceof Error) {
				if (err.name === 'TransactionCanceledException') {
					this.log.error(`MetricRepository> create> err> ${JSON.stringify((err as TransactionCanceledException).CancellationReasons)}`);
					throw new DatabaseTransactionError((err as TransactionCanceledException).CancellationReasons as TransactionCancellationReason[]);
				} else {
					this.log.error(err);
					throw err;
				}
			}
		}

		this.log.debug(`MetricRepository> create> exit>`);
	}

	private assembleMetricList(items: Record<string, any>[]): Metric[] {
		const metrics = [];
		for (const item of items) {
			metrics.push(this.assembleMetric(item));
		}
		return metrics;
	}

	private assembleMetric(i: Record<string, any>): Metric {
		const pk = expandDelimitedAttribute(i['pk']);
		return {
			id: pk?.[1] as string,
			name: i['name'],
			summary: i['summary'],
			description: i['description'],
			aggregationType: i['aggregationType'],
			tags: i['tags'],
			state: i['state'],
			outputMetrics: i['outputMetrics'] ?? [],
			inputMetrics: i['inputMetrics'] ?? [],
			inputPipelines: i['inputPipelines'] ?? [],
			attributes: i['attributes'],
			groups: i['groups'],
			version: i['version'],
			createdAt: i['createdAt'],
			createdBy: i['createdBy'],
			updatedAt: i['updatedAt'],
			updatedBy: i['updatedBy'],
		};
	}
}

export interface MetricListPaginationKey {
	paginationToken: string;
}

export interface MetricVersionPaginationKey {
	version: number;
}

export interface DynamoDbPaginationKey {
	[key: string]: string;
}

export interface MetricListOptions {
	count?: number;
	exclusiveStart?: MetricListPaginationKey;
	name?: string;
	tags?: Tags;
	includeChildGroups?: boolean;
	includeParentGroups?: boolean;
}
