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

import { Kind, Static, Type } from '@sinclair/typebox';
import { stringEnum } from '@sif/resource-api-base';
import { TimeUnits } from './models.js';

/**
 * Metric specific path parameters
 */
export const version = Type.Union([Type.Integer(), Type.String()], { description: 'Version of the metric.' });

/**
 * Metric specific query string parameters
 */
export const nameQS = Type.String({
	description: 'Filters metrics based on a specific metric name.',
});
export const versionQS = Type.Optional(
	Type.Number({
		description: 'Filters metrics based on a specific version.',
	})
);
export const timeUnitQS = stringEnum(TimeUnits, 'Time unit to aggregate metric by.');

export const dateFromQS = Type.Optional(
	Type.String({
		description: 'Filters metrics that have a timestamp greater than or equal to this date.',
	})
);
export const dateToQS = Type.Optional(
	Type.String({
		description: 'Filters metrics that have a timestamp lesser than or equal to this date.',
	})
);
export const membersQS = Type.Boolean({
	description: 'If true, metrics are returned for the current groups members. If false (default) metrics are returned for the current group only.',
	default: false,
});

/**
 * Metric specific resource attributes
 */

/**
 * Metric specific resources
 */

export const metricResource = Type.Object(
	{
		date: Type.Unsafe<Date>({ [Kind]: 'Date' }),
		metricId: Type.String({ description: 'Id of metric.' }),
		name: Type.String({ description: 'Name of metric.' }),
		timeUnit: stringEnum(TimeUnits, 'Time unit the metric represents.'),
		day: Type.Optional(Type.Integer({ description: 'Day of year of the metric. Applies to `day` time unit only.' })),
		week: Type.Optional(Type.Integer({ description: 'Week of year of the metric. Applies to `week` time unit only.' })),
		month: Type.Optional(Type.Integer({ description: 'Month of year of the metric. Applies to `month` time unit only.' })),
		quarter: Type.Optional(Type.Integer({ description: 'Quarter of year of the metric. Applies to `quarter` time unit only.' })),
		year: Type.Integer({ description: 'Year of the metric.' }),
		hierarchyValue: Type.Optional(Type.Number({ description: 'Value of the metric for the current group hierarchy, combination of group and sub groups' })),
		groupValue: Type.Number({ description: 'Value of the metric for the current group.' }),
		subGroupsValue: Type.Number({ description: 'Value of the metric for the sub groups' }),
		version: version,
		groupId: Type.Optional(Type.String({ description: 'group of the metric' })),
	},
	{ $id: 'metricResource' }
);

export type Metric = Static<typeof metricResource>;

export const metricsList = Type.Object(
	{
		metrics: Type.Array(Type.Ref(metricResource)),
	},
	{ $id: 'metricsList' }
);
export type MetricsList = Static<typeof metricsList>;

export const metricVersionsList = Type.Object(
	{
		metrics: Type.Array(Type.Ref(metricResource)),
		pagination: Type.Optional(
			Type.Object({
				lastEvaluatedVersion: Type.Optional(version),
			})
		),
	},
	{ $id: 'metricVersionsList' }
);
export type MetricVersionsList = Static<typeof metricVersionsList>;
