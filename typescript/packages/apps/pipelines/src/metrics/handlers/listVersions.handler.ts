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

import { commonHeaders, apiVersion100, FastifyTypebox, id, countPaginationQS, fromVersionPaginationQS } from '@sif/resource-api-base';

import { metricList } from '../schemas.js';
import { metricVersionListExample } from '../examples.js';

export default function listMetricVersionsRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'GET',
		url: '/metrics/:metricId/versions',
		schema: {
			description: `Lists the versions of the metric`,
			tags: ['Metrics'],
			headers: commonHeaders,
			operationId: 'listMetricVersions',
			params: Type.Object({
				metricId: id,
			}),
			querystring: Type.Object({
				count: countPaginationQS,
				fromVersion: fromVersionPaginationQS,
			}),
			response: {
				200: {
					description: 'Success.',
					...Type.Ref(metricList),
					'x-examples': {
						'List of metrics': {
							summary: 'Paginated list of metrics.',
							value: metricVersionListExample(),
						},
					},
				},
			},
			'x-security-scopes': atLeastReader,
		},
		constraints: {
			version: apiVersion100,
		},

		handler: async (request, reply) => {
			const svc = fastify.diContainer.resolve('metricService');
			const { count, fromVersion } = request.query;
			const { metricId } = request.params;
			const metricList = await svc.listVersions(request.authz, metricId, count as number, fromVersion as number);
			return reply.status(200).send(metricList); // nosemgrep
		},
	});

	done();
}
