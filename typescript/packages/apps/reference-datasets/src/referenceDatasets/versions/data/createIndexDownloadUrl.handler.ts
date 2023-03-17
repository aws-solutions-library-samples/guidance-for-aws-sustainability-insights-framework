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
import { signedUrlResponse, SignedUrlResponse, version } from '../../schemas.js';
import { signedUrlResponseExample } from '../../examples.js';

export default function createReferenceDatasetVersionIndexDataRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'GET',
		url: '/referenceDatasets/:id/versions/:version/index',
		schema: {
			description: `Retrieve specific version of reference dataset lucene index

Permissions:
- All roles of the group in context may get reference dataset.
`,
			tags: ['Reference Datasets'],
			operationId: 'getVersionIndex',
			headers: commonHeaders,
			produces: ['application/json'],
			params: Type.Object({
				id,
				version,
			}),
			response: {
				200: {
					description: 'Success.',
					...Type.Ref(signedUrlResponse),
					'x-examples': {
						'Signed Url for the Reference dataset index file': {
							summary: 'Signed url to retrieve the reference dataset index file',
							value: signedUrlResponseExample,
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
			const referenceDatasetContent: SignedUrlResponse = await svc.getReferenceDatasetIndexDownloadUrl(
				request.authz,
				request.params.id,
				request.params.version
			);
			await reply.status(200).type('application/json').send(referenceDatasetContent); // nosemgrep
		},
	});

	done();
}
