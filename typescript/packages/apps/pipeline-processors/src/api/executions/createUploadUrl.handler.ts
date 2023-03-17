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
import { signedUrlUploadInputRequest, uploadSignedUrlResponse } from './schemas.js';
import { signedUrlUploadInputRequestExample, uploadSignedUrlResponseExample } from './examples.js';
import { apiVersion100, badRequestResponse, commonHeaders, FastifyTypebox, id } from '@sif/resource-api-base';
import { atLeastContributor } from '@sif/authz';

export default function createPipelineInputUploadUrlRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'POST',
		url: '/pipelines/:pipelineId/inputUploadUrl',
		schema: {
			description: `Returns a pre-signed URL to upload the input data file for to feed the pipeline.`,
			tags: ['Pipelines'],
			headers: commonHeaders,
			params: Type.Object({
				pipelineId: id,
			}),
			body: {
				...Type.Ref(signedUrlUploadInputRequest),
				'x-examples': {
					'New upload file signed url request': { ...signedUrlUploadInputRequestExample },
				},
			},
			response: {
				201: {
					description: 'Success.',
					...Type.Ref(uploadSignedUrlResponse),
					'x-examples': {
						'Pipeline Execution Input Upload URL': {
							summary: 'pipeline execution input Upload URL',
							value: {
								...uploadSignedUrlResponseExample,
							},
						},
					},
				},
				400: badRequestResponse,
			},
			'x-security-scopes': atLeastContributor,
		},
		constraints: {
			version: apiVersion100,
		},

		handler: async (request, reply) => {
			const svc = fastify.diContainer.resolve('pipelineProcessorsService');
			const uploadUrl = await svc.generatePipelineExecutionInputUrl(request.authz, request.params.pipelineId, request.body.expiration, request.body.actionType);
			await reply.status(201).send(uploadUrl); // nosemgrep
		},
	});

	done();
}
