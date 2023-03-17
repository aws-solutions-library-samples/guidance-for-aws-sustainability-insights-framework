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
import { commonHeaders, countPaginationQS, id, apiVersion100, FastifyTypebox, fromVersionPaginationQS, forbiddenResponse, versionAsAtQS, QueryParameterError } from '@sif/resource-api-base';
import { referenceDatasetVersionsListExample } from '../examples.js';
import { referenceDatasetVersionList, ReferenceDatasetVersionList } from '../schemas.js';

export default function listReferenceDatasetsByVersionRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'GET',
		url: '/referenceDatasets/:id/versions',
		schema: {
			description: `Lists Reference Datasets by versions

Permissions:
- All roles of the group in context may lists Reference Datasets by versions.
`,
			tags: ['Reference Datasets'],
			operationId: 'listVersions',
			headers: commonHeaders,
			params: Type.Object({
				id,
			}),
			querystring: Type.Object({
				count: countPaginationQS,
				fromVersion: fromVersionPaginationQS,
				versionAsAt: versionAsAtQS
			}),
			response: {
				200: {
					description: 'Success.',
					...Type.Ref(referenceDatasetVersionList),
					'x-examples': {
						'List of reference datasets by version': {
							summary: 'Paginated list of reference datasets by version',
							value: referenceDatasetVersionsListExample,
						},
					},
				},
				403: forbiddenResponse,
			},
			'x-security-scopes': atLeastReader,
		},
		constraints: {
			version: apiVersion100,
		},

		handler: async (request, reply) => {
			const svc = fastify.diContainer.resolve('referenceDatasetService');

			// parse request
			const { count, fromVersion, versionAsAt } = request.query;

			if (versionAsAt && (count || fromVersion)) {
				throw new QueryParameterError('request can only contain versionAsAt or count/fromVersion query parameter, but not both');
			}

			const [referenceDatasets, lastEvaluated] = await svc.listVersions(request.authz, request.params.id, {
				count,
				exclusiveStart: { version: fromVersion },
				versionAsAt
			});

			const response: ReferenceDatasetVersionList = { referenceDatasets };
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
