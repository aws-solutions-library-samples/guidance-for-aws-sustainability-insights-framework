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
import type { ListIdsPaginationKey, ListIdsPaginationOptions, ListIdsPaginationTokenKey, ResourceListByAliasOptions, ResourceListOptions } from './models.js';
import type { ResourceRepository } from './repository.js';
import type { AccessManagementClient } from '../clients/accessManagement.client';
import type { FilterResultsByGroupFunction, Utils } from '../common/utils';

export class ResourceService {
	private DEFAULT_PAGE_SIZE = 20;
	private readonly log: BaseLogger;
	private readonly resourceRepository: ResourceRepository;
	private readonly utils: Utils;
	private readonly accessManagementClient: AccessManagementClient;

	public constructor(log: BaseLogger, resourceRepository: ResourceRepository, accessManagementClient: AccessManagementClient, utils: Utils) {
		this.utils = utils;
		this.accessManagementClient = accessManagementClient;
		this.log = log;
		this.resourceRepository = resourceRepository;
	}

	public async listIdsByAlternateId(groupId: string, alternateId: string, options?: ResourceListByAliasOptions): Promise<string[]> {
		this.log.debug(`ResourceService> listIdsByAlternateId> in> groupId:${groupId}, alternateId:${alternateId}, options: ${JSON.stringify(options)}`);

		const groupList = [groupId];

		if (options.includeParentGroups) {
			// populate group list from parents
			groupList.push(...this.utils.explodeGroupId(groupId));
		}

		if (options.includeChildGroups) {
			// populate group list from child groups (and its descendants)
			const childGroups = await this.accessManagementClient.listSubGroupIds(groupId, true);
			groupList.push(...childGroups);
		}

		const groupSet = new Set(groupList);

		const resourceIds = await this.resourceRepository.listIdsByAlternateId(alternateId, Array.from(groupSet));
		this.log.debug(`ResourceService> listIdsByAlternateId> exit:${resourceIds}`);
		return resourceIds;
	}

