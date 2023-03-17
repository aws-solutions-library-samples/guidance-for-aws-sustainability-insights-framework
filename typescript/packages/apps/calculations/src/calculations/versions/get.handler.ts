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

import { commonHeaders, id, notFoundResponse, apiVersion100, FastifyTypebox } from '@sif/resource-api-base';
import { calculationResourceExample2 } from '../examples.js';
import { calculationResource, version } from '../schemas.js';

export default function getCalculationVersionRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'GET',
		url: '/calculations/:id/versions/:version',

		schema: {
			summary: 'Retrieve specific version.',
			description: `Retrieve the details of a specific version of a calculation.

Permissions:
- Only \`readers\` of the group in context may view a version of a calculation.
`,
			tags: ['Calculations'],
			operationId: 'getVersion',
			headers: commonHeaders,
			params: Type.Object({
				id: id,
				version: version,
			}),
			response: {
				200: {
					description: 'Success.',
					...calculationResource,
					'x-examples': {
						'Existing calculation': {
							summary: 'Calculation retrieved successfully.',
							value: calculationResourceExample2,
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
			// DI
			const svc = fastify.diContainer.resolve('calculationService');
			// do the work...
			const { id, version } = request.params;
			const calculation = await svc.get(request.authz, id, version.toString());
			return reply.status(200).send(calculation); // nosemgrep
		},
	});

	done();
}
