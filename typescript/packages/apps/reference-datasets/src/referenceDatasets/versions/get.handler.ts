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

import { commonHeaders, id, notFoundResponse, apiVersion100, FastifyTypebox, forbiddenResponse } from '@sif/resource-api-base';
import { Type } from '@sinclair/typebox';
import { referenceDatasetResource, version } from '../schemas.js';
import { referenceDatasetVersionsListExample } from '../examples.js';

export default function getReferenceDatasetByVersionRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'GET',
		url: '/referenceDatasets/:id/versions/:version',
		schema: {
			description: `Retrieve specific version of the Reference Dataset

Permissions:
- All roles of the group in context may get specific version of Dataset.
`,
			tags: ['Reference Datasets'],
			consumes: ['application/json', 'text/csv'],
			operationId: 'getVersion',
			headers: commonHeaders,
			params: Type.Object({
				id,
				version,
			}),
			response: {
				200: {
					description: 'Success.',
					...Type.Ref(referenceDatasetResource),
					'x-examples': {
						'Existing Reference Dataset by Version': {
							summary: 'Existing reference dataset details by Version',
							value: referenceDatasetVersionsListExample,
						},
					},
				},
				404: notFoundResponse,
				403: forbiddenResponse,
			},
			'x-security-scopes': atLeastReader,
		},
		constraints: {
			version: apiVersion100,
		},

		handler: async (request, reply) => {
			const svc = fastify.diContainer.resolve('referenceDatasetService');
			const referenceDataset = await svc.get(request.authz, request.params.id, request.params.version);
			await reply.status(200).send(referenceDataset); // nosemgrep
		},
	});

	done();
}
