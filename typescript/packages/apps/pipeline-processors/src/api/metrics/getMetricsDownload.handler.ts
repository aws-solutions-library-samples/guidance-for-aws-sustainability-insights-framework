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

import { atLeastReader } from '@sif/authz';
import { apiVersion100, commonHeaders, FastifyTypebox, id, notFoundResponse, acceptedResponse } from '@sif/resource-api-base';
import { Type } from '@sinclair/typebox';
import { metricsDownloadList } from '../metrics/schemas.js';
import { metricsDownloadExample } from './examples.js';

export default function getMetricsDownloadRoute(fastify: FastifyTypebox, _options: unknown, done: () => void): void {
	fastify.route({
		method: 'GET',
		url: '/metrics/download/:downloadId',
		schema: {
			description: `Retrieve signed url used to download the metrics query output.`,
			tags: ['Metrics'],
			headers: commonHeaders,
			params: Type.Object({
				downloadId: id,
			}),
			response: {
				200: {
					description: 'Success.',
					...Type.Ref(metricsDownloadList),
					'x-examples': {
						'Metrics Download': {
							summary: 'Signed url of the created metric download.',
							value: { ...metricsDownloadExample },
						},
					},
				},
				202: acceptedResponse,
				404: notFoundResponse,
			},
			'x-security-scopes': atLeastReader,
		},
		constraints: {
			version: apiVersion100,
		},

		handler: async (request, reply) => {
			const svc = fastify.diContainer.resolve('metricsService');
			const metricsDownload = await svc.getMetricsDownload(request.authz, request.params.downloadId);
			if (metricsDownload) {
				await reply.status(200).send(metricsDownload); // nosemgrep
			} else {
				await reply.status(202).send(); // nosemgrep
			}
		},
	});

	done();
}
