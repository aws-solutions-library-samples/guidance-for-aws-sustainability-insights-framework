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
import { commonHeaders, apiVersion100, FastifyTypebox, id, countPaginationQS, fromVersionPaginationQS, versionAsAtQS, QueryParameterError } from '@sif/resource-api-base';
import { pipelineVersionList } from '../schemas.js';
import { pipelineVersionListExample } from '../examples.js';

export default function listPipelineVersionsRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'GET',
		url: '/pipelines/:pipelineId/versions',
		schema: {
			description: `Lists the versions of the pipeline`,
			tags: ['Pipelines'],
			headers: commonHeaders,
			params: Type.Object({
				pipelineId: id,
			}),
			querystring: Type.Object({
				count: countPaginationQS,
				fromVersion: fromVersionPaginationQS,
				versionAsAt: versionAsAtQS
			}),
			response: {
				200: {
					description: 'Success.',
					...Type.Ref(pipelineVersionList),
					'x-examples': {
						'List of pipelines': {
							summary: 'Paginated list of pipelines.',
							value: pipelineVersionListExample(),
						},
					},
				},
			},
			'x-security-scopes': atLeastReader,
		},
		constraints: {
			version: apiVersion100,
		},

		handler: async (request, reply) => {
			const svc = fastify.diContainer.resolve('pipelineService');
			const { count, fromVersion, versionAsAt } = request.query;
			const { pipelineId } = request.params;
			if (versionAsAt && (count || fromVersion)) {
				throw new QueryParameterError('request can only contain versionAsAt or count/fromVersion query parameter, but not both');
			}
			const pipelineList = await svc.listVersions(request.authz, pipelineId, count as number, fromVersion as number, versionAsAt);
			return reply.status(200).send(pipelineList); // nosemgrep
		},
	});

	done();
}
