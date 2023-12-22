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

import type { MetricAggregationJob, MetricAggregationJobList, NewMetricAggregationJob, StartMetricAggregationJob } from './schemas.js';

export const createMetricAggregationJobExample: NewMetricAggregationJob = {
	pipelineId: 'pipeline-12345',
	timeRange: {
		to: '2022-02-02',
		from: '2022-01-02',
	}
};

export const metricAggregationJobExample: MetricAggregationJob = {
	id: '11111',
	pipelineId: 'pipeline-12345',
	groupContextId: '/test',
	timeRange: {
		to: '2022-02-02',
		from: '2022-01-02',
	},
	status: 'pending',
	groupsQueue: [{
		order: 1,
		group: 'group-one'
	}],
	metricQueue: [
		{
			order: 1,
			metric: 'metric-one'
		},
		{
			order: 2,
			metric: 'metric-two'
		}]
};

export const metricAggregationTaskListExamples: MetricAggregationJobList = {
	jobs: [metricAggregationJobExample],
	pagination: {
		lastEvaluatedToken: '12345'
	}
};

export const startMetricAggregationJobExample: StartMetricAggregationJob = {
	to: '2022-02-02',
	from: '2022-01-02',
};
