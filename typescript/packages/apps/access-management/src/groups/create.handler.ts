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
import { atLeastAdmin } from '@sif/authz';

import { badRequestResponse, commonHeaders, conflictResponse, apiVersion100, FastifyTypebox, forbiddenResponse } from '@sif/resource-api-base';
import { groupResource, newGroupRequestBody } from './schemas.js';

export default function createGroupRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'POST',
		url: '/groups',

		schema: {
			description: `Creates a new group.

Permissions:
- Only \`admins\` of the group in context may create new groups.
`,
			tags: ['Groups'],
			headers: commonHeaders,
			body: {
				...Type.Ref(newGroupRequestBody),
				'x-examples': {
					'New top level group': {
						summary: 'Creates the group `USA` as a child group.',
						value: {
							name: 'USA',
							configuration: {
								pipelineProcessor: {
									chunkSize: 2,
								},
							},
						},
					},
				},
			},
			response: {
				201: {
					description: 'Success.',
					...groupResource,
					'x-examples': {
						'New group': {
							summary: 'New group created successfully.',
							value: {
								id: '/usa/northwest',
								name: 'Northwest',
								createdBy: 'someone@somewhere.com',
								createdAt: '2022-08-10T23:55:20.322Z',
								configuration: {
									pipelineProcessor: {
										chunkSize: 2,
									},
								},
							},
						},
					},
				},
				400: badRequestResponse,
				403: forbiddenResponse,
				409: conflictResponse,
			},
			'x-security-scopes': atLeastAdmin,
		},
		constraints: {
			version: apiVersion100,
		},

		handler: async (request, reply) => {
			// DI
			const svc = fastify.diContainer.resolve('groupModuleService');
			// do the work...
			const saved = await svc.create(request.authz, request.body);
			return reply.header('x-groupId', saved.id).status(201).send(saved); // nosemgrep
		},
	});

	done();
}
