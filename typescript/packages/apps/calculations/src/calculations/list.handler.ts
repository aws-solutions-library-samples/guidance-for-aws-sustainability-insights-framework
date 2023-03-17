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
import { CalculationsList, calculationsList } from './schemas.js';
import { commonHeaders, countPaginationQS, tagFilterQS, apiVersion100, FastifyTypebox, fromTokenPaginationQS, aliasQS } from '@sif/resource-api-base';
import { calculationListResource } from './examples.js';
import { includeChildGroupsQS, includeParentGroupsQS } from '@sif/resource-api-base';

export default function listCalculationsRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'GET',
		url: '/calculations',

		schema: {
			summary: 'List all calculations.',
			description: `List the latest versions of calculations.

Permissions:
- \`readers\` of the group in context may list calculations.
`,
			tags: ['Calculations'],
			operationId: 'list',
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
					...calculationsList,
					'x-examples': {
						'List of calculations': {
							summary: 'Paginated list of calculations.',
							value: calculationListResource,
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
			// DI
			const calculationService = fastify.diContainer.resolve('calculationService');
			const tagService = fastify.diContainer.resolve('tagService');

			// parse request
			const { count, fromToken, name, tags, includeParentGroups, includeChildGroups } = request.query;
			const [calculations, lastEvaluatedToken] = await calculationService.list(request.authz, {
				count,
				exclusiveStart: { paginationToken: fromToken },
				name,
				tags: tagService.expandTagsQS(tags),
				includeChildGroups,
				includeParentGroups,
			});

			const response: CalculationsList = { calculations };
			if (count || lastEvaluatedToken) {
				response.pagination = {};
				if (lastEvaluatedToken) {
					response.pagination.lastEvaluatedToken = lastEvaluatedToken.paginationToken;
				}
			}

			fastify.log.debug(`list.handler> exit:${JSON.stringify(response)}`);
			await reply.status(200).send(response); // nosemgrep
		},
	});

	done();
}
