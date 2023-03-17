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
import multipart from '@fastify/multipart';
import fastifySensible from '@fastify/sensible';
import { authzPlugin } from '@sif/authz';
import { errorHandler } from './common/errors.js';
import createExecutionAuditDownloadUrlRoute from './api/executions/createAuditUrl.handler.js';
import createExecutionErrorDownloadUrlRoute from './api/executions/createErrorUrl.handler.js';
import createPipelineInputUploadUrlRoute from './api/executions/createUploadUrl.handler.js';
import getPipelineExecutionRoute from './api/executions/getExecution.handler.js';
import listPipelineExecutionsRoute from './api/executions/listExecutions.handler.js';
import { pipelineExecutionFull, pipelineExecutionList, signedUrlListResponse, signedUrlRequest, signedUrlResponse, signedUrlUploadInputRequest, uploadSignedUrlResponse } from './api/executions/schemas.js';
import awilix from './plugins/module.awilix.js';
import config from './plugins/config.js';
import swagger from './plugins/swagger.js';
import { activitiesList, activityResource } from './api/activities/schemas.js';
import listActivitiesRoute from './api/activities/list.handler.js';
import { metricResource, metricsList } from './api/metrics/schemas.js';
import listMetricsRoute from './api/metrics/list.handler.js';

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
				function(ajv: any) {
					ajv.addKeyword({ keyword: 'x-examples' });
				},
			],
		},
	}).withTypeProvider<TypeBoxTypeProvider>();

	app.setErrorHandler(errorHandler);

	// register all plugins
	await app.register(config);
	await app.register(swagger);
	await app.register(multipart, { attachFieldsToBody: 'keyValues' });
	await app.register(awilix);
	await app.register(authzPlugin);
	await app.register(fastifySensible);

	app.addSchema(pipelineExecutionFull);
	app.addSchema(pipelineExecutionList);
	app.addSchema(signedUrlRequest);
	app.addSchema(signedUrlUploadInputRequest);
	app.addSchema(uploadSignedUrlResponse);
	app.addSchema(signedUrlResponse);
	app.addSchema(signedUrlListResponse);
	await app.register(createExecutionErrorDownloadUrlRoute);
	await app.register(createPipelineInputUploadUrlRoute);
	await app.register(createExecutionAuditDownloadUrlRoute);
	await app.register(getPipelineExecutionRoute);
	await app.register(listPipelineExecutionsRoute);

	app.addSchema(activityResource);
	app.addSchema(activitiesList);
	await app.register(listActivitiesRoute);

	app.addSchema(metricResource);
	app.addSchema(metricsList);
	await app.register(listMetricsRoute);

	return app as unknown as FastifyInstance;
};
