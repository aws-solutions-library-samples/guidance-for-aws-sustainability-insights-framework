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
import { commonHeaders, apiVersion100, FastifyTypebox } from '@sif/resource-api-base';
import { attributesQS, dateFromQS, dateToQS, executionIdQS, metricQS, pipelineIdQS, dateQS, showHistoryQS, uniqueKeyAttributesQS, showAggregateQS, newActivitiesDownload } from './schemas.js';
import { newActivitiesDownloadExample } from './examples.js';
import { expandAttributes, validateDates } from '../../utils/helper.utils.js';
import type { DownloadQueryRequest } from './models.js';

dayjs.extend(utc);

export default function createActivitiesDownloadRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'POST',
		url: '/activities/download',

		schema: {
			summary: 'Initiate a download request for activities processed by a pipeline. An ID will be returned that can be used to download the file once processing completes.',
			description: `Initiate a download request for activities processed by a pipeline. An ID will be returned that can be used to download the file once processing completes.'

Permissions:
- \`readers\` of the group in context may initiate a download request.
`,
			tags: ['Activities'],
			operationId: 'startActivityDownload',
			headers: commonHeaders,
			querystring: Type.Object({
				pipelineId: pipelineIdQS,
				executionId: executionIdQS,
				metric: metricQS,
				dateFrom: dateFromQS,
				dateTo: dateToQS,
				date: dateQS,
				attributes: attributesQS,
				showHistory: showHistoryQS,
				uniqueKeyAttributes: uniqueKeyAttributesQS,
				showAggregate: showAggregateQS
			}),
			response: {
				202: {
					description: 'Success.',
					id: '1234',
					...newActivitiesDownload,
					'x-examples': {
						'New activities download': {
							summary: 'Query id used to get the signed url.',
							value: newActivitiesDownloadExample,
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
			const svc = fastify.diContainer.resolve('activityService');

			const { pipelineId, executionId, dateFrom, dateTo, attributes, date, showHistory, uniqueKeyAttributes, showAggregate } = request.query;

			validateDates(date, dateTo, dateFrom);

			const req: DownloadQueryRequest = {
				groupId: request.authz.groupId,
				pipelineId,
				executionId,
				dateFrom: dateFrom ? dayjs.utc(dateFrom).toDate() : undefined,
				dateTo: dateTo ? dayjs.utc(dateTo).toDate() : undefined,
				date: date ? dayjs.utc(date).toDate() : undefined,
				attributes: expandAttributes(attributes),
				showHistory,
				uniqueKeyAttributes: expandAttributes(uniqueKeyAttributes),
				showAggregate
			};
			const id = await svc.createActivitiesDownload(request.authz, req);
			return reply.status(202).send({ ...req, id }); // nosemgrep
		},
	});

	done();
}

