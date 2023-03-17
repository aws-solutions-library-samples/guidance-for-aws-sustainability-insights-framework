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

import { badRequestResponse, forbiddenResponse, apiVersion100, FastifyTypebox, id } from '@sif/resource-api-base';

import { atLeastContributor } from '@sif/authz';
import { editComponentRequestBody, componentResource, componentKey } from './schemas.js';

export default function updateComponentRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'PATCH',
		url: '/activities/:id/impacts/:impactName/components/:componentKey',

		schema: {
			description: `Updates an existing activities component`,
			tags: ['Components'],
			params: Type.Object({
				id,
				impactName: componentKey,
				componentKey: componentKey,
			}),
			body: {
				...Type.Ref(editComponentRequestBody),
				'x-examples': {
					'Update component value': {
						summary: 'Update the component of an impact',
						value: {
							description: 'updated description text',
						},
					},
				},
			},
			response: {
				204: {
					description: 'Success.',
					...Type.Ref(componentResource),
				},
				400: badRequestResponse,
				403: forbiddenResponse,
			},
			'x-security-scopes': atLeastContributor,
		},
		constraints: {
			version: apiVersion100,
		},

		handler: async (_request, _reply) => {
			const svc = fastify.diContainer.resolve('componentService');
			const { id, impactName, componentKey } = _request.params;
			const component = await svc.update(_request.authz, id, impactName, componentKey, _request.body);
			return _reply.status(200).send(component); // nosemgrep
		},
	});

	done();
}
