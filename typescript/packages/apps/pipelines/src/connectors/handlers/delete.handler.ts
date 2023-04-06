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
import { commonHeaders, noBodyResponse, notFoundResponse, apiVersion100, FastifyTypebox, forbiddenResponse, id } from '@sif/resource-api-base';

export default function deleteconnectorRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'DELETE',
		url: '/connectors/:id',
		schema: {
			description: `Delete connector

Permissions:
- Only \`Admin\` may delete reference connector.
`,
			tags: ['Pipeline Connectors'],
			headers: commonHeaders,
			consumes: ['application/json'],
			params: Type.Object({
				id,
			}),
			response: {
				204: noBodyResponse,
				404: notFoundResponse,
				403: forbiddenResponse,
			},
			'x-security-scopes': atLeastAdmin,
		},
		constraints: {
			version: apiVersion100,
		},

		handler: async (request, reply) => {
			const svc = fastify.diContainer.resolve('connectorService');
			await svc.delete(request.authz, request.params.id);
			await reply.status(204).send();
		},
	});

	done();
}
