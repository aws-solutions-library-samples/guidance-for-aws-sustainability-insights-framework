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
import { badRequestResponse, apiVersion100, FastifyTypebox } from '@sif/resource-api-base';
import { taskResource, activityTaskNew } from './schemas.js';
import { atLeastContributor } from '@sif/authz';
import { activityTaskCreateRequestExample, activityTaskResourceExample } from './examples.js';

// For now, this is defined as maximum lambda request/response size is allowed.
const activityTaskPayloadSize = 6291456;

export default function createActivityTaskRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'POST',
		url: '/activityTasks',
		bodyLimit: activityTaskPayloadSize,
		schema: {
			description: `Create a activities in bulk`,
			tags: ['Activity Tasks'],
			body: {
				...Type.Ref(activityTaskNew),
				'x-examples': {
					'list of activities': {
						value: activityTaskCreateRequestExample,
					},
				},
			},
			response: {
				201: {
					description: 'Success.',
					...Type.Ref(taskResource),
					'x-examples': {
						'Activities creation task': {
							summary: 'Existing Activity details.',
							value: activityTaskResourceExample,
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
			const svc = fastify.diContainer.resolve('activityTaskService');
			const saved = await svc.create(request.authz, request.body);
			return reply.status(201).send(saved); // nosemgrep
		},
	});

	done();
}
