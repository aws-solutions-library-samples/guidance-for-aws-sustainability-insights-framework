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

import { atLeastContributor } from '@sif/authz';
import { apiVersion100, FastifyTypebox, badRequestResponse, forbiddenResponse, id, commonHeaders } from '@sif/resource-api-base';

import { editPipelineRequestBody, dryRunQS, pipelineResponse } from '../schemas.js';
import { pipelineDryRunExample, pipelineUpdateExample1 } from '../examples.js';

export default function updatePipelineRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'PATCH',
		url: '/pipelines/:pipelineId',

		schema: {
			description: `Updates an existing pipeline.`,
			tags: ['Pipelines'],
			headers: commonHeaders,
			operationId: 'update',
			querystring: Type.Object({
				dryRun: dryRunQS,
			}),
			params: Type.Object({
				pipelineId: id,
			}),
			body: {
				...Type.Ref(editPipelineRequestBody),
				'x-examples': {
					'Update pipelines name and attribute': {
						summary: 'Update pipeline',
						value: { ...pipelineUpdateExample1 },
					},
					'Dry Run a new pipeline ': {
						summary: 'Dry Run existing Pipeline configuration.',
						value: { ...pipelineDryRunExample },
					},
				},
			},
			response: {
				200: {
					description: 'Success.',
					...pipelineResponse,
				},
				400: {
					...badRequestResponse,
					'x-examples': {
						'Dry run failure response': {
							summary: 'Dry run has failed for an existing pipeline',
							value: {
								message:
									'{\\"csvData\\":[\\"\\"],\\"errorMessages\\":[\\"Failed processing row \'[10, A]\', err: Character A is neither a decimal digit number, decimal point, nor \\\\\\"e\\\\\\" notation exponential mark.\\"],\\"csvHeaders\\":[\\"sum\\"]}',
							},
						},
					},
				},
				403: forbiddenResponse,
			},
			'x-security-scopes': atLeastContributor,
		},
		constraints: {
			version: apiVersion100,
		},

		handler: async (request, reply) => {
			const svc = fastify.diContainer.resolve('pipelineService');

			const { dryRun } = request.query;
			const { pipelineId } = request.params;

			if (dryRun) {
				const res = await svc.dryRunForUpdate(request.authz, pipelineId, request.body);
				await reply.status(200).send(res); // nosemgrep
			} else {
				const pipeline = await svc.update(request.authz, pipelineId, request.body);
				await reply.status(200).send(pipeline); // nosemgrep
			}
		},
	});

	done();
}
