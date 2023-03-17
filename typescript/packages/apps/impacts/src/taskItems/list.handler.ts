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
import { apiVersion100, FastifyTypebox, countPaginationQS, fromIdPaginationQS, commonHeaders } from '@sif/resource-api-base';
import { atLeastReader } from '@sif/authz';

import { taskItemList, TaskItemList as TaskItemList, taskId, statusQS, TaskItemStatus } from './schemas.js';
import { taskItemListExample } from './examples.js';

export default function listTaskItemRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'GET',
		url: '/activityTasks/:taskId/taskItems',
		schema: {
			description: `Lists activities task items`,
			tags: ['Task Items'],
			operationId: 'listActivityTaskItems',
			headers: commonHeaders,
			params: Type.Object({
				taskId,
			}),
			querystring: Type.Object({
				count: countPaginationQS,
				fromName: fromIdPaginationQS,
				status: statusQS,
			}),
			response: {
				200: {
					description: 'Success.',
					...Type.Ref(taskItemList),
					'x-examples': {
						'List of task items': {
							summary: 'Paginated list of activity task items',
							value: taskItemListExample,
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
			const svc = fastify.diContainer.resolve('activityTaskItemService');

			// parse request
			const { count, fromName, status } = request.query;
			const { taskId } = request.params;

			const [taskItems, lastEvaluatedId] = await svc.list(request.authz, taskId, {
				count,
				exclusiveStart: { name: fromName },
				status: status as TaskItemStatus,
			});
			const response: TaskItemList = { taskItems: taskItems };
			if (count || lastEvaluatedId) {
				response.pagination = {};
				if (count) {
					response.pagination.count = count;
				}
				if (lastEvaluatedId) {
					response.pagination.lastEvaluatedId = lastEvaluatedId.name;
				}
			}

			fastify.log.debug(`list.handler> exit:${JSON.stringify(response)}`);
			await reply.status(200).send(response); // nosemgrep
		},
	});

	done();
}
