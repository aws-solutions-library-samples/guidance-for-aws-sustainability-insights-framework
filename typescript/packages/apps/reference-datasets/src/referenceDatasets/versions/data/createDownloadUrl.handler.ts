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
import { referenceDatasetFileContentExample, signedUrlResponseExample } from '../../examples.js';

export default function createReferenceDatasetVersionDownloadDataRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'GET',
		url: '/referenceDatasets/:id/versions/:version/data',
		schema: {
			description: `Retrieve specific version of reference dataset file content

Permissions:
- All roles of the group in context may get reference dataset.
`,
			tags: ['Reference Datasets'],
			operationId: 'getVersionData',
			headers: commonHeaders,
			produces: ['text/csv', 'application/json'],
			params: Type.Object({
				id,
				version,
			}),
			response: {
				200: {
					description: 'Success.',
					...Type.Ref(signedUrlResponse),
					'x-examples': {
						'Content of the reference dataset': {
							summary: 'Content of the reference dataset',
							value: referenceDatasetFileContentExample,
						},
						'Signed Url for the Reference dataset': {
							summary: 'Signed url to retrieve the reference dataset',
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
			if (request.headers['accept'] === 'application/json') {
				const referenceDatasetContent: SignedUrlResponse = await svc.getReferenceDatasetDownloadUrl(
					request.authz,
					request.params.id,
					request.params.version
				);
				await reply.status(200).type('application/json').send(referenceDatasetContent);
			} else {
				const referenceDatasetContent = await svc.getContent(request.authz, request.params.id, request.params.version);
				await reply
					.status(200)
					.header('Content-Disposition', 'attachment; filename=data.csv')
					.header('Content-Type', 'text/csv')
					// @ts-ignore
					.send(referenceDatasetContent); // nosemgrep
			}
		},
	});

	done();
}
