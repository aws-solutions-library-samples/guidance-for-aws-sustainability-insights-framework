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
import { DynamoDBDocumentClient, QueryCommand, QueryCommandInput } from '@aws-sdk/lib-dynamodb';
import type { ListIdsPaginationKey, ListByTagPaginationOptions, ListIdsPaginationOptions } from './models.js';
import { CommonPkType } from '../common/pkTypes.js';
import { createDelimitedAttribute, createDelimitedAttributePrefix, expandDelimitedAttribute } from '@sif/dynamodb-utils';
import type { Utils } from '../common/utils';
import pLimit from 'p-limit';
import type { FilterResultsByGroupFunction } from '../common/utils';

export class ResourceRepository {
	private readonly GSI1 = 'siKey1-pk-index';
	private readonly GSI2 = 'siKey2-pk-index';
	private readonly GSI3 = 'siKey3-siSort3-index';
	private readonly concurrencyLimit: number;
	private readonly log: BaseLogger;
	private readonly dc: DynamoDBDocumentClient;
	private readonly tableName: string;
	private readonly utils: Utils;

	public constructor(log: BaseLogger, dc: DynamoDBDocumentClient, tableName: string, utils: Utils, concurrencyLimit: number) {
		this.concurrencyLimit = concurrencyLimit;
		this.log = log;
		this.dc = dc;
		this.tableName = tableName;
		this.utils = utils;
	}

	private async getPaginationKeyFromResourceId(resourcePrefix: string, resourceId: string, groupId?: string): Promise<GSI3PartitionKey | undefined> {
		this.log.debug(`resourceRepository> getPaginationKeyFromResourceId> in> resourcePrefix:${resourcePrefix},  resourceId:${resourceId}`);

		const params: QueryCommandInput = {
			TableName: this.tableName,
			KeyConditionExpression: `#hash=:hash AND begins_with(#sortKey,:sortKey)`,
			ExpressionAttributeNames: {
				'#hash': 'pk',
				'#sortKey': 'sk',
			},
			ExpressionAttributeValues: {
				':hash': createDelimitedAttribute(resourcePrefix, resourceId),
				':sortKey': createDelimitedAttribute(CommonPkType.Group),
			},
		};

		const queryCommandResponse = await this.dc.send(new QueryCommand(params));

		if (queryCommandResponse?.Items?.length === 0) {
			this.log.debug(`resourceRepository> getPaginationKeyFromResourceId> exit> exclusiveStartKey: undefined`);
			return undefined;
		}

		// a resource can be granted to 2 different groups, so if user specify groupId when finding the pagination
		// we should query the row that match that one and not the first row
		const queryItem = groupId ? queryCommandResponse.Items.find((o) => o['sk'] === createDelimitedAttribute(CommonPkType.Group, groupId)) : queryCommandResponse.Items.pop();

		const exclusiveStartKey: GSI3PartitionKey = {
			sk: queryItem['sk'],
			pk: queryItem['pk'],
			siKey3: queryItem['siKey3'],
			siSort3: queryItem['siSort3'],
		};

		this.log.debug(`resourceRepository> getPaginationKeyFromResourceId> exit> exclusiveStartKey: ${JSON.stringify(exclusiveStartKey)})`);

		return exclusiveStartKey;
	}

