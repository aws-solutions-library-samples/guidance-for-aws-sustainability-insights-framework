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

import { atLeastAdmin } from '@sif/authz';

import { commonHeaders, forbiddenResponse, id, noBodyResponse, notFoundResponse, apiVersion100, FastifyTypebox } from '@sif/resource-api-base';

import { Type } from '@sinclair/typebox';

export default function deleteReferenceDatasetRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'DELETE',
		url: '/referenceDatasets/:id',
		schema: {
			description: `Delete reference dataset

Permissions:
- Only \`admin\` of the group in context may create reference datasets.
`,
			tags: ['Reference Datasets'],
			operationId: 'delete',
			headers: commonHeaders,
			params: Type.Object({
				id,
			}),
			response: {
				204: noBodyResponse,
				404: notFoundResponse,
				403: forbiddenResponse,
			},
			'x-security-scopes': atLeastAdmin,
		},
		constraints: {
			version: apiVersion100,
		},

		handler: async (request, reply) => {
			const svc = fastify.diContainer.resolve('referenceDatasetService');
			await svc.delete(request.authz, request.params.id);
			await reply.status(204).send();
		},
	});

	done();
}
