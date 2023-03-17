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
import { DynamoDBDocumentClient, QueryCommand, QueryCommandInput, TransactWriteCommand, TransactWriteCommandInput } from '@aws-sdk/lib-dynamodb';
import { createDelimitedAttribute, createDelimitedAttributePrefix, expandDelimitedAttribute, pkDelimiter } from '@sif/dynamodb-utils';

import { CommonPkType } from '../common/pkTypes.js';
import { tagHierarchyDelimiter, TagListOptions, TagListPaginationKey, TagValueListOptions, TagValueListPaginationKey } from './models.js';

import type { Tags } from './schemas.js';
import type { DynamoDbItem } from '../common/models.js';
import type { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { DatabaseTransactionError, TransactionCancellationReason } from '../common/errors.js';
export class TagRepository {
	private readonly GSI1 = 'siKey1-pk-index';

	private readonly log: BaseLogger;
	private readonly dc: DynamoDBDocumentClient;
	private readonly tableName: string;

	public constructor(log: BaseLogger, dc: DynamoDBDocumentClient, tableName: string) {
		this.log = log;
		this.dc = dc;
		this.tableName = tableName;
	}

	public async listByResourceId(resourceId: string, keyPrefix: string, options?: TagListOptions): Promise<[Tags, TagListPaginationKey]> {
		this.log.debug(`TagRepository> listByResourceId> in> resourceId:${resourceId}, keyPrefix:${keyPrefix}, options:${JSON.stringify(options)}`);

		let exclusiveStartKey;
		if (options?.exclusiveStart?.key) {
			exclusiveStartKey = {
				pk: createDelimitedAttribute(keyPrefix, resourceId),
				sk: createDelimitedAttribute(CommonPkType.TagKey, options.exclusiveStart.key, CommonPkType.TagValue, options.exclusiveStart.value),
			};
		}

		const params: QueryCommandInput = {
			TableName: this.tableName,
			KeyConditionExpression: `#hash=:hash AND begins_with(#sortKey,:sortKey)`,
			ExpressionAttributeNames: {
				'#hash': 'pk',
				'#sortKey': 'sk',
				'#key': 'key',
				'#value': 'value',
			},
			ExpressionAttributeValues: {
				':hash': createDelimitedAttribute(keyPrefix, resourceId),
				':sortKey': createDelimitedAttributePrefix(CommonPkType.TagKey),
			},
			Limit: options?.count as number,
			ExclusiveStartKey: exclusiveStartKey,
			ProjectionExpression: '#key,#value',
		};

		this.log.debug(`TagRepository> listByResourceId> params:${JSON.stringify(params)}`);
		const data = await this.dc.send(new QueryCommand(params));
		this.log.debug(`TagRepository> listByResourceId> data:${JSON.stringify(data)}`);

		let result: [Tags, TagListPaginationKey] = [{}, undefined];
		if (data.Count > 0) {
			result[0] = this.assembleTags(data.Items);

			if (data.LastEvaluatedKey) {
				const sk = expandDelimitedAttribute(data.LastEvaluatedKey['sk']);
				result[1] = {
					key: sk[1],
					value: sk[3],
				};
			}
		}

		this.log.debug(`TagRepository> listByResourceId> exit:${JSON.stringify(result)}`);
		return result;
	}

	public async listByGroupId(groupId: string, tagKey: string, options?: TagValueListOptions): Promise<[Record<string, string>, TagValueListPaginationKey]> {
		this.log.debug(`TagRepository> listByGroupId> in> groupId:${groupId}, tagKey:${tagKey}, options:${JSON.stringify(options)}`);

		let sk = createDelimitedAttribute(CommonPkType.TagKey, tagKey);
		let siKey1 = createDelimitedAttribute(CommonPkType.Group, groupId, CommonPkType.TagKey, tagKey);
		if (options.parentTagValue) {
			sk += pkDelimiter + createDelimitedAttribute(CommonPkType.TagValue, options.parentTagValue);
			siKey1 += pkDelimiter + createDelimitedAttribute(CommonPkType.TagValue, options.parentTagValue);
		}
		sk += pkDelimiter + options.resourceKeyPrefix;
		siKey1 += pkDelimiter + options.resourceKeyPrefix;

		let exclusiveStartKey: { pk: string; sk: string; siKey1: string };
		if (options?.exclusiveStart?.value) {
			exclusiveStartKey = {
				pk: createDelimitedAttribute(CommonPkType.Group, groupId, CommonPkType.TagKey, tagKey, CommonPkType.TagValue, options.exclusiveStart.value),
				sk,
				siKey1,
			};
		}

		const params: QueryCommandInput = {
			TableName: this.tableName,
			IndexName: this.GSI1,
			KeyConditionExpression: `#hash=:hash`,
			ExpressionAttributeNames: {
				'#hash': 'siKey1',
				'#pk': 'pk',
				'#label': 'label',
				'#inUse': 'inUse',
			},
			ExpressionAttributeValues: {
				':hash': siKey1,
				':inUse': 0,
			},
			Limit: options?.count as number,
			ExclusiveStartKey: exclusiveStartKey,
			ProjectionExpression: '#pk,#label',
			FilterExpression: '#inUse > :inUse',
		};

		this.log.debug(`TagRepository> listByGroupId> params:${JSON.stringify(params)}`);
		const data = await this.dc.send(new QueryCommand(params));
		this.log.debug(`TagRepository> listByGroupId> data:${JSON.stringify(data)}`);

		let result: [Record<string, string>, TagValueListPaginationKey] = [{}, undefined];
		if (data.Count > 0) {
			data.Items.forEach((i) => {
				result[0][expandDelimitedAttribute(i['pk'])[5]] = i['label'];
			});

			if (data.LastEvaluatedKey) {
				result[1] = {
					value: expandDelimitedAttribute(data.LastEvaluatedKey['pk'])[5],
				};
			}
		}

		this.log.debug(`TagRepository> listByGroupId> exit:${JSON.stringify(result)}`);
		return result;
	}

	public getTagTransactWriteCommandInput(resourceId: string, keyPrefix: string, groups: string[], added: Tags = {}, removed: Tags = {}): TransactWriteCommandInput {
		this.log.debug(`TagRepository> getTagTransactWriteCommandInput> in> resourceId:${resourceId}, keyPrefix:${keyPrefix}, added:${JSON.stringify(added)}, removed:${JSON.stringify(removed)}`);

		const command: TransactWriteCommandInput = {
			TransactItems: [],
		};

		// 1st add all the tags to add
		Object.entries(added).forEach(([k, v]) => {
			const explodedValues = this.explodeTagValue(v);
			for (let i = explodedValues.length - 1; i >= 0; i--) {
				command.TransactItems.push({
					Put: {
						TableName: this.tableName,
						Item: {
							pk: createDelimitedAttribute(keyPrefix, resourceId),
							sk: createDelimitedAttribute(CommonPkType.TagKey, k, CommonPkType.TagValue, explodedValues[i]),
							siKey2: createDelimitedAttribute(CommonPkType.TagKey, k, CommonPkType.TagValue, explodedValues[i], keyPrefix),
							groups,
							key: k,
							value: explodedValues[i],
						},
					},
				});
			}
		});

		// 2nd, add the tags to delete
		Object.entries(removed).forEach(([k, v]) => {
			const explodedValues = this.explodeTagValue(v);
			for (let i = explodedValues.length - 1; i >= 0; i--) {
				// as an update to a tag can trigger both an add and update action, we have to ignore any delete if it was processed in the add
				const pk = createDelimitedAttribute(keyPrefix, resourceId);
				const sk = createDelimitedAttribute(CommonPkType.TagKey, k, CommonPkType.TagValue, explodedValues[i]);
				const keyProcessed = command.TransactItems.find((i) => i.Put?.Item['pk'] === pk && i.Put?.Item['sk'] === sk);
				if (keyProcessed === undefined) {
					command.TransactItems.push({
						Delete: {
							TableName: this.tableName,
							Key: {
								pk: createDelimitedAttribute(keyPrefix, resourceId),
								sk: createDelimitedAttribute(CommonPkType.TagKey, k, CommonPkType.TagValue, explodedValues[i]),
							},
						},
					});
				}
			}
		});

		this.log.debug(`TagRepository> getTagTransactWriteCommandInput> exit:${JSON.stringify(command)}`);
		return command;
	}

	public async updateGroupSummaries(groupId: string, resourceKeyPrefix: string, tagsAdded: Tags = {}, tagsRemoved: Tags = {}): Promise<void> {
		this.log.debug(`TagRepository> updateGroupSummaries> in> groupId:${groupId}, resourceKeyPrefix:${resourceKeyPrefix}, tagsAdded:${JSON.stringify(tagsAdded)}, tagsRemoved:${JSON.stringify(tagsRemoved)}`);
		const transaction: TransactWriteCommandInput = {
			TransactItems: [],
		};

		const createItem = (key: string, tagValue: string, incrementBy: number) => {
			let sk = createDelimitedAttribute(CommonPkType.TagKey, key);
			let siKey1 = createDelimitedAttribute(CommonPkType.Group, groupId, CommonPkType.TagKey, key);

			const lastIndexOfDelimiter = tagValue.lastIndexOf(tagHierarchyDelimiter);
			if (lastIndexOfDelimiter > 0) {
				const parentTagValue = tagValue.substring(0, lastIndexOfDelimiter);
				sk += pkDelimiter + createDelimitedAttribute(CommonPkType.TagValue, parentTagValue);
				siKey1 += pkDelimiter + createDelimitedAttribute(CommonPkType.TagValue, parentTagValue);
			}
			sk += pkDelimiter + resourceKeyPrefix;
			siKey1 += pkDelimiter + resourceKeyPrefix;

			return {
				Update: {
					TableName: this.tableName,
					Key: {
						pk: createDelimitedAttribute(CommonPkType.Group, groupId, CommonPkType.TagKey, key, CommonPkType.TagValue, tagValue),
						sk,
					},
					UpdateExpression: 'SET #inUse = if_not_exists(#inUse, :start) + :inc, #siKey1 = :siKey1, #label= :label',
					ExpressionAttributeNames: {
						'#inUse': 'inUse',
						'#siKey1': 'siKey1',
						'#label': 'label',
					},
					ExpressionAttributeValues: {
						':start': 0,
						':inc': incrementBy,
						':siKey1': siKey1,
						':label': this.leafTagValue(tagValue),
					},
				},
			};
		};

		// first figure out which tags will be affected by additions:
		const buildKey = (k: string, v: string): string => `${encodeURIComponent(k)}:${encodeURIComponent(v)}`;
		const splitKey = (kv: string): [string, string] => {
			const split = kv.split(':');
			return [decodeURIComponent(split[0]), decodeURIComponent(split[1])];
		};

		const tagKeyExplodedValuesToAdd = new Set<string>();
		Object.entries(tagsAdded).forEach(([k, v]) => {
			const explodedTagValues = this.explodeTagValue(v);
			for (let i = 0; i < explodedTagValues.length; i++) {
				tagKeyExplodedValuesToAdd.add(buildKey(k, explodedTagValues[i]));
			}
		});

		// next figure out which tag deletions to process, and which ones cancel out an addition
		const tagKeyExplodedValuesToDelete = new Set<string>();
		Object.entries(tagsRemoved).forEach(([k, v]) => {
			const explodedTagValues = this.explodeTagValue(v);
			for (let i = 0; i < explodedTagValues.length; i++) {
				const key = buildKey(k, explodedTagValues[i]);
				if (tagKeyExplodedValuesToAdd.has(key)) {
					tagKeyExplodedValuesToAdd.delete(key);
				} else {
					tagKeyExplodedValuesToDelete.add(key);
				}
			}
		});

		// now we can go ahead and process the additions
		tagKeyExplodedValuesToAdd.forEach((kv) => {
			const [key, value] = splitKey(kv);
			transaction.TransactItems.push(createItem(key, value, 1));
		});

		// finally we can go ahead and process the deletions without fear of clashing in the transaction
		tagKeyExplodedValuesToDelete.forEach((kv) => {
			const [key, value] = splitKey(kv);
			transaction.TransactItems.push(createItem(key, value, -1));
		});

		this.log.debug(`TagRepository> updateGroupSummaries> transaction:${JSON.stringify(transaction)}`);
		try {
			if (transaction.TransactItems.length > 0) {
				const response = await this.dc.send(new TransactWriteCommand(transaction));
				this.log.debug(`TagRepository> updateGroupSummaries> response:${JSON.stringify(response)}`);
			}
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

		this.log.debug(`TagRepository> updateGroupSummaries> exit:`);
	}

	private assembleTags(items: DynamoDbItem[]): Tags {
		this.log.debug(`TagRepository> assembleTags> in> items:${JSON.stringify(items)}`);
		const tags: Tags = {};
		for (const item of items) {
			const key = item['key'];
			const value = item['value'];
			if (tags[key]) {
				// hierarchical tag that needs collapsing
				if (value.startsWith(tags[key])) {
					tags[key] = value;
				}
			} else {
				tags[key] = value;
			}
		}
		this.log.debug(`TagRepository> assembleTags> exit:${JSON.stringify(tags)}`);
		return tags;
	}

	private explodeTagValue(value: string): string[] {
		this.log.debug(`TagRepository> explodeTagValue> in> value: ${value}`);

		const split = value.split(tagHierarchyDelimiter);

		const exploded: string[] = [value];
		for (let i = split.length - 1; i > 0; i--) {
			split.splice(i);
			exploded.push(split.join(tagHierarchyDelimiter));
		}
		exploded.sort();
		this.log.debug(`TagRepository> explodeTagValue> exit: ${exploded}`);
		return exploded;
	}

	private leafTagValue(value: string): string {
		this.log.debug(`TagRepository> leafTagValue> in> value: ${value}`);

		const split = value.split(tagHierarchyDelimiter);
		const leaf = split[split.length - 1];
		this.log.debug(`TagRepository> leafTagValue> exit: ${leaf}`);
		return leaf;
	}
}
