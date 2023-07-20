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

import { badRequestResponse, commonHeaders, conflictResponse, apiVersion100, FastifyTypebox, forbiddenResponse } from '@sif/resource-api-base';

import { newPipelineRequestBody, dryRunQS, pipelineResource, dryRunResponse } from '../schemas.js';
import { dryRunExampleResponse, pipelineDryRunExample, pipelineFullExample, pipelineActivitiesNewExample, pipelineDataNewExample, pipelineImpactsNewExample } from '../examples.js';

export default function createPipelineRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'POST',
		url: '/pipelines',
		schema: {
			description: `Creates a new Pipeline configuration`,
			tags: ['Pipelines'],
			headers: commonHeaders,
			operationId: 'create',
			querystring: Type.Object({
				dryRun: dryRunQS,
			}),
			body: {
				...Type.Ref(newPipelineRequestBody),
				'x-examples': {
					'New Activities Pipeline Configuration': {
						summary: 'Creates a new activities pipeline configuration.',
						value: { ...pipelineActivitiesNewExample },
					},
					'New Data Pipeline Configuration': {
						summary: 'Creates a new data pipeline configuration.',
						value: { ...pipelineDataNewExample },
					},
					'New Impacts Pipeline Configuration': {
						summary: 'Creates a new impacts pipeline configuration.',
						value: { ...pipelineImpactsNewExample },
					},
					'Dry Run a new pipeline ': {
						summary: 'Dry Run new Pipeline configuration.',
						value: { ...pipelineDryRunExample },
					},
				},
			},
			response: {
				200: {
					description: 'Successful dry run',
					...dryRunResponse,
					'x-examples': {
						'Dry Run success': {
							summary: 'New pipeline dry run performed',
							value: { ...dryRunExampleResponse },
						},
					},
				},
				202: {
					description: 'Success.',
					...Type.Ref(pipelineResource),
					'x-examples': {
						'New pipeline': {
							summary: 'New pipeline.',
							value: { ...pipelineFullExample },
						},
					},
				},
				400: {
					...badRequestResponse,
					'x-examples': {
						'Dry run failure response': {
							summary: 'Dry run has failed for a new pipeline',
							value: {
								message:
									'{\\"csvData\\":[\\"\\"],\\"errorMessages\\":[\\"Failed processing row \'[10, A]\', err: Character A is neither a decimal digit number, decimal point, nor \\\\\\"e\\\\\\" notation exponential mark.\\"],\\"csvHeaders\\":[\\"sum\\"]}',
							},
						},
					},
				},
				409: conflictResponse,
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
			if (dryRun) {
				const res = await svc.dryRun(request.authz, request.body);
				await reply.status(200).send(res); // nosemgrep
			} else {
				const pipeline = await svc.create(request.authz, request.body);
				await reply.status(201).header('x-pipelineId', pipeline.id).send(pipeline); // nosemgrep
			}
		},
	});

	done();
}
