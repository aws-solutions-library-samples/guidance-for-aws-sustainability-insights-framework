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
import { apiVersion100, badRequestResponse, commonHeaders, conflictResponse, FastifyTypebox, forbiddenResponse } from '@sif/resource-api-base';

import { ReferenceDatasetDefinitionError } from '../common/errors.js';
import { referenceDatasetFullExample, referenceDatasetNewExample, referenceDatasetNewS3Example } from './examples.js';
import { referenceDatasetResource, newReferenceDatasetRequestBody } from './schemas.js';

export default function createReferenceDatasetRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'POST',
		url: '/referenceDatasets',
		schema: {
			description: `Create a new reference dataset

Permissions:
- Only \`contributor\` or \`admin\` of the group in context may create reference datasets.
			`,
			tags: ['Reference Datasets'],
			headers: commonHeaders,
			operationId: 'create',
			consumes: ['multipart/form-data'],
			body: {
				...Type.Ref(newReferenceDatasetRequestBody),
				'x-examples': {
					'New ReferenceDataset': {
						summary: 'Creates a new ReferenceDataset.',
						value: referenceDatasetNewExample,
					},
					'New ReferenceDataset from S3': {
						summary: 'Creates a new ReferenceDataset and request s3 signed url to upload the data',
						value: referenceDatasetNewS3Example,
					},
				},
			},
			response: {
				202: {
					description: 'Success.',
					...Type.Ref(referenceDatasetResource),
					'x-examples': {
						'New Reference Data': {
							summary: 'New reference data created',
							value: referenceDatasetFullExample,
						},
					},
				},
				400: badRequestResponse,
				409: conflictResponse,
				403: forbiddenResponse,
			},
			'x-security-scopes': atLeastContributor,
		},
		constraints: {
			version: apiVersion100,
		},

		handler: async (request, reply) => {
			const svc = fastify.diContainer.resolve('referenceDatasetService');

			if (request.body.tags && typeof request.body.tags === 'string') {
				throw new ReferenceDatasetDefinitionError(
					`Incorrect tags defined ${request.body.tags}. form-data attributes of json type should  have the individual "tags" attribute content-type set to "application/json" `
				);
			}

			if (request.body.tags && Object.entries(request.body.tags).length === 0) {
				delete request.body.tags;
			}

			if (typeof request.body.datasetHeaders === 'string') {
				throw new ReferenceDatasetDefinitionError(
					`Incorrect reference datasetsHeaders defined ${request.body.datasetHeaders}. form-data attributes of json type should have the individual "datasetHeaders" attribute content-type set to "application/json" `
				);
			}

			const referenceDataset = await svc.create(request.authz, request.body);
			await reply.status(201).header('x-referenceDatasetId', referenceDataset.id).send(referenceDataset); // nosemgrep
		},
	});

	done();
}
