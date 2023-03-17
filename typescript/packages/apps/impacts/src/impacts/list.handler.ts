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
import { apiVersion100, commonHeaders, countPaginationQS, FastifyTypebox, id } from '@sif/resource-api-base';
import { atLeastReader } from '@sif/authz';
import { fromImpactNamePaginationParam, impactMap } from './schemas.js';
import { listImpactExample } from './examples.js';

export default function listImpactsRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'GET',
		url: '/activities/:id/impacts',
		schema: {
			description: `Lists impacts`,
			tags: ['Impacts'],
			operationId: 'listImpacts',
			headers: commonHeaders,
			params: Type.Object({
				id,
			}),
			querystring: Type.Object({
				count: countPaginationQS,
				fromImpactName: fromImpactNamePaginationParam,
			}),
			response: {
				200: {
					description: 'Success.',
					...Type.Ref(impactMap),
					'x-examples': {
						'List of Impacts': {
							summary: 'Paginated list of impacts',
							value: listImpactExample,
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
			const svc = fastify.diContainer.resolve('impactService');
			const { id } = _request.params;
			const saved = await svc.list(_request.authz, id);
			return _reply.status(200).send(saved); // nosemgrep
		},
	});

	done();
}
