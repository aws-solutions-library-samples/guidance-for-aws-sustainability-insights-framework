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
import { commonHeaders, apiVersion100, FastifyTypebox, forbiddenResponse, notFoundResponse, id } from '@sif/resource-api-base';
import { resource } from './schema.js';

export default function getResourceRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'GET',
		url: '/resources/:id',
		schema: {
			description: `Retrieve details of a resource

Permissions:
- Only platform administrator may retrieve details of a resource.`,
			tags: ['Platform Resource'],
			operationId: 'get',
			params: Type.Object({
				id
			}),
			headers: commonHeaders,
			response: {
				200: {
					description: 'Success.',
					...resource,
					'x-examples': {
						'Existing resource': {
							summary: 'Existing resource details.',
							value: {
								id: 'aurora-cluster',
								status: 'available'
							}
						}
					}
				},
				403: forbiddenResponse,
				404: notFoundResponse
			}
		},
		constraints: {
			version: apiVersion100
		},

		handler: async (request, reply) => {
			// DI
			const svc = fastify.diContainer.resolve('resourceService');
			// do the work...
			const { id } = request.params;
			const resource = await svc.get(id);
			return reply.status(200).send(resource); // nosemgrep
		}
	});

	done();
}
