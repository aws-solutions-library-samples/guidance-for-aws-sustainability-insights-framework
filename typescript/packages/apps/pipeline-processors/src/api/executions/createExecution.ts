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
import { pipelineExecutionRequest, pipelineExecutionFull } from './schemas.js';
import { executionRequestExample,  pipelineExecutionFullSuccess } from './examples.js';
import { apiVersion100, badRequestResponse, commonHeaders, FastifyTypebox, id } from '@sif/resource-api-base';
import { atLeastContributor } from '@sif/authz';

export default function createExecution(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'POST',
		url: '/pipelines/:pipelineId/executions',
		schema: {
			description: `Creates a new execution for a pipeline`,
			tags: ['Pipeline Executions'],
			headers: commonHeaders,
			params: Type.Object({
				pipelineId: id,
			}),
			body: {
				...Type.Ref(pipelineExecutionRequest),
				'x-examples': {
					'Pipeline Execution request example': { ...executionRequestExample },
				},
			},
			response: {
				201: {
					description: 'Success.',
					...Type.Ref(pipelineExecutionFull),
					'x-examples': {
						'Pipeline Execution creation response': {
							summary: 'pipeline execution response',
							value: {
								...pipelineExecutionFullSuccess,
							},
						},
					},
				},
				400: badRequestResponse,
			},
			'x-security-scopes': atLeastContributor,
		},
		constraints: {
			version: apiVersion100,
		},

		handler: async (request, reply) => {
			const svc = fastify.diContainer.resolve('pipelineProcessorsService');

			const execution = await svc.create(request.authz, request.params.pipelineId, request.body);

			await reply.status(201).send(execution); // nosemgrep
		},
	});

	done();
}
