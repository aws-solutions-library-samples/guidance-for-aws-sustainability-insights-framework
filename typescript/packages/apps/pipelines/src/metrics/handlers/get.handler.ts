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
import { notFoundResponse, apiVersion100, FastifyTypebox, id, commonHeaders } from '@sif/resource-api-base';

import { metricResource } from '../schemas.js';
import { metricFullExample } from '../examples.js';

export default function getMetricRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'GET',
		url: '/metrics/:metricId',

		schema: {
			description: `Retrieve details of an existing metric.`,
			tags: ['Metrics'],
			headers: commonHeaders,
			params: Type.Object({
				metricId: id,
			}),
			response: {
				200: {
					description: 'Success.',
					...Type.Ref(metricResource),
					'x-examples': {
						'Existing metric': {
							summary: 'Existing metric details.',
							value: { ...metricFullExample },
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
			const svc = fastify.diContainer.resolve('metricService');
			const { metricId } = request.params;
			const metric = await svc.get(request.authz, metricId);
			return reply.status(200).send(metric); // nosemgrep
		},
	});

	done();
}
