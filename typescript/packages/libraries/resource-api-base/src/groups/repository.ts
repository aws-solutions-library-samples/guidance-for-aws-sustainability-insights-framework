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

import type { BaseLogger } from 'pino';
import { DynamoDBDocumentClient, GetCommand, GetCommandInput, TransactWriteCommand, TransactWriteCommandInput } from '@aws-sdk/lib-dynamodb';
import { CommonPkType } from '../common/pkTypes.js';
import { createDelimitedAttribute } from '@sif/dynamodb-utils';
import type { Resource } from '../resources/models.js';
import type { Group } from './models.js';
import type { Tags } from '../tags/schemas.js';
import type { TagRepository } from '../tags/repository.js';
import type { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { DatabaseTransactionError, TransactionCancellationReason } from '../common/errors.js';
import type { Utils } from '../common/utils';

export class GroupRepository {
	private readonly log: BaseLogger;
	private readonly dc: DynamoDBDocumentClient;
	private readonly tableName: string;
	private readonly tagRepo: TagRepository;
	private readonly utils: Utils;

	public constructor(log: BaseLogger, dc: DynamoDBDocumentClient, tableName: string, tagRepo: TagRepository, utils: Utils) {
		this.utils = utils;
		this.log = log;
		this.dc = dc;
		this.tableName = tableName;
		this.tagRepo = tagRepo;
	}

	public async grant(resource: Resource, group: Group, tags: Tags): Promise<void> {
		this.log.debug(`GroupRepository> grant> in> resource:${JSON.stringify(resource)}, group:${JSON.stringify(group)}, tags:${JSON.stringify(tags)}`);

		const transaction = this.getGrantGroupTransactWriteCommandInput(resource, group);

		try {
			this.log.debug(`GroupRepository> grant> transaction:${JSON.stringify(transaction)}`);
			const response = await this.dc.send(new TransactWriteCommand(transaction));
			this.log.debug(`GroupRepository> grant> response:${JSON.stringify(response)}`);
		} catch (err) {
			if (err instanceof Error) {
				if (err.name === 'TransactionCanceledException') {
					this.log.error(`GroupRepository> grant> err> ${JSON.stringify((err as TransactionCanceledException).CancellationReasons)}`);
					throw new DatabaseTransactionError((err as TransactionCanceledException).CancellationReasons as TransactionCancellationReason[]);
				} else {
					this.log.error(err);
					throw err;
				}
			}
		}

		await this.tagRepo.updateGroupSummaries(group.id, resource.keyPrefix, tags, {});

		this.log.debug(`GroupRepository> grant> exit:`);
	}

	public getGrantGroupTransactWriteCommandInput(resource: Resource, group: Group): TransactWriteCommandInput {
		this.log.debug(`GroupRepository> getGrantGroupTransactWriteCommandInput> in> resource:${JSON.stringify(resource)}, group:${JSON.stringify(group)}`);

		const resourceDbId = createDelimitedAttribute(resource.keyPrefix, resource.id);
		const groupDbId = createDelimitedAttribute(CommonPkType.Group, group.id);

		const transaction: TransactWriteCommandInput = {
			TransactItems: [
				{
					Put: {
						TableName: this.tableName,
						// group membership item
						Item: {
							pk: resourceDbId,
							sk: groupDbId,
							siKey1: groupDbId,
							siKey2: resource.alternateId !== undefined ? createDelimitedAttribute(CommonPkType.AlternateId, resource.alternateId, CommonPkType.Group, group.id) : undefined,
							siKey3: createDelimitedAttribute(CommonPkType.Partition, this.utils.getRandomPartition()),
							siSort3: createDelimitedAttribute(CommonPkType.Group, resource.keyPrefix, this.utils.appendDelimiter(group.id), resource.keyPrefix, resource.id),
						},
					},
				},
			],
		};

		this.log.debug(`getGrantGroupTransactWriteCommandInput> grant> exit:${JSON.stringify(transaction)}`);
		return transaction;
	}

	public async revoke(resource: Resource, group: Group, tags: Tags): Promise<void> {
		this.log.debug(`GroupRepository> revoke> in> resource:${JSON.stringify(resource)}, group:${JSON.stringify(group)}, tags:${JSON.stringify(tags)}`);

		const resourceDbId = createDelimitedAttribute(resource.keyPrefix, resource.id);
		const groupDbId = createDelimitedAttribute(CommonPkType.Group, group.id);

		const transaction: TransactWriteCommandInput = {
			TransactItems: [
				{
					Delete: {
						TableName: this.tableName,
						// group membership item
						Key: {
							pk: resourceDbId,
							sk: groupDbId,
						},
					},
				},
			],
		};

		try {
			this.log.debug(`GroupRepository> revoke> transaction:${JSON.stringify(transaction)}`);
			const response = await this.dc.send(new TransactWriteCommand(transaction));
			this.log.debug(`GroupRepository> revoke> response:${JSON.stringify(response)}`);
		} catch (err) {
			if (err instanceof Error) {
				if (err.name === 'TransactionCanceledException') {
					this.log.error(`GroupRepository> grant> err> ${JSON.stringify((err as TransactionCanceledException).CancellationReasons)}`);
					throw new DatabaseTransactionError((err as TransactionCanceledException).CancellationReasons as TransactionCancellationReason[]);
				} else {
					this.log.error(err);
					throw err;
				}
			}
		}

		await this.tagRepo.updateGroupSummaries(group.id, resource.keyPrefix, {}, tags);

		this.log.debug(`GroupRepository> revoke> exit:`);
	}

	public async isGranted(resourceId: string, resourceKeyPrefix: string, groupId: string): Promise<boolean> {
		this.log.debug(`GroupRepository> isGranted> in> resourceId: ${resourceId}, resourceKeyPrefix:${resourceKeyPrefix}, groupId:${groupId}`);

		const params: GetCommandInput = {
			TableName: this.tableName,
			Key: {
				pk: createDelimitedAttribute(resourceKeyPrefix, resourceId),
				sk: createDelimitedAttribute(CommonPkType.Group, groupId),
			},
		};

		this.log.debug(`GroupRepository> isGranted> params:${JSON.stringify(params)}`);
		const item = await this.dc.send(new GetCommand(params));
		this.log.debug(`GroupRepository> isGranted> item:${JSON.stringify(item)}`);

		const granted = item?.Item !== undefined;
		this.log.debug(`GroupRepository> isGranted> exit> ${granted}`);
		return granted;
	}
}
