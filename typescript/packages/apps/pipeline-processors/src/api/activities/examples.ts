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

import type { ActivitiesList, Activity, ActivityVersionsList } from './schemas.js';

const pipelineId = '01gmf43ak9r1ghhvfaqb2wbcxp';
const executionId = '01gnb3v9nty57at170b7sfvdp0';

const activityExample1: Activity = {
	date: '2022-01-02',
	fuel: 'Lignite Coal',
	equipmentId: 'furnace9',
	equipmentType: 'furnace',
	co2: 101.0,
	pipelineId,
	executionId,
};

const activityExample2: Activity = {
	...activityExample1,
	date: '2022-01-04',
	fuel: 'Aviation Gasoline',
	equipmentId: 'thermaloxidizer5',
	equipmentType: 'thermal oxidizer',
	co2: 335.0,
};

const activityExample3: Activity = {
	...activityExample1,
	date: '2022-01-03',
	fuel: 'Fuel Gas',
	equipmentId: 'oven8',
	equipmentType: 'Oven',
	co2: 308.0,
};

const activityVersion1: Activity = {
	...activityExample1,
};

const activityVersion2: Activity = {
	...activityExample1,
	co2: 314.0,
};

const activityVersion3: Activity = {
	...activityExample1,
	co2: 327.0,
};

export const activitiesListExample: ActivitiesList = {
	activities: [activityExample1, activityExample2, activityExample3],
	pagination: {
		lastEvaluatedToken: 20,
	},
};

export const activityVersionsListExample: ActivityVersionsList = {
	activities: [activityVersion1, activityVersion2, activityVersion3],
	pagination: {
		lastEvaluatedToken: 3,
	},
};