	public async listIdsByParentGroups(groupId: string, resourcePrefix: string, pagination?: ListIdsPaginationOptions, includeCurrentGroup = true): Promise<[string[], ListIdsPaginationKey]> {
		this.log.debug(`resourceRepository> listIdsByParentGroup> groupId: ${groupId}, resourcePrefix: ${resourcePrefix}, pagination: ${JSON.stringify(pagination)}`);
		let { count, from } = pagination,
			resultIds = [],
			exclusiveStartKey,
			lastEvaluatedGroup: string;

		let groups = this.utils.explodeGroupId(groupId);

		// when listing group resource, '/' is never included, so we have to add this manually
		if (resourcePrefix === 'g') {
			resultIds = [...groups];

			// should only include descendants of group specified in the pagination
			if (pagination?.from?.id) {
				resultIds = groups.filter((o) => this.utils.isChildOf(o, pagination.from.id));
			}

			if (pagination?.count && resultIds.length >= pagination.count) {
				resultIds = resultIds.slice(0, pagination.count);
				return [resultIds, { id: resultIds[pagination.count - 1], groupId: resultIds[pagination.count - 1] }];
			}
			// We have populated the resultIds from the parent hierarchy now we need to
			// search based on children
			groups = [groupId];
		} else if (resourcePrefix !== 'g') {
			// pagination for access management group list can be inferred from the from.id which is the group itself
			// so below line only needed to be done for resource other than access management group
			if (from?.id) {
				exclusiveStartKey = await this.getPaginationKeyFromResourceId(resourcePrefix, from.id, from.groupId);
				if (exclusiveStartKey) lastEvaluatedGroup = expandDelimitedAttribute(exclusiveStartKey?.sk)[1];
			}
		}

		if (!includeCurrentGroup) {
			groups.pop();
		}

		for (const group of groups) {
			if (lastEvaluatedGroup && this.utils.isChildOf(lastEvaluatedGroup, group)) {
				this.log.trace(`resourceRepository> listIdsByParentGroup> skipping group: ${group}, lastEvaluatedGroup: ${lastEvaluatedGroup}`);
				continue;
			}

			// should only user the pagination if the pagination from id is from the same group
			// that we're querying now
			if (lastEvaluatedGroup !== group) {
				pagination.from = undefined;
			}

			this.log.trace(`resourceRepository> listIdsByParentGroup> processing group: ${group}`);

			const [resourceIds, _] = await this.listIdsByGroupId(group, resourcePrefix, {
				from: pagination.from,
				// only need to query to meet the pagination count
				count: count - resultIds.length,
			});

			resultIds.push(...resourceIds);

			// when it reaches the count return the result
			if (resultIds.length === count) {
				return [resultIds, { id: resultIds[resultIds.length - 1], groupId: group }];
			}
		}

		const paginationKey: ListIdsPaginationKey =
			// only include pagination if result is more than count
			count && resultIds.length >= count
				? {
						id: resultIds[resultIds.length - 1],
						groupId: groups.pop(),
				  }
				: undefined;

		return [resultIds, paginationKey];
	}

