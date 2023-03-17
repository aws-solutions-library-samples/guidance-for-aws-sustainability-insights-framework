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

import { commonHeaders, forbiddenResponse, noBodyResponse, notFoundResponse, apiVersion100, FastifyTypebox, id } from '@sif/resource-api-base';

export default function deleteActivityTaskRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'DELETE',
		url: '/activityTasks/:id',

		schema: {
			summary: 'Deletes an activity task',
			description: `Deletes an activity task.

Permissions:
- Only \`admin\` and above may delete activity tasks.
`,
			tags: ['Activity Tasks'],
			operationId: 'deleteActivityTask',
			headers: commonHeaders,
			params: Type.Object({
				id,
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
			const svc = fastify.diContainer.resolve('activityTaskService');
			const { id } = request.params;
			await svc.delete(request.authz, id);
			return reply.status(204).send();
		},
	});

	done();
}
