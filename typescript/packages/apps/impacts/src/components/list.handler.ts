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
import { apiVersion100, countPaginationQS, FastifyTypebox, id } from '@sif/resource-api-base';

import { atLeastReader } from '@sif/authz';
import { componentMap, fromComponentKeyPaginationParam, typeParam, componentKey } from './schemas.js';
import { listComponentExample } from './example.js';

export default function listComponentsRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'GET',
		url: '/activities/:id/impacts/:impactName/components',
		schema: {
			description: `Lists activity impact components`,
			tags: ['Components'],
			params: Type.Object({
				id,
				impactName: componentKey,
			}),
			querystring: Type.Object({
				count: countPaginationQS,
				fromComponentKey: fromComponentKeyPaginationParam,
				type: typeParam,
			}),
			response: {
				201: {
					description: 'Success.',
					...Type.Ref(componentMap),
					'x-examples': {
						'List of components': {
							summary: 'Paginated list of components',
							value: listComponentExample,
						},
					},
				},
			},
			'x-security-scopes': atLeastReader,
		},
		constraints: {
			version: apiVersion100,
		},

		handler: async (_request, _reply) => {
			// DI
			const svc = fastify.diContainer.resolve('componentService');
			// do the work...
			const { id, impactName } = _request.params;
			const saved = await svc.list(_request.authz, id, impactName);
			return _reply.status(200).send(saved); // nosemgrep
		},
	});

	done();
}
