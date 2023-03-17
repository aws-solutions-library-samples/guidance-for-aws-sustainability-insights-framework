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

import { commonHeaders, conflictResponse, apiVersion100, FastifyTypebox, noBodyResponse, forbiddenResponse, notFoundResponse } from '@sif/resource-api-base';

import { encodedGroupIdParam } from './schemas.js';

export default function deleteGroupRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'DELETE',
		url: '/groups/:groupId',

		schema: {
			description: `Deletes an existing group.

Warning! This is an irreversible action and will cause permanent data loss!

For protection:
- any users granted access to the group directly must have been deleted.
- only groups that have been set to \`disabled\` may be deleted.

Permissions:
- Only \`admins\` of the group in context may delete a group.
`,
			tags: ['Groups'],
			operationId: 'delete',
			params: Type.Object({
				groupId: encodedGroupIdParam,
			}),
			headers: commonHeaders,
			response: {
				204: noBodyResponse,
				403: forbiddenResponse,
				404: notFoundResponse,
				409: {
					description: 'Deletion not allowed as it still contains users.',
					...conflictResponse,
				},
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
			await svc.delete(request.authz, groupId);
			return reply.status(204).send(); // nosemgrep
		},
	});

	done();
}
