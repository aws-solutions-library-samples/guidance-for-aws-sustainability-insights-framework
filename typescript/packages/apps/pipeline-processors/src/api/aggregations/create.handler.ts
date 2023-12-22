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
import { createMetricAggregationJobExample, metricAggregationJobExample } from './examples.js';
import { apiVersion100, badRequestResponse, commonHeaders, FastifyTypebox, forbiddenResponse } from '@sif/resource-api-base';
import { atLeastContributor } from '@sif/authz';
import { metricAggregationJob, newMetricAggregationJob } from './schemas.js';

export default function createMetricAggregationJob(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'POST',
		url: '/aggregations',
		schema: {
			description: `Create metric aggregation job for a pipeline`,
			tags: ['MetricAggregationJob'],
			headers: commonHeaders,
			body: {
				...Type.Ref(newMetricAggregationJob),
				'x-examples': {
					'New metric aggregation request example': { ...createMetricAggregationJobExample },
				},
			},
			response: {
				200: {
					description: 'Success',
					...metricAggregationJob,
				},
				201: {
					description: 'Success',
					...metricAggregationJob,
					'x-examples': {
						'New Metric Aggregation Job': {
							summary: 'New metric aggregation job created successfully.',
							value: metricAggregationJobExample,
						},
					},
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
			const svc = fastify.diContainer.resolve('metricAggregationJobService');
			// create the metric aggregation job
			let [metricAggregationJob, matchExistingJob] = await svc.create(request.authz, request.body);
			// start the metric aggregation job
			metricAggregationJob = await svc.start(request.authz, metricAggregationJob.id);
			await reply.status(matchExistingJob ? 200 : 201).send(metricAggregationJob); // nosemgrep
		},
	});

	done();
}
