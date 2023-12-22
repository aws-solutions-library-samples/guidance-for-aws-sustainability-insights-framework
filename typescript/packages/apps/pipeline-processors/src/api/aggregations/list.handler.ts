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
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import { commonHeaders, countPaginationQS, apiVersion100, FastifyTypebox, fromTokenPaginationQS, aliasQS } from '@sif/resource-api-base';
import { MetricAggregationJobList, metricAggregationJobList } from './schemas.js';
import { metricAggregationTaskListExamples } from './examples.js';

dayjs.extend(utc);

export default function listAggregationsRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'GET',
		url: '/aggregations',

		schema: {
			summary: 'List metric aggregation jobs.',
			description: `List metric aggregation jobs.'

Permissions:
- \`readers\` of the group in context may list metric aggregation tasks.
`,
			tags: ['MetricAggregationJob'],
			operationId: 'listMetricAggregationJobs',
			headers: commonHeaders,
			querystring: Type.Object({
				count: countPaginationQS,
				pipelineId: aliasQS,
				fromToken: fromTokenPaginationQS,
			}),
			response: {
				200: {
					description: 'Success.',
					...Type.Ref(metricAggregationJobList),
					'x-examples': {
						'List of aggregation jobs': {
							summary: 'Paginated list of metric aggregation jobs.',
							value: metricAggregationTaskListExamples,
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
			const svc = fastify.diContainer.resolve('metricAggregationJobService');

			const { count, fromToken, pipelineId } = request.query;

			const [jobs, lastEvaluatedToken] = await svc.list(request.authz, { count, name: pipelineId, exclusiveStart: { paginationToken: fromToken } });

			const response: MetricAggregationJobList = { jobs };
			if (count || lastEvaluatedToken) {
				response.pagination = {};
				if (lastEvaluatedToken) {
					response.pagination.lastEvaluatedToken = lastEvaluatedToken.paginationToken;
				}
			}

			return reply.status(200).send(response); // nosemgrep
		},
	});

	done();
}


