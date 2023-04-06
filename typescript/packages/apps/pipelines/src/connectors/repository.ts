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
import type { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommandInput, QueryCommandInput, TransactWriteCommandInput, BatchGetCommandInput, GetCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { createDelimitedAttribute, DynamoDbUtils, expandDelimitedAttribute } from '@sif/dynamodb-utils';

import { TagRepository, GroupRepository, DatabaseTransactionError, TransactionCancellationReason, Tags } from '@sif/resource-api-base';
import type { Connector } from './schemas.js';
import { PkType } from '../utils/pkUtils.utils.js';
import { validateNotEmpty } from '@sif/validators';

export class ConnectorRepository {
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

	public async create(connector: Connector): Promise<void> {
		this.log.debug(`ConnectorRepository> create> connector:${JSON.stringify(connector)}`);

		validateNotEmpty(connector, 'connector');

		// keys
		const groupId = connector.groups[0] as string;

		// create Connector latest
		const transaction = this.getPutResourceTransactionWriteCommandInput(connector);

		// create tag items
		transaction.TransactItems.push(...this.tagRepository.getTagTransactWriteCommandInput(connector.id, PkType.Connector, connector.groups, connector.tags, {}).TransactItems);

		// group membership
		transaction.TransactItems.push(
			...this.groupRepository.getGrantGroupTransactWriteCommandInput(
				{
					id: connector.id,
					keyPrefix: PkType.Connector,
					alternateId: connector.name,
				},
				{ id: groupId }
			).TransactItems
		);

		try {
			this.log.debug(`ConnectorRepository> create> params:${JSON.stringify(transaction)}`);
			const response = await this.dc.send(new TransactWriteCommand(transaction));
			this.log.debug(`ConnectorRepository> create> response:${JSON.stringify(response)}`);
		} catch (err) {
			if (err instanceof Error) {
				if (err.name === 'TransactionCanceledException') {
					this.log.error(`ConnectorRepository> create> err> ${JSON.stringify((err as TransactionCanceledException).CancellationReasons)}`);
					throw new DatabaseTransactionError((err as TransactionCanceledException).CancellationReasons as TransactionCancellationReason[]);
				} else {
					this.log.error(err);
					throw err;
				}
			}
		}

		this.log.debug(`ConnectorRepository> create> exit>`);
	}

	public async delete(id: string): Promise<void> {
		this.log.debug(`ConnectorRepository> delete> id:${id}`);

		validateNotEmpty(id, 'connectorId');

		// keys
		const dbId = createDelimitedAttribute(PkType.Connector, id);

		// list all items directly relating to the Connector
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
			this.log.debug(`ConnectorRepository> delete> params1:${JSON.stringify(params1)}`);
			params1.ExclusiveStartKey = exclusiveStartKey;
			const data = await this.dc.send(new QueryCommand(params1));
			this.log.debug(`ConnectorRepository> delete> data:${JSON.stringify(data)}`);
			if (data.Count > 0) {
				dbIds.push(...data.Items.map((i) => ({ pk: i['pk'], sk: i['sk'] })));
			}
			exclusiveStartKey = data.LastEvaluatedKey;
		} while (exclusiveStartKey !== undefined);
		this.log.debug(`ConnectorRepository> delete> dbIds:${JSON.stringify(dbIds)}`);

		// delete all the Connector related items
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
			this.log.debug(`ConnectorRepository> delete> transaction:${JSON.stringify(transaction)}`);
			const response = await this.dc.send(new TransactWriteCommand(transaction));
			this.log.debug(`ConnectorRepository> delete> response:${JSON.stringify(response)}`);
		} catch (err) {
			if (err instanceof Error) {
				if (err.name === 'TransactionCanceledException') {
					this.log.error(`ConnectorRepository> delete> err> ${JSON.stringify((err as TransactionCanceledException).CancellationReasons)}`);
					throw new DatabaseTransactionError((err as TransactionCanceledException).CancellationReasons as TransactionCancellationReason[]);
				} else {
					this.log.error(err);
					throw err;
				}
			}
		}

		this.log.debug(`ConnectorRepository> delete> exit>`);

	}

	public async get(id: string): Promise<Connector> {
		this.log.info(`ConnectorRepository > get > connectorId:${id}`);

		validateNotEmpty(id, 'connectorId');

		const dbId = createDelimitedAttribute(PkType.Connector, id);
		const command: GetCommandInput = {
			TableName: this.tableName,
			Key: {
				pk: dbId,
				sk: dbId,
			},
		};

		const response = await this.dc.send(new GetCommand(command));
		if (response.Item) {
			const connector = this.assembleConnector(response.Item);
			this.log.debug(`ConnectorRepository > get > exit connector:${connector}`);
			return connector;
		}

		return undefined;
	}

	public async getByIds(connectorIds: string[]): Promise<Connector[] | undefined> {
		this.log.debug(`ConnectorRepository > get > connectorIds :${connectorIds}`);

		validateNotEmpty(connectorIds, 'connectorIds');

		if ((connectorIds?.length ?? 0) === 0) {
			this.log.debug(`ConnectorRepository> getByIds> early exit:[]`);
			return [];
		}

		const ids = [...connectorIds];
		const idsSet = new Set(ids);
		connectorIds = Array.from(idsSet);

		const command: BatchGetCommandInput = {
			RequestItems: {
				[this.tableName]: {
					Keys: connectorIds.map((id) => ({
						pk: createDelimitedAttribute(PkType.Connector, id),
						sk: createDelimitedAttribute(PkType.Connector, id),
					})),
				},
			},
		};

		this.log.debug(`ConnectorRepository> getByIds> command:${JSON.stringify(command)}`);
		const items = await this.dynamoDbUtils.batchGetAll(command);
		this.log.debug(`ConnectorRepository> getByIds> items:${JSON.stringify(items)}`);

		if (items?.Responses?.[this.tableName]) {
			const connectorDict = this.assembleConnectorList(items.Responses[this.tableName] as Record<string, any>[], false).reduce((prev, curr) => {
				prev[curr.id] = curr;
				return prev;
			}, {});
			const connectors = ids.map((id) => connectorDict[id]);
			this.log.debug(`ConnectorRepository > get > exit> connectors:${connectors}`);
			return connectors;
		}

		return undefined;

	}

	public async update(connector: Connector, tagsToAdd: Tags, tagsToDelete: Tags): Promise<void> {
		this.log.debug(`ConnectorRepository> update> connector:${JSON.stringify(connector)}, tagsToAdd:${JSON.stringify(tagsToAdd)}, tagsToDelete:${JSON.stringify(tagsToDelete)}`);

		validateNotEmpty(connector, 'connector');

		// create Connector latest
		const transaction = this.getPutResourceTransactionWriteCommandInput(connector);

		transaction.TransactItems.push(...this.tagRepository.getTagTransactWriteCommandInput(connector.id, PkType.Connector, connector.groups, tagsToAdd, tagsToDelete).TransactItems);

		try {
			this.log.debug(`ConnectorRepository> update> transaction:${JSON.stringify(transaction)}`);
			const response = await this.dc.send(new TransactWriteCommand(transaction));
			this.log.debug(`ConnectorRepository> update> response:${JSON.stringify(response)}`);
		} catch (err) {
			if (err instanceof Error) {
				if (err.name === 'TransactionCanceledException') {
					this.log.error(`ConnectorRepository> update> err> ${JSON.stringify((err as TransactionCanceledException).CancellationReasons)}`);
					throw new DatabaseTransactionError((err as TransactionCanceledException).CancellationReasons as TransactionCancellationReason[]);
				} else {
					this.log.error(err);
					throw err;
				}
			}
		}

		this.log.debug(`ConnectorRepository> update> exit>`);

	}

	private assembleConnector(i: Record<string, any>): Connector {
		const pk = expandDelimitedAttribute(i['pk']);
		const connector: Connector = {
			createdAt: i['createdAt'],
			createdBy: i['createdBy'],
			description: i['description'],
			groups: i['groups'],
			id: pk?.[1] as string,
			isManaged: i['isManaged'],
			name: i['name'],
			parameters: i['parameters'],
			requiresFileUpload: i['requiresFileUpload'],
			type: i['type'],
			updatedAt: i['updatedAt'],
			updatedBy: i['updatedBy'],
			tags: i['tags'],
		};

		return connector;
	}

	private assembleConnectorList(items: Record<string, any>[], excludeCurrent: boolean = true): Connector[] {
		const connectors = [];
		for (const item of items) {
			if (!excludeCurrent || (excludeCurrent && !item['sk'].includes('LATEST'))) {
				connectors.push(this.assembleConnector(item));
			}
		}
		return connectors;
	}

	private getPutResourceTransactionWriteCommandInput(p: Connector): TransactWriteCommandInput {
		const connectorDbId = createDelimitedAttribute(PkType.Connector, p.id);

		const transaction: TransactWriteCommandInput = {
			TransactItems: [
				{
					Put: {
						TableName: this.tableName,
						Item: {
							pk: connectorDbId,
							sk: connectorDbId,
							...p,
						},
					},
				},
			],
		};
		return transaction;
	}
}

export interface ConnectorListPaginationKey {
	paginationToken: string;
}

export interface ConnectorListOptions {
	count?: number;
	exclusiveStart?: ConnectorListPaginationKey;
	name?: string;
	tags?: Tags;
	includeChildGroups?: boolean;
	includeParentGroups?: boolean;
}
