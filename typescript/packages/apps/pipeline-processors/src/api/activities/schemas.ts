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

/**
 * Activity specific path parameters
 */

/**
 * Activity specific query string parameters
 */
export const pipelineIdQS = Type.Optional(
	Type.String({
		description: 'Filters processed activities based on a specific pipeline.',
	})
);
export const executionIdQS = Type.Optional(
	Type.String({
		description: 'Filters processed activities based on a specific pipeline execution.',
	})
);
export const metricQS = Type.Optional(
	Type.String({
		description: 'Filters processed activities that contributed to a specific metric.',
	})
);
export const dateFromQS = Type.Optional(
	Type.String({
		description: 'Filters processed activities that have a ISO8601 timestamp to be greater than or equal to this date. i.e. 2023-01-26T17:38:05.205Z',
	})
);
export const dateToQS = Type.Optional(
	Type.String({
		description: 'Filters processed activities that have a ISO8601 timestamp to be lesser than or equal to this date.  i.e. 2023-01-26T17:38:05.205Z',
	})
);
export const dateQS = Type.Optional(
	Type.String({
		description: 'Filters processed activities that have a ISO8601 timestamp to be exact match with a date.  i.e. 2023-01-26T17:38:05.205Z',
	})
);

export const attributesQS = Type.Optional(
	Type.String({
		description: 'Filters processed activities based on attributes in the format of `key1:value1[,key2:value2]`.',
	})
);

export const showAggregateQS = Type.Optional(
	Type.Boolean({
		description: 'Show the aggregated value of activities.',
	})
);

export const uniqueKeyAttributesQS = Type.Optional(
	Type.String({
		description: 'This parameter is required for viewing historical activities. The uniquely specified outputs of the pipeline should be provided for showHistory=true parameter `key1:value1[,key2:value2]`.',
	})
);

export const showHistoryQS = Type.Optional(
	Type.Boolean({
		description: 'Retrieves full history of an activity',
	})
);

/**
 * Activity specific resources
 */

export const activityResource = Type.Record(Type.String({ description: 'Column.' }), Type.Union([Type.String(), Type.Number(), Type.Boolean(), Type.Null()], { description: 'Value`.' }), {
	description: 'Processed activities.',
	$id: 'activityResource',
});
export type Activity = Static<typeof activityResource>;

export const activitiesList = Type.Object(
	{
		activities: Type.Array(Type.Ref(activityResource)),
		pagination: Type.Optional(
			Type.Object({
				lastEvaluatedToken: Type.Optional(Type.Number({ description: 'Token used to paginate to the next page of search result.' })),
			})
		),
	},
	{ $id: 'activitiesList' }
);
export type ActivitiesList = Static<typeof activitiesList>;

export const activityVersionsList = Type.Object(
	{
		activities: Type.Array(Type.Ref(activityResource)),
		pagination: Type.Optional(
			Type.Object({
				lastEvaluatedToken: Type.Optional(Type.Number({ description: 'last evaluated token of the activities to paginate from' })),
			})
		),
	},
	{ $id: 'activityVersionsList' }
);
export type ActivityVersionsList = Static<typeof activityVersionsList>;

export const versionParam = Type.Optional(Type.String({ description: 'specify the version number or latest to retrieve latest data.', default: 'latest' }));

