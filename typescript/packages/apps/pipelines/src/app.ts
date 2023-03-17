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

import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyInstance } from 'fastify';
import { fastify } from 'fastify';

import { tags } from '@sif/resource-api-base';
import { authzPlugin } from '@sif/authz';

import config from './plugins/config.js';
import swagger from './plugins/swagger.js';
import awilix from './plugins/module.awilix.js';
import sensible from './plugins/sensible.js';
import { errorHandler } from './common/errors.js';

import { editPipelineRequestBody, pipelineResource, newPipelineRequestBody, pipelineList, pipelineVersionList } from './pipelines/schemas.js';

import createPipelineRoute from './pipelines/handlers/create.handler.js';
import updatePipelineRoute from './pipelines/handlers/update.handler.js';
import getPipelineRoute from './pipelines/handlers/get.handler.js';
import listPipelinesRoute from './pipelines/handlers/list.handler.js';
import getPipelineByVersionRoute from './pipelines/handlers/getVersion.handler.js';
import listPipelineVersionsRoute from './pipelines/handlers/listVersions.handler.js';
import deletePipelineRoute from './pipelines/handlers/delete.handler.js';
import grantPipelineToGroupRoute from './pipelines/handlers/groups/put.handler.js';
import revokePipelineToGroupRoute from './pipelines/handlers/groups/delete.handler.js';
import { listTagsRoute } from './tags/list.handler.js';
import { editMetricRequestBody, metricList, metricResource, newMetricRequestBody } from './metrics/schemas.js';
import createMetricRoute from './metrics/handlers/create.handler.js';
import updateMetricRoute from './metrics/handlers/update.handler.js';
import getMetricRoute from './metrics/handlers/get.handler.js';
import getMetricByVersionRoute from './metrics/handlers/getVersion.handler.js';
import listMetricsRoute from './metrics/handlers/list.handler.js';
import listMetricVersionsRoute from './metrics/handlers/listVersions.handler.js';
import grantMetricToGroupRoute from './metrics/handlers/groups/put.handler.js';
import revokeMetricToGroupRoute from './metrics/handlers/groups/delete.handler.js';
import deleteMetricRoute from './metrics/handlers/delete.handler.js';

export const buildApp = async (): Promise<FastifyInstance> => {
	const environment = process.env['NODE_ENV'] as string;
	const logLevel = process.env['LOG_LEVEL'] as string;
	const envToLogger = {
		local: {
			level: logLevel ?? 'debug',
			transport: {
				target: 'pino-pretty',
				options: {
					translateTime: 'HH:MM:ss Z',
					ignore: 'pid,hostname',
				},
			},
		},
		prod: {
			level: logLevel ?? 'warn',
		},
	};

	const app = fastify({
		// @ts-ignore
		logger: envToLogger[environment] ?? {
			level: logLevel ?? 'info',
		},
		ajv: {
			customOptions: {
				strict: 'log',
				keywords: ['kind', 'modifier'],
				removeAdditional: 'all',
			},
			plugins: [
				// eslint-disable-next-line @typescript-eslint/typedef
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				function (ajv: any) {
					ajv.addKeyword({ keyword: 'x-examples' });
				},
			],
		},
	}).withTypeProvider<TypeBoxTypeProvider>();

	// register all plugins
	await app.register(config);
	await app.register(swagger);
	await app.register(awilix);
	await app.register(authzPlugin);
	await app.register(sensible);

	app.setErrorHandler(errorHandler);

	// register the tags schemas and routes
	app.addSchema(tags);
	await app.register(listTagsRoute);

	// register the pipeline schemas and routes
	app.addSchema(newPipelineRequestBody);
	app.addSchema(pipelineResource);
	app.addSchema(editPipelineRequestBody);
	app.addSchema(pipelineList);
	app.addSchema(pipelineVersionList);

	await app.register(createPipelineRoute);
	await app.register(updatePipelineRoute);
	await app.register(getPipelineRoute);
	await app.register(getPipelineByVersionRoute);
	await app.register(listPipelinesRoute);
	await app.register(listPipelineVersionsRoute);
	await app.register(grantPipelineToGroupRoute);
	await app.register(revokePipelineToGroupRoute);
	if (app.config.ENABLE_DELETE_RESOURCE) {
		await app.register(deletePipelineRoute);
	}

	// register the metric schemas and routes
	app.addSchema(newMetricRequestBody);
	app.addSchema(metricResource);
	app.addSchema(editMetricRequestBody);
	app.addSchema(metricList);

	await app.register(createMetricRoute);
	await app.register(updateMetricRoute);
	await app.register(getMetricRoute);
	await app.register(getMetricByVersionRoute);
	await app.register(listMetricsRoute);
	await app.register(listMetricVersionsRoute);
	await app.register(grantMetricToGroupRoute);
	await app.register(revokeMetricToGroupRoute);
	if (app.config.ENABLE_DELETE_RESOURCE) {
		await app.register(deleteMetricRoute);
	}

	return app as unknown as FastifyInstance;
};
