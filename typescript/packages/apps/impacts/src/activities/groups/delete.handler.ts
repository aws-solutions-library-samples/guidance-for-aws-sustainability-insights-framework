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

import { apiVersion100, FastifyTypebox, commonHeaders, forbiddenResponse, groupId, id, noBodyResponse, notFoundResponse } from '@sif/resource-api-base';

export default function revokeActivityToGroupRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'DELETE',
		url: '/activities/:id/groups/:groupId',

		schema: {
			summary: 'Revoke access',
			description: `Revokes access of the activity to the provided group.

Permissions:
- \`admin\` and above of both the active group in context and the target group required.
`,
			tags: ['Activities'],
			operationId: 'revoke',
			headers: commonHeaders,
			params: Type.Object({
				id: id,
				groupId: groupId,
			}),
			response: {
				204: noBodyResponse,
				403: forbiddenResponse,
				404: notFoundResponse,
			},
			'x-security-scopes': atLeastAdmin,
		},
		constraints: {
			version: apiVersion100,
		},

		handler: async (request, reply) => {
			// DI
			const svc = fastify.diContainer.resolve('activityService');
			// do the work...
			const { id, groupId } = request.params;
			await svc.revoke(request.authz, id, groupId);
			return reply.status(204).send(); // nosemgrep
		},
	});

	done();
}
