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
import { badRequestResponse, commonHeaders, conflictResponse, forbiddenResponse, id, apiVersion100, FastifyTypebox, notFoundResponse } from '@sif/resource-api-base';
import { calculationDryRunRequestExample, calculationDryRunResponseExample, calculationPatchRequestExample1, calculationPatchRequestExample2, calculationResourceExample2 } from './examples.js';
import { editCalculationRequestBody, dryRunQS } from './schemas.js';

export default function updateCalculationRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'PATCH',
		url: '/calculations/:id',

		schema: {
			summary: 'Update a calculation.',
			description: `
Updates an existing calculation by creating a new version of it. This latest version becomes the current version.

If the calculation is to be frozen to prevent from being used as part of any new transforms then set the \`state\` to \`frozen\`. This will still allow existing transforms to use the calculation.

If the calculation needs to be prevented from being used in any transform, pre-existing or not, then set the \`state\` to \'disabled\'.

Permissions:
- Only \`admins\` of the group in context may update calculations.
`,
			tags: ['Calculations'],
			operationId: 'update',
			headers: commonHeaders,
			querystring: Type.Object({
				dryRun: dryRunQS,
			}),
			params: Type.Object({
				id: id,
			}),
			body: {
				...Type.Ref(editCalculationRequestBody),
				'x-examples': {
					'Update calculation': {
						summary: 'Update an existing calculation.',
						value: calculationPatchRequestExample1,
					},
					'Changing tags': {
						summary: 'Changing the tags of a calculation.',
						value: calculationPatchRequestExample2,
					},
					'executing a dry run': {
						summary: 'executing a dry run for an existing pipeline',
						value: { ...calculationDryRunRequestExample },
					},
				},
			},
			response: {
				200: {
					description: 'Success.',
					// TODO: check why union does not works
					...Type.Record(Type.String(), Type.Any(), {
						description: 'the response can be a calculation resource or dry run result.',
					}),
					'x-examples': {
						'Existing calculation updated successfully': {
							summary: 'New version of an existing calculation created successfully.',
							value: calculationResourceExample2,
						},
						'Successful Dry run of a calculation update': {
							summary: 'a dry run has been perform which returned a success response',
							value: { ...calculationDryRunResponseExample },
						},
					},
				},
				400: {
					...badRequestResponse,
					'x-examples': {
						'Malformed equation': {
							summary: 'Provided formula is malformed.',
							value: {
								description: 'Malformed formula. Expected `)` at line 1 column 15.',
							},
						},
						'Unused parameter': {
							summary: 'A specified parameter is unused.',
							value: {
								description: 'Parameter `distance` is specified but not referenced within the formula.',
							},
						},
						'Missing parameter definition': {
							summary: 'Missing parameter.',
							value: {
								description: 'Parameter `distance` is referenced within the formula but not defined.',
							},
						},
						'Invalid request': {
							summary: 'Invalid request.',
							value: {
								description: 'Expected `formula` to be defined but not provided.',
							},
						},
						'Failed Dry Run': {
							summary: 'failed dry run response',
							value: {
								description:
									'{\\"data\\":[\\"\\"],\\"errors\\":[\\"Failed processing row \'[10, A]\', err: Character A is neither a decimal digit number, decimal point, nor \\\\\\"e\\\\\\" notation exponential mark.\\"],\\"headers\\":[\\"sum\\"]}',
							},
						},
					},
				},
				403: forbiddenResponse,
				404: notFoundResponse,
				409: {
					...conflictResponse,
					'x-examples': {
						'Name in use': {
							summary: 'The `name` is already in use within the specified `groups`.',
							value: {
								description: 'Name `vehicle_emissions` already exists within group `/usa/northwest`.',
							},
						},
					},
				},
			},
			'x-security-scopes': atLeastContributor,
		},
		constraints: {
			version: apiVersion100,
		},

		handler: async (request, reply) => {
			const svc = fastify.diContainer.resolve('calculationService');

			const { dryRun } = request.query;
			if (dryRun) {
				const res = await svc.dryRunForUpdate(request.authz, request.params.id, request.body);
				return reply.status(200).send(res); // nosemgrep
			} else {
				const saved = await svc.update(request.authz, request.params.id, request.body);
				return reply.status(200).send(saved); // nosemgrep
			}
		},
	});

	done();
}
