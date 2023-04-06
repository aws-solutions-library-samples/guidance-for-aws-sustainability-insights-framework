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
import { notFoundResponse, apiVersion100, FastifyTypebox, id, commonHeaders } from '@sif/resource-api-base';

import { connector } from '../schemas.js';
import { connectorExample } from '../examples.js';

export default function getConnectorRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'GET',
		url: '/connectors/:connectorId',

		schema: {
			description: `Retrieve details of an existing connector.`,
			tags: ['Pipeline connectors'],
			headers: commonHeaders,
			params: Type.Object({
				connectorId: id,
			}),
			response: {
				200: {
					description: 'Success.',
					...Type.Ref(connector),
					'x-examples': {
						'Existing connector': {
							summary: 'Existing connector details.',
							value: { ...connectorExample },
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

		handler: async (request, reply) => {
			const svc = fastify.diContainer.resolve('connectorService');
			const { connectorId } = request.params;
			const connector = await svc.get(request.authz, connectorId);
			return reply.status(200).send(connector); // nosemgrep
		},
	});

	done();
}
