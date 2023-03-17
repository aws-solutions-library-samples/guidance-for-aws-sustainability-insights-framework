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

import { atLeastReader, SecurityContext, GroupPermissions } from '@sif/authz';
import { NotFoundError, UnauthorizedError } from '@sif/resource-api-base';

import type { TaskItemListOptions, TaskItemListPaginationKey, ActivityTaskItemRepository } from './repository.js';
import type { TaskItemResource } from './schemas.js';

export class ActivityTaskItemService {
	private readonly log: FastifyBaseLogger;
	private readonly repository: ActivityTaskItemRepository;
	private readonly authChecker: GroupPermissions;

	public constructor(log: FastifyBaseLogger, authChecker: GroupPermissions, repository: ActivityTaskItemRepository) {
		this.log = log;
		this.authChecker = authChecker;
		this.repository = repository;
	}

	public async createBulk(taskItems: TaskItemResource[]): Promise<void> {
		this.log.debug(`ActivityTaskItemService> createBulk> start in:  taskItem: ${JSON.stringify(taskItems)}`);

		await this.repository.create(taskItems);

		this.log.debug(`ActivityTaskItemService> create> exit`);
	}

	public async get(securityContext: SecurityContext, taskId: string, name: string): Promise<TaskItemResource> {
		this.log.debug(`ActivityTaskItemService> get> taskId:${taskId}, name:${name}`);

		// Authz check - `reader` and above may get new activity.
		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId], securityContext.groupRoles, atLeastReader, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not at least a \`reader\` of the group in context \`${JSON.stringify(securityContext.groupId)}`);
		}

		const taskItem = await this.repository.get(taskId, name);

		if (taskItem === undefined) {
			throw new NotFoundError(`Task Item '${name}' not found.`);
		}

		this.log.debug(`ActivityTaskItemService> get> exit:${JSON.stringify(taskItem)}`);
		return taskItem;
	}

	public async list(
		securityContext: SecurityContext,
		taskId: string,
		options: TaskItemListOptions
	): Promise<[TaskItemResource[], TaskItemListPaginationKey]> {
		this.log.debug(`ActivityTaskItemService> list> taskId: ${taskId} options: ${JSON.stringify(options)}`);

		// Authz check - `reader` and above may list activity versions
		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId], securityContext.groupRoles, atLeastReader, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not at least a \`reader\` of the group in context \`${JSON.stringify(securityContext.groupId)}`);
		}

		// retrieve the task items
		let taskItems: TaskItemResource[] = [];
		let paginationKey: TaskItemListPaginationKey = undefined;
		do {
			// retrieve a page of id
			[taskItems, paginationKey] = await this.repository.list(taskId, options);

			// we may have ended up with less than the requested page of results. if so, retrieve the next page
		} while (paginationKey !== undefined && taskItems.length < options.count);

		this.log.debug(`ActivityTaskItemService> list> exit:${JSON.stringify([taskItems, paginationKey])}`);
		return [taskItems, paginationKey];
	}
}
