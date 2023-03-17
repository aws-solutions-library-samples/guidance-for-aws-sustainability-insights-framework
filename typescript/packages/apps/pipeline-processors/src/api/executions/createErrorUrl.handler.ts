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
import { executionId, signedUrlRequest, signedUrlResponse } from './schemas.js';
import { signedUrlRequestExample, signedUrlResponseExample } from './examples.js';
import { atLeastContributor } from '@sif/authz';
import { apiVersion100, badRequestResponse, commonHeaders, FastifyTypebox, id } from '@sif/resource-api-base';

export default function createExecutionErrorDownloadUrlRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'POST',
		url: '/pipelines/:pipelineId/executions/:executionId/errorDownloadUrl',
		schema: {
			description: `Returns a pre-signed URL to download the pipeline errors file.`,
			headers: commonHeaders,
			tags: ['Pipelines'],
			params: Type.Object({
				pipelineId: id,
				executionId,
			}),
			body: {
				...Type.Ref(signedUrlRequest),
				'x-examples': {
					'New download error signedUrl request': { ...signedUrlRequestExample },
				},
			},
			response: {
				201: {
					description: 'Success.',
					...Type.Ref(signedUrlResponse),
					'x-examples': {
						'Pipeline Execution Error Download Url': {
							summary: 'pipeline execution error download url',
							value: { ...signedUrlResponseExample },
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
			const errorUrl = await svc.generatePipelineErrorUrl(request.authz, request.params.pipelineId, request.params.executionId, request.body.expiration);
			await reply.status(201).send(errorUrl); // nosemgrep
		},
	});

	done();
}
