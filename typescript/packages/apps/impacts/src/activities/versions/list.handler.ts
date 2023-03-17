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

import { apiVersion100, commonHeaders, countPaginationQS, FastifyTypebox, fromVersionPaginationQS, id, versionAsAtQS, QueryParameterError } from '@sif/resource-api-base';
import { atLeastReader } from '@sif/authz';
import { Type } from '@sinclair/typebox';
import { ActivityVersionsList, activityVersionsList } from '../schemas.js';
import { activitiesListVersionsExample } from '../examples.js';

export default function listActivityVersionsRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'GET',
		url: '/activities/:id/versions',
		schema: {
			description: `Lists activity versions`,
			tags: ['Activities'],
			operationId: 'listVersions',
			headers: commonHeaders,
			params: Type.Object({
				id,
			}),
			querystring: Type.Object({
				count: countPaginationQS,
				fromVersion: fromVersionPaginationQS,
				versionAsAt: versionAsAtQS
			}),
			response: {
				200: {
					description: 'Success.',
					...Type.Ref(activityVersionsList),
					'x-examples': {
						'List activity versions': {
							summary: 'Paginated list of activity versions',
							value: activitiesListVersionsExample,
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
			const svc = fastify.diContainer.resolve('activityService');
			// parse request
			const { count, fromVersion, versionAsAt } = request.query;

			if (versionAsAt && (count || fromVersion)) {
				throw new QueryParameterError('request can only contain versionAsAt or count/fromVersion query parameter, but not both');
			}

			const [activities, lastEvaluated] = await svc.listVersions(request.authz, request.params.id, {
				count,
				exclusiveStart: { version: fromVersion },
				versionAsAt
			});

			const response: ActivityVersionsList = { activities };
			if (count || lastEvaluated) {
				response.pagination = {};
				if (lastEvaluated) {
					response.pagination.lastEvaluatedVersion = lastEvaluated.version;
				}
			}
			await reply.status(200).send(response); // nosemgrep
		},
	});

	done();
}
