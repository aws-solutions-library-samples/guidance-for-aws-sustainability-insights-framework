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

import dayjs from 'dayjs';
import { ulid } from 'ulid';
import type { Metric, MetricsList, MetricVersionsList } from './schemas.js';

const metricExample1: Metric = {
	date: dayjs('2022-01-01').toDate(),
	metricId: ulid(),
	name: 'ghg:scope1',
	timeUnit: 'month',
	month: 1,
	year: 2022,
	hierarchyValue: 146,
	groupValue: 34,
	subGroupsValue: 112,
	version: 'latest',
};

const metricExample2: Metric = {
	...metricExample1,
	date: dayjs('2022-02-01').toDate(),
	month: 2,
	hierarchyValue: 54,
	groupValue: 22,
	subGroupsValue: 32,
};

const metricExample3: Metric = {
	...metricExample1,
	date: dayjs('2022-03-01').toDate(),
	month: 3,
	hierarchyValue: 360,
	groupValue: 21,
	subGroupsValue: 339,
};

const metricVersion1: Metric = {
	...metricExample1,
	version: 1,
};

const metricVersion2: Metric = {
	...metricExample1,
	hierarchyValue:158,
	groupValue: 36,
	subGroupsValue: 122,
	version: 2,
};

const metricVersion3: Metric = {
	...metricExample1,
	hierarchyValue: 148,
	groupValue: 37,
	subGroupsValue: 111,
	version: 3,
};

export const metricsListExample: MetricsList = {
	metrics: [metricExample1, metricExample2, metricExample3],
};

export const metricVersionsListExample: MetricVersionsList = {
	metrics: [metricVersion1, metricVersion2, metricVersion3],
	pagination: {
		lastEvaluatedVersion: metricVersion3.version,
	},
};
