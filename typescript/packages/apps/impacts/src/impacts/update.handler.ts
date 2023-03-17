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
import { badRequestResponse, forbiddenResponse, apiVersion100, FastifyTypebox, id, commonHeaders } from '@sif/resource-api-base';
import { atLeastContributor } from '@sif/authz';
import { editImpactRequestBody, impactResource, impactName } from './schemas.js';

export default function updateImpactRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'PATCH',
		url: '/activities/:id/impacts/:impactName',

		schema: {
			description: `Updates an existing activities impact`,
			tags: ['Impacts'],
			operationId: 'updateImpacts',
			headers: commonHeaders,
			params: Type.Object({
				id,
				impactName,
			}),
			body: {
				...Type.Ref(editImpactRequestBody),
				'x-examples': {
					'Update impact value': {
						summary: 'Update the impact of an activity',
						value: {
							description: 'updated description text',
						},
					},
				},
			},
			response: {
				204: {
					description: 'Success.',
					...Type.Ref(impactResource),
				},
				400: badRequestResponse,
				403: forbiddenResponse,
			},
			'x-security-scopes': atLeastContributor,
		},
		constraints: {
			version: apiVersion100,
		},

		handler: async (request, reply) => {
			const svc = fastify.diContainer.resolve('impactService');
			const { id, impactName } = request.params;
			const impact = await svc.update(request.authz, id, impactName, request.body);
			return reply.status(200).send(impact); // nosemgrep
		},
	});

	done();
}
