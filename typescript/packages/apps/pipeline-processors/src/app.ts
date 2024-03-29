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
import fastifySensible from '@fastify/sensible';
import { authzPlugin } from '@sif/authz';
import { errorHandler } from './common/errors.js';
import { auditList, auditResource } from './api/activities/audits/schema.js';
import listActivityAuditsRoute from './api/activities/audits/list.handler.js';
import createExecutionErrorDownloadUrlRoute from './api/executions/createErrorUrl.handler.js';
import createExecutionOutputDownloadUrlRoute from './api/executions/createOutputDownloadUrl.handler.js';
import getPipelineExecutionRoute from './api/executions/getExecution.handler.js';
import listPipelineExecutionsRoute from './api/executions/listExecutions.handler.js';
import listMetricAggregationJobsRoute from './api/aggregations/list.handler.js';
import startMetricAggregationJobRoute from './api/aggregations/start.handler.js';
import createMetricAggregationJob from './api/aggregations/create.handler.js';
import deleteMetricAggregationJobRoute from './api/aggregations/delete.handler.js';

import {
	pipelineExecutionFull,
	pipelineExecutionList,
	pipelineExecutionRequest,
	signedUrlListResponse,
	signedUrlRequest,
	signedUrlResponse,
	signedUrlUploadInputRequest
} from './api/executions/schemas.js';
import awilix from './plugins/module.awilix.js';
import config from './plugins/config.js';
import swagger from './plugins/swagger.js';
import { activitiesDownload, activitiesDownloadList, activitiesList, activityResource, newActivitiesDownload } from './api/activities/schemas.js';
import listActivitiesRoute from './api/activities/list.handler.js';
import { metricResource, metricsList, newMetricsDownload, metricsDownloadList, metricsDownload } from './api/metrics/schemas.js';
import listMetricsRoute from './api/metrics/list.handler.js';
import { tags } from '@sif/resource-api-base';
import createExecution from './api/executions/createExecution.js';
import getPipelineAuditExecutionExportRoute from './api/executions/getAuditExecutionExport.handler.js';
import createActivitiesDownloadRoute from './api/activities/createActivitiesDownload.handler.js';
import getActivitiesDownloadRoute from './api/activities/getActivitiesDownload.handler.js';
import createMetricsDownloadRoute from './api/metrics/createMetricsDownload.handler.js';
import getMetricsDownloadRoute from './api/metrics/getMetricsDownload.handler.js';
import cors from '@fastify/cors';
import { newMetricAggregationJob, metricAggregationJob, metricAggregationJobList, startMetricAggregationJob } from './api/aggregations/schemas.js';

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
	await app.register(awilix);
	await app.register(cors, {});
	await app.register(authzPlugin);
	await app.register(fastifySensible);

	// register all schemas
	app.addSchema(tags);
	app.addSchema(pipelineExecutionRequest);
	app.addSchema(pipelineExecutionFull);
	app.addSchema(pipelineExecutionList);
	app.addSchema(signedUrlRequest);
	app.addSchema(signedUrlUploadInputRequest);
	app.addSchema(signedUrlResponse);
	app.addSchema(signedUrlListResponse);
	app.addSchema(auditResource);
	app.addSchema(auditList);
	app.addSchema(metricAggregationJob);
	app.addSchema(metricAggregationJobList);
	app.addSchema(startMetricAggregationJob);
	app.addSchema(newMetricAggregationJob);

	// register all routes
	await app.register(createExecutionErrorDownloadUrlRoute);
	await app.register(createExecutionOutputDownloadUrlRoute);
	await app.register(getPipelineExecutionRoute);
	await app.register(listPipelineExecutionsRoute);
	await app.register(createExecution);
	await app.register(createMetricAggregationJob);
	await app.register(deleteMetricAggregationJobRoute);
	await app.register(listActivityAuditsRoute);
	await app.register(listMetricAggregationJobsRoute);
	await app.register(startMetricAggregationJobRoute);

	app.addSchema(activityResource);
	app.addSchema(activitiesList);
	await app.register(listActivitiesRoute);

	app.addSchema(metricResource);
	app.addSchema(metricsList);

	await app.register(listMetricsRoute);
	await app.register(getPipelineAuditExecutionExportRoute);

	app.addSchema(newActivitiesDownload);
	app.addSchema(activitiesDownload);
	app.addSchema(activitiesDownloadList);
	await app.register(createActivitiesDownloadRoute);
	await app.register(getActivitiesDownloadRoute);

	app.addSchema(newMetricsDownload);
	app.addSchema(metricsDownload);
	app.addSchema(metricsDownloadList);
	await app.register(createMetricsDownloadRoute);
	await app.register(getMetricsDownloadRoute);

	return app as unknown as FastifyInstance;
};
