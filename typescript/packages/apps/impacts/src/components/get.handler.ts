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
import { atLeastReader } from '@sif/authz';

import { componentKey, componentResource } from './schemas.js';
import { getComponentExample } from './example.js';
import { impactName } from '../impacts/schemas.js';

export default function getComponentRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'GET',
		url: '/activities/:id/impacts/:impactName/components/:componentKey',
		schema: {
			description: `Component details for a particular activity impact`,
			tags: ['Components'],
			params: Type.Object({
				id,
				impactName: impactName,
				componentKey: componentKey,
			}),
			response: {
				201: {
					description: 'Success.',
					...Type.Ref(componentResource),
					'x-examples': {
						Component: {
							summary: 'Component details',
							value: getComponentExample,
						},
					},
				},
				400: badRequestResponse,
				403: forbiddenResponse,
			},
			'x-security-scopes': atLeastReader,
		},
		constraints: {
			version: apiVersion100,
		},

		handler: async (request, reply) => {
			const svc = fastify.diContainer.resolve('componentService');
			const { id, impactName, componentKey } = request.params;
			const saved = await svc.get(request.authz, id, impactName, componentKey);
			return reply.status(200).send(saved); // nosemgrep
		},
	});

	done();
}
