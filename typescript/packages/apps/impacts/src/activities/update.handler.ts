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

import { badRequestResponse, forbiddenResponse, apiVersion100, FastifyTypebox, id, commonHeaders } from '@sif/resource-api-base';

import { atLeastContributor } from '@sif/authz';
import { editActivityRequestBody, activityResource } from './schemas.js';

export default function updateActivityRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'PATCH',
		url: '/activities/:id',

		schema: {
			description: `Updates an existing Activity`,
			tags: ['Activities'],
			operationId: 'update',
			headers: commonHeaders,
			params: Type.Object({
				id,
			}),
			body: {
				...Type.Ref(editActivityRequestBody),
				'x-examples': {
					'Update existing ': {
						summary: 'Update existing activity',
						value: {
							description: 'updated description text',
						},
					},
				},
			},
			response: {
				204: {
					description: 'Success.',
					...Type.Ref(activityResource),
				},
				400: badRequestResponse,
				403: forbiddenResponse,
			},
			'x-security-scopes': atLeastContributor,
		},
		constraints: {
			version: apiVersion100,
		},

		handler: async (_request, _reply) => {
			const svc = fastify.diContainer.resolve('activityService');
			const { id } = _request.params;
			const activity = await svc.update(_request.authz, id, _request.body);
			return _reply.status(200).send(activity); // nosemgrep
		},
	});

	done();
}
