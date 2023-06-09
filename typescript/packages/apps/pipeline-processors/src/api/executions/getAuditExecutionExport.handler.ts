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
import { apiVersion100, badRequestResponse, commonHeaders, FastifyTypebox, forbiddenResponse, id, noBodyResponse, notFoundResponse } from '@sif/resource-api-base';
import { Type } from '@sinclair/typebox';

import { executionId, signedUrlResponse } from './schemas.js';
import { signedUrlResponseExample } from './examples.js';

export default function getPipelineExecutionExportRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'POST',
		url: '/pipelines/:pipelineId/executions/:executionId/generateAuditExportUrl',

		schema: {
			description: `Generate a url for audit aggregated report associated with a specific pipeline execution.`,
			tags: ['Audits'],
			headers: commonHeaders,
			params: Type.Object({
				pipelineId: id,
				executionId,
			}),
			response: {
				201: {
					description: 'Success.',
					...Type.Ref(signedUrlResponse),
					'x-examples': {
						'Pipeline execution export available for download': {
							value: { ...signedUrlResponseExample },
						},
					},
				},
				202: {
					description: 'Export of data still in progress. Try again later.',
					...noBodyResponse,
				},
				403: forbiddenResponse,
				404: notFoundResponse,
				400: badRequestResponse
			},
			'x-security-scopes': atLeastReader,
		},
		constraints: {
			version: apiVersion100,
		},

		handler: async (request, reply) => {
			const svc = fastify.diContainer.resolve('executionAuditExportService');
			const resp = await svc.createAuditExportUrl(request.authz, request.params.pipelineId, request.params.executionId);
			if (resp.state === 'inProgress') {
				await reply.status(202).send() // nosemgrep
			} else {
				await reply.status(201).send(resp); // nosemgrep
			}

		},
	});

	done();
}
