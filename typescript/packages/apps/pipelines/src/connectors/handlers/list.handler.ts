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
import { apiVersion100, FastifyTypebox, commonHeaders, countPaginationQS, fromTokenPaginationQS, aliasQS, tagFilterQS, includeChildGroupsQS, includeParentGroupsQS } from '@sif/resource-api-base';

import { connectorList, ConnectorList } from '../schemas.js';
import { connectorListExample } from '../examples.js';

export default function listConnectorsRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'GET',
		url: '/connectors',

		schema: {
			description: `Lists connectors.`,
			tags: ['Pipeline Connectors'],
			headers: commonHeaders,
			querystring: Type.Object({
				count: countPaginationQS,
				fromToken: fromTokenPaginationQS,
				name: aliasQS,
				tags: tagFilterQS,
				includeParentGroups: includeParentGroupsQS,
				includeChildGroups: includeChildGroupsQS,
			}),
			response: {
				200: {
					description: 'Success.',
					...Type.Ref(connectorList),
					'x-examples': {
						'List of connectors': {
							summary: 'Paginated list of connectors.',
							value: connectorListExample,
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
			const svc = fastify.diContainer.resolve('connectorService');
			const tagService = fastify.diContainer.resolve('tagService');

			const { count, fromToken, name, tags, includeParentGroups, includeChildGroups } = request.query;

			const [connectors, lastEvaluatedToken] = await svc.list(request.authz, {
				count,
				exclusiveStart: { paginationToken: fromToken },
				name,
				tags: tagService.expandTagsQS(tags),
				includeChildGroups,
				includeParentGroups,
			});

			const response: ConnectorList = { connectors };
			if (count || lastEvaluatedToken) {
				response.pagination = {};
				if (lastEvaluatedToken) {
					response.pagination.lastEvaluatedToken = lastEvaluatedToken.paginationToken;
				}
			}

			return reply.status(200).send(response); // nosemgrep
		},
	});

	done();
}
