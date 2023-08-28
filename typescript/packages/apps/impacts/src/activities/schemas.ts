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
import { Static, Type } from '@sinclair/typebox';
import { id, createdBy, createdAt, updatedBy, updatedAt, activeAt, attributes, tags, count, state, groups, paginationToken } from '@sif/resource-api-base';
import { impactMap } from '../impacts/schemas.js';

/**
 * Resource specific path parameters
 */
export const versionParam = Type.Optional(Type.Number({ description: 'specify the version number' }));

/**
 * Resource specific query string parameters
 */

/**
 * activity specific resource attributes
 */

export const name = Type.String({ description: 'name of the entity' });
export const description = Type.String({ description: 'description of the entity' });

const version = Type.Number({ description: 'Version' });

/**
 * API specific resources
 */

export const activityResource = Type.Object(
	{
		id,
		name,
		description: Type.Optional(description),
		attributes: Type.Optional(attributes),
		version,
		state,
		impacts: Type.Optional(impactMap),
		groups,
		tags: Type.Optional(Type.Ref(tags)),
		createdBy: createdBy,
		createdAt: createdAt,
		updatedBy: Type.Optional(updatedBy),
		updatedAt: Type.Optional(updatedAt),
		activeAt: Type.Optional(activeAt)
	},
	{
		$id: 'activityResource',
	}
);

export const activityRequestBody = Type.Object(
	{
		name: Type.Optional(name),
		id: Type.Optional(id),
		description: Type.Optional(description),
		attributes: Type.Optional(attributes),
		state: Type.Optional(state),
		impacts: Type.Optional(impactMap),
		tags: Type.Optional(Type.Ref(tags)),
		activeAt: Type.Optional(activeAt)
	},
	{
		$id: 'activityRequestBody',
	}
);

export const newActivityRequestBody = Type.Object(
	{
		name,
		description: Type.Optional(description),
		attributes: Type.Optional(attributes),
		state: Type.Optional(state),
		impacts: Type.Optional(impactMap),
		tags: Type.Optional(Type.Ref(tags)),
		activeAt: Type.Optional(activeAt)
	},
	{
		$id: 'newActivityRequestBody',
	}
);

export const editActivityRequestBody = Type.Object(
	{
		description: Type.Optional(description),
		attributes: Type.Optional(attributes),
		state: Type.Optional(state),
		impacts: Type.Optional(impactMap),
		tags: Type.Optional(Type.Ref(tags)),
		activeAt: Type.Optional(activeAt)
	},
	{
		$id: 'editActivityRequestBody',
	}
);

export const activityList = Type.Object(
	{
		activities: Type.Array(Type.Ref(activityResource)),
		pagination: Type.Optional(
			Type.Object({
				count: Type.Optional(count),
				lastEvaluatedToken: Type.Optional(paginationToken),
			})
		),
	},
	{
		$id: 'activityList',
	}
);

export const activityVersionsList = Type.Object(
	{
		activities: Type.Array(Type.Ref(activityResource)),
		pagination: Type.Optional(
			Type.Object({
				lastEvaluatedVersion: Type.Optional(version),
			})
		),
	},
	{ $id: 'activityVersion_List' }
);

export type ActivityId = Static<typeof id>;

export interface ActivityListPaginationKey {
	activityId: string;
}

export type Activity = Static<typeof activityResource>;
export type NewActivity = Static<typeof newActivityRequestBody>;
export type EditActivity = Static<typeof editActivityRequestBody>;
export type ActivityList = Static<typeof activityList>;
export type ActivityVersionsList = Static<typeof activityVersionsList>;
