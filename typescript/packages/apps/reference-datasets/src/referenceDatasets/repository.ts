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
import { DatabaseTransactionError } from '@sif/resource-api-base';
import { PkType } from '../utils/pkTypes.utils.js';
import type { FastifyBaseLogger } from 'fastify';
import type { ReferenceDataset, ReferenceDatasetWithS3, ReferenceDatasetUpdateMetadata } from './schemas.js';
import type { Tags, GroupRepository, TagRepository } from '@sif/resource-api-base';
import type { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import type { TransactionCancellationReason } from '@sif/resource-api-base';
import dayjs from 'dayjs';

export class ReferenceDatasetRepository {
	private readonly log: FastifyBaseLogger;
	private readonly dc: DynamoDBDocumentClient;
	private readonly tableName: string;
	private readonly dynamoDbUtils: DynamoDbUtils;
	private readonly tagRepository: TagRepository;
	private readonly groupRepository: GroupRepository;

	public constructor(log: FastifyBaseLogger, dc: DynamoDBDocumentClient, tableName: string, tagRepository: TagRepository, groupRepository: GroupRepository, dynamoDbUtils: DynamoDbUtils) {
		this.log = log;
		this.dc = dc;
		this.tableName = tableName;
		this.tagRepository = tagRepository;
		this.groupRepository = groupRepository;
		this.dynamoDbUtils = dynamoDbUtils;
	}

	public async updatePartial(id: string, request: ReferenceDatasetUpdateMetadata): Promise<void> {
		this.log.info(`ReferenceDatasetRepository> updatePartial> request:${JSON.stringify(request)}`);

		const { state, status, statusMessage, indexS3Location, s3Location } = request;

		const r = await this.get(id);

		if (status) {
			r.status = status;
		}

		if (state) {
			r.state = state;
		}

		if (statusMessage) {
			r.statusMessage = statusMessage;
		}

		if (indexS3Location) {
			r.indexS3Location = indexS3Location;
		}

		if (s3Location) {
			r.s3Location = s3Location;
		}

		const transaction = this.getPutResourceTransactionWriteCommandInput(r);

		try {
			this.log.debug(`ReferenceDatasetRepository> updateReferenceDatasetState> transaction:${JSON.stringify(transaction)}`);
			const response = await this.dc.send(new TransactWriteCommand(transaction));
			this.log.debug(`ReferenceDatasetRepository> updateReferenceDatasetState> response:${JSON.stringify(response)}`);
		} catch (err) {
			if (err instanceof Error) {
				if (err.name === 'TransactionCanceledException') {
					this.log.error(`ReferenceDatasetRepository> updateReferenceDatasetState> err> ${JSON.stringify((err as TransactionCanceledException).CancellationReasons)}`);
					throw new DatabaseTransactionError((err as TransactionCanceledException).CancellationReasons as TransactionCancellationReason[]);
				} else {
					this.log.error(err);
					throw err;
				}
			}
		}
		this.log.info(`ReferenceDatasetRepository> updateReferenceDatasetState> exit`);
	}

	public async delete(id: string): Promise<void> {
		this.log.debug(`ReferenceDatasetRepository> delete> id:${id}`);

		// keys
		const resourceDbId = createDelimitedAttribute(PkType.ReferenceDataset, id);

		// list all items directly relating to the calculation
		const params1: QueryCommandInput = {
			TableName: this.tableName,
			KeyConditionExpression: `#hash=:hash`,
			ExpressionAttributeNames: {
				'#hash': 'pk',
			},
			ExpressionAttributeValues: {
				':hash': resourceDbId,
			},
		};

		const dbIds: { pk: string; sk: string }[] = [];
		let exclusiveStartKey: Record<string, any>;
		do {
			this.log.debug(`ReferenceDatasetRepository> delete> params1:${JSON.stringify(params1)}`);
			params1.ExclusiveStartKey = exclusiveStartKey;
			const data = await this.dc.send(new QueryCommand(params1));
			this.log.debug(`ReferenceDatasetRepository> delete> data:${JSON.stringify(data)}`);
			if (data.Count > 0) {
				dbIds.push(...data.Items.map((i) => ({ pk: i['pk'], sk: i['sk'] })));
			}
			exclusiveStartKey = data.LastEvaluatedKey;
		} while (exclusiveStartKey !== undefined);

		this.log.debug(`ReferenceDatasetRepository> delete> dbIds:${JSON.stringify(dbIds)}`);

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
			this.log.debug(`ReferenceDatasetRepository> delete> transaction:${JSON.stringify(transaction)}`);
			const response = await this.dc.send(new TransactWriteCommand(transaction));
			this.log.debug(`ReferenceDatasetRepository> delete> response:${JSON.stringify(response)}`);
		} catch (err) {
			if (err instanceof Error) {
				if (err.name === 'TransactionCanceledException') {
					this.log.error(`ReferenceDatasetRepository> delete> err> ${JSON.stringify((err as TransactionCanceledException).CancellationReasons)}`);
					throw new DatabaseTransactionError((err as TransactionCanceledException).CancellationReasons as TransactionCancellationReason[]);
				} else {
					this.log.error(err);
					throw err;
				}
			}
		}

		this.log.debug(`ReferenceDatasetRepository> delete> exit>`);
	}

	private getPutResourceTransactionWriteCommandInput(r: ReferenceDataset): TransactWriteCommandInput {
		const referenceDatasetDbId = createDelimitedAttribute(PkType.ReferenceDataset, r.id);
		const referenceDatasetVersionDbId = createDelimitedAttribute(PkType.ReferenceDatasetVersion, r.version);
		const referenceDatasetActivationTimestamp = createDelimitedAttribute(PkType.ReferenceDatasetActivationTime, dayjs(r.activeAt ?? r.updatedAt ?? r.createdAt).unix());

		const transaction: TransactWriteCommandInput = {
			TransactItems: [
				{
					Put: {
						TableName: this.tableName,
						Item: {
							pk: referenceDatasetDbId,
							sk: referenceDatasetDbId,
							...r,
						},
					},
				},
			],
		};

		// The calculation item (versioned by id)
		const versionedStatement = clone(transaction.TransactItems[0]);
		versionedStatement.Put.Item['sk'] = referenceDatasetVersionDbId;
		transaction.TransactItems.push(versionedStatement);
		// The calculation item (versioned by activation time)
		const activationStatement = clone(transaction.TransactItems[0]);
		activationStatement.Put.Item['sk'] = referenceDatasetActivationTimestamp;
		transaction.TransactItems.push(activationStatement);
		return transaction;
	}

	public async update(r: ReferenceDataset, tagsToAdd: Tags, tagsToDelete: Tags): Promise<void> {
		this.log.debug(`ReferenceDatasetRepository> update> c:${JSON.stringify(r)}, tagsToAdd:${JSON.stringify(tagsToAdd)}, tagsToDelete:${JSON.stringify(tagsToDelete)}`);

		// create calculation latest version and versioned items
		const transaction = this.getPutResourceTransactionWriteCommandInput(r);

		// add/delete tag items
		transaction.TransactItems.push(...this.tagRepository.getTagTransactWriteCommandInput(r.id, PkType.ReferenceDataset, r.groups, tagsToAdd, tagsToDelete).TransactItems);

		try {
			this.log.debug(`ReferenceDatasetRepository> update> transaction:${JSON.stringify(transaction)}`);
			const response = await this.dc.send(new TransactWriteCommand(transaction));
			this.log.debug(`ReferenceDatasetRepository> update> response:${JSON.stringify(response)}`);
		} catch (err) {
			if (err instanceof Error) {
				if (err.name === 'TransactionCanceledException') {
					this.log.error(`ReferenceDatasetRepository> update> err> ${JSON.stringify((err as TransactionCanceledException).CancellationReasons)}`);
					throw new DatabaseTransactionError((err as TransactionCanceledException).CancellationReasons as TransactionCancellationReason[]);
				} else {
					this.log.error(err);
					throw err;
				}
			}
		}

		this.log.debug(`ReferenceDatasetRepository> update> exit>`);
	}

	public async put(r: ReferenceDatasetWithS3): Promise<void> {
		this.log.info(`ReferenceDatasetRepository> put> referenceDataset:${JSON.stringify(r)}`);

		// keys
		const groupId = r.groups[0] as string;

		// create latest reference dataset version and versioned items
		const transaction = this.getPutResourceTransactionWriteCommandInput(r);

		// create tag items
		transaction.TransactItems.push(...this.tagRepository.getTagTransactWriteCommandInput(r.id, PkType.ReferenceDataset, r.groups, r.tags, {}).TransactItems);

		// group membership
		transaction.TransactItems.push(
			...this.groupRepository.getGrantGroupTransactWriteCommandInput(
				{
					id: r.id,
					keyPrefix: PkType.ReferenceDataset,
					alternateId: r.name,
				},
				{ id: groupId }
			).TransactItems
		);

		try {
			this.log.debug(`ReferenceDatasetRepository> create> params:${JSON.stringify(transaction)}`);
			const response = await this.dc.send(new TransactWriteCommand(transaction));
			this.log.debug(`ReferenceDatasetRepository> create> response:${JSON.stringify(response)}`);
		} catch (err) {
			if (err instanceof Error) {
				if (err.name === 'TransactionCanceledException') {
					this.log.error(`ReferenceDatasetRepository> create> err> ${JSON.stringify((err as TransactionCanceledException).CancellationReasons)}`);
					throw new DatabaseTransactionError((err as TransactionCanceledException).CancellationReasons as TransactionCancellationReason[]);
				} else {
					this.log.error(err);
					throw err;
				}
			}
		}
	}

	private assemble(i: DocumentDbClientItem): ReferenceDatasetWithS3 {
		const pk = expandDelimitedAttribute(i['pk']);
		return {
			id: pk[1] as string,
			version: i['version'],
			name: i['name'],
			groups: i['groups'],
			description: i['description'],
			createdAt: i['createdAt'],
			createdBy: i['createdBy'],
			updatedAt: i['updatedAt'],
			updatedBy: i['updatedBy'],
			activeAt: i['activeAt'],
			tags: i['tags'],
			state: i['state'],
			status: i['status'],
			statusMessage: i['statusMessage'],
			s3Location: i['s3Location'],
			indexS3Location: i['indexS3Location'],
			datasetHeaders: i['datasetHeaders'],
		};
	}

	public async get(id: string, version?: number): Promise<ReferenceDatasetWithS3> {
		this.log.debug(`ReferenceDatasetRepository> get> id:${JSON.stringify(id)}, version:${version}`);

		const dbId = createDelimitedAttribute(PkType.ReferenceDataset, id);
		const params: GetCommandInput = {
			TableName: this.tableName,
			Key: {
				pk: dbId,
				sk: version ? createDelimitedAttribute(PkType.ReferenceDatasetVersion, version) : dbId,
			},
		};

		const response = await this.dc.send(new GetCommand(params));
		if (response.Item === undefined) {
			this.log.debug(`ReferenceDatasetRepository> get> early exit:`);
			return undefined;
		}

		const referenceDataset = this.assemble(response.Item);

		this.log.debug(`ReferenceDatasetRepository> get> exit:${JSON.stringify(referenceDataset)}`);
		return referenceDataset;
	}

	public async listByIds(referenceDatasetIds: string[]): Promise<ReferenceDatasetWithS3[] | undefined> {
		this.log.debug(`ReferenceDatasetRepository > get > listReferenceDatasetByIds :${referenceDatasetIds}`);

		if ((referenceDatasetIds?.length ?? 0) === 0) {
			this.log.debug(`ReferenceDatasetRepository> listByIds> early exit:[]`);
			return [];
		}

		const originalReferenceDatasetIds = [...referenceDatasetIds];
		const referenceDatasetIdsSet = new Set(referenceDatasetIds);
		referenceDatasetIds = Array.from(referenceDatasetIdsSet);

		const params: BatchGetCommandInput = {
			RequestItems: {
				[this.tableName]: {
					Keys: referenceDatasetIds.map((id) => ({
						pk: createDelimitedAttribute(PkType.ReferenceDataset, id),
						sk: createDelimitedAttribute(PkType.ReferenceDataset, id),
					})),
				},
			},
		};

		this.log.debug(`ReferenceDatasetRepository> listByIds> params:${JSON.stringify(params)}`);
		const items = await this.dynamoDbUtils.batchGetAll(params);
		this.log.debug(`ReferenceDatasetRepository> listByIds> items:${JSON.stringify(items)}`);

		if (items?.Responses?.[this.tableName] === undefined) {
			this.log.debug('ReferenceDatasetRepository> listByIds> exit: commands:undefined');
			return [];
		}

		const referenceDatasetsDict = items.Responses[this.tableName]
			.sort((a, b) => (a['pk'] as string).localeCompare(b['pk']) || (a['sk'] as string).localeCompare(b['sk']))
			.map((i) => this.assemble(i))
			.reduce((prev, curr) => {
				prev[curr.id] = curr;
				return prev;
			}, {});

		const referenceDatasets = originalReferenceDatasetIds.map((id) => referenceDatasetsDict[id]);

		this.log.debug(`ReferenceDatasetRepository> listByIds> exit:${JSON.stringify([referenceDatasets])}`);
		return referenceDatasets;
	}

	public async listVersions(referenceDatasetId: string, options: ReferenceDatasetListVersionsOptions): Promise<[ReferenceDataset[], ReferenceDatasetListVersionPaginationKey]> {
		this.log.info(`ReferenceDatasetRepository > listVersions > referenceDatasetId: ${referenceDatasetId}, options:${JSON.stringify(options)}`);

		let exclusiveStartKey;
		if (options?.exclusiveStart?.version) {
			exclusiveStartKey = {
				pk: createDelimitedAttribute(PkType.ReferenceDataset, referenceDatasetId),
				sk: createDelimitedAttribute(PkType.ReferenceDatasetVersion, options.exclusiveStart.version),
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
				':hash': createDelimitedAttribute(PkType.ReferenceDataset, referenceDatasetId),
				':sortKey': createDelimitedAttributePrefix(PkType.ReferenceDatasetVersion),
			},
			Limit: options.count as number,
			ExclusiveStartKey: exclusiveStartKey,
			ScanIndexForward: false,
		};

		if (options.versionAsAt) {
			params.KeyConditionExpression = `#hash=:hash AND #sortKey<=:sortKey`;
			params.ExpressionAttributeValues[':sortKey'] = createDelimitedAttribute(PkType.ReferenceDatasetActivationTime, dayjs(options.versionAsAt).unix());
			params.Limit = 1;
		}

		this.log.debug(`ReferenceDatasetRepository> listVersions> params:${JSON.stringify(params)}`);
		const items = await this.dc.send(new QueryCommand(params));
		this.log.debug(`ReferenceDatasetRepository> listVersions> items:${JSON.stringify(items)}`);
		if ((items.Items?.length ?? 0) === 0) {
			return [[], undefined];
		}

		let paginationKey: ReferenceDatasetListVersionPaginationKey;
		if (!options.versionAsAt && items.LastEvaluatedKey) {
			const lastEvaluatedVersion = Number(expandDelimitedAttribute(items.LastEvaluatedKey['sk'])[1]);
			paginationKey = {
				version: lastEvaluatedVersion,
			};
		}

		const resources: ReferenceDataset[] = [];
		for (const i of items.Items) {
			resources.push(this.assemble(i));
		}

		this.log.debug(`ReferenceDatasetRepository> list> exit:${JSON.stringify([resources, paginationKey])}`);
		return [resources, paginationKey];
	}
}

export interface ReferenceDatasetListPaginationKey {
	paginationToken: string;
}

export interface ReferenceDatasetListVersionsOptions {
	count?: number;
	exclusiveStart?: ReferenceDatasetListVersionPaginationKey;
	versionAsAt?: string;
}

export interface ReferenceDatasetListVersionPaginationKey {
	version: number;
}

export interface ReferenceDatasetListOptions {
	count?: number;
	exclusiveStart?: ReferenceDatasetListPaginationKey;
	name?: string;
	tags?: Tags;
	includeChildGroups?: boolean;
	includeParentGroups?: boolean;
}
