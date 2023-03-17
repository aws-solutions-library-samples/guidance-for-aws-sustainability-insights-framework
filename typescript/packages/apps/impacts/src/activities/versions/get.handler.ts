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

import { notFoundResponse, apiVersion100, FastifyTypebox, id, commonHeaders } from '@sif/resource-api-base';
import { atLeastReader } from '@sif/authz';

import { Type } from '@sinclair/typebox';
import { activityResource, versionParam } from '../schemas.js';
import { activityVersionResourceExample } from '../examples.js';

export default function getActivityByVersionRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'GET',
		url: '/activities/:id/versions/:version',

		schema: {
			description: `Retrieve details of an existing activity by version`,
			tags: ['Activities'],
			operationId: 'getVersion',
			headers: commonHeaders,
			params: Type.Object({
				id,
				version: versionParam,
			}),
			response: {
				200: {
					description: 'Success.',
					...Type.Ref(activityResource),
					'x-examples': {
						'Existing activity by version': {
							summary: 'Existing activity details for a particular version',
							value: activityVersionResourceExample,
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
			const svc = fastify.diContainer.resolve('activityService');
			const { id, version } = request.params;
			const saved = await svc.get(request.authz, id, version);
			return reply.status(200).send(saved); // nosemgrep
		},
	});

	done();
}
