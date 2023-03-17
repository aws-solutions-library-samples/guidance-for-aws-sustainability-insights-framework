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

/* eslint-disable @rushstack/typedef-var */
import { Static, Type, TNumber } from '@sinclair/typebox';
import { attributes, tags, state, groups, id, createdBy, createdAt, updatedBy, updatedAt, count, stringEnum, paginationToken } from '@sif/resource-api-base';

/**
 * resource specific path parameters
 */

/**
 * resource specific query string parameters
 */

const fromMetricVersionPagination = Type.Optional(Type.Number({ description: 'Last evaluated version.' }));

/**
 * resource specific resource attributes
 */
export const version: TNumber = Type.Number({
	description: 'version number of the Metric. The Metric version is incremented whenever there is an update to the Metric.',
});

export const name = Type.String({
	description: 'Name of Metric. How the Metric is referenced from within a transform.',
});
const summary = Type.String({
	description: 'Concise summary of the Metric.',
});
const description = Type.String({
	description: 'Expanded description of the Metric.',
});
const aggregationType = stringEnum(['min', 'max', 'count', 'sum', 'mean'], 'Aggregation type to be performed for the Metric.');

const outputMetrics = Type.Array(Type.String({ description: 'Metric name' }), {
	description: "A list of Metric's that this Metric will contribute to.",
});
const inputMetrics = Type.Array(Type.String({ description: 'Metric name' }), {
	description: "The existing Metric's configured to contribute to this Metric.",
});
const inputPipelines = Type.Array(
	Type.Object(
		{
			pipelineId: Type.String({ description: 'Pipeline ID.' }),
			output: Type.String({ description: 'Name of output column aggregated.' }),
		},
		{ description: 'A pipeline transform configured to contribute to this Metric.' }
	),
	{
		description: 'Pipeline transforms configured to contribute to this Metric.',
	}
);

/**
 * resources
 */
export const newMetricRequestBody = Type.Object(
	{
		name,
		summary,
		description: Type.Optional(description),
		aggregationType,
		tags: Type.Optional(tags),
		attributes: Type.Optional(attributes),
		outputMetrics: Type.Optional(outputMetrics),
	},
	{ $id: 'newMetricRequestBody' }
);

export const editMetricRequestBody = Type.Object(
	{
		summary: Type.Optional(summary),
		description: Type.Optional(description),
		aggregationType: Type.Optional(aggregationType),
		tags: Type.Optional(tags),
		state: Type.Optional(state),
		attributes: Type.Optional(attributes),
		outputMetrics: Type.Optional(outputMetrics),
	},
	{ $id: 'editMetricRequestBody' }
);

export const metricResource = Type.Object(
	{
		id,
		name,
		summary,
		description: Type.Optional(description),
		aggregationType,
		tags: Type.Optional(tags),
		state,
		outputMetrics: Type.Optional(outputMetrics),
		inputMetrics: Type.Optional(inputMetrics),
		inputPipelines: Type.Optional(inputPipelines),
		attributes: Type.Optional(attributes),
		groups,
		version,
		createdAt,
		createdBy,
		updatedAt: Type.Optional(updatedAt),
		updatedBy: Type.Optional(updatedBy),
	},
	{ $id: 'metricResource' }
);

export const metricList = Type.Object(
	{
		metrics: Type.Array(metricResource),
		pagination: Type.Optional(
			Type.Object({
				count: Type.Optional(count),
				lastEvaluatedToken: Type.Optional(paginationToken),
			})
		),
	},
	{ $id: 'metricList' }
);

export const metricVersionList = Type.Object(
	{
		metrics: Type.Array(metricResource),
		pagination: Type.Optional(
			Type.Object({
				count: Type.Optional(count),
				lastEvaluatedVersion: fromMetricVersionPagination,
			})
		),
	},
	{ $id: 'metricVersionList' }
);

export type AggregationType = Static<typeof aggregationType>;
export type NewMetric = Static<typeof newMetricRequestBody>;
export type EditMetric = Static<typeof editMetricRequestBody>;
export type Metric = Static<typeof metricResource>;
export type MetricsList = Static<typeof metricList>;
export type MetricVersionsList = Static<typeof metricVersionList>;
