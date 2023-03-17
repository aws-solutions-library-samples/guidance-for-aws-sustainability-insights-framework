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

import { commonHeaders, apiVersion100, FastifyTypebox, countPaginationQS, fromTokenPaginationQS, forbiddenResponse, tagFilterQS, includeParentGroupsQS, includeChildGroupsQS } from '@sif/resource-api-base';

import { GroupsList, groupsList } from './schemas.js';

export default function listGroupsRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'GET',
		url: '/groups',

		schema: {
			description: `Lists groups.

Permissions:
- Only members of the group in context may list its sub groups.`,
			tags: ['Groups'],
			headers: commonHeaders,
			querystring: Type.Object({
				count: countPaginationQS,
				fromToken: fromTokenPaginationQS,
				tags: tagFilterQS,
				includeParentGroups: includeParentGroupsQS,
				includeChildGroups: includeChildGroupsQS,
			}),
			response: {
				200: {
					description: 'Success.',
					...groupsList,
					'x-examples': {
						'List of groups': {
							summary: 'Paginated list of groups.',
							value: {
								groups: [
									{
										id: '/usa/northwest',
										name: 'Northwest',
										description: 'Northwest region',
										state: 'active',
										createdBy: 'someone@somewhere.com',
										createdAt: '2022-08-10T23:55:20.322Z',
									},
									{
										id: '/usa/southwest',
										name: 'Southwest',
										description: 'Southwest region',
										state: 'active',
										createdBy: 'someone@somewhere.com',
										createdAt: '2022-08-10T23:55:20.322Z',
										updatedBy: 'someoneelse@somewhere.com',
										updatedAt: '2022-08-11T17:45:18.221Z',
									},
								],
								pagination: {
									count: 2,
									lastEvaluated: {
										id: '/usa/southwest',
									},
								},
							},
						},
					},
				},
				403: forbiddenResponse,
			},
			'x-security-scopes': atLeastReader,
		},
		constraints: {
			version: apiVersion100,
		},

		handler: async (request, reply) => {
			// DI
			const groupModuleService = fastify.diContainer.resolve('groupModuleService');
			const tagService = fastify.diContainer.resolve('tagService');

			// parse request
			const { count, fromToken, tags, includeParentGroups, includeChildGroups } = request.query;

			const [groups, lastEvaluatedToken] = await groupModuleService.list(request.authz, {
				count,
				exclusiveStart: { paginationToken: fromToken },
				tags: tagService.expandTagsQS(tags),
				includeChildGroups,
				includeParentGroups,
			});

			const response: GroupsList = { groups };
			if (count || lastEvaluatedToken) {
				response.pagination = {};
				if (lastEvaluatedToken) {
					response.pagination.lastEvaluatedToken = lastEvaluatedToken.paginationToken;
				}
			}

			fastify.log.debug(`list.handler> exit:${JSON.stringify(response)}`);
			await reply.status(200).send(response); // nosemgrep
		},
	});

	done();
}
