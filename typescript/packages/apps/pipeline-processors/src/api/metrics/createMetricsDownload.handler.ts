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
import { apiVersion100, commonHeaders, FastifyTypebox } from '@sif/resource-api-base';
import { Type } from '@sinclair/typebox';
import { newMetricsDownloadExample } from './examples.js';
import { dateFromQS, dateToQS, membersQS, nameQS, timeUnitQS, versionQS } from './schemas.js';
import type { DownloadQueryRequest } from './models.js';
import { newMetricsDownload } from '../metrics/schemas.js';

export default function createMetricsDownloadRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'POST',
		url: '/metrics/download',

		schema: {
			summary: 'Initiate the process to query and save the metrics output so it can be downloaded.',
			description: `List metrics processed by a pipeline.'

Permissions:
- \`readers\` of the group in context may list metrics.
`,
			tags: ['Metrics'],
			operationId: 'createMetricsDownload',
			headers: commonHeaders,
			querystring: Type.Object({
				name: nameQS,
				timeUnit: timeUnitQS,
				dateFrom: dateFromQS,
				dateTo: dateToQS,
				members: membersQS,
				version: versionQS,
			}),
			response: {
				202: {
					description: 'Success.',
					...newMetricsDownload,
					'x-examples': {
						'Metrics Download': {
							summary: 'Query id used to get the download signed url.',
							value: newMetricsDownloadExample,
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

			const { name, timeUnit, dateFrom, dateTo, members, version } = request.query;

			const req: DownloadQueryRequest = {
				groupId: request.authz.groupId,
				name,
				timeUnit,
				dateFrom: dateFrom ? dayjs(dateFrom).toDate() : undefined,
				dateTo: dateTo ? dayjs(dateTo).toDate() : undefined,
				members,
				version,
			};
			const id = await svc.createMetricsDownload(request.authz, req);
			return reply.status(202).send({ id }); // nosemgrep
		},
	});

	done();
}
