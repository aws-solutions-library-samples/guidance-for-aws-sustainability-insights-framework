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
import { ulid } from 'ulid';
import { SendMessageCommand, SendMessageCommandOutput, SQSClient } from '@aws-sdk/client-sqs';
import pLimit from 'p-limit';

import { NotFoundError, UnauthorizedError, ResourceService } from '@sif/resource-api-base';
import { atLeastAdmin, atLeastReader, atLeastContributor, GroupPermissions, SecurityContext } from '@sif/authz';

import type { ActivityTaskListOptions, ActivityTaskListPaginationKey, ActivityTaskRepository } from './repository.js';
import type { ActivityTaskResource, ActivityTaskNew, TaskBatch, TaskBatchProgress } from './schemas.js';
import { PkType } from '../common/pkTypes.js';
import { ActivityTaskDefinitionError } from '../common/errors.js';

export class ActivityTaskService {
	private readonly defaultCount = 20;

	private readonly log: FastifyBaseLogger;
	private readonly authChecker: GroupPermissions;
	private readonly repository: ActivityTaskRepository;
	private readonly sqs: SQSClient;
	private readonly sqsQueueUrl: string;
	private readonly batchSize: number;
	private readonly concurrencyLimit: number;
	private readonly resourceService: ResourceService;

	public constructor(log: FastifyBaseLogger, authChecker: GroupPermissions, repository: ActivityTaskRepository, sqs: SQSClient, sqsQueueUrl: string, batchSize: number, concurrencyLimit: number, resourceService: ResourceService) {
		this.log = log;
		this.authChecker = authChecker;
		this.repository = repository;
		this.sqs = sqs;
		this.sqsQueueUrl = sqsQueueUrl;
		this.batchSize = batchSize;
		this.concurrencyLimit = concurrencyLimit;
		this.resourceService = resourceService;
	}

