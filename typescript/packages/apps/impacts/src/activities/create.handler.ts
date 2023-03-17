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
import { atLeastContributor } from '@sif/authz';
import { badRequestResponse, conflictResponse, forbiddenResponse, apiVersion100, FastifyTypebox, commonHeaders } from '@sif/resource-api-base';

import { newActivityRequestBody, activityResource } from './schemas.js';
import { createActivityRequestBodyExample, activityResourceExample } from './examples.js';

export default function createActivityRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'POST',
		url: '/activities',

		schema: {
			description: `Create a new Activity`,
			tags: ['Activities'],
			headers: commonHeaders,
			operationId: 'create',
			body: {
				...Type.Ref(newActivityRequestBody),
				'x-examples': {
					'New Acitivity': {
						value: createActivityRequestBodyExample,
					},
				},
			},
			response: {
				201: {
					description: 'Success.',
					...Type.Ref(activityResource),
					'x-examples': {
						'New Activity': {
							value: activityResourceExample,
						},
					},
				},
				403: forbiddenResponse,
				400: badRequestResponse,
				409: conflictResponse,
			},
			'x-security-scopes': atLeastContributor,
		},
		constraints: {
			version: apiVersion100,
		},

		handler: async (request, reply) => {
			const svc = fastify.diContainer.resolve('activityService');
			const saved = await svc.create(request.authz, request.body);
			return reply.header('x-activityId', saved.id).status(201).send(saved); // nosemgrep
		},
	});

	done();
}
