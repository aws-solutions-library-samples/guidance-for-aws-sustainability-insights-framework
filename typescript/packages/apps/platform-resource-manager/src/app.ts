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
import config from './plugins/config.js';
// @ts-ignore
import swagger from './plugins/swagger.js';
import moduleAwilix from './plugins/module.awilix.js';
import fastifySensible from '@fastify/sensible';
import multipart from '@fastify/multipart';
import cors from '@fastify/cors';
import { handleError } from './common/error.js';
import getResourceRoute from './resources/get.handler.js';
import listResourcesRoute from './resources/list.handler.js';
import createActionRoute from './actions/create.handler.js';
import { resource, resourceList } from './resources/schema.js';
import { actionResource } from './actions/schema.js';

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
					ignore: 'pid,hostname'
				}
			}
		},
		prod: {
			level: logLevel ?? 'warn'
		}
	};

	const app = fastify({
		logger: envToLogger[environment] ?? {
			level: logLevel ?? 'info'
		},
		ajv: {
			customOptions: {
				strict: 'log',
				keywords: ['kind', 'modifier'],
				removeAdditional: 'all'
			},
			plugins: [
				// eslint-disable-next-line @typescript-eslint/typedef
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				function(ajv: any) {
					ajv.addKeyword({ keyword: 'x-examples' });
				}
			]
		}
	}).withTypeProvider<TypeBoxTypeProvider>();

	app.setErrorHandler(handleError);

	// register all plugins
	await app.register(swagger);
	await app.register(config);
	await app.register(cors, {});
	await app.register(multipart, { attachFieldsToBody: 'keyValues' });
	await app.register(moduleAwilix);
	await app.register(fastifySensible);

	// register all schemas
	app.addSchema(resource);
	app.addSchema(resourceList);
	app.addSchema(actionResource);

	// register all routes
	await app.register(getResourceRoute);
	await app.register(listResourcesRoute);
	await app.register(createActionRoute);

	return app as unknown as FastifyInstance;
};
