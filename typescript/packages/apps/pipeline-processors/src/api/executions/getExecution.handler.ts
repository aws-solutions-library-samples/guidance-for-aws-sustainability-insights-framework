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
import { apiVersion100, commonHeaders, FastifyTypebox, id, notFoundResponse } from '@sif/resource-api-base';
import { Type } from '@sinclair/typebox';

import { pipelineExecutionFullFail, pipelineExecutionFullSuccess } from './examples.js';
import { executionId, pipelineExecutionFull } from './schemas.js';

export default function getPipelineExecutionRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'GET',
		url: '/pipelines/:pipelineId/executions/:executionId',

		schema: {
			description: `Retrieve details of a specific execution of the pipeline.`,
			tags: ['Pipelines'],
			headers: commonHeaders,
			params: Type.Object({
				pipelineId: id,
				executionId,
			}),
			response: {
				200: {
					description: 'Success.',
					...Type.Ref(pipelineExecutionFull),
					'x-examples': {
						'Existing pipeline successful execution details': {
							summary: 'Existing pipeline successful execution details.',
							value: { ...pipelineExecutionFullSuccess },
						},
						'Existing pipeline failed execution details': {
							summary: 'Existing pipeline failed execution details.',
							value: { ...pipelineExecutionFullFail },
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
			const svc = fastify.diContainer.resolve('pipelineProcessorsService');
			const pipelineExecution = await svc.get(request.authz, request.params.pipelineId, request.params.executionId);
			await reply.status(200).send(pipelineExecution); // nosemgrep
		},
	});

	done();
}
