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
import { executionId, signedUrlListResponse, signedUrlRequest } from './schemas.js';
import { signedUrlListResponseExample, signedUrlRequestExample } from './examples.js';
import { atLeastContributor } from '@sif/authz';
import { apiVersion100, badRequestResponse, conflictResponse, commonHeaders, FastifyTypebox, id } from '@sif/resource-api-base';

export default function createAuditErrorDownloadUrlRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'POST',
		url: '/pipelines/:pipelineId/executions/:executionId/auditDownloadUrl',
		schema: {
			description: `Returns a pre-signed URL to download the pipeline execution audit file.`,
			headers: commonHeaders,
			tags: ['Pipelines'],
			params: Type.Object({
				pipelineId: id,
				executionId
			}),
			body: {
				...Type.Ref(signedUrlRequest),
				'x-examples': {
					'New download audit signedUrl request': { ...signedUrlRequestExample }
				}
			},
			response: {
				201: {
					description: 'Success.',
					...Type.Ref(signedUrlListResponse),
					'x-examples': {
						'Pipeline Execution Audit Download Url': {
							summary: 'pipeline execution audit download url',
							value: { ...signedUrlListResponseExample }
						}
					}
				},
				400: badRequestResponse,
				409: conflictResponse
			},
			'x-security-scopes': atLeastContributor
		},
		constraints: {
			version: apiVersion100
		},

		handler: async (request, reply) => {
			const svc = fastify.diContainer.resolve('pipelineProcessorsService');
			const errorUrl = await svc.generatePipelineAuditUrl(request.authz, request.params.pipelineId, request.params.executionId, request.body.expiration);
			await reply.status(201).send(errorUrl); // nosemgrep
		}
	});

	done();
}
