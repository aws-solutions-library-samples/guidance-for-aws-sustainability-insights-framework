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

import { mergeAndConcat, merge } from 'merge-anything';
import type { TagService } from '../tags/service.js';
export class MergeUtils {
	private readonly tagService: TagService;

	public constructor(tagService: TagService) {
		this.tagService = tagService;
	}

	public mergeResource<T extends { groups?: string[]; tags?: Record<string, string> }>(existing: T, updated: T): T {
		const merged = merge(existing, updated) as T;
		if ((updated?.groups?.length ?? 0) > 0) {
			merged.groups = Array.from(new Set(mergeAndConcat(existing.groups, updated.groups)));
		}

		if (merged.tags) {
			this.tagService.removeUnusedTags(merged.tags);
		}

		return merged;
	}
}
