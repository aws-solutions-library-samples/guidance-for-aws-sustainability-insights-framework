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

import { commonHeaders, apiVersion100, FastifyTypebox, forbiddenResponse, notFoundResponse } from '@sif/resource-api-base';

import { encodedGroupIdParam, groupResource, showConfigurationSource } from './schemas.js';

export default function getGroupRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'GET',
		url: '/groups/:groupId',

		schema: {
			description: `Retrieve details of an existing group.

Permissions:
- Only members of the group in context may retrieve details of a group.`,
			tags: ['Groups'],
			operationId: 'get',
			params: Type.Object({
				groupId: encodedGroupIdParam,
			}),
			querystring: Type.Object({
				showConfigurationSource: showConfigurationSource,
			}),
			headers: commonHeaders,
			response: {
				200: {
					description: 'Success.',
					...groupResource,
					'x-examples': {
						'Existing group': {
							summary: "Existing group's details.",
							value: {
								id: '/usa/northwest',
								name: 'Northwest',
								description: 'Northwest region.',
								state: 'active',
								createdAt: '2022-08-10T23:55:20.322Z',
								createdBy: 'someone@somewhere.com',
								updatedAt: '2022-08-11T17:45:18.221Z',
								updatedBy: 'someoneelse@somewhere.com',
								configuration: {
									pipelineProcessor: {
										chunkSize: 2,
									},
								},
							},
						},
					},
				},
				403: forbiddenResponse,
				404: notFoundResponse,
			},
			'x-security-scopes': atLeastReader,
		},
		constraints: {
			version: apiVersion100,
		},

		handler: async (request, reply) => {
			// DI
			const svc = fastify.diContainer.resolve('groupModuleService');
			// do the work...
			const { groupId } = request.params;
			const group = await svc.get(request.authz, groupId, request.query.showConfigurationSource);
			return reply.status(200).send(group); // nosemgrep
		},
	});

	done();
}
