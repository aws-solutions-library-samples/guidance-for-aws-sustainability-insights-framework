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
import { stringEnum, count } from '@sif/resource-api-base';

export const statusQS = Type.Optional(Type.String({ description: 'filter by status of the tasks, i.e. success, failure' }));
export const taskItemStatus = stringEnum(['success', 'failure'], 'Activity task item state');
export const activityId = Type.Optional(Type.String({ description: 'activity id.' }));
export const taskId = Type.Optional(Type.String({ description: 'activity Task id.' }));

export const name = Type.String({ description: 'name of the entity' });

export const taskItemResource = Type.Object(
	{
		name,
		taskId,
		activityId,
		status: Type.Optional(taskItemStatus),
		statusMessage: Type.Optional(Type.String({ description: 'failure message' })),
	},
	{
		$id: 'taskItem_resource',
	}
);

export const taskItemList = Type.Object(
	{
		taskItems: Type.Array(Type.Ref(taskItemResource)),
		pagination: Type.Optional(
			Type.Object({
				count: Type.Optional(count),
				lastEvaluatedId: Type.Optional(name),
			})
		),
	},
	{ $id: 'taskItem_List' }
);

export type TaskItemResource = Static<typeof taskItemResource>;
export type TaskItemStatus = Static<typeof taskItemStatus>;
export type TaskItemList = Static<typeof taskItemList>;
