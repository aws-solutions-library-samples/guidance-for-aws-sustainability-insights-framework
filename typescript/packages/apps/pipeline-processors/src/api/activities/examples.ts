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

export const activityAuditListExample = [
	{
		'activityId': 1144,
		'date': '2022-01-03T16:00:00.000Z',
		'pipelineId': '01gwh2f5zwqryq789v42g1akrz',
		'executionId': '01gwh2hpz1dbpskw8vq531jg94',
		'auditId': '8e50a420-c138-406b-a794-4f1e973018f5',
		'createdAt': '2023-03-27T00:21:58.322Z',
		'executionNo': 0,
		'outputs': [
			{
				'index': 0,
				'name': 'time',
				'formula': 'AS_TIMESTAMP(:reading date,\'M/d/yy\')',
				'evaluated': {
					'AS_TIMESTAMP(:reading date,\'M/d/yy\')': '1641254400000',
					':reading date': '1/4/22'
				},
				'result': '1641254400000'
			},
			{
				'index': 1,
				'name': 'month',
				'formula': 'AS_TIMESTAMP(:reading date,\'M/d/yy\', roundDownTo=\'month\')',
				'evaluated': {
					'AS_TIMESTAMP(:reading date,\'M/d/yy\', roundDownTo=\'month\')': '1640995200000',
					':reading date': '1/4/22'
				},
				'result': '1640995200000'
			},
			{
				'index': 2,
				'name': 'a',
				'formula': ':a',
				'evaluated': {
					':a': 'A'
				},
				'result': 'A'
			},
			{
				'index': 3,
				'name': 'b*c',
				'formula': ':b*:c',
				'evaluated': {
					':b': '10',
					':c': '1'
				},
				'result': '10'
			}
		]
	},
	{
		'activityId': 1144,
		'date': '2022-01-03T16:00:00.000Z',
		'pipelineId': '01gwh2f5zwqryq789v42g1akrz',
		'executionId': '01gwh2g8k79v4qfq4m9pvz05q1',
		'auditId': '5ca76cb8-bb74-4a7b-ac9c-31b1b594b1f7',
		'createdAt': '2023-03-27T00:21:11.104Z',
		'executionNo': 0,
		'outputs': [
			{
				'index': 0,
				'name': 'time',
				'formula': 'AS_TIMESTAMP(:reading date,\'M/d/yy\')',
				'evaluated': {
					'AS_TIMESTAMP(:reading date,\'M/d/yy\')': '1641254400000',
					':reading date': '1/4/22'
				},
				'result': '1641254400000'
			},
			{
				'index': 1,
				'name': 'month',
				'formula': 'AS_TIMESTAMP(:reading date,\'M/d/yy\', roundDownTo=\'month\')',
				'evaluated': {
					'AS_TIMESTAMP(:reading date,\'M/d/yy\', roundDownTo=\'month\')': '1640995200000',
					':reading date': '1/4/22'
				},
				'result': '1640995200000'
			},
			{
				'index': 2,
				'name': 'a',
				'formula': ':a',
				'evaluated': {
					':a': 'A'
				},
				'result': 'A'
			},
			{
				'index': 3,
				'name': 'b*c',
				'formula': ':b*:c'
			}
		]
	},
	{
		'activityId': 1144,
		'date': '2022-01-03T16:00:00.000Z',
		'pipelineId': '01gwh2f5zwqryq789v42g1akrz',
		'executionId': '01gwh2fb3g2e33ghb08pab5hma',
		'auditId': '80eda70e-cc36-480e-9b95-6c010cf951d0',
		'createdAt': '2023-03-27T00:20:52.759Z',
		'executionNo': 0,
		'outputs': [
			{
				'index': 0,
				'name': 'time',
				'formula': 'AS_TIMESTAMP(:reading date,\'M/d/yy\')',
				'evaluated': {
					'AS_TIMESTAMP(:reading date,\'M/d/yy\')': '1641254400000',
					':reading date': '1/4/22'
				},
				'result': '1641254400000'
			},
			{
				'index': 1,
				'name': 'month',
				'formula': 'AS_TIMESTAMP(:reading date,\'M/d/yy\', roundDownTo=\'month\')',
				'evaluated': {
					'AS_TIMESTAMP(:reading date,\'M/d/yy\', roundDownTo=\'month\')': '1640995200000',
					':reading date': '1/4/22'
				},
				'result': '1640995200000'
			},
			{
				'index': 2,
				'name': 'a',
				'formula': ':a',
				'evaluated': {
					':a': 'A'
				},
				'result': 'A'
			},
			{
				'index': 3,
				'name': 'b*c',
				'formula': ':b*:c',
				'evaluated': {
					':b': '10',
					':c': '1'
				},
				'result': '10'
			}
		]
	},
	{
		'activityId': 1144,
		'date': '2022-01-03T16:00:00.000Z',
		'pipelineId': '01gwh2f5zwqryq789v42g1akrz',
		'executionId': '01gwh2fb3g2e33ghb08pab5hma',
		'auditId': 'ab633d60-c50c-424e-add1-e6810766b1b4',
		'createdAt': '2023-03-27T00:20:52.722Z',
		'executionNo': 0,
		'outputs': [
			{
				'index': 0,
				'name': 'time',
				'formula': 'AS_TIMESTAMP(:reading date,\'M/d/yy\')',
				'evaluated': {
					'AS_TIMESTAMP(:reading date,\'M/d/yy\')': '1641254400000',
					':reading date': '1/4/22'
				},
				'result': '1641254400000'
			},
			{
				'index': 1,
				'name': 'month',
				'formula': 'AS_TIMESTAMP(:reading date,\'M/d/yy\', roundDownTo=\'month\')',
				'evaluated': {
					'AS_TIMESTAMP(:reading date,\'M/d/yy\', roundDownTo=\'month\')': '1640995200000',
					':reading date': '1/4/22'
				},
				'result': '1640995200000'
			},
			{
				'index': 2,
				'name': 'a',
				'formula': ':a',
				'evaluated': {
					':a': 'A'
				},
				'result': 'A'
			},
			{
				'index': 3,
				'name': 'b*c',
				'formula': ':b*:c',
				'evaluated': {
					':b': '10',
					':c': '1'
				},
				'result': '10'
			}
		]
	}
];
