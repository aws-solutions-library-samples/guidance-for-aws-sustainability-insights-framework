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

import type { TaskItemList, TaskItemResource } from './schemas.js';

export const taskItemResourceExample: TaskItemResource = {
	taskId: '01ghf2acthpy46hjwess4enjmr',
	activityId: '01ghf2acthpy46hjwess4enjmr',
	name: 'ExampleActivity',
	status: 'failure',
	statusMessage: 'conflict',
};

export const taskItemListExample: TaskItemList = {
	taskItems: [
		{
			taskId: '52seg1jnuhrs83ioiuvr8plokq',
			activityId: '08hgt3ytynbe09sqxovr7gpled',
			name: 'ExampleActivityOne',
			status: 'success',
		},
		{
			taskId: '01ghf2acthpy46hjwess4enjmr',
			name: 'ExampleActivityTwo',
			status: 'failure',
			statusMessage: 'conflict',
		},
	],
	pagination: {
		count: 2,
		lastEvaluatedId: '01ghf2acthpy46hjwess4enjmr',
	},
};
