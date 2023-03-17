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
import { apiVersion100, fromTokenPaginationQS, countPaginationQS, FastifyTypebox } from '@sif/resource-api-base';
import { atLeastReader } from '@sif/authz';
import { taskList, ActivityTaskList } from './schemas.js';
import { activityTaskListExample } from './examples.js';

export default function listImpactTasksRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'GET',
		url: '/activityTasks',
		schema: {
			description: `Lists activity Tasks`,
			tags: ['Activity Tasks'],
			querystring: Type.Object({
				count: countPaginationQS,
				fromToken: fromTokenPaginationQS,
			}),
			response: {
				200: {
					description: 'Success.',
					...Type.Ref(taskList),
					'x-examples': {
						'List of Activities': {
							summary: 'Paginated list of activities',
							value: activityTaskListExample,
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
			const svc = fastify.diContainer.resolve('activityTaskService');

			// parse request
			const { count, fromToken } = request.query;

			const [tasks, lastEvaluatedToken] = await svc.list(request.authz, {
				count,
				exclusiveStart: { paginationToken: fromToken },
			});
			const response: ActivityTaskList = { tasks };

			if (count || lastEvaluatedToken) {
				response.pagination = {};
				if (lastEvaluatedToken) {
					response.pagination.lastEvaluated = lastEvaluatedToken.paginationToken;
				}
			}

			fastify.log.debug(`list.handler> exit:${JSON.stringify(response)}`);
			await reply.status(200).send(response); // nosemgrep
		},
	});

	done();
}
