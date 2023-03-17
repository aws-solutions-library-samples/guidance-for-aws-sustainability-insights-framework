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

import { createActivityRequestBodyExample } from '../activities/examples.js';
import type { ActivityTaskResource, ActivityTaskNew, ActivityTaskList } from './schemas.js';

export const activityTaskCreateRequestExample: ActivityTaskNew = {
	type: 'create',
	activities: [createActivityRequestBodyExample, createActivityRequestBodyExample],
};

export const activityTaskResourceExample: ActivityTaskResource = {
	id: 'string',
	taskStatus: 'waiting',
	type: 'create',
	groups: ['/'],
	statusMessage: 'string',
	progress: 50,
	itemsTotal: 100,
	itemsSucceeded: 99,
	itemsFailed: 1,
	createdAt: '2022-08-30T03:18:26.809Z',
	createdBy: 'someone@somewhere',
};

export const activityTaskListExample: ActivityTaskList = {
	tasks: [
		activityTaskResourceExample,
		{
			...activityTaskResourceExample,
			id: 'some-id2',
		},
	],
	pagination: {
		lastEvaluated: 'some-id2',
	},
};
