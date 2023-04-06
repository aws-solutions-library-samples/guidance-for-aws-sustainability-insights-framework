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
import { apiVersion100, commonHeaders, notFoundResponse, FastifyTypebox, id, versionAsAtQS } from '@sif/resource-api-base';
import { atLeastReader } from '@sif/authz';
import { activityAuditListExample } from '../examples.js';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
dayjs.extend(utc);

export default function listActivityAuditsRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'GET',
		url: '/activities/:id/audits',
		schema: {
			description: `Retrieve list of audit information for an activity.`,
			tags: ['Audits'],
			operationId: 'list',
			headers: commonHeaders,
			params: Type.Object({
				id,
			}),
			querystring: Type.Object({
				versionAsAt: versionAsAtQS
			}),
			response: {
				200: {
					description: 'Success.',
					...Type.Array(Type.Record(Type.String(), Type.Any(), {
						description: 'The audit information for an activity.',
					})),
					'x-examples': {
						'List of audit versions for an activity': {
							summary: 'Audit detail.',
							value: activityAuditListExample,
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
			const svc = fastify.diContainer.resolve('activityAuditService');
			const { id } = request.params;
			const { versionAsAt } = request.query;
			const saved = await svc.listAudits(request.authz, id, versionAsAt ? dayjs(versionAsAt).toDate() : undefined);
			return reply.status(200).send(saved); // nosemgrep
		},
	});
	done();
}

