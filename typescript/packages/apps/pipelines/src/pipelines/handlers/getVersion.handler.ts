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

import { atLeastReader } from '@sif/authz';
import { notFoundResponse, apiVersion100, FastifyTypebox, id, commonHeaders } from '@sif/resource-api-base';

import { pipelineResource, verboseQS, version } from '../schemas.js';
import { pipelineFullExample } from '../examples.js';

export default function getPipelineByVersionRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'GET',
		url: '/pipelines/:pipelineId/versions/:version',

		schema: {
			description: `Retrieve details of an existing pipeline by version`,
			tags: ['Pipelines'],
			params: Type.Object({
				pipelineId: id,
				version,
			}),
			headers: commonHeaders,
			querystring: Type.Object({
				verbose: verboseQS,
			}),
			response: {
				200: {
					description: 'Success.',
					...Type.Ref(pipelineResource),
					'x-examples': {
						'Existing pipeline details': {
							summary: 'Existing pipeline details.',
							value: { ...pipelineFullExample },
						},
					},
				},
				404: notFoundResponse,
			},
			'x-security-scopes': atLeastReader,
		},
		constraints: {
			version: apiVersion100,
		},

		handler: async (request, reply) => {
			const svc = fastify.diContainer.resolve('pipelineService');
			const { verbose } = request.query;
			const { pipelineId, version } = request.params;
			const pipeline = await svc.get(request.authz, pipelineId, version, verbose);
			return reply.status(200).send(pipeline); // nosemgrep
		},
	});

	done();
}
