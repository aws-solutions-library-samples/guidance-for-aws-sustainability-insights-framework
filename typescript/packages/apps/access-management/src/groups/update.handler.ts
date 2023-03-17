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

import { commonHeaders, apiVersion100, FastifyTypebox, forbiddenResponse, badRequestResponse } from '@sif/resource-api-base';
import { editGroupRequestBody, encodedGroupIdParam, groupResource } from './schemas.js';

export default function updateGroupRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'PATCH',
		url: '/groups/:groupId',

		schema: {
			description: `Updates an sub group.

Permissions:
- Only \`admins\` of the group may update.`,
			tags: ['Groups'],
			params: Type.Object({
				groupId: encodedGroupIdParam,
			}),
			headers: commonHeaders,
			body: {
				...Type.Ref(editGroupRequestBody),
				'x-examples': {
					'Update group': {
						summary: 'Update group.',
						value: {
							description: 'North west region',
							applicationConfiguration: {
								pipelineProcessor: {
									chunkSize: 2,
								},
							},
						},
					},
				},
			},
			response: {
				200: {
					description: 'Success.',
					...groupResource,
				},
				400: badRequestResponse,
				403: forbiddenResponse,
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
			const { groupId } = request.params;
			const saved = await svc.update(request.authz, groupId, request.body);
			return reply.status(200).send(saved); // nosemgrep
		},
	});

	done();
}
