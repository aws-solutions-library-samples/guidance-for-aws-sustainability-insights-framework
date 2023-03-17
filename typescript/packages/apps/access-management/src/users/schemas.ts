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

import { Static, TOptional, TString, Type } from '@sinclair/typebox';

import { paginationToken, tags, stringEnum, createdBy, createdAt, updatedBy, updatedAt } from '@sif/resource-api-base';

/**
 * User specific path parameters
 */
export const encodedEmailParam: TString = Type.String({
	description: 'URL encoded email address of user.',
	format: 'email',
});

/**
 * User specific query string params
 */
export const fromEmailPaginationQS: TOptional<TString> = Type.Optional(Type.String({ description: 'Email to paginate from (exclusive).' }));

/**
 * User specific resource attributes
 */
const email: TString = Type.String({
	description: 'Email address of user. Also used as the username to sign in.',
	format: 'email',
});
// eslint-disable-next-line @rushstack/typedef-var
export const userGroupRole = stringEnum(['admin', 'contributor', 'reader'], 'User role');

const groups = Type.Record(Type.String(), userGroupRole, { description: 'Access groups along with assigned role granted to the user' });

const userState = stringEnum(['invited', 'active', 'disabled'], 'User state');

const defaultGroup = Type.String({ description: 'The default group the user will be logged into' });

/**
 * User specific resources
 */

// eslint-disable-next-line @rushstack/typedef-var
export const newUserRequestBody = Type.Object(
	{
		email,
		role: userGroupRole,
		password: Type.Optional(Type.String({ description: 'Temporary password' })),
		tags: Type.Optional(Type.Ref(tags)),
		defaultGroup: Type.Optional(defaultGroup),
	},
	{ $id: 'newUserRequestBody' }
);
export type NewUser = Static<typeof newUserRequestBody>;

// eslint-disable-next-line @rushstack/typedef-var
export const editUserRequestBody = Type.Object(
	{
		password: Type.Optional(Type.String({ description: 'The new password' })),
		state: Type.Optional(userState),
		tags: Type.Optional(Type.Ref(tags)),
		defaultGroup: Type.Optional(defaultGroup),
	},
	{ $id: 'editUserRequestBody' }
);
export type EditUser = Static<typeof editUserRequestBody>;

// eslint-disable-next-line @rushstack/typedef-var
export const userResource = Type.Object(
	{
		email,
		state: Type.Optional(userState),
		groups: Type.Optional(groups),
		tags: Type.Optional(Type.Ref(tags)),
		defaultGroup: Type.Optional(defaultGroup),
		createdAt: Type.Optional(createdAt),
		createdBy: Type.Optional(createdBy),
		updatedAt: Type.Optional(updatedAt),
		updatedBy: Type.Optional(updatedBy),
	},
	{ $id: 'userResource' }
);
export type User = Static<typeof userResource>;

// eslint-disable-next-line @rushstack/typedef-var
export const usersList = Type.Object(
	{
		users: Type.Array(Type.Ref(userResource)),
		pagination: Type.Optional(
			Type.Object({
				lastEvaluatedToken: Type.Optional(paginationToken),
			})
		),
	},
	{ $id: 'usersList' }
);
export type UserList = Static<typeof usersList>;
export type Groups = Static<typeof groups>;
