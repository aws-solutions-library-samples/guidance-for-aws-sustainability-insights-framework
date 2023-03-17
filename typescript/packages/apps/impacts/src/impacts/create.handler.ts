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
import { badRequestResponse, conflictResponse, apiVersion100, FastifyTypebox, id, commonHeaders } from '@sif/resource-api-base';
import { atLeastContributor } from '@sif/authz';
import { newImpactRequestBody, impactResource, impactName } from './schemas.js';
import { createImpactRequestExample, impactResponseExample } from './examples.js';

export default function createImpactRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'PUT',
		url: '/activities/:id/impacts/:impactName',
		schema: {
			params: Type.Object({
				id,
				impactName,
			}),
			description: `Create a new Impact`,
			tags: ['Impacts'],
			headers: commonHeaders,
			operationId: 'createImpact',
			body: {
				...Type.Ref(newImpactRequestBody),
				'x-examples': {
					'New Impact': {
						value: createImpactRequestExample,
					},
				},
			},
			response: {
				201: {
					description: 'Success.',
					...Type.Ref(impactResource),
					'x-examples': {
						'New Impact': {
							value: impactResponseExample,
						},
					},
				},
				400: badRequestResponse,
				409: conflictResponse,
			},
			'x-security-scopes': atLeastContributor,
		},
		constraints: {
			version: apiVersion100,
		},

		handler: async (request, reply) => {
			const svc = fastify.diContainer.resolve('impactService');
			const { id, impactName } = request.params;
			const saved = await svc.create(request.authz, id, impactName, request.body);
			return reply.status(201).send(saved); // nosemgrep
		},
	});

	done();
}
