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

import { commonHeaders, apiVersion100, FastifyTypebox, forbiddenResponse, badRequestResponse, conflictResponse } from '@sif/resource-api-base';
import { newUserRequestBody, userResource } from './schemas.js';

export default function grantUserRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'POST',
		url: '/users',

		schema: {
			description: `If the email is previously unknown to the platform, the user is invited to the platform.

      The user if granted access to the group in context.

Permissions:
- Only \`admin\` may grant users access.

`,
			tags: ['Users'],
			headers: commonHeaders,
			body: {
				...Type.Ref(newUserRequestBody),
				'x-examples': {
					'New user': {
						summary: 'Register and invite new user.',
						description: 'Register new user within Cognito, and send an invitation to activate and verify email.',
						value: {
							email: 'someone@somewhere.com',
							role: 'contributor',
						},
					},
					'Temporary password': {
						summary: "Optionally set the user's temporary password.",
						value: {
							email: 'someone@somewhere.com',
							role: 'contributor',
							password: 'zo3oOX2#C8h2',
						},
					},
				},
			},
			response: {
				201: {
					description: 'Success.',
					...userResource,
					'x-examples': {
						'New user': {
							summary: 'New user created successfully.',
							description: 'New user registered within Cognito, along with an invitation sent to activate user and verify email.',
							value: {
								email: 'someone@somewhere.com',
								state: 'invited',
								groups: {
									'/usa/southwest': 'contributor',
								},
								createdAt: '2022-08-10T23:55:20.322Z',
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
			const svc = fastify.diContainer.resolve('userService');
			// do the work...
			const saved = await svc.grant(request.authz, request.body);
			return reply.status(201).send(saved); // nosemgrep
		},
	});

	done();
}
