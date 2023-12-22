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
import { metricAggregationJobExample, startMetricAggregationJobExample } from './examples.js';
import { apiVersion100, badRequestResponse, commonHeaders, FastifyTypebox, forbiddenResponse, id, notFoundResponse } from '@sif/resource-api-base';
import { atLeastContributor } from '@sif/authz';
import { metricAggregationJob, startMetricAggregationJob } from './schemas.js';

export default function startsMetricAggregationJob(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'PATCH',
		url: '/aggregations/:metricAggregationJobId',
		schema: {
			description: `Start aggregation job for a pipeline`,
			tags: ['MetricAggregationJob'],
			headers: commonHeaders,
			params: Type.Object({
				metricAggregationJobId: id,
			}),
			body: {
				...Type.Ref(startMetricAggregationJob),
				'x-examples': {
					'Pipeline Execution request example': { ...startMetricAggregationJobExample },
				},
			},
			response: {
				200: {
					description: 'Success',
					...metricAggregationJob,
					'x-examples': {
						'Metric Aggregation Job': {
							summary: 'metric aggregation job started successfully.',
							value: metricAggregationJobExample,
						},
					},
				},
				400: badRequestResponse,
				403: forbiddenResponse,
				404: notFoundResponse,
			},
			'x-security-scopes': atLeastContributor,
		},
		constraints: {
			version: apiVersion100,
		},

		handler: async (request, reply) => {
			const svc = fastify.diContainer.resolve('metricAggregationJobService');
			const metricAggregationJob = await svc.start(request.authz, request.params.metricAggregationJobId, {
				to: request.body.to,
				from: request.body.from
			});
			await reply.status(200).send(metricAggregationJob); // nosemgrep
		},
	});

	done();
}
