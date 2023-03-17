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

import { commonHeaders, apiVersion100, FastifyTypebox, notFoundResponse } from '@sif/resource-api-base';
import { encodedEmailParam, userResource } from './schemas.js';

export default function getUserRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'GET',
		url: '/users/:email',

		schema: {
			description: `Retrieve details of an existing user.

Permissions:
- \`reader\` and above for the group in context.
`,
			tags: ['Users'],
			params: Type.Object({
				email: encodedEmailParam,
			}),
			headers: commonHeaders,
			response: {
				200: {
					description: 'Success.',
					...userResource,
					'x-examples': {
						'Existing user': {
							summary: "Existing user's details.",
							value: {
								email: 'someone@somewhere.com',
								state: 'invited',
								groups: {
									'/usa/northwest': 'admin',
									'/usa/southwest': 'contributor',
								},
								createdAt: '2022-08-10T23:55:20.322Z',
								updatedAt: '2022-08-11T17:45:18.221Z',
							},
						},
					},
				},
				404: notFoundResponse,
			},
			'x-security-scopes': atLeastReader,
		},
		constraints: {
			version: apiVersion100,
		},

		handler: async (request, _reply) => {
			const { email } = request.params;
			const svc = fastify.diContainer.resolve('userService');
			const user = await svc.get(request.authz, email);
			return user;
		},
	});

	done();
}
