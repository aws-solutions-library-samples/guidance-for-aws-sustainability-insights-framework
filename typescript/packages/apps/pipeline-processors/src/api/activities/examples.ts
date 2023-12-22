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

import type { ActivitiesDownloadList, ActivitiesList, Activity, ActivityVersionsList, NewActivitiesDownload } from './schemas.js';

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

export const activityAuditListExample = [{
	'status': 'SUCCEEDED',
	'exportUrl': '<S3 Export Url>',
	'audits': [{
		'pipelineId': '01h5ewn29qjzx606f1z3ksd7dy',
		'executionId': '01h5ewn4wvsk1fx5rhjm682zjg',
		'auditId': '12b42b60-6198-44df-a075-167a6a740f1f',
		'inputs': [{
			'name': '___row_identifier___',
			'value': '1/4/22-A-10-1'
		}, {
			'name': 'reading date',
			'value': '1/4/22'
		}, {
			'name': 'a',
			'value': 'A'
		}, {
			'name': 'b',
			'value': '10'
		}, {
			'name': 'c',
			'value': '1'
		}],
		'outputs': [{
			'index': 0,
			'name': 'time',
			'formula': 'AS_TIMESTAMP(:reading date,\'M/d/yy\')',
			'evaluated': {
				':reading date': '1/4/22',
				'AS_TIMESTAMP(:reading date,\'M/d/yy\')': '1641254400000'
			},
			'result': '1641254400000',
			'errormessage': null,
			'resources': null
		}, {
			'index': 1,
			'name': 'month',
			'formula': 'AS_TIMESTAMP(:reading date,\'M/d/yy\', roundDownTo=\'month\')',
			'evaluated': {
				':reading date': '1/4/22',
				'AS_TIMESTAMP(:reading date,\'M/d/yy\', roundDownTo=\'month\')': '1640995200000'
			},
			'result': '1640995200000',
			'errormessage': null,
			'resources': null
		}, {
			'index': 2,
			'name': 'a',
			'formula': ':a',
			'evaluated': {
				':a': 'A'
			},
			'result': 'A',
			'errormessage': null,
			'resources': null
		}, {
			'index': 3,
			'name': 'b*c',
			'formula': ':b*:c',
			'evaluated': {
				':b': '10',
				':c': '1'
			},
			'result': '10',
			'errormessage': null,
			'resources': null
		}]
	},
		{
			'pipelineId': '01h5ewn29qjzx606f1z3ksd7dy',
			'executionId': '01h5ewn4wvsk1fx5rhjm682zjg',
			'auditId': 'f50357e1-d2ba-4351-bf28-d9281d74e150',
			'inputs': [{
				'name': '___row_identifier___',
				'value': '1/4/22-A-10-1'
			}, {
				'name': 'reading date',
				'value': '1/4/22'
			}, {
				'name': 'a',
				'value': 'A'
			}, {
				'name': 'b',
				'value': '10'
			}, {
				'name': 'c',
				'value': '1'
			}],
			'outputs': [{
				'index': 0,
				'name': 'time',
				'formula': 'AS_TIMESTAMP(:reading date,\'M/d/yy\')',
				'evaluated': {
					':reading date': '1/4/22',
					'AS_TIMESTAMP(:reading date,\'M/d/yy\')': '1641254400000'
				},
				'result': '1641254400000',
				'errormessage': null,
				'resources': null
			},
				{
					'index': 1,
					'name': 'month',
					'formula': 'AS_TIMESTAMP(:reading date,\'M/d/yy\', roundDownTo=\'month\')',
					'evaluated': {
						':reading date': '1/4/22',
						'AS_TIMESTAMP(:reading date,\'M/d/yy\', roundDownTo=\'month\')': '1640995200000'
					},
					'result': '1640995200000',
					'errormessage': null,
					'resources': null
				}, {
					'index': 2,
					'name': 'a',
					'formula': ':a',
					'evaluated': {
						':a': 'A'
					},
					'result': 'A',
					'errormessage': null,
					'resources': null
				}, {
					'index': 3,
					'name': 'b*c',
					'formula': ':b*:c',
					'evaluated': {
						':b': '10',
						':c': '1'
					},
					'result': '10',
					'errormessage': null,
					'resources': null
				}
			]
		},
		{
			'pipelineId': '01h5ewn29qjzx606f1z3ksd7dy',
			'executionId': '01h5ewqm8x2ywd64s9b5p2b0fd',
			'auditId': '51aa61ea-936d-4e26-b610-9e15f3f6c43b',
			'inputs': [{
				'name': '___row_identifier___',
				'value': '1/4/22-A--'
			}, {
				'name': 'reading date',
				'value': '1/4/22'
			}, {
				'name': 'a',
				'value': 'A'
			}, {
				'name': 'b',
				'value': ''
			}, {
				'name': 'c',
				'value': ''
			}],
			'outputs': [{
				'index': 0,
				'name': 'time',
				'formula': 'AS_TIMESTAMP(:reading date,\'M/d/yy\')',
				'evaluated': {
					':reading date': '1/4/22',
					'AS_TIMESTAMP(:reading date,\'M/d/yy\')': '1641254400000'
				},
				'result': '1641254400000',
				'errormessage': null,
				'resources': null
			}, {
				'index': 1,
				'name': 'month',
				'formula': 'AS_TIMESTAMP(:reading date,\'M/d/yy\', roundDownTo=\'month\')',
				'evaluated': {
					':reading date': '1/4/22',
					'AS_TIMESTAMP(:reading date,\'M/d/yy\', roundDownTo=\'month\')': '1640995200000'
				},
				'result': '1640995200000',
				'errormessage': null,
				'resources': null
			}, {
				'index': 2,
				'name': 'a',
				'formula': ':a',
				'evaluated': {
					':a': 'A'
				},
				'result': 'A',
				'errormessage': null,
				'resources': null
			}, {
				'index': 3,
				'name': 'b*c',
				'formula': ':b*:c',
				'evaluated': null,
				'result': null,
				'errormessage': null,
				'resources': null
			}]
		},
		{
			'pipelineId': '01h5ewn29qjzx606f1z3ksd7dy',
			'executionId': '01h5ewts1j6ef1d8n11zh0zdte',
			'auditId': 'a8f2c849-4908-4b8a-a7c8-2359629bc9c3',
			'inputs': [{
				'name': '___row_identifier___',
				'value': '1/4/22-A-10-1'
			}, {
				'name': 'reading date',
				'value': '1/4/22'
			}, {
				'name': 'a',
				'value': 'A'
			}, {
				'name': 'b',
				'value': '10'
			}, {
				'name': 'c',
				'value': '1'
			}],
			'outputs': [{
				'index': 0,
				'name': 'time',
				'formula': 'AS_TIMESTAMP(:reading date,\'M/d/yy\')',
				'evaluated': {
					':reading date': '1/4/22',
					'AS_TIMESTAMP(:reading date,\'M/d/yy\')': '1641254400000'
				},
				'result': '1641254400000',
				'errormessage': null,
				'resources': null
			}, {
				'index': 1,
				'name': 'month',
				'formula': 'AS_TIMESTAMP(:reading date,\'M/d/yy\', roundDownTo=\'month\')',
				'evaluated': {
					':reading date': '1/4/22',
					'AS_TIMESTAMP(:reading date,\'M/d/yy\', roundDownTo=\'month\')': '1640995200000'
				},
				'result': '1640995200000',
				'errormessage': null,
				'resources': null
			}, {
				'index': 2,
				'name': 'a',
				'formula': ':a',
				'evaluated': {
					':a': 'A'
				},
				'result': 'A',
				'errormessage': null,
				'resources': null
			}, {
				'index': 3,
				'name': 'b*c',
				'formula': ':b*:c',
				'evaluated': {
					':b': '10',
					':c': '1'
				},
				'result': '10',
				'errormessage': null,
				'resources': null
			}]
		}
	]
}];

export const newActivitiesDownloadExample: NewActivitiesDownload = {
	id: '12345'
};

export const activitiesDownloadExample: ActivitiesDownloadList = {
	downloads: [
		{
			url: 'https://<some-signed-url>'
		}
	]

};
