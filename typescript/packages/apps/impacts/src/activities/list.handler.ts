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
import { apiVersion100, FastifyTypebox, tagFilterQS, countPaginationQS, aliasQS, fromTokenPaginationQS, commonHeaders, includeChildGroupsQS, includeParentGroupsQS } from '@sif/resource-api-base';
import { atLeastReader } from '@sif/authz';
import { activityList, ActivityList } from './schemas.js';
import { activitiesListExample } from './examples.js';

export default function listActivitiesRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'GET',
		url: '/activities',
		schema: {
			description: `Lists activities`,
			tags: ['Activities'],
			operationId: 'list',
			headers: commonHeaders,
			querystring: Type.Object({
				count: countPaginationQS,
				fromToken: fromTokenPaginationQS,
				name: aliasQS,
				tags: tagFilterQS,
				includeParentGroups: includeParentGroupsQS,
				includeChildGroups: includeChildGroupsQS,
			}),
			response: {
				200: {
					description: 'Success.',
					...Type.Ref(activityList),
					'x-examples': {
						'List of Activities': {
							summary: 'Paginated list of activities',
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
			const tagService = fastify.diContainer.resolve('tagService');

			// parse request
			const { count, fromToken, name, tags, includeChildGroups, includeParentGroups } = request.query;

			const [activities, lastEvaluatedToken] = await svc.list(request.authz, {
				count,
				exclusiveStart: { paginationToken: fromToken },
				name,
				tags: tagService.expandTagsQS(tags),
				includeChildGroups,
				includeParentGroups,
			});
			const response: ActivityList = { activities };
			if (count || lastEvaluatedToken) {
				response.pagination = {};
				if (lastEvaluatedToken) {
					response.pagination.lastEvaluatedToken = lastEvaluatedToken.paginationToken;
				}
			}

			fastify.log.debug(`list.handler> exit:${JSON.stringify(response)}`);
			await reply.status(200).send(response); // nosemgrep
		},
	});

	done();
}
