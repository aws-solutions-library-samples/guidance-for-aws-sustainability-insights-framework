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

import {
	commonHeaders,
	countPaginationQS,
	forbiddenResponse,
	apiVersion100,
	FastifyTypebox,
	fromValuePaginationQS,
	keyParam,
	parentValueQS,
	TagValuesListResource,
	tagValuesListResource,
	TagService,
	stringEnum,
} from '@sif/resource-api-base';
import { PkType } from '../utils/pkUtils.utils.js';
import { PipelineDefinitionError } from '../common/errors.js';

export function listTagsRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'GET',
		url: '/tags/:key',

		schema: {
			summary: 'List tag values',
			description: `List tags for a given key.

For hierarchical / cascading tags, provide the \`?parentValue\` query string parameter.

Use the \`?resourceType\` query string parameter to filter between \`User\` and \`Group\` resource types..

Permissions:
- \`reader\` and above may list tags.
`,
			tags: ['Tags'],
			operationId: 'listTags',
			headers: commonHeaders,
			params: Type.Object({
				key: keyParam,
			}),
			querystring: Type.Object({
				count: countPaginationQS,
				fromValue: fromValuePaginationQS,
				parentValue: parentValueQS,
				resourceType: stringEnum(['pipeline', 'metric', 'connector'], 'Resource type'),
			}),
			response: {
				200: {
					description: 'Success.',
					...tagValuesListResource,
					'x-examples': {
						'List of tag values': {
							summary: 'Paginated list of tag values.',
							value: {
								values: [
									{
										'ghg protocol': 'GHG Protocol',
										'the green alliance': 'The Green Alliance',
									},
								],
								pagination: {
									count: 2,
									lastEvaluated: {
										value: 'the green alliance',
									},
								},
							},

							'List of hierarchical tag values': {
								summary: 'Paginated list of hierarchical tag values.',
								value: {
									values: [
										{
											'material/metal/steel': 'Steel',
											'material/metal/iron': 'Iron',
										},
									],
									pagination: {
										count: 2,
										lastEvaluated: {
											value: 'material/metal/iron',
										},
									},
								},
							},
						},
					},
				},
				403: forbiddenResponse,
			},
			'x-security-scopes': atLeastReader,
		},
		constraints: {
			version: apiVersion100,
		},

		handler: async (request, reply) => {
			const svc = fastify.diContainer.resolve('tagService') as TagService;

			const { key } = request.params;
			const { count, fromValue, parentValue, resourceType } = request.query;

			let resourceKeyPrefix: string;
			switch (resourceType) {
				case 'pipeline':
					resourceKeyPrefix = PkType.Pipeline;
					break;
				case 'metric':
					resourceKeyPrefix = PkType.Metric;
					break;
				case 'connector':
					resourceKeyPrefix = PkType.Connector;
					break;
				default:
					throw new PipelineDefinitionError('Unrecognized ?resourceType provided.');
			}

			const [values, lastEvaluatedValue] = await svc.listByGroupId(request.authz, key, {
				parentTagValue: parentValue,
				count,
				exclusiveStart: { value: fromValue },
				resourceKeyPrefix,
			});

			const response: TagValuesListResource = { values };
			if (count || lastEvaluatedValue) {
				response.pagination = {};
				if (count) {
					response.pagination.count = count;
				}
				if (lastEvaluatedValue) {
					response.pagination.lastEvaluatedValue = lastEvaluatedValue.value;
				}
			}

			fastify.log.debug(`list.handler> exit:${JSON.stringify(response)}`);
			return reply.status(200).send(response); // nosemgrep
		},
	});

	done();
}
