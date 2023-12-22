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

import { Static, Type } from '@sinclair/typebox';
import { count, id, paginationToken } from '@sif/resource-api-base';
import { pipelineId } from '../executions/schemas.js';
import type { SecurityContext } from '@sif/authz';

const status = Type.Enum({
	pending: 'pending',
	running: 'running',
	succeeded: 'succeeded',
	failed: 'failed'
}, { description: 'Status of the metric aggregation job.' });


export const startMetricAggregationJob = Type.Object(
	{
		from: Type.Optional(Type.String({ description: 'Metric aggregation start date in ISO string format' })),
		to: Type.Optional(Type.String({ description: 'Metric aggregation end date in ISO string format' })),
	},
	{
		$id: 'startMetricAggregationJob',
	}
);

export const metricAggregationJob = Type.Object(
	{
		id,
		pipelineId,
		status,
		groupContextId: Type.String({ description: 'Security context id of the pending metric aggregation' }),
		metricQueue: Type.Array(Type.Object({
			order: Type.Number({ description: 'Metric processing order' }),
			metric: Type.String({ description: 'Name of the metric' })
		})),
		groupsQueue: Type.Array(Type.Object({
			order: Type.Number({ description: 'Group processing order' }),
			group: Type.String({ description: 'Name of the group' })
		})),
		timeRange: Type.Optional(Type.Object({
			to: Type.String({ description: 'To date of the pipeline executions to be aggregated into the metric' }),
			from: Type.String({ description: 'From date of the pipeline executions to be aggregated into the metric' }),
		}))
	},
	{ $id: 'metricAggregationJob' }
);

export const newMetricAggregationJob = Type.Object(
	{
		pipelineId,
		timeRange: Type.Object({
			to: Type.String({ description: 'To date of the pipeline executions to be aggregated into the metric in ISO string format' }),
			from: Type.String({ description: 'From date of the pipeline executions to be aggregated into the metric in ISO string format' }),
		})
	},
	{ $id: 'newMetricAggregationJob' }
);

export const metricAggregationJobList = Type.Object(
	{
		jobs: Type.Array(Type.Ref(metricAggregationJob)),
		pagination: Type.Optional(
			Type.Object({
				count: Type.Optional(count),
				lastEvaluatedToken: Type.Optional(paginationToken),
			})
		),
	},
	{ $id: 'metricAggregationJob_list' }
);

export type MetricAggregationJob = Static<typeof metricAggregationJob>;
export type NewMetricAggregationJob = Static<typeof newMetricAggregationJob>;
export type MetricAggregationJobList = Static<typeof metricAggregationJobList>;
export type StartMetricAggregationJob = Static<typeof startMetricAggregationJob>;
export type MetricAggregationJobStatus = Static<typeof status>;
export type MetricAggregationJobWithContext = MetricAggregationJob & { securityContext: SecurityContext }
export type MatchExistingJob = boolean;
