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
import { badRequestResponse, conflictResponse, forbiddenResponse, apiVersion100, FastifyTypebox, id } from '@sif/resource-api-base';
import { atLeastContributor } from '@sif/authz';

import { componentKey, newComponentRequestBody, componentResource } from './schemas.js';
import { createComponentExample } from './example.js';

export default function createComponentRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'PUT',
		url: '/activities/:id/impacts/:impactName/components/:componentKey',
		schema: {
			description: `Creates a new activity impacts's component`,
			tags: ['Components'],
			params: Type.Object({
				id,
				impactName: componentKey,
				componentKey: componentKey,
			}),
			body: {
				...Type.Ref(newComponentRequestBody),
				'x-examples': {
					'Add new component to the impact': {
						summary: 'add new component to the impact',
						value: createComponentExample,
					},
				},
			},
			response: {
				201: {
					description: 'Success.',
					...Type.Ref(componentResource),
				},
				400: badRequestResponse,
				403: forbiddenResponse,
				409: conflictResponse,
			},
			'x-security-scopes': atLeastContributor,
		},
		constraints: {
			version: apiVersion100,
		},

		handler: async (request, reply) => {
			const svc = fastify.diContainer.resolve('componentService');
			const { id, impactName, componentKey } = request.params;
			const component = request.body;
			component.key = componentKey;
			const saved = await svc.create(request.authz, id, impactName, component);
			return reply.status(201).send(saved); // nosemgrep
		},
	});

	done();
}
