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
import type { Pipeline } from './schemas.js';
import type { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { PkType } from '../utils/pkUtils.utils.js';
import dayjs from 'dayjs';

export class PipelineRepository {
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
		this.log.debug(`PipelineRepository> delete> id:${id}`);

		// keys
		const pipelineDbId = createDelimitedAttribute(PkType.Pipeline, id);

		// list all items directly relating to the Pipeline
		const params1: QueryCommandInput = {
			TableName: this.tableName,
			KeyConditionExpression: `#hash=:hash`,
			ExpressionAttributeNames: {
				'#hash': 'pk',
			},
			ExpressionAttributeValues: {
				':hash': pipelineDbId,
			},
		};

		const dbIds: { pk: string; sk: string }[] = [];
		let exclusiveStartKey: Record<string, any>;
		do {
			this.log.debug(`PipelineRepository> delete> params1:${JSON.stringify(params1)}`);
			params1.ExclusiveStartKey = exclusiveStartKey;
			const data = await this.dc.send(new QueryCommand(params1));
			this.log.debug(`PipelineRepository> delete> data:${JSON.stringify(data)}`);
			if (data.Count > 0) {
				dbIds.push(...data.Items.map((i) => ({ pk: i['pk'], sk: i['sk'] })));
			}
			exclusiveStartKey = data.LastEvaluatedKey;
		} while (exclusiveStartKey !== undefined);
		this.log.debug(`PipelineRepository> delete> dbIds:${JSON.stringify(dbIds)}`);

		// delete all the Pipeline related items
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
			this.log.debug(`PipelineRepository> delete> transaction:${JSON.stringify(transaction)}`);
			const response = await this.dc.send(new TransactWriteCommand(transaction));
			this.log.debug(`PipelineRepository> delete> response:${JSON.stringify(response)}`);
		} catch (err) {
			if (err instanceof Error) {
				if (err.name === 'TransactionCanceledException') {
					this.log.error(`PipelineRepository> delete> err> ${JSON.stringify((err as TransactionCanceledException).CancellationReasons)}`);
					throw new DatabaseTransactionError((err as TransactionCanceledException).CancellationReasons as TransactionCancellationReason[]);
				} else {
					this.log.error(err);
					throw err;
				}
			}
		}

		this.log.debug(`PipelineRepository> delete> exit>`);
	}

	public async update(pipeline: Pipeline, tagsToAdd: Tags, tagsToDelete: Tags): Promise<void> {
		this.log.debug(`PipelineRepository> update> c:${JSON.stringify(pipeline)}, tagsToAdd:${JSON.stringify(tagsToAdd)}, tagsToDelete:${JSON.stringify(tagsToDelete)}`);

		// create Pipeline latest version and versioned items
		const transaction = this.getPutResourceTransactionWriteCommandInput(pipeline);

		// add/delete tag items
		transaction.TransactItems.push(...this.tagRepository.getTagTransactWriteCommandInput(pipeline.id, PkType.Pipeline, pipeline.groups, tagsToAdd, tagsToDelete).TransactItems);

		try {
			this.log.debug(`PipelineRepository> update> transaction:${JSON.stringify(transaction)}`);
			const response = await this.dc.send(new TransactWriteCommand(transaction));
			this.log.debug(`PipelineRepository> update> response:${JSON.stringify(response)}`);
		} catch (err) {
			if (err instanceof Error) {
				if (err.name === 'TransactionCanceledException') {
					this.log.error(`PipelineRepository> update> err> ${JSON.stringify((err as TransactionCanceledException).CancellationReasons)}`);
					throw new DatabaseTransactionError((err as TransactionCanceledException).CancellationReasons as TransactionCancellationReason[]);
				} else {
					this.log.error(err);
					throw err;
				}
			}
		}

		this.log.debug(`PipelineRepository> update> exit>`);
	}

	public async get(pipelineId: string, version?: number, verbose = false): Promise<Pipeline | undefined> {
		this.log.info(`PipelineRepository > get > pipelineId:${pipelineId}, version:${version}, verbose:${verbose}`);

		const dbId = createDelimitedAttribute(PkType.Pipeline, pipelineId);
		const command: GetCommandInput = {
			TableName: this.tableName,
			Key: {
				pk: dbId,
				sk: version ? createDelimitedAttribute(PkType.PipelineVersion, version) : dbId,
			},
		};

		const response = await this.dc.send(new GetCommand(command));
		if (response.Item) {
			const pipeline = this.assemblePipeline(response.Item, verbose);
			this.log.debug(`PipelineRepository > get > exit pipeline:${pipeline}`);
			return pipeline;
		}

		return undefined;
	}

	public async getByIds(pipelineIds: string[]): Promise<Pipeline[] | undefined> {
		this.log.debug(`PipelineRepository > get > pipelineIds :${pipelineIds}`);

		if ((pipelineIds?.length ?? 0) === 0) {
			this.log.debug(`PipelineRepository> listByIds> early exit:[]`);
			return [];
		}

		const originalPipelineIds = [...pipelineIds];
		const pipelineIdsSet = new Set(pipelineIds);
		pipelineIds = Array.from(pipelineIdsSet);

		const command: BatchGetCommandInput = {
			RequestItems: {
				[this.tableName]: {
					Keys: pipelineIds.map((id) => ({
						pk: createDelimitedAttribute(PkType.Pipeline, id),
						sk: createDelimitedAttribute(PkType.Pipeline, id),
					})),
				},
			},
		};

		this.log.debug(`PipelineRepository> listByIds> command:${JSON.stringify(command)}`);
		const items = await this.dynamoDbUtils.batchGetAll(command);
		this.log.debug(`PipelineRepository> listByIds> items:${JSON.stringify(items)}`);

		if (items?.Responses?.[this.tableName]) {
			const pipelinesDict = this.assemblePipelineList(items.Responses[this.tableName] as Record<string, any>[], false).reduce((prev, curr) => {
				prev[curr.id] = curr;
				return prev;
			}, {});
			const pipelines = originalPipelineIds.map((id) => pipelinesDict[id]);
			this.log.debug(`PipelineRepository > get > exit pipelines:${pipelines}`);
			return pipelines;
		}
		return undefined;
	}

	public async listVersions(pipelineId: string, count?: number, exclusiveStart?: PipelineVersionPaginationKey, versionAsAt?: string): Promise<[Pipeline[], PipelineVersionPaginationKey | undefined]> {
		this.log.debug(`PipelineRepository > listPVersions > pipelineId: ${pipelineId}, count:${count}, exclusiveStart: ${exclusiveStart}`);

		let exclusiveStartKey;
		if (exclusiveStart?.version) {
			exclusiveStartKey = {
				pk: createDelimitedAttribute(PkType.Pipeline, pipelineId),
				sk: createDelimitedAttribute(PkType.PipelineVersion, exclusiveStart.version),
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
				':hash': createDelimitedAttribute(PkType.Pipeline, pipelineId),
				':sortKey': createDelimitedAttributePrefix(PkType.PipelineVersion),
			},
			Limit: count as number,
			ExclusiveStartKey: exclusiveStartKey,
			ScanIndexForward: false,
		};

		if (versionAsAt) {
			params.KeyConditionExpression = `#hash=:hash AND #sortKey<=:sortKey`;
			params.ExpressionAttributeValues[':sortKey'] = createDelimitedAttribute(PkType.PipelineActivationTime, dayjs(versionAsAt).unix());
			params.Limit = 1;
		}

		this.log.debug(`PipelineRepository> listVersions> params:${JSON.stringify(params)}`);
		const items = await this.dc.send(new QueryCommand(params));
		this.log.debug(`PipelineRepository> listVersions> items:${JSON.stringify(items)}`);
		if ((items.Items?.length ?? 0) === 0) {
			return [[], undefined];
		}

		let paginationKey: PipelineVersionPaginationKey;
		if (!versionAsAt && items.LastEvaluatedKey) {
			const lastEvaluatedVersion = Number(expandDelimitedAttribute(items.LastEvaluatedKey['sk'])[1]);
			paginationKey = {
				version: lastEvaluatedVersion,
			};
		}

		const pipelines: Pipeline[] = [];
		for (const i of items.Items) {
			pipelines.push(this.assemblePipeline(i));
		}

		this.log.debug(`PipelineRepository> listVersions> exit:${JSON.stringify([pipelines, paginationKey])}`);
		return [pipelines, paginationKey];
	}

	private getPutResourceTransactionWriteCommandInput(p: Pipeline): TransactWriteCommandInput {
		const pipelineDbId = createDelimitedAttribute(PkType.Pipeline, p.id);
		const pipelineVersionDbId = createDelimitedAttribute(PkType.PipelineVersion, p.version);
		const pipelineActivationTimeStamp = createDelimitedAttribute(PkType.PipelineActivationTime, dayjs(p.activeAt ?? p.updatedAt ?? p.activeAt).unix());

		const transaction: TransactWriteCommandInput = {
			TransactItems: [
				{
					// The Pipeline item (current version)
					Put: {
						TableName: this.tableName,
						Item: {
							pk: pipelineDbId,
							sk: pipelineDbId,
							...p,
						},
					},
				},
			],
		};

		// The Pipeline item (versioned by id)
		const versionedStatement = clone(transaction.TransactItems[0]);
		versionedStatement.Put.Item['sk'] = pipelineVersionDbId;
		transaction.TransactItems.push(versionedStatement);
		// The Pipeline item (versioned by activation time)
		const activationStatement = clone(transaction.TransactItems[0]);
		activationStatement.Put.Item['sk'] = pipelineActivationTimeStamp;
		transaction.TransactItems.push(activationStatement);

		return transaction;
	}

	public async create(c: Pipeline): Promise<void> {
		this.log.debug(`PipelineRepository> create> c:${JSON.stringify(c)}`);

		// keys
		const groupId = c.groups[0] as string;

		// create Pipeline latest version and versioned items
		const transaction = this.getPutResourceTransactionWriteCommandInput(c);

		// create tag items
		transaction.TransactItems.push(...this.tagRepository.getTagTransactWriteCommandInput(c.id, PkType.Pipeline, c.groups, c.tags, {}).TransactItems);

		// group membership
		transaction.TransactItems.push(
			...this.groupRepository.getGrantGroupTransactWriteCommandInput(
				{
					id: c.id,
					keyPrefix: PkType.Pipeline,
					alternateId: c.name,
				},
				{ id: groupId }
			).TransactItems
		);

		try {
			this.log.debug(`PipelineRepository> create> params:${JSON.stringify(transaction)}`);
			const response = await this.dc.send(new TransactWriteCommand(transaction));
			this.log.debug(`PipelineRepository> create> response:${JSON.stringify(response)}`);
		} catch (err) {
			if (err instanceof Error) {
				if (err.name === 'TransactionCanceledException') {
					this.log.error(`PipelineRepository> create> err> ${JSON.stringify((err as TransactionCanceledException).CancellationReasons)}`);
					throw new DatabaseTransactionError((err as TransactionCanceledException).CancellationReasons as TransactionCancellationReason[]);
				} else {
					this.log.error(err);
					throw err;
				}
			}
		}

		this.log.debug(`PipelineRepository> create> exit>`);
	}

	private assemblePipelineList(items: Record<string, any>[], excludeCurrent: boolean = true): Pipeline[] {
		const pipelines = [];
		for (const item of items) {
			if (!excludeCurrent || (excludeCurrent && !item['sk'].includes('LATEST'))) {
				pipelines.push(this.assemblePipeline(item));
			}
		}
		return pipelines;
	}

	private assemblePipeline(i: Record<string, any>, verbose = false): Pipeline {
		const pk = expandDelimitedAttribute(i['pk']);
		const pipeline: Pipeline = {
			attributes: i['attributes'],
			createdAt: i['createdAt'],
			createdBy: i['createdBy'],
			connectorConfig: i['connectorConfig'],
			description: i['description'],
			groups: i['groups'],
			id: pk?.[1] as string,
			name: i['name'],
			processorOptions: i['processorOptions'],
			transformer: i['transformer'],
			state: i['state'],
			tags: i['tags'],
			updatedAt: i['updatedAt'],
			activeAt: i['activeAt'],
			updatedBy: i['updatedBy'],
			version: i['version'],
			_aggregatedOutputKeyAndTypeMap: i['_aggregatedOutputKeyAndTypeMap'],
		};

		// we will do a check if it's not verbose, then remove system specific properties
		// can enhance this in the future to have specific way to assemble the resource if the verbose flag is passed in or not
		if (!verbose) {
			pipeline.transformer.transforms.forEach((transform) => {
				transform.outputs.forEach((output) => {
					delete output._keyMapping;
				});
			});
			delete pipeline._aggregatedOutputKeyAndTypeMap;
		}

		return pipeline;
	}
}

export interface PipelineListPaginationKey {
	paginationToken: string;
}

export interface PipelineVersionPaginationKey {
	version: number;
}

export interface DynamoDbPaginationKey {
	[key: string]: string;
}

export interface PipelineListOptions {
	count?: number;
	exclusiveStart?: PipelineListPaginationKey;
	versionAsAt?: string;
	name?: string;
	tags?: Tags;
	includeChildGroups?: boolean;
	includeParentGroups?: boolean;
}
