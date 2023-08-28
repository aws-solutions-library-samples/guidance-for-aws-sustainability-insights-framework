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

import { commonHeaders, apiVersion100, FastifyTypebox, forbiddenResponse, badRequestResponse, conflictResponse } from '@sif/resource-api-base';
import { editUserRequestBody, encodedEmailParam, userResource } from './schemas.js';

export default function updateUserRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'PATCH',
		url: '/users/:email',

		schema: {
			description: `Updates an existing user.

Permissions:
- \`reader\` and above may update their own password
- \`admin\` roles may update any user (but their own) status where they are themselves an \`admin\` of all the groups the user is a member of

`,
			tags: ['Users'],
			params: Type.Object({
				email: encodedEmailParam,
			}),
			headers: commonHeaders,
			body: {
				...Type.Ref(editUserRequestBody),
				'x-examples': {
					'User deactivated': {
						summary: 'Administrator deactivates a user.',
						value: {
							state: 'inactive',
						},
					},
					'Change password': {
						summary: 'User changes password.',
						value: {
							password: 'my_new_password',
						},
					},
				},
			},
			response: {
				204: {
					description: 'Success.',
					...userResource,
				},
				400: badRequestResponse,
				403: forbiddenResponse,
				409: conflictResponse,
			},
			'x-security-scopes': atLeastReader,
		},
		constraints: {
			version: apiVersion100,
		},

		handler: async (request, reply) => {
			// DI
			const svc = fastify.diContainer.resolve('userService');

			const { email } = request.params;
			await svc.update(request.authz, email, request.body);

			await reply.status(204).send(); // nosemgrep
		},
	});

	done();
}
