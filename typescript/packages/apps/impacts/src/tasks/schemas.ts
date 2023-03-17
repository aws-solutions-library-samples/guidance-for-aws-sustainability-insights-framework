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

import { Type, Static } from '@sinclair/typebox';

import { id, createdBy, createdAt, updatedBy, updatedAt, stringEnum, groups } from '@sif/resource-api-base';
import type { SecurityContext } from '@sif/authz';

import { editActivityRequestBody } from '../activities/schemas.js';

const taskStatus = stringEnum(['waiting', 'inProgress', 'success', 'failure'], 'Task execution status');
const taskType = stringEnum(['create', 'update'], 'Task type');

export const fromTaskIdPaginationParam = Type.Optional(Type.String({ description: 'Task Id to paginate from (exclusive).' }));

export const activityTaskItems = Type.Array(Type.Intersect([editActivityRequestBody, Type.Object({ id: Type.Optional(id), name: Type.Optional(Type.String()) })]), {
	description: 'array of items, for create type task, these should include names, for update type task, the items should include ids',
});

export const activityTaskNew = Type.Object(
	{
		type: taskType,
		activities: activityTaskItems,
	},
	{
		$id: 'activityTask_new',
	}
);

const fromTaskIdPagination = Type.Optional(Type.String({ description: 'Last evaluated task Id' }));

export const taskResource = Type.Object(
	{
		type: taskType,
		id,
		taskStatus,
		statusMessage: Type.Optional(Type.String({ description: 'message for the status' })),
		progress: Type.Optional(Type.Number({ description: 'total progress of the task' })),
		batchesTotal: Type.Optional(Type.Number({ description: 'no. of batches the task has been split into' })),
		batchesCompleted: Type.Optional(Type.Number({ description: 'no. of batches the task which have been completed' })),
		itemsTotal: Type.Number({ description: 'total number of items in the task' }),
		itemsSucceeded: Type.Number({ description: 'total number of items succeeded' }),
		itemsFailed: Type.Number({ description: 'no. of items failed' }),
		groups,
		createdAt,
		createdBy,
		updatedAt: Type.Optional(updatedAt),
		updatedBy: Type.Optional(updatedBy),
	},
	{
		$id: 'Task_resource',
	}
);

export const taskList = Type.Object(
	{
		tasks: Type.Array(Type.Ref(taskResource)),
		pagination: Type.Optional(
			Type.Object({
				lastEvaluated: Type.Optional(fromTaskIdPagination),
			})
		),
	},
	{
		$id: 'activityTasks_list',
	}
);

export type ActivityTaskResource = Static<typeof taskResource>;
export type ActivityTaskList = Static<typeof taskList>;
export type ActivityTaskNew = Static<typeof activityTaskNew>;

export interface TaskBatchProgress {
	taskId: string;
	totalItems: number;
	itemsFailed: number;
	itemsSucceeded: number;
}

export interface TaskBatch {
	taskId: string;
	securityContext: SecurityContext;
	type: Static<typeof taskType>;
	items: Static<typeof activityTaskItems>;
}
