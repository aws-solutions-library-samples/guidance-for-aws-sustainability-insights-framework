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

import { Type } from '@sinclair/typebox';
import { atLeastReader } from '@sif/authz';

import { includeChildGroupsQS, includeParentGroupsQS, commonHeaders, apiVersion100, FastifyTypebox, countPaginationQS, tagFilterQS, fromTokenPaginationQS } from '@sif/resource-api-base';
import { UserList, usersList } from './schemas.js';

export default function listUsersRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'GET',
		url: '/users',

		schema: {
			description: `Lists all users.

Permissions
- \`reader\` and above for the group in context.
`,
			tags: ['Users'],
			querystring: Type.Object({
				count: countPaginationQS,
				fromToken: fromTokenPaginationQS,
				tags: tagFilterQS,
				includeParentGroups: includeParentGroupsQS,
				includeChildGroups: includeChildGroupsQS,
			}),
			headers: commonHeaders,
			response: {
				200: {
					description: 'Success.',
					...usersList,
					'x-examples': {
						'List of users': {
							summary: 'Paginated list of users.',
							value: {
								users: [
									{
										email: 'someone@somewhere.com',
										state: 'invited',
										groups: {
											'/usa/northwest': 'admin',
											'/usa/southwest': 'contributor',
										},
										createdAt: '2022-08-10T23:55:20.322Z',
										updatedAt: '2022-08-11T17:45:18.221Z',
									},
									{
										email: 'someoneelse@somewhere.com',
										state: 'active',
										groups: {
											'/usa/northwest': 'reader',
										},
										createdAt: '2022-08-10T23:55:20.322Z',
										updatedAt: '2022-08-11T17:45:18.221Z',
									},
								],
								pagination: {
									count: 2,
									lastEvaluated: {
										email: 'someoneelse@somewhere.com',
									},
								},
							},
						},
					},
				},
			},
			'x-security-scopes': atLeastReader,
		},
		constraints: {
			version: apiVersion100,
		},

		handler: async (request, reply) => {
			const userService = fastify.diContainer.resolve('userService');
			const tagService = fastify.diContainer.resolve('tagService');

			const { count, fromToken, tags, includeParentGroups, includeChildGroups } = request.query;
			const [users, paginationKey] = await userService.list(request.authz, {
				count,
				exclusiveStart: { paginationToken: fromToken },
				tags: tagService.expandTagsQS(tags),
				includeParentGroups,
				includeChildGroups,
			});

			const response: UserList = { users };
			if (count || paginationKey) {
				response.pagination = {};
				if (paginationKey) {
					response.pagination.lastEvaluatedToken = paginationKey.paginationToken;
				}
			}

			fastify.log.debug(`list.handler> exit:${JSON.stringify(response)}`);
			await reply.status(200).send(response); // nosemgrep
		},
	});

	done();
}