	public async listIdsByChildGroups(groupId: string, resourcePrefix: string, pagination?: ListIdsPaginationOptions): Promise<[string[], ListIdsPaginationKey]> {
		const queryFromPartition = (partition: number, fromId: string, fromGroupId: string) => {
			this.log.trace(`ResourceService> listIdsFromAllPartitions> childGroupQuery> partition:${partition}, fromId:${fromId}`);
			return this.listSortKeysOfChildGroups(groupId, resourcePrefix, partition, { count: pagination.count, from: { id: fromId, groupId: fromGroupId } });
		};

		let initialPagination = {
			id: pagination?.from?.id,
			groupId: pagination?.from?.groupId,
		};

		const resultsForFiltersFutures: Promise<[string[], ListIdsPaginationKey]>[] = [];
		for (let partition of this.utils.getPartitionRange()) {
			resultsForFiltersFutures.push(queryFromPartition(partition, initialPagination.id, initialPagination.groupId));
		}

		const resultsForFilters = await Promise.all(resultsForFiltersFutures);
		const sortKeyResults = resultsForFilters.map(([sortKeys, _paginationKey]) => sortKeys);

		// pointers to help with iterating through the different result sets
		const listPointers = new Array(resultsForFilters.length).fill(0);

		// this inline function will populate new pages of resource ids for a specific filter
		const getNextPageOfResults = async (partitionIndex: number): Promise<boolean> => {
			this.log.trace(`ResourceService> listIdsFromAllPartitions> getNextPageOfResults> filterIndex:${partitionIndex}`);
			const paginationKey = resultsForFilters[partitionIndex]?.[1];
			this.log.trace(`ResourceService> listIdsFromAllPartitions> getNextPageOfResults> paginationKey:${paginationKey}`);

			if (paginationKey === undefined) {
				// no more to process
				this.log.trace(`ResourceService> listIdsFromAllPartitions> getNextPageOfResults> early exit 1 (false)`);
				return false;
			}
			// all subsequent filters are optional filter by tags
			resultsForFilters[partitionIndex] = await queryFromPartition(partitionIndex, paginationKey.id, paginationKey.groupId);

			this.log.trace(`ResourceService> listIdsFromAllPartitions> getNextPageOfResults> resultsForFilters[filterIndex]: ${JSON.stringify(resultsForFilters[partitionIndex])}`);

			if ((resultsForFilters[partitionIndex]?.[0]?.length ?? 0) === 0) {
				// no more to process
				this.log.trace(`ResourceService> listIdsFromAllPartitions> getNextPageOfResults> early exit 2 (false)`);
				return false;
			} else {
				// store the new page of results, and reset its pointer
				sortKeyResults[partitionIndex] = resultsForFilters[partitionIndex]?.[0];
				listPointers[partitionIndex] = 0;
				this.log.trace(`ResourceService> listIdsFromAllPartitions> getNextPageOfResults> exit (true)`);
				return true;
			}
		};

		// process each list of resource ids per filter, saving where the resource id is found across all filter results
		const matchedSortKeys: string[] = [];
		let keepGoing = true;
		const pageSize = pagination?.count;

		while (keepGoing && matchedSortKeys.length < pageSize) {
			let selectedPartition = undefined,
				smallestSortKey = undefined;

			// check from all partition if there are more element to process
			const elementsToProcess = sortKeyResults.find((sortKeys, index) => {
				return sortKeys[listPointers[index]] !== undefined;
			});

			// if there are no more elements to process
			if (!elementsToProcess) break;

			// get the smallest id from all partition
			for (let partition of this.utils.getPartitionRange()) {
				// no more left for this partition
				if (sortKeyResults[partition][listPointers[partition]] == undefined) continue;

				const sortKeyInPartition = sortKeyResults[partition][listPointers[partition]];

				if (smallestSortKey === undefined || sortKeyInPartition < smallestSortKey) {
					selectedPartition = partition;
					smallestSortKey = sortKeyInPartition;
				}
			}

			if (selectedPartition !== undefined) {
				matchedSortKeys.push(sortKeyResults[selectedPartition][listPointers[selectedPartition]]);
				// increment index
				listPointers[selectedPartition]++;

				// if we have reached max, get next
				if (sortKeyResults[selectedPartition][listPointers[selectedPartition]] === undefined) {
					await getNextPageOfResults(selectedPartition);
				}
			}
		}

		// sort key would be in this format g:r:group:r:resourceId
		const matched = matchedSortKeys.map((i) => expandDelimitedAttribute(i)[4]);

		let paginationKey: ListIdsPaginationKey;
		if (matched.length >= pageSize) {
			this.log.trace(`ResourceService> listIdsFromAllPartitions> full page of results therefore adding pagination`);
			paginationKey = {
				id: matched[pageSize - 1],
				groupId: this.utils.trimDelimiter(expandDelimitedAttribute(matchedSortKeys[pageSize - 1])[2]),
			};
		}

		const result: [string[], ListIdsPaginationKey] = [matched, paginationKey];
		this.log.debug(`ResourceService> listIdsFromAllPartitions> exit:${JSON.stringify(result)}`);
		return result;
	}

	public async listSortKeysOfChildGroups(groupId: string, resourcePrefix: string, partition: number, pagination?: ListIdsPaginationOptions): Promise<[string[], ListIdsPaginationKey]> {
		this.log.debug(`resourceRepository> listSortKeysOfChildGroups> in> groupId:${groupId}, pagination:${JSON.stringify(pagination)}`);

		let exclusiveStartKey: Record<string, any>;

		if (pagination.from?.id) {
			exclusiveStartKey = await this.getPaginationKeyFromResourceId(resourcePrefix, pagination.from.id, pagination.from.groupId);
			// replace the primary key to appropriate partition
			if (exclusiveStartKey) {
				exclusiveStartKey['siKey3'] = createDelimitedAttribute(CommonPkType.Partition, partition);
				const paginationItemGroup = expandDelimitedAttribute(exclusiveStartKey['sk'])[1];
				// if pagination key is from parent group, it could not be used in dynamodb query
				if (this.utils.isChildOf(groupId, paginationItemGroup)) {
					exclusiveStartKey = undefined;
				}
			}
		}

		const params: QueryCommandInput = {
			TableName: this.tableName,
			IndexName: this.GSI3,
			KeyConditionExpression: `#hash=:hash AND begins_with(#sort,:sort)`,
			ExpressionAttributeNames: {
				'#hash': 'siKey3',
				'#sort': 'siSort3',
			},
			ExpressionAttributeValues: {
				':hash': createDelimitedAttribute(CommonPkType.Partition, partition),
				':sort': createDelimitedAttribute(CommonPkType.Group, resourcePrefix, this.utils.appendDelimiter(groupId)),
			},
			ProjectionExpression: 'pk,siSort3',
			ExclusiveStartKey: exclusiveStartKey,
			Limit: pagination.count,
			ScanIndexForward: true,
		};

		const queryResponse = await this.dc.send(new QueryCommand(params));

		let result: [string[], ListIdsPaginationKey] = [[], undefined];
		if ((queryResponse?.Count ?? 0) > 0) {
			result[0] = queryResponse?.Items?.map((i) => i['siSort3']);
			if (queryResponse.LastEvaluatedKey) {
				result[1] = {
					id: expandDelimitedAttribute(queryResponse.LastEvaluatedKey['pk'])[1],
					groupId: this.utils.trimDelimiter(expandDelimitedAttribute(queryResponse.LastEvaluatedKey['siSort3'])[2]),
				};
			}
		}

		this.log.debug(`resourceRepository> listSortKeysOfChildGroups> exit: result:${JSON.stringify(result)}`);
		return result;
	}

