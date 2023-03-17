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

import { notFoundResponse, apiVersion100, FastifyTypebox, forbiddenResponse, id } from '@sif/resource-api-base';
import { atLeastReader } from '@sif/authz';
import { Type } from '@sinclair/typebox';
import { taskResource } from './schemas.js';
import { activityTaskResourceExample } from './examples.js';

export default function getActivityTaskRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'GET',
		url: '/activityTasks/:id',

		schema: {
			description: `Retrieve details of an existing activity task`,
			tags: ['Activity Tasks'],
			params: Type.Object({
				id,
			}),
			response: {
				200: {
					description: 'Success.',
					...Type.Ref(taskResource),
					'x-examples': {
						'Existing Activity Task': {
							summary: 'Existing Activity Task details.',
							value: activityTaskResourceExample,
						},
					},
				},
				403: forbiddenResponse,
				404: notFoundResponse,
			},
			'x-security-scopes': atLeastReader,
		},
		constraints: {
			version: apiVersion100,
		},

		handler: async (request, reply) => {
			const svc = fastify.diContainer.resolve('activityTaskService');
			const { id } = request.params;
			const saved = await svc.get(request.authz, id);
			return reply.status(200).send(saved); // nosemgrep
		},
	});

	done();
}
