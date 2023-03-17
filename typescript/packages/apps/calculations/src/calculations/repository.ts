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

import clone from 'just-clone';
import { BatchGetCommandInput, DynamoDBDocumentClient, GetCommand, GetCommandInput, QueryCommand, QueryCommandInput, TransactWriteCommand, TransactWriteCommandInput } from '@aws-sdk/lib-dynamodb';
import { createDelimitedAttribute, createDelimitedAttributePrefix, DocumentDbClientItem, DynamoDbUtils, expandDelimitedAttribute } from '@sif/dynamodb-utils';
import { PkType } from '../common/pkTypes.js';
import type { FastifyBaseLogger } from 'fastify';
import type { Calculation } from './schemas.js';
import type { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { TagRepository, GroupRepository, Tags, DatabaseTransactionError, NotFoundError, TransactionCancellationReason } from '@sif/resource-api-base';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';

dayjs.extend(utc);

export class CalculationRepository {
	private readonly log: FastifyBaseLogger;
	private readonly dc: DynamoDBDocumentClient;
	private readonly tableName: string;
	private readonly dynamoDbUtils: DynamoDbUtils;
	private readonly tagRepository: TagRepository;
	private readonly groupRepository: GroupRepository;

	public constructor(log: FastifyBaseLogger, dc: DynamoDBDocumentClient, tableName: string, dynamoDbUtils: DynamoDbUtils, tagRepository: TagRepository, groupRepository: GroupRepository) {
		this.log = log;
		this.dc = dc;
		this.tableName = tableName;
		this.dynamoDbUtils = dynamoDbUtils;
		this.tagRepository = tagRepository;
		this.groupRepository = groupRepository;
	}

	public async create(c: Calculation): Promise<void> {
		this.log.debug(`CalculationRepository> create> c:${JSON.stringify(c)}`);

		// keys
		const groupId = c.groups[0] as string;

		// create calculation latest version and versioned items
		const transaction = this.getPutResourceTransactionWriteCommandInput(c);

		// create tag items
		transaction.TransactItems.push(...this.tagRepository.getTagTransactWriteCommandInput(c.id, PkType.Calculation, c.groups, c.tags, {}).TransactItems);

		// group membership
		transaction.TransactItems.push(
			...this.groupRepository.getGrantGroupTransactWriteCommandInput(
				{
					id: c.id,
					keyPrefix: PkType.Calculation,
					alternateId: c.name,
				},
				{ id: groupId }
			).TransactItems
		);

		try {
			this.log.debug(`CalculationRepository> create> params:${JSON.stringify(transaction)}`);
			const response = await this.dc.send(new TransactWriteCommand(transaction));
			this.log.debug(`CalculationRepository> create> response:${JSON.stringify(response)}`);
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

		this.log.debug(`CalculationRepository> create> exit>`);
	}

	public async update(c: Calculation, tagsToAdd: Tags, tagsToDelete: Tags): Promise<void> {
		this.log.debug(`CalculationRepository> update> c:${JSON.stringify(c)}, tagsToAdd:${JSON.stringify(tagsToAdd)}, tagsToDelete:${JSON.stringify(tagsToDelete)}`);

		// create calculation latest version and versioned items
		const transaction = this.getPutResourceTransactionWriteCommandInput(c);

		// add/delete tag items
		transaction.TransactItems.push(...this.tagRepository.getTagTransactWriteCommandInput(c.id, PkType.Calculation, c.groups, tagsToAdd, tagsToDelete).TransactItems);

		try {
			this.log.debug(`CalculationRepository> update> transaction:${JSON.stringify(transaction)}`);
			const response = await this.dc.send(new TransactWriteCommand(transaction));
			this.log.debug(`CalculationRepository> update> response:${JSON.stringify(response)}`);
		} catch (err) {
			if (err instanceof Error) {
				if (err.name === 'TransactionCanceledException') {
					this.log.error(`CalculationRepository> update> err> ${JSON.stringify((err as TransactionCanceledException).CancellationReasons)}`);
					throw new DatabaseTransactionError((err as TransactionCanceledException).CancellationReasons as TransactionCancellationReason[]);
				} else {
					this.log.error(err);
					throw err;
				}
			}
		}

		this.log.debug(`CalculationRepository> update> exit>`);
	}

	private getPutResourceTransactionWriteCommandInput(c: Calculation): TransactWriteCommandInput {
		const calculationDbId = createDelimitedAttribute(PkType.Calculation, c.id);
		const calculationVersionDbId = createDelimitedAttribute(PkType.CalculationVersion, c.version);
		const calculationActivationTimestamp = createDelimitedAttribute(PkType.CalculationActivationTime, dayjs(c.activeAt ?? c.updatedAt ?? c.createdAt).unix());

		const transaction: TransactWriteCommandInput = {
			TransactItems: [
				{
					// The calculation item (current version)
					Put: {
						TableName: this.tableName,
						Item: {
							pk: calculationDbId,
							sk: calculationDbId,
							...c,
						},
					},
				},
			],
		};

		// The calculation item (versioned by id)
		const versionedStatement = clone(transaction.TransactItems[0]);
		versionedStatement.Put.Item['sk'] = calculationVersionDbId;
		transaction.TransactItems.push(versionedStatement);
		// The calculation item (versioned by activation time)
		const activationStatement = clone(transaction.TransactItems[0]);
		activationStatement.Put.Item['sk'] = calculationActivationTimestamp;
		transaction.TransactItems.push(activationStatement);

		return transaction;
	}

	public async get(id: string, version?: string): Promise<Calculation | undefined> {
		this.log.debug(`CalculationRepository> get> id:${JSON.stringify(id)}, version:${version}`);

		const calculationDbId = createDelimitedAttribute(PkType.Calculation, id);
		const params: GetCommandInput = {
			TableName: this.tableName,
			Key: {
				pk: calculationDbId,
				sk: version ? createDelimitedAttribute(PkType.CalculationVersion, version) : calculationDbId,
			},
		};

		const response = await this.dc.send(new GetCommand(params));
		if (response.Item === undefined) {
			throw new NotFoundError(`Calculation '${id}' not found`);
		}

		const calculation = this.assemble(response.Item);

		this.log.debug(`CalculationRepository> get> exit:${JSON.stringify(calculation)}`);
		return calculation;
	}

	public async delete(id: string): Promise<void> {
		this.log.debug(`CalculationRepository> delete> id:${id}`);

		// keys
		const calculationDbId = createDelimitedAttribute(PkType.Calculation, id);

		// list all items directly relating to the calculation
		const params1: QueryCommandInput = {
			TableName: this.tableName,
			KeyConditionExpression: `#hash=:hash`,
			ExpressionAttributeNames: {
				'#hash': 'pk',
			},
			ExpressionAttributeValues: {
				':hash': calculationDbId,
			},
		};

		const dbIds: { pk: string; sk: string }[] = [];
		let exclusiveStartKey: Record<string, any>;
		do {
			this.log.debug(`CalculationRepository> delete> params1:${JSON.stringify(params1)}`);
			params1.ExclusiveStartKey = exclusiveStartKey;
			const data = await this.dc.send(new QueryCommand(params1));
			this.log.debug(`CalculationRepository> delete> data:${JSON.stringify(data)}`);
			if (data.Count > 0) {
				dbIds.push(...data.Items.map((i) => ({ pk: i['pk'], sk: i['sk'] })));
			}
			exclusiveStartKey = data.LastEvaluatedKey;
		} while (exclusiveStartKey !== undefined);
		this.log.debug(`CalculationRepository> delete> dbIds:${JSON.stringify(dbIds)}`);

		// delete all the calculation related items
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
			this.log.debug(`CalculationRepository> delete> transaction:${JSON.stringify(transaction)}`);
			const response = await this.dc.send(new TransactWriteCommand(transaction));
			this.log.debug(`CalculationRepository> delete> response:${JSON.stringify(response)}`);
		} catch (err) {
			if (err instanceof Error) {
				if (err.name === 'TransactionCanceledException') {
					this.log.error(`CalculationRepository> delete> err> ${JSON.stringify((err as TransactionCanceledException).CancellationReasons)}`);
					throw new DatabaseTransactionError((err as TransactionCanceledException).CancellationReasons as TransactionCancellationReason[]);
				} else {
					this.log.error(err);
					throw err;
				}
			}
		}

		this.log.debug(`CalculationRepository> delete> exit>`);
	}

	public async listVersions(calculationId: string, options: CalculationListVersionsOptions): Promise<[Calculation[], CalculationListVersionPaginationKey]> {
		this.log.debug(`CalculationRepository> listVersions> calculationId:${calculationId}, options:${JSON.stringify(options)}`);

		let exclusiveStartKey;
		if (options?.exclusiveStart?.version) {
			exclusiveStartKey = {
				pk: createDelimitedAttribute(PkType.Calculation, calculationId),
				sk: createDelimitedAttribute(PkType.CalculationVersion, options.exclusiveStart.version),
			};
		}

		const params: QueryCommandInput = {
			TableName: this.tableName,
			KeyConditionExpression: `#hash=:hash AND begins_with(#sortKey,:sortKey)`,
			ExpressionAttributeNames: {
				'#hash': 'pk',
				'#sortKey': 'sk',
			},
			ExpressionAttributeValues: {
				':hash': createDelimitedAttribute(PkType.Calculation, calculationId),
				':sortKey': createDelimitedAttributePrefix(PkType.CalculationVersion),

			},
			Limit: options.count as number,
			ExclusiveStartKey: exclusiveStartKey,
			ScanIndexForward: false,
		};

		if (options.versionAsAt) {
			params.KeyConditionExpression = `#hash=:hash AND #sortKey<=:sortKey`;
			params.ExpressionAttributeValues[':sortKey'] = createDelimitedAttribute(PkType.CalculationActivationTime, dayjs(options.versionAsAt).unix());
			params.Limit = 1;
		}


		this.log.debug(`CalculationRepository> listVersions> params:${JSON.stringify(params)}`);
		const items = await this.dc.send(new QueryCommand(params));
		this.log.debug(`CalculationRepository> listVersions> items:${JSON.stringify(items)}`);
		if ((items.Items?.length ?? 0) === 0) {
			return [[], undefined];
		}

		let paginationKey: CalculationListVersionPaginationKey;
		if (!options.versionAsAt && items.LastEvaluatedKey) {
			const lastEvaluatedVersion = Number(expandDelimitedAttribute(items.LastEvaluatedKey['sk'])[1]);
			paginationKey = {
				version: lastEvaluatedVersion,
			};
		}

		const calculations: Calculation[] = [];
		for (const i of items.Items) {
			calculations.push(this.assemble(i));
		}

		this.log.debug(`CalculationRepository> list> exit:${JSON.stringify([calculations, paginationKey])}`);
		return [calculations, paginationKey];
	}

	public async listByIds(calculationIds: string[]): Promise<Calculation[]> {
		this.log.debug(`CalculationRepository> listByIds> in> calculationIds:${JSON.stringify(calculationIds)}`);

		if ((calculationIds?.length ?? 0) === 0) {
			this.log.debug(`CalculationRepository> listByIds> early exit:[]`);
			return [];
		}

		const originalCalculationIds = [...calculationIds];
		const calculationIdsSet = new Set(calculationIds);
		calculationIds = Array.from(calculationIdsSet);

		// retrieve the calculation items
		const params: BatchGetCommandInput = {
			RequestItems: {},
		};
		params.RequestItems[this.tableName] = {
			Keys: calculationIds.map((i) => ({
				pk: createDelimitedAttribute(PkType.Calculation, i),
				sk: createDelimitedAttribute(PkType.Calculation, i),
			})),
		};

		this.log.debug(`CalculationRepository> listByIds> params:${JSON.stringify(params)}`);
		const items = await this.dynamoDbUtils.batchGetAll(params);
		this.log.debug(`CalculationRepository> listByIds> items:${JSON.stringify(items)}`);

		if (items?.Responses?.[this.tableName] === undefined) {
			this.log.debug('CalculationRepository> listByIds> exit: commands:undefined');
			return [];
		}

		const calculationDict = items.Responses[this.tableName]
			.sort((a, b) => (a['pk'] as string).localeCompare(b['pk']) || (a['sk'] as string).localeCompare(b['sk']))
			.map((i) => this.assemble(i))
			.reduce((prev, curr) => {
				prev[curr.id] = curr;
				return prev;
			}, {});

		const calculations = originalCalculationIds.map((id) => calculationDict[id]);

		this.log.debug(`CalculationRepository> listByIds> exit:${JSON.stringify([calculations])}`);
		return calculations;
	}

	private assemble(i: DocumentDbClientItem): Calculation {
		this.log.debug(`CalculationRepository> assemble> in> i:${JSON.stringify(i)}`);
		if (i === undefined) {
			return undefined;
		}

		const calculation: Calculation = {
			id: i['id'],
			name: i['name'],
			summary: i['summary'],
			description: i['description'],
			formula: i['formula'],
			parameters: i['parameters'],
			outputs: i['outputs'],
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

		this.log.debug(`CalculationRepository> assemble> exit:${JSON.stringify(calculation)}`);
		return calculation;
	}
}

export interface CalculationListOptions {
	count?: number;
	exclusiveStart?: CalculationListPaginationKey;
	name?: string;
	tags?: Tags;
	includeChildGroups?: boolean;
	includeParentGroups?: boolean;
}

export interface CalculationListPaginationKey {
	paginationToken: string;
}

export interface CalculationListVersionsOptions {
	count?: number;
	exclusiveStart?: CalculationListVersionPaginationKey;
	versionAsAt?: string;
}

export interface CalculationListVersionPaginationKey {
	version: number;
}
