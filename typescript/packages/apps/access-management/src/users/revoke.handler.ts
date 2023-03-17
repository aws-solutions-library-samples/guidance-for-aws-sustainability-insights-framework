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

import { commonHeaders, apiVersion100, FastifyTypebox, forbiddenResponse, noBodyResponse, notFoundResponse } from '@sif/resource-api-base';
import { encodedEmailParam } from './schemas.js';

export default function revokeUserRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'DELETE',
		url: '/users/:email',

		schema: {
			description: `Revokes a user's access to a group.

      If the user has no more groups accessible the user is deleted.

Permissions:
- Only \`admins\` of the group in context may revoke a user.`,
			tags: ['Users'],
			params: Type.Object({
				email: encodedEmailParam,
			}),
			headers: commonHeaders,
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
			const svc = fastify.diContainer.resolve('userService');
			await svc.revoke(request.authz, request.params.email);
			return reply.status(204).send();
		},
	});

	done();
}
