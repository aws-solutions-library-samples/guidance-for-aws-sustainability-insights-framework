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

import { Static, TString, Type } from '@sinclair/typebox';

import { configuration, configurationSource, tags, stringEnum, createdBy, createdAt, updatedBy, updatedAt, id, paginationToken } from '@sif/resource-api-base';
import { userGroupRole } from '../users/schemas.js';

/**
 * Calculation specific query string parameters
 */
export const showConfigurationSource = Type.Boolean({
	description: 'Show all the properties that the current group inherits/override from its parents',
	default: false,
});

/**
 * Group specific path parameters
 */
export const encodedGroupIdParam: TString = Type.String({
	description: 'URL encoded id of group.',
});

/**
 * Group specific resource attributes
 */
const name: TString = Type.String({
	description: 'Name of group. May only contain letters, numbers, and dashes (`-`). Note that the `id` of the group is comprised of the names of the group and all its parents which in total may not exceed 114 characters long.',
});
const description: TString = Type.String({ description: 'Description of group.' });

const state = stringEnum(['active', 'disabled'], 'Group state');
export type GroupState = Static<typeof state>;
/**
 * Group specific resources
 */

// eslint-disable-next-line @rushstack/typedef-var
export const newGroupRequestBody = Type.Object(
	{
		name: name,
		description: Type.Optional(description),
		tags: Type.Optional(Type.Ref(tags)),
		configuration: Type.Optional(Type.Ref(configuration)),
	},
	{ $id: 'newGroupRequestBody' }
);
export type NewGroup = Static<typeof newGroupRequestBody>;

// eslint-disable-next-line @rushstack/typedef-var
export const editGroupRequestBody = Type.Object(
	{
		description: Type.Optional(description),
		state: Type.Optional(state),
		tags: Type.Optional(Type.Ref(tags)),
		configuration: Type.Optional(Type.Ref(configuration)),
	},
	{ $id: 'editGroupRequestBody' }
);
export type EditGroup = Static<typeof editGroupRequestBody>;

// eslint-disable-next-line @rushstack/typedef-var
export const groupResource = Type.Object(
	{
		id: id,
		name: Type.Optional(name),
		description: Type.Optional(description),
		state: Type.Optional(state),
		tags: Type.Optional(Type.Ref(tags)),
		createdBy: Type.Optional(createdBy),
		createdAt: Type.Optional(createdAt),
		updatedBy: Type.Optional(updatedBy),
		updatedAt: Type.Optional(updatedAt),
		configuration: Type.Optional(Type.Ref(configuration)),
		configurationSource: Type.Optional(configurationSource),
	},
	{ $id: 'groupResource' }
);
export type Group = Static<typeof groupResource>;

// eslint-disable-next-line @rushstack/typedef-var
export const groupsList = Type.Object(
	{
		groups: Type.Array(Type.Ref(groupResource)),
		pagination: Type.Optional(
			Type.Object({
				lastEvaluatedToken: Type.Optional(paginationToken),
			})
		),
	},
	{ $id: 'groupsList' }
);
export type GroupsList = Static<typeof groupsList>;

// eslint-disable-next-line @rushstack/typedef-var
export const groupRole = Type.Object(
	{
		role: userGroupRole,
	},
	{ $id: 'groupRole' }
);
export type GroupRole = Static<typeof groupRole>;
