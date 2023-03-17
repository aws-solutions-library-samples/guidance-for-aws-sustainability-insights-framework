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

import { commonHeaders, countPaginationQS, apiVersion100, FastifyTypebox, fromTokenPaginationQS } from '@sif/resource-api-base';

import { activitiesListExample } from './examples.js';
import type { QueryRequest } from './models.js';
import { ActivitiesList, activitiesList, attributesQS, dateFromQS, dateToQS, executionIdQS, metricQS, pipelineIdQS, dateQS, showHistoryQS, uniqueKeyAttributesQS, showAggregateQS } from './schemas.js';

dayjs.extend(utc);

export default function listActivitiesRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'GET',
		url: '/activities',

		schema: {
			summary: 'List activities processed by a pipeline.',
			description: `List activities processed by a pipeline.'

Permissions:
- \`readers\` of the group in context may list activities.
`,
			tags: ['Activities'],
			operationId: 'listActivities',
			headers: commonHeaders,
			querystring: Type.Object({
				pipelineId: pipelineIdQS,
				executionId: executionIdQS,
				metric: metricQS,
				dateFrom: dateFromQS,
				dateTo: dateToQS,
				date: dateQS,
				attributes: attributesQS,
				count: countPaginationQS,
				fromToken: fromTokenPaginationQS,
				showHistory: showHistoryQS,
				uniqueKeyAttributes: uniqueKeyAttributesQS,
				showAggregate:  showAggregateQS
			}),
			response: {
				200: {
					description: 'Success.',
					...activitiesList,
					'x-examples': {
						'List of activities': {
							summary: 'Paginated list of activities.',
							value: activitiesListExample,
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

			const { pipelineId, executionId, dateFrom, dateTo, attributes, count, fromToken, date, showHistory, uniqueKeyAttributes, showAggregate } = request.query;

			validateDates(date, dateTo, dateFrom);

			const req: QueryRequest = {
				groupId: request.authz.groupId,
				pipelineId,
				executionId,
				dateFrom: dateFrom ? dayjs.utc(dateFrom).toDate() : undefined,
				dateTo: dateTo ? dayjs.utc(dateTo).toDate() : undefined,
				date: date ? dayjs.utc(date).toDate() : undefined,
				attributes: expandAttributes(attributes),
				maxRows: count,
				nextToken: parseInt(fromToken),
				showHistory,
				uniqueKeyAttributes: expandAttributes(uniqueKeyAttributes),
				showAggregate
			};
			const { data, nextToken } = await svc.getActivities(request.authz, req);

			const response: ActivitiesList = { activities: data };
			if (nextToken) {
				response.pagination = {
					lastEvaluatedToken: nextToken,
				};
			}

			return reply.status(200).send(response); // nosemgrep
		},
	});

	done();
}

const validateDates = (date: string, dateTo: string, dateFrom: string) => {
	let isValid = true;

	if (date) isValid = dayjs(date).isValid();
	if (dateFrom) isValid = dayjs(dateFrom).isValid();
	if (dateTo) isValid = dayjs(dateTo).isValid();

	if (!isValid) {
		throw new Error('Invalid Date specified double check if the date/time is in ISO8601 local time');
	}
};

const expandAttributes = (attrString:string) => {
	const expandedAttributes: Record<string, string> = {};
	if ((attrString?.length ?? 0) > 0) {
		attrString.split(',').forEach((a) => {
			const kv = a.split(':');
			const k = decodeURIComponent(kv[0] as string);
			const v = decodeURIComponent(kv[1] as string);
			expandedAttributes[k] = v;
		});
	}
	return expandedAttributes
}
