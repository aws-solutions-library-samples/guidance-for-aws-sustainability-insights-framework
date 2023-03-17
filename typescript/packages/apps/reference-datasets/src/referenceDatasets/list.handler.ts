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
import { commonHeaders, countPaginationQS, tagFilterQS, apiVersion100, FastifyTypebox, aliasQS, forbiddenResponse, fromTokenPaginationQS, includeParentGroupsQS, includeChildGroupsQS } from '@sif/resource-api-base';
import { atLeastReader } from '@sif/authz';

import { referenceDatasetListExample } from './examples.js';
import { ReferenceDatasetList, referenceDatasetList } from './schemas.js';
import type { ReferenceDatasetListOptions } from './repository';

export default function listReferenceDatasetsRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'GET',
		url: '/referenceDatasets',
		schema: {
			description: `Lists Reference Datasets

Permissions:
- All roles of the group in context may list Reference Datasets.
`,
			tags: ['Reference Datasets'],
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
					...Type.Ref(referenceDatasetList),
					'x-examples': {
						'List of reference datasets': {
							summary: 'Paginated list of reference datasets',
							value: referenceDatasetListExample,
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
			const tagService = fastify.diContainer.resolve('tagService');

			const { count, fromToken, name, tags, includeChildGroups, includeParentGroups } = request.query;

			const options: ReferenceDatasetListOptions = {
				count,
				name,
				exclusiveStart: { paginationToken: fromToken },
				tags: tagService.expandTagsQS(tags),
				includeChildGroups: includeChildGroups,
				includeParentGroups: includeParentGroups,
			};

			const [referenceDatasets, lastEvaluatedToken] = await svc.list(request.authz, options);

			const response: ReferenceDatasetList = { referenceDatasets };

			if (count || lastEvaluatedToken) {
				response.pagination = {};
				if (lastEvaluatedToken) {
					response.pagination.lastEvaluatedToken = lastEvaluatedToken.paginationToken;
				}
			}

			await reply.status(200).send(response); // nosemgrep
		},
	});

	done();
}
