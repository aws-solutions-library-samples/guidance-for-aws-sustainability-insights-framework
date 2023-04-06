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

import { badRequestResponse, commonHeaders, conflictResponse, apiVersion100, FastifyTypebox, forbiddenResponse } from '@sif/resource-api-base';

import { connectorCreateParams, connector } from '../schemas.js';
import { connectorCreateParamsExample, connectorExample } from '../examples.js';

export default function createConnectorRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'POST',
		url: '/connectors',
		schema: {
			description: `Creates a new Pipeline Connector`,
			tags: ['Pipeline Connectors'],
			headers: commonHeaders,
			operationId: 'create',
			body: {
				...Type.Ref(connectorCreateParams),
				'x-examples': {
					'New Pipeline connector Configuration': {
						summary: 'Creates a new Pipeline connector configuration.',
						value: { ...connectorCreateParamsExample },
					}
				},
			},
			response: {
				202: {
					description: 'Success.',
					...Type.Ref(connector),
					'x-examples': {
						'New connector': {
							summary: 'New pipeline connector response',
							value: { ...connectorExample },
						},
					},
				},
				400: {
					...badRequestResponse
				},
				409: conflictResponse,
				403: forbiddenResponse,
			},
			'x-security-scopes': atLeastContributor,
		},
		constraints: {
			version: apiVersion100,
		},

		handler: async (request, reply) => {
			const svc = fastify.diContainer.resolve('connectorService');

			const connector = await svc.create(request.authz, request.body);
			await reply.status(201).send(connector); // nosemgrep
		},
	});

	done();
}
