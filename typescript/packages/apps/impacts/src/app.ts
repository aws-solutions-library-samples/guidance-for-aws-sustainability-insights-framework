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
import { proxyPlugin } from '@sif/proxy';
import { tags } from '@sif/resource-api-base';

import createActivityRoute from './activities/create.handler.js';
import deleteActivityRoute from './activities/delete.handler.js';
import getActivityRoute from './activities/get.handler.js';
import revokeActivityToGroupRoute from './activities/groups/delete.handler.js';
import grantActivityToGroupRoute from './activities/groups/put.handler.js';
import listActivitiesRoute from './activities/list.handler.js';
import { activityList, activityResource, activityVersionsList, editActivityRequestBody, newActivityRequestBody, activityRequestBody } from './activities/schemas.js';
import updateActivityRoute from './activities/update.handler.js';
import getActivityByVersionRoute from './activities/versions/get.handler.js';
import listActivityVersionsRoute from './activities/versions/list.handler.js';
import { handleError } from './common/errors.js';
import createComponentRoute from './components/create.handler.js';
import deleteComponentRoute from './components/delete.handler.js';
import getComponentRoute from './components/get.handler.js';
import listComponentsRoute from './components/list.handler.js';
import { componentMap, componentResource, editComponentRequestBody, newComponentRequestBody } from './components/schemas.js';
import updateComponentRoute from './components/update.handler.js';
import createImpactRoute from './impacts/create.handler.js';
import deleteImpactRoute from './impacts/delete.handler.js';
import getImpactRoute from './impacts/get.handler.js';
import listImpactRoute from './impacts/list.handler.js';
import { editImpactRequestBody, impactMap, impactResource, newImpactRequestBody } from './impacts/schemas.js';
import updateImpactRoute from './impacts/update.handler.js';
import config from './plugins/config.js';
import awilix from './plugins/module.awilix.js';
import swagger from './plugins/swagger.js';
import createActivityTaskRoute from './tasks/create.handler.js';
import getActivityTaskRoute from './tasks/get.handler.js';
import listActivityTasksRoute from './tasks/list.handler.js';
import deleteActivityTaskRoute from './tasks/delete.handler.js';
import { taskResource, taskList, activityTaskNew } from './tasks/schemas.js';
import getTaskItemRoute from './taskItems/get.handler.js';
import listActivityStatusRoute from './taskItems/list.handler.js';
import { taskItemList, taskItemResource } from './taskItems/schemas.js';
import { listTagsRoute } from './tags/list.handler.js';
import cors from '@fastify/cors';

export const buildApp = async (): Promise<FastifyInstance> => {
	const environment = process.env['NODE_ENV'] as string;
	const logLevel = process.env['LOG_LEVEL'] as string;
	const envToLogger = {
		local: {
			level: logLevel ?? 'info',
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
			level: logLevel ?? 'debug',
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

	// register all plugins
	await app.register(config);
	await app.register(swagger);
	await app.register(awilix);
	await app.register(cors, {});
	await app.register(fastifySensible);
	await app.register(proxyPlugin);
	await app.register(authzPlugin);

	app.setErrorHandler(handleError);

	// register the impact factors schemas and routes
	app.addSchema(tags);

	app.addSchema(componentMap);
	app.addSchema(componentResource);
	app.addSchema(editComponentRequestBody);
	app.addSchema(newComponentRequestBody);

	app.addSchema(impactMap);
	app.addSchema(editImpactRequestBody);
	app.addSchema(newImpactRequestBody);
	app.addSchema(impactResource);

	app.addSchema(activityResource);
	app.addSchema(activityList);
	app.addSchema(activityRequestBody);
	app.addSchema(editActivityRequestBody);
	app.addSchema(newActivityRequestBody);
	app.addSchema(activityVersionsList);

	app.addSchema(taskResource);
	app.addSchema(taskList);
	app.addSchema(activityTaskNew);

	app.addSchema(taskItemResource);
	app.addSchema(taskItemList);

	await app.register(createActivityRoute);
	await app.register(getActivityRoute);
	await app.register(getActivityByVersionRoute);
	await app.register(updateActivityRoute);
	await app.register(listActivitiesRoute);
	await app.register(listActivityVersionsRoute);
	await app.register(grantActivityToGroupRoute);
	await app.register(revokeActivityToGroupRoute);

	await app.register(createImpactRoute);
	await app.register(getImpactRoute);
	await app.register(updateImpactRoute);
	await app.register(listImpactRoute);

	await app.register(createComponentRoute);
	await app.register(updateComponentRoute);
	await app.register(listComponentsRoute);
	await app.register(getComponentRoute);

	await app.register(createActivityTaskRoute);
	await app.register(listActivityTasksRoute);
	await app.register(getActivityTaskRoute);

	await app.register(getTaskItemRoute);
	await app.register(listActivityStatusRoute);

	await app.register(listTagsRoute);

	if (app.config.ENABLE_DELETE_RESOURCE) {
		await app.register(deleteActivityRoute);
		await app.register(deleteImpactRoute);
		await app.register(deleteComponentRoute);
		await app.register(deleteActivityTaskRoute);
	}

	return app as unknown as FastifyInstance;
};