	public async listIdsByGroupId(groupId: string, resourcePrefix: string, pagination?: ListIdsPaginationOptions): Promise<[string[], ListIdsPaginationKey]> {
		this.log.debug(`resourceRepository> listIdsByGroupId> in> groupId:${groupId}, resourcePrefix:${resourcePrefix}, pagination:${JSON.stringify(pagination)}`);

		let exclusiveStartKey: GSI1PartitionKey;
		if (pagination?.from?.id) {
			exclusiveStartKey = {
				pk: createDelimitedAttribute(resourcePrefix, pagination.from.id),
				sk: createDelimitedAttribute(CommonPkType.Group, groupId),
				siKey1: createDelimitedAttribute(CommonPkType.Group, groupId),
			};
		}

		const params: QueryCommandInput = {
			TableName: this.tableName,
			IndexName: this.GSI1,
			KeyConditionExpression: `#hash=:hash AND begins_with(#sort,:sort)`,
			ExpressionAttributeNames: {
				'#hash': 'siKey1',
				'#sort': 'pk',
			},
			ExpressionAttributeValues: {
				':hash': createDelimitedAttribute(CommonPkType.Group, groupId),
				':sort': createDelimitedAttributePrefix(resourcePrefix),
			},
			ProjectionExpression: 'pk',
			ScanIndexForward: true,
			ExclusiveStartKey: exclusiveStartKey,
			Limit: pagination?.count,
		};

		let result: [string[], ListIdsPaginationKey] = [[], undefined];
		this.log.debug(`resourceRepository> listIdsByGroupId> params:${JSON.stringify(params)}`);
		const queryResponse = await this.dc.send(new QueryCommand(params));
		this.log.debug(`resourceRepository> listIdsByGroupId> queryResponse:${JSON.stringify(queryResponse)}`);
		if ((queryResponse?.Count ?? 0) > 0) {
			result[0] = queryResponse?.Items?.map((i) => expandDelimitedAttribute(i['pk'])[1]);
			if (queryResponse.LastEvaluatedKey) {
				result[1] = {
					id: expandDelimitedAttribute(queryResponse.LastEvaluatedKey['pk'])[1],
				};
			}
		}
		this.log.debug(`resourceRepository> listIdsByGroupId> exit: result:${JSON.stringify(result)}`);
		return result;
	}