	public async listIds(groupId: string, resourcePrefix: string, options?: ResourceListOptions): Promise<[string[], ListIdsPaginationTokenKey]> {
		this.log.debug(`ResourceService> listIds> in> groupId:${groupId}, resourcePrefix:${resourcePrefix}, options: ${JSON.stringify(options)}`);

		const tagFilterCount = Object.keys(options?.tagFilter ?? {}).length ?? 0;
		const pageSize = options?.pagination?.count ?? this.DEFAULT_PAGE_SIZE;
		const tagKeys = Object.keys(options?.tagFilter ?? {});
		const tagValues = Object.values(options?.tagFilter ?? {});

		this.log.trace(
			`ResourceService> listIds> tagFilterCount:${tagFilterCount}, tagFilterCount:${tagFilterCount}, pageSize:${pageSize}, tagKeys:${JSON.stringify(tagKeys)}, tagValues:${JSON.stringify(tagValues)}, includeParentGroups: ${
				options.includeParentGroups
			}, includeChildrenGroups: ${options.includeChildGroups}`
		);

		// only returns pagination information if pagination is specified
		const paginationSpecified = options?.pagination?.count || options?.pagination?.from?.paginationToken;

		let pagination: ListIdsPaginationOptions = options?.pagination
			? {
					count: options.pagination.count,
					// should decode the pagination to resourceId and groupId
					from: this.utils.decodeFromPaginationToken(options?.pagination.from),
			  }
			: undefined;

		// if user does not specify tag options, we will query the results using the GSI3 for child groups
		if (tagFilterCount < 1) {
			let ids, paginationKey: ListIdsPaginationKey;

			if (options.includeParentGroups && options.includeChildGroups) {
				// first get the results from parents
				[ids, paginationKey] = await this.resourceRepository.listIdsByParentGroups(groupId, resourcePrefix, pagination, false);

				if (ids.length < pageSize) {
					// if parents does not hit the limit then retrieve from children groups
					const diff = pageSize - ids.length;
					const [idsFromChildren, childGroupPaginationKey] = await this.resourceRepository.listIdsByChildGroups(groupId, resourcePrefix, {
						from: pagination.from,
						count: diff,
					});
					ids.push(...idsFromChildren);
					paginationKey = childGroupPaginationKey;
				}
			} else if (options.includeChildGroups) {
				// return current and child groups
				[ids, paginationKey] = await this.resourceRepository.listIdsByChildGroups(groupId, resourcePrefix, {
					from: pagination.from,
					count: pageSize,
				});
			} else if (options.includeParentGroups) {
				// return current and parent groups
				[ids, paginationKey] = await this.resourceRepository.listIdsByParentGroups(groupId, resourcePrefix, pagination);
			} else {
				// return current only
				[ids, paginationKey] = await this.resourceRepository.listIdsByGroupId(groupId, resourcePrefix, pagination);
			}

			// make sure we encode the pagination key
			return [ids, paginationSpecified ? this.utils.encodeToPaginationToken(paginationKey) : undefined];
		}

		const filterResultsByGroupsFunc: FilterResultsByGroupFunction = this.utils.createFilterGroupsFunction(groupId, {
			includeChildGroups: options.includeChildGroups,
			includeParentGroups: options.includeParentGroups,
		});

		// if tag filter is specified we will query using GSI2 using tag as the key and the filter the result based on the
		// query options whether to include parent/child groups
		const tagFilterQuery = (filterIndex: number, fromId: string) => {
			this.log.trace(`ResourceService> listIds> tagFilterQuery> filterIndex:${filterIndex}, fromId:${fromId}`);
			return this.resourceRepository.listIdsByTag(tagKeys[filterIndex], tagValues[filterIndex], resourcePrefix, filterResultsByGroupsFunc, {
				count: pageSize,
				from: { id: fromId },
			});
		};

		// retrieve the first page of results for each filter
		const initialPaginationFromId = pagination?.from?.id;

		const resultsForFiltersFutures: Promise<[string[], ListIdsPaginationKey]>[] = [];
		for (let filterIndex = 0; filterIndex < tagFilterCount; filterIndex++) {
			resultsForFiltersFutures.push(tagFilterQuery(filterIndex, initialPaginationFromId));
		}

		const resultsForFilters = await Promise.all(resultsForFiltersFutures);
		const idResultsForFilters = resultsForFilters.map(([ids, _paginationKey]) => ids);

		this.log.trace(`ResourceService> listIds> resultsForFilters> resultsForFilters:${JSON.stringify(resultsForFilters)}`);

		// if any of the initial results are empty, then we can exit immediately as no common matches
		for (const ids of idResultsForFilters) {
			if ((ids?.length ?? 0) === 0) {
				this.log.trace(`ResourceService> listIds> early exit`);
				return [undefined, undefined];
			}
		}

		// pointers to help with iterating through the different result sets
		const listPointers = new Array(resultsForFilters.length).fill(0);

		// this inline function will populate new pages of resource ids for a specific filter
		let largestMatchResourceId: string;
		const getNextPageOfResults = async (filterIndex: number): Promise<boolean> => {
			this.log.trace(`ResourceService> listIds> getNextPageOfResults> filterIndex:${filterIndex}`);
			const paginationKey = resultsForFilters[filterIndex]?.[1];
			this.log.trace(`ResourceService> listIds> getNextPageOfResults> paginationKey:${paginationKey}`);

			if (paginationKey === undefined) {
				// no more to process
				this.log.trace(`ResourceService> listIds> getNextPageOfResults> early exit 1 (false)`);
				return false;
			}
			if (largestMatchResourceId && largestMatchResourceId > paginationKey.id) {
				this.log.trace(`ResourceService> listIds> getNextPageOfResults> paginationKey.id ${paginationKey.id} overridden to ${largestMatchResourceId}`);
				paginationKey.id = largestMatchResourceId;
			}

			// all subsequent filters are optional filter by tags

			resultsForFilters[filterIndex] = await tagFilterQuery(filterIndex, paginationKey.id);

			this.log.trace(`ResourceService> listIds> getNextPageOfResults> resultsForFilters[filterIndex]: ${JSON.stringify(resultsForFilters[filterIndex])}`);

			if ((resultsForFilters[filterIndex]?.[0]?.length ?? 0) === 0) {
				// no more to process
				this.log.trace(`ResourceService> listIds> getNextPageOfResults> early exit 2 (false)`);
				return false;
			} else {
				// store the new page of results, and reset its pointer
				idResultsForFilters[filterIndex] = resultsForFilters[filterIndex]?.[0];
				listPointers[filterIndex] = 0;
				this.log.trace(`ResourceService> listIds> getNextPageOfResults> exit (true)`);
				return true;
			}
		};

		// process each list of resource ids per filter, saving where the resource id is found across all filter results
		const matched: string[] = [];
		let keepGoing = true;

		while (keepGoing && matched.length < pageSize) {
			for (let filterIndex = 0; filterIndex < tagFilterCount; filterIndex++) {
				this.log.trace(`ResourceService> listIds> filterIndex:${filterIndex}`);
				let currentResourceId = idResultsForFilters?.[filterIndex]?.[listPointers[filterIndex]];
				this.log.trace(`ResourceService> listIds> currentResourceId:${currentResourceId}`);
				if (currentResourceId === undefined) {
					keepGoing = await getNextPageOfResults(filterIndex);
					if (!keepGoing) break;
					currentResourceId = idResultsForFilters?.[filterIndex]?.[listPointers[filterIndex]];
					this.log.trace(`ResourceService> listIds> currentResourceId updated to:${currentResourceId}`);
				}
				// if we reached the last filter index, it means we found a match across all tags
				if (filterIndex === tagFilterCount - 1) {
					this.log.trace(`ResourceService> listIds> found a match across all!`);
					// add the matched id to the result
					matched.push(currentResourceId);
					// increment all the pointers
					listPointers.forEach((_value, index) => listPointers[index]++);
				} else {
					// check for matching resource ids between this and the next filter being compared
					let nextResourceId = idResultsForFilters?.[filterIndex + 1]?.[listPointers[filterIndex + 1]];
					this.log.trace(`ResourceService> listIds> nextResourceId:${nextResourceId}`);
					if (nextResourceId === undefined) {
						keepGoing = await getNextPageOfResults(filterIndex + 1);
						if (!keepGoing) break;
						nextResourceId = idResultsForFilters?.[filterIndex + 1]?.[listPointers[filterIndex + 1]];
						this.log.trace(`ResourceService> listIds> nextResourceId updated to:${nextResourceId}`);
					}
					if (currentResourceId === nextResourceId) {
						this.log.trace(`ResourceService> listIds> found partial match so continuing`);
						// resource id match, so move onto checking the next filter
						largestMatchResourceId = currentResourceId;
						continue;
					} else if (currentResourceId && nextResourceId && currentResourceId < nextResourceId) {
						// this filter result has a lower resource id, therefore increment this filters index
						this.log.trace(`ResourceService> listIds> mismatch. incrementing current point`);
						listPointers[filterIndex]++;
						break;
					} else {
						// the next filter result has a lower resource id, therefore increment the next filters index
						this.log.trace(`ResourceService> listIds> mismatch. incrementing next point`);
						listPointers[filterIndex + 1]++;
						break;
					}
				}
			}
		}

		let paginationKey: ListIdsPaginationKey;
		if (matched.length >= pageSize) {
			this.log.trace(`ResourceService> listIds> full page of results therefore adding pagination`);
			paginationKey = { id: matched[pageSize - 1] };
		}

		const result: [string[], ListIdsPaginationTokenKey] = [matched, paginationSpecified ? this.utils.encodeToPaginationToken(paginationKey) : undefined];
		this.log.debug(`ResourceService> listIds> exit:${JSON.stringify(result)}`);
		return result;
	}
}
