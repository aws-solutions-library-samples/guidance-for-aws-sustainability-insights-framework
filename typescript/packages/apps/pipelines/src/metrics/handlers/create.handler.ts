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
import { atLeastContributor } from '@sif/authz';
import { badRequestResponse, commonHeaders, conflictResponse, notImplementedResponse, apiVersion100, FastifyTypebox, forbiddenResponse } from '@sif/resource-api-base';
import { metricResource, newMetricRequestBody } from '../schemas.js';
import { metricFullExample, metricCreateExample } from '../examples.js';

export default function createMetricRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'POST',
		url: '/metrics',
		schema: {
			description: `Creates a new Metric.`,
			tags: ['Metrics'],
			headers: commonHeaders,
			operationId: 'createMetric',
			body: {
				...Type.Ref(newMetricRequestBody),
				'x-examples': {
					'New Metric': {
						summary: 'Creates a new Metric.',
						value: { ...metricCreateExample },
					},
				},
			},
			response: {
				201: {
					description: 'Success.',
					...Type.Ref(metricResource),
					'x-examples': {
						'New metric': {
							summary: 'New metric.',
							value: { ...metricFullExample },
						},
					},
				},
				400: {
					...badRequestResponse,
				},
				409: conflictResponse,
				403: forbiddenResponse,
				501: notImplementedResponse
			},
			'x-security-scopes': atLeastContributor,
		},
		constraints: {
			version: apiVersion100,
		},

		handler: async (request, reply) => {
			const svc = fastify.diContainer.resolve('metricService');
			const metric = await svc.create(request.authz, request.body);
			await reply.status(201).header('x-metricId', metric.id).send(metric); // nosemgrep
		},
	});

	done();
}
