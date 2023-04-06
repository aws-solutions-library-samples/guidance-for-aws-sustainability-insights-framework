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
import { atLeastContributor } from '@sif/authz';
import { apiVersion100, FastifyTypebox, badRequestResponse, forbiddenResponse, id, commonHeaders } from '@sif/resource-api-base';
import { connector, connectorUpdateParams } from '../schemas.js';
import { connectorUpdateParamsExample } from '../examples.js';

export default function updateConnectorRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'PATCH',
		url: '/connectors/:connectorId',
		schema: {
			description: `Updates an existing connector.`,
			tags: ['Pipeline Connectors'],
			headers: commonHeaders,
			operationId: 'update',
			params: Type.Object({
				connectorId: id,
			}),
			body: {
				...Type.Ref(connectorUpdateParams),
				'x-examples': {
					'Update Connector name and parameters': {
						summary: 'Update Connector',
						value: { ...connectorUpdateParamsExample },
					}
				},
			},
			response: {
				200: {
					description: 'Success.',
					...Type.Ref(connector),
				},
				400: {
					...badRequestResponse,
				},
				403: forbiddenResponse,
			},
			'x-security-scopes': atLeastContributor,
		},
		constraints: {
			version: apiVersion100,
		},

		handler: async (request, reply) => {
			const svc = fastify.diContainer.resolve('connectorService');

			const { connectorId } = request.params;

			const connector = await svc.update(request.authz, connectorId, request.body);
			await reply.status(200).send(connector); // nosemgrep
		},
	});

	done();
}
