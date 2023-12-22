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
import { badRequestResponse, commonHeaders, apiVersion100, FastifyTypebox, forbiddenResponse, noBodyResponse } from '@sif/resource-api-base';
import { actionResource } from './schema.js';

export default function createActionRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'POST',
		url: '/actions',

		schema: {
			description: `Creates a new action to be applied to the platform resource.

Permissions:
- Only platform administrator may create new action for resource.
`,
			tags: ['Platform Resource Action'],
			headers: commonHeaders,
			body: {
				...Type.Ref(actionResource),
				'x-examples': {
					'New action resource': {
						summary: 'Starts the aurora cluster.',
						value: {
							id: 'aurora-cluster',
							action: 'START'
						}
					}
				}
			},
			response: {
				201: noBodyResponse,
				400: badRequestResponse,
				403: forbiddenResponse
			}
		},
		constraints: {
			version: apiVersion100
		},

		handler: async (request, reply) => {
			const actionService = fastify.diContainer.resolve('actionService');
			await actionService.create(request.body);
			return reply.status(200).send(); // nosemgrep
		}
	});

	done();
}
