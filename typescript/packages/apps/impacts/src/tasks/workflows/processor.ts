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
import pLimit from 'p-limit';

import type { WorkflowAction } from './workflows.interfaces.js';
import type { ActivityService } from '../../activities/service.js';
import type { ActivityTaskService } from '../service.js';
import type { TaskBatch, TaskBatchProgress } from '../schemas.js';
import type { ActivityTaskItemService } from '../../taskItems/service.js';
import type { TaskItemResource } from '../../taskItems/schemas.js';
import type { EditActivity, NewActivity } from '../../activities/schemas.js';

export class ActivityTaskWorkflowProcessor implements WorkflowAction {
	private readonly log: FastifyBaseLogger;
	private readonly activityService: ActivityService;
	private readonly activityTaskService: ActivityTaskService;
	private readonly activityTaskItemService: ActivityTaskItemService;
	private readonly concurrencyLimit: number;

	public constructor(
		log: FastifyBaseLogger,
		activityService: ActivityService,
		activityTaskService: ActivityTaskService,
		activityTaskItemService: ActivityTaskItemService,
		concurrencyLimit: number
	) {
		this.log = log;
		this.activityService = activityService;
		this.activityTaskService = activityTaskService;
		this.activityTaskItemService = activityTaskItemService;
		this.concurrencyLimit = concurrencyLimit;
	}

	// Process create Items received on the SQS queue
	public async process(batch: TaskBatch): Promise<void> {
		this.log.debug(`ActivityTaskCreateWorkflow> process> task:${JSON.stringify(batch)}`);

		// update the overall task status to inProgress
		await this.activityTaskService.updateTaskStatus(batch.taskId, 'inProgress');

		// process task items
		const taskBatchProgress = await this.processTaskBatch(batch);

		// update task progress
		await this.activityTaskService.updateTaskProgress(taskBatchProgress);

		// update the overall task status to success
		// (this will attempt to update the status but the query condition will guard this update to not update the status if the batches have not been completed)
		await this.activityTaskService.updateTaskStatus(batch.taskId, 'success');

		this.log.debug(`ActivityTaskCreateWorkflow> process> exit:${JSON.stringify(taskBatchProgress)}`);
	}

	private async processTaskBatch(batch: TaskBatch): Promise<TaskBatchProgress> {
		this.log.debug(`ActivityTaskCreateWorkflow> processTaskItems> task:${JSON.stringify(batch)}`);

		const futures: Promise<TaskItemResource>[] = [];
		let succeededItems = 0;
		let failedItems = 0;
		const limit = pLimit(this.concurrencyLimit);
		for (const a of batch.items) {
			futures.push(
				limit(async () => {
					// create a minimal taskItem resource
					let taskItem: TaskItemResource = {
						name: a.name,
						taskId: batch.taskId,
					};

					// try to create an activity
					try {
						// this is where we can control the action needed to be performed in this case, it could an action to create or update an activity entity
						let actionResponse;
						if (batch.type === 'create') {
							actionResponse = await this.activityService.create(batch.securityContext, a as NewActivity);
						} else if (batch.type === 'update') {
							actionResponse = await this.activityService.update(batch.securityContext, a.id, a as EditActivity);
						} else {
							throw Error('unknown task action');
						}

						// if we succeed, update the status and activity Id on the taskItem
						taskItem.status = 'success';
						taskItem.activityId = actionResponse.id;

						// to avoid unnecessary iterations i.e. map() etc., we can optimize this by keep track of counters within the same loop
						succeededItems += 1;
					} catch (error) {
						const e = error as Error;

						// if we fail we update the status and statusMessage on the taskItem
						taskItem.status = 'failure';
						taskItem.statusMessage = e.message;

						failedItems += 1;

						this.log.debug(`ActivityTaskCreateWorkflow> processTaskItems> error: ${e.name}: ${e.message}`);
					}

					return taskItem;
				})
			);
		}
		const taskItems = await Promise.all(futures);

		// to optimize write to ddb, we will do a transaction write of all task items at once
		await this.activityTaskItemService.createBulk(taskItems);

		// once we are done processing the items in this batch, we create a "batch progress report" and return it
		const batchProgress = {
			taskId: batch.taskId,
			totalItems: taskItems.length,
			itemsFailed: failedItems,
			itemsSucceeded: succeededItems,
		};

		this.log.debug(`ActivityTaskCreateWorkflow> processTaskItems> exit:${JSON.stringify(batchProgress)}`);

		return batchProgress;
	}
}
