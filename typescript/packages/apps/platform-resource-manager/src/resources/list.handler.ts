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

import { commonHeaders, apiVersion100, FastifyTypebox, forbiddenResponse, notFoundResponse } from '@sif/resource-api-base';
import { resourceList } from './schema.js';

export default function listResourcesRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'GET',
		url: '/resources',
		schema: {
			description: `Retrieve list of resource details.

Permissions:
- Only platform administrator may retrieve details of a resource.`,
			tags: ['Platform Resource'],
			operationId: 'list',
			headers: commonHeaders,
			response: {
				200: {
					description: 'Success.',
					...resourceList,
					'x-examples': {
						'Existing resource list': {
							summary: 'Existing resource details.',
							value: [{
								id: 'aurora-cluster',
								status: 'available'
							}]
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

		handler: async (_request, reply) => {
			const svc = fastify.diContainer.resolve('resourceService');
			const resourceList = await svc.list();
			return reply.status(200).send({ resources: resourceList }); // nosemgrep
		}
	});

	done();
}
