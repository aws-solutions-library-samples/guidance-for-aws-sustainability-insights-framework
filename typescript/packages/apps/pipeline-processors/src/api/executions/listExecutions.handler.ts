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

import { atLeastReader } from '@sif/authz';
import { apiVersion100, commonHeaders, FastifyTypebox, id } from '@sif/resource-api-base';
import { Type } from '@sinclair/typebox';

import { pipelineExecutionListExample } from './examples.js';
import { countPaginationParam, fromExecutionIdPaginationParam, pipelineExecutionList } from './schemas.js';

export default function listPipelineExecutionsRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'GET',
		url: '/pipelines/:pipelineId/executions',
		schema: {
			description: `Lists executions of a pipeline.`,
			tags: ['Pipelines'],
			headers: commonHeaders,
			params: Type.Object({
				pipelineId: id,
			}),
			querystring: Type.Object({
				count: countPaginationParam,
				fromExecutionId: fromExecutionIdPaginationParam,
			}),
			response: {
				200: {
					description: 'Success.',
					...Type.Ref(pipelineExecutionList),
					'x-examples': {
						'List of pipeline executions': {
							summary: 'Paginated list of pipelines executions',
							value: pipelineExecutionListExample(),
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
			const svc = fastify.diContainer.resolve('pipelineProcessorsService');
			const pipelineExecutionList = await svc.list(request.authz, request.params.pipelineId, request.query.fromExecutionId, request.query.count);
			await reply.status(200).send(pipelineExecutionList); // nosemgrep
		},
	});

	done();
}
