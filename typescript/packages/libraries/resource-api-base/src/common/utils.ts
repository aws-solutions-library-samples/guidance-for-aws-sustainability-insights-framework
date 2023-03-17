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
import { groupHierarchyDelimiter } from '../groups/models.js';
import type { ListIdsPaginationKey, ListIdsPaginationTokenKey } from '../resources/models';

export type FilterResultsByGroupFunction = (groupsIds: string[]) => boolean;

export class Utils {
	private readonly log: BaseLogger;
	private readonly partitionSize: number;

	public constructor(log: BaseLogger, partitionSize: number) {
		this.partitionSize = partitionSize;
		this.log = log;
	}

	public appendDelimiter(groupId: string): string {
		groupId = groupId.trim().toLowerCase();
		return groupId.endsWith('/') ? groupId : groupId + '/';
	}

	public trimDelimiter(groupId: string): string {
		if (groupId === '/') return '/';
		if (groupId.endsWith('/')) return groupId.slice(0, groupId.length - 1);
		return groupId;
	}

	public isChildOf(groupId: string, parentGroupId: string): boolean {
		return this.appendDelimiter(groupId).startsWith(this.appendDelimiter(parentGroupId)) && this.appendDelimiter(groupId) !== this.appendDelimiter(parentGroupId);
	}

	public encodeToPaginationToken(from: ListIdsPaginationKey): ListIdsPaginationTokenKey {
		if (!from?.id) return undefined;

		let buff = new Buffer(`${from.id}:${from.groupId}`);
		let base64data = buff.toString('base64');
		return {
			paginationToken: base64data,
		};
	}

	public decodeFromPaginationToken(from: ListIdsPaginationTokenKey): ListIdsPaginationKey {
		if (!from?.paginationToken) return undefined;
		let buff = new Buffer(from.paginationToken, 'base64');
		let [id, groupId] = buff.toString('ascii').split(':');
		return {
			id,
			groupId,
		};
	}

	public createFilterGroupsFunction(groupId: string, options: { includeParentGroups: boolean; includeChildGroups: boolean }): FilterResultsByGroupFunction {
		const filterResultsByGroupOptions = (resourceGroupIds: string[]): boolean => {
			return resourceGroupIds.find((r) => r === groupId || (options.includeParentGroups && this.isChildOf(groupId, r)) || (options.includeChildGroups && this.isChildOf(r, groupId))) !== undefined;
		};
		return filterResultsByGroupOptions;
	}

	public getPartitionRange(): number[] {
		let range = (n) => [...Array(n).keys()];
		return range(this.partitionSize);
	}

	public getRandomPartition() {
		const min = Math.ceil(0);
		const max = Math.floor(this.partitionSize);
		return Math.floor(Math.random() * (max - min) + min); // The maximum is exclusive and the minimum is inclusive
	}

	public explodeGroupId(groupId: string): string[] {
		this.log.debug(`Utils> explodeGroupId> in> groupId: ${groupId}`);

		// remove any trailing slash
		if (groupId !== groupHierarchyDelimiter && groupId.endsWith(groupHierarchyDelimiter)) {
			groupId = groupId.slice(0, groupId.length - 1);
		}

		const exploded: Set<string> = new Set();
		exploded.add(groupId);

		if (groupId === groupHierarchyDelimiter) {
			this.log.debug(`Utils> explodeGroupId> early exit: ${JSON.stringify(Array.from(exploded))}`);
			return Array.from(exploded);
		}

		const split = groupId.split(groupHierarchyDelimiter);

		for (let i = split.length - 1; i > 0; i--) {
			split.splice(i);
			let groupHierarchyId = split.join(groupHierarchyDelimiter);
			if (groupHierarchyId.length === 0) {
				groupHierarchyId = groupHierarchyDelimiter;
			}
			exploded.add(groupHierarchyId);
		}
		this.log.debug(`Utils> explodeGroupId> exit: ${JSON.stringify(Array.from(exploded))}`);
		// make sure the order is from root to leaf
		return Array.from(exploded).reverse();
	}

	public getParentGroupId(groupId: string): string {
		const lastIndex = groupId.lastIndexOf(groupHierarchyDelimiter);
		if (lastIndex === 0) {
			return groupHierarchyDelimiter;
		} else {
			return groupId.substring(0, lastIndex);
		}
	}
}
