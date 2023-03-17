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

import dayjs from 'dayjs';

import { atLeastReader } from '@sif/authz';
import { apiVersion100, commonHeaders, countPaginationQS, FastifyTypebox, fromTokenPaginationQS } from '@sif/resource-api-base';
import { Type } from '@sinclair/typebox';

import { metricsListExample } from './examples.js';
import { dateFromQS, dateToQS, membersQS, metricsList, nameQS, timeUnitQS, versionQS } from './schemas.js';

import type { QueryRequest } from './models.js';
import type { MetricsList } from './schemas.js';

export default function listMetricsRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'GET',
		url: '/metrics',

		schema: {
			summary: 'List metrics processed by a pipeline.',
			description: `List metrics processed by a pipeline.'

Permissions:
- \`readers\` of the group in context may list metrics.
`,
			tags: ['Metrics'],
			operationId: 'listMetrics',
			headers: commonHeaders,
			querystring: Type.Object({
				name: nameQS,
				timeUnit: timeUnitQS,
				dateFrom: dateFromQS,
				dateTo: dateToQS,
				members: membersQS,
				version: versionQS,
				count: countPaginationQS,
				fromToken: fromTokenPaginationQS,
			}),
			response: {
				200: {
					description: 'Success.',
					...metricsList,
					'x-examples': {
						'List of metrics': {
							summary: 'Paginated list of metrics.',
							value: metricsListExample,
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
			const svc = fastify.diContainer.resolve('metricsService');

			const { name, timeUnit, dateFrom, dateTo, members, version, count, fromToken } = request.query;

			const req: QueryRequest = {
				groupId: request.authz.groupId,
				name,
				timeUnit,
				dateFrom: dateFrom ? dayjs(dateFrom).toDate() : undefined,
				dateTo: dateTo ? dayjs(dateTo).toDate() : undefined,
				members,
				version,
				count,
				nextToken: fromToken,
			};
			const metrics = await svc.query(request.authz, req);

			const response: MetricsList = { metrics };

			return reply.status(200).send(response); // nosemgrep
		},
	});

	done();
}
