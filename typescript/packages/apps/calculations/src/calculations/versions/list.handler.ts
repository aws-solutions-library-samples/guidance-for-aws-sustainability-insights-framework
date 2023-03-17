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
import { commonHeaders, countPaginationQS, id, apiVersion100, FastifyTypebox, fromVersionPaginationQS, versionAsAtQS, QueryParameterError } from '@sif/resource-api-base';
import { calculationVersionListResource } from '../examples.js';
import { calculationVersionsList, CalculationVersionsList } from '../schemas.js';

export default function listCalculationVersionsRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'GET',
		url: '/calculations/:id/versions',

		schema: {
			summary: 'List all versions.',
			description: `List the latets versions of calculations.

Permissions:
- Only \`readers\` of the group in context may list versions of a calculation.
`,
			tags: ['Calculations'],
			operationId: 'listVersions',
			headers: commonHeaders,
			params: Type.Object({
				id: id,
			}),
			querystring: Type.Object({
				count: countPaginationQS,
				fromVersion: fromVersionPaginationQS,
				versionAsAt: versionAsAtQS
			}),
			response: {
				200: {
					description: 'Success.',
					...calculationVersionsList,
					'x-examples': {
						'List of versions of a calculation': {
							summary: 'Paginated list of versions of a calculation.',
							value: calculationVersionListResource,
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
			// DI
			const svc = fastify.diContainer.resolve('calculationService');

			// parse request
			const { count, fromVersion, versionAsAt } = request.query;

			if (versionAsAt && (count || fromVersion)) {
				throw new QueryParameterError('request can only contain versionAsAt or count/fromVersion query parameter, but not both');
			}

			const [calculations, lastEvaluated] = await svc.listVersions(request.authz, request.params.id, {
				count,
				exclusiveStart: { version: fromVersion },
				versionAsAt
			});

			const response: CalculationVersionsList = { calculations };
			if (count || lastEvaluated) {
				response.pagination = {};
				if (lastEvaluated) {
					response.pagination.lastEvaluatedVersion = lastEvaluated.version;
				}
			}

			await reply.status(200).send(response); // nosemgrep
		},
	});

	done();
}