	public async listIdsByTag(tagKey: string, tagValue: string, resourcePrefix: string, filterResultByGroupOptions: FilterResultsByGroupFunction, pagination?: ListByTagPaginationOptions): Promise<[string[], ListIdsPaginationKey]> {
		this.log.debug(`resourceRepository> listIdsByTag> in> tagKey:${tagKey}, tagValue:${tagValue}, resourcePrefix:${resourcePrefix}, pagination:${JSON.stringify(pagination)}`);

		const sk = createDelimitedAttribute(CommonPkType.TagKey, tagKey, CommonPkType.TagValue, tagValue);
		const siKey2 = createDelimitedAttribute(CommonPkType.TagKey, tagKey, CommonPkType.TagValue, tagValue, resourcePrefix);

		// build the exclusive start key if pagination has been requested
		let exclusiveStartKey: GSI2PartitionKey;
		if (pagination?.from?.id) {
			exclusiveStartKey = {
				pk: createDelimitedAttribute(resourcePrefix, pagination.from.id),
				sk,
				siKey2,
			};
		}

		let resourceIds = [];

		let keepGoing = true;
		while (keepGoing) {
			const params: QueryCommandInput = {
				TableName: this.tableName,
				IndexName: this.GSI2,
				KeyConditionExpression: `#hash=:hash`,
				ExpressionAttributeNames: {
					'#hash': 'siKey2',
					'#g': 'groups',
				},
				ExpressionAttributeValues: {
					':hash': siKey2,
				},
				ProjectionExpression: 'pk,#g',
				ExclusiveStartKey: exclusiveStartKey,
				Limit: pagination?.count,
				ScanIndexForward: true,
			};

			this.log.debug(`resourceRepository> listIdsByTag> params:${JSON.stringify(params)}`);
			const queryResponse = await this.dc.send(new QueryCommand(params));
			this.log.debug(`resourceRepository> listIdsByTag> queryResponse:${JSON.stringify(queryResponse)}`);

			const results = queryResponse?.Items?.map((i) => {
				return {
					id: expandDelimitedAttribute(i['pk'])[1],
					groups: i['groups'],
				};
			});

			// filterResultByGroupOptions will filter result based on query options defined by the caller
			resourceIds.push(...results.filter((o) => filterResultByGroupOptions(o.groups)).map((o) => o.id));

			if (queryResponse.LastEvaluatedKey) {
				exclusiveStartKey = queryResponse.LastEvaluatedKey as GSI2PartitionKey;
				keepGoing = true;
			} else {
				keepGoing = false;
				exclusiveStartKey = undefined;
			}

			if (resourceIds.length >= pagination?.count) {
				const slicedResults = resourceIds.slice(0, pagination.count);
				const lastEvaluatedId = { id: slicedResults[slicedResults.length - 1] };
				return [slicedResults, lastEvaluatedId];
			}
		}

		this.log.debug(`resourceRepository> listIdsByTag> exit: result:${JSON.stringify(resourceIds)}`);
		return [resourceIds, { id: resourceIds[resourceIds.length - 1] }];
	}

	public async listIdsByAlternateId(alternateId: string, groups: string[], keyPrefix: string): Promise<string[]> {
		this.log.debug(
			`ResourceRepository> listIdsByAlternateId> in> alternateId: ${alternateId}, groups:${groups}, keyPrefix:${keyPrefix}}`
		);

		const limit = pLimit(this.concurrencyLimit);
		const getIdFutures = groups.map((g) => {
			return limit(() => this.getIdByAlternateId(alternateId, g, keyPrefix));
		});

		const resourceIds = (await Promise.all(getIdFutures)).filter((r) => r !== undefined);
		this.log.debug(`ResourceRepository> listIdsByAlternateId> resourceIds:${JSON.stringify(resourceIds)}`);
		return resourceIds;
	}

	public async getIdByAlternateId(alternateId: string, groupId: string, keyPrefix: string): Promise<string> {
		this.log.debug(`ResourceRepository> getIdByAlternateId> in> alternateId: ${alternateId}, groupId:${groupId}, keyPrefix:${keyPrefix}`);

		const params: QueryCommandInput = {
			TableName: this.tableName,
			IndexName: this.GSI2,
			KeyConditionExpression: `#hash=:hash AND begins_with(#sort,:sort)`,
			ExpressionAttributeNames: {
				'#hash': 'siKey2',
				'#sort': 'pk',
			},
			ExpressionAttributeValues: {
				':hash': createDelimitedAttribute(CommonPkType.AlternateId, alternateId, CommonPkType.Group, groupId),
				':sort': createDelimitedAttributePrefix(keyPrefix),
			},
			ProjectionExpression: 'pk,sk',
		};

		this.log.debug(`ResourceRepository> getIdByAlternateId> params:${JSON.stringify(params)}`);
		const data = await this.dc.send(new QueryCommand(params));
		this.log.debug(`ResourceRepository> getIdByAlternateId> data:${JSON.stringify(data)}`);

		const resourceId = expandDelimitedAttribute(data.Items?.[0]?.['pk'])?.[1];
		this.log.debug(`ResourceRepository> getIdByAlternateId> resourceIds:${JSON.stringify(resourceId)}`);

		return resourceId;
	}
}

interface GSI1PartitionKey {
	pk: string;
	sk: string;
	siKey1: string;
}

interface GSI2PartitionKey {
	pk: string;
	sk: string;
	siKey2: string;
}

interface GSI3PartitionKey {
	pk: string;
	sk: string;
	siKey3: string;
	siSort3: string;
}
