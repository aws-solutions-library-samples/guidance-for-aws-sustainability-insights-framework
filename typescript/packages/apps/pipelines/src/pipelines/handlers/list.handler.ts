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
import { apiVersion100, FastifyTypebox, commonHeaders, countPaginationQS, tagFilterQS, fromTokenPaginationQS, aliasQS, includeChildGroupsQS, includeParentGroupsQS } from '@sif/resource-api-base';

import { pipelineList, PipelineListType } from '../schemas.js';
import { pipelineListExample } from '../examples.js';

export default function listPipelinesRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'GET',
		url: '/pipelines',

		schema: {
			description: `Lists pipelines.`,
			tags: ['Pipelines'],
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
					...Type.Ref(pipelineList),
					'x-examples': {
						'List of pipelines': {
							summary: 'Paginated list of pipelines.',
							value: pipelineListExample(),
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
			const svc = fastify.diContainer.resolve('pipelineService');
			const tagService = fastify.diContainer.resolve('tagService');

			const { count, fromToken, tags, name, includeParentGroups, includeChildGroups } = request.query;

			const [pipelines, lastEvaluatedToken] = await svc.list(request.authz, {
				count,
				exclusiveStart: { paginationToken: fromToken },
				name,
				tags: tagService.expandTagsQS(tags),
				includeChildGroups,
				includeParentGroups,
			});

			const response: PipelineListType = { pipelines };
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