	public async create(securityContext: SecurityContext, activityTask: ActivityTaskNew): Promise<ActivityTaskResource> {
		this.log.debug(`ActivityTaskService> create> start`);

		// Authz check - Only `admin` and above may create new activities.
		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId], securityContext.groupRoles, atLeastContributor, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not an \`admin\` of the group in context \`${JSON.stringify(securityContext.groupId)}`);
		}

		// validate the activityTask payload
		await this.validate(activityTask);

		const batcher = <T>(items: T[]) =>
			items.reduce((chunks: T[][], item: T, index) => {
				const chunk = Math.floor(index / this.batchSize);
				chunks[chunk] = ([] as T[]).concat(chunks[chunk] || [], item);
				return chunks;
			}, []);

		const batches = batcher(activityTask.activities);

		// building the activity task
		const task: ActivityTaskResource = {
			type: activityTask.type,
			id: ulid().toLowerCase(),
			groups: [securityContext.groupId],
			itemsTotal: activityTask.activities.length,
			itemsFailed: 0,
			itemsSucceeded: 0,
			batchesCompleted: 0,
			batchesTotal: batches.length,
			taskStatus: 'waiting',
			createdAt: new Date(Date.now()).toISOString(),
			createdBy: securityContext.email,
		};

		await this.repository.create(task);

		const taskBatches = batches.map((c) => {
			const taskBatch: TaskBatch = {
				taskId: task.id,
				type: task.type,
				securityContext: securityContext,
				items: c,
			};
			return taskBatch;
		});

		// send each batch of activities to sqs for async processing
		const sqsFutures: Promise<SendMessageCommandOutput>[] = [];
		const limit = pLimit(this.concurrencyLimit);
		for (const batch of taskBatches) {
			sqsFutures.push(
				limit(() =>
					this.sqs.send(
						new SendMessageCommand({
							QueueUrl: this.sqsQueueUrl,
							MessageBody: JSON.stringify(batch),
							MessageAttributes: {
								messageType: {
									DataType: 'String',
									StringValue: `ActivityTask:${task.type}`,
								},
							},
						})
					)
				)
			);
		}

		await Promise.all(sqsFutures);

		this.log.debug(`ActivityTaskService> create> exit id:${JSON.stringify(task)}`);
		return task;
	}

	public async get(securityContext: SecurityContext, taskId: string): Promise<ActivityTaskResource> {
		this.log.debug(`ActivityTaskService> get> ActivityTask Id: ${taskId}`);

		// Authz check - `reader` and above may get new activity.
		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId], securityContext.groupRoles, atLeastReader, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not at least a \`reader\` of the group in context \`${JSON.stringify(securityContext.groupId)}`);
		}

		// retrieve task
		const task = await this.repository.get(taskId);
		if (task === undefined) {
			throw new NotFoundError(`task with id:'${taskId}' not found.`);
		}

		// verify task is permissible to group
		const isAllowed = this.authChecker.matchGroup(task.groups, securityContext.groupId);
		if (!isAllowed) {
			throw new UnauthorizedError(`The caller does not have access the group(s) that task '${taskId}' is part of.`);
		}

		this.log.debug(`ActivityTaskService> get> exit:${JSON.stringify(task)}`);
		return task;
	}

	public async list(securityContext: SecurityContext, options: ActivityTaskListOptions): Promise<[ActivityTaskResource[], ActivityTaskListPaginationKey]> {
		this.log.debug(`ActivityTaskService> list> Start`);

		if (!options.count) {
			options.count = this.defaultCount;
		}

		// Authz check - `reader` and above may list activity versions
		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId], securityContext.groupRoles, atLeastReader, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not at least a \`reader\` of the group in context \`${JSON.stringify(securityContext.groupId)}`);
		}

		// retrieve
		let tasks: ActivityTaskResource[] | undefined, paginationKey;

		let taskIds;
		[taskIds, paginationKey] = await this.resourceService.listIds(securityContext.groupId, PkType.ActivityTask, {
			tagFilter: {},
			pagination: {
				count: options?.count,
				from: {
					paginationToken: options?.exclusiveStart?.paginationToken,
				},
			},
		});

		tasks = await this.repository.listByIds(taskIds);

		this.log.debug(`ActivityTaskService> list> exit:${JSON.stringify(tasks)}`);
		return [tasks, paginationKey];
	}

	public async updateTaskProgress(taskBatchProgress: TaskBatchProgress): Promise<void> {
		this.log.debug(`ActivityTaskService> updateTaskProgress> in: taskUpdate:${JSON.stringify(taskBatchProgress)}`);

		await this.repository.updateProgress(taskBatchProgress);

		this.log.debug(`ActivityTaskService> update> exit`);
	}

	public async updateTaskStatus(taskId: string, status: string): Promise<void> {
		this.log.debug(`ActivityTaskService> updateTaskProgress> in: taskId: ${taskId} status:${status}`);

		await this.repository.updateStatus(taskId, status);

		this.log.debug(`ActivityTaskService> update> exit`);
	}

	public async delete(securityContext: SecurityContext, taskId: string): Promise<void> {
		this.log.debug(`ActivityTaskService> delete> in> taskId: ${taskId}`);

		// Authz check - `admin` and above may get delete activities
		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId], securityContext.groupRoles, atLeastAdmin, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not at least an \`admin\` of the group in context \`${JSON.stringify(securityContext.groupId)}`);
		}

		// retrieve and verify activity task is permissible to group
		await this.get(securityContext, taskId);

		// save
		await this.repository.delete(taskId);

		this.log.debug(`ActivityTaskService> delete> exit:`);
	}

	private async validate(activityTask: ActivityTaskNew): Promise<void> {
		this.log.debug(`ActivityTaskService> validate> in> activityTask: ${JSON.stringify(activityTask)}`);

		// check if task has activities
		if (!activityTask.activities || activityTask.activities.length <= 0) {
			throw new ActivityTaskDefinitionError('body/activities not defined');
		}

		// check if task type is on of supported types
		if (!['create', 'update'].includes(activityTask.type)) {
			throw new ActivityTaskDefinitionError('unsupported task type');
		}

		// loop over all activities
		for (let i = 0; i < activityTask.activities.length; i++) {
			const activity = activityTask.activities[i];
			// if the type is create
			if (activityTask.type === 'create') {
				// then it should have a name, if not we throw an error
				if (!activity.name) {
					throw new ActivityTaskDefinitionError(`body/activities/${i} must have required property name`);
				}
				// if the type is update
			} else if (activityTask.type === 'update') {
				// then it should have an id, if not then we throw an error
				if (!activity.id) {
					throw new ActivityTaskDefinitionError(`body/activities/${i} must have required property id`);
				}
			}

			// there is no need to do catch all else, since we validate the supported types before going into this loop
		}

		this.log.debug(`ActivityTaskService> validate> exit`);
	}
}
