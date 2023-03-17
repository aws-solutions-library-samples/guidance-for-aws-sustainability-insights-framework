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

import { badRequestResponse, commonHeaders, forbiddenResponse, id, apiVersion100, FastifyTypebox, notFoundResponse } from '@sif/resource-api-base';
import { editReferenceDatasetRequestBody, referenceDatasetResource } from './schemas.js';
import { referenceDatasetEditDeleteTagExample, referenceDatasetEditExample, referenceDatasetFullUpdatedExample } from './examples.js';

export default function updateReferenceDatasetRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'PATCH',
		url: '/referenceDatasets/:id',

		schema: {
			description: `Updates an existing reference dataset

Permissions:
- Only \`admin\` of the group in context may update reference datasets.
`,
			tags: ['Reference Datasets'],
			operationId: 'update',
			headers: commonHeaders,
			params: Type.Object({
				id,
			}),
			consumes: ['multipart/form-data'],
			body: {
				...Type.Ref(editReferenceDatasetRequestBody),
				'x-examples': {
					'Edit ReferenceDataset': {
						summary: 'Update an existing ReferenceDataset, if there is an existing tag with the same key, the tag will be modified, if not it will be added',
						value: referenceDatasetEditExample,
					},
					'Removing Tag from ReferenceDataset': {
						summary: 'Deleting tag from a reference dataset.',
						value: referenceDatasetEditDeleteTagExample,
					},
				},
			},
			response: {
				200: {
					description: 'Success.',
					...Type.Ref(referenceDatasetResource),
					'x-examples': {
						'Updated Reference Dataset': {
							summary: 'Updated reference dataset details',
							value: referenceDatasetFullUpdatedExample,
						},
					},
				},
				400: badRequestResponse,
				403: forbiddenResponse,
				404: notFoundResponse,
			},
			'x-security-scopes': atLeastContributor,
		},
		constraints: {
			version: apiVersion100,
		},

		handler: async (request, reply) => {
			const svc = fastify.diContainer.resolve('referenceDatasetService');
			const updatedReferenceDataset = await svc.update(request.authz, request.params.id, request.body);
			await reply.status(200).send(updatedReferenceDataset); // nosemgrep
		},
	});

	done();
}
