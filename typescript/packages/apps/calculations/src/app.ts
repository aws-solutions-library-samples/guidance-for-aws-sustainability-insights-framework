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

import { authzPlugin } from '@sif/authz';

import createCalculationRoute from './calculations/create.handler.js';
import getCalculationRoute from './calculations/get.handler.js';
import listCalculationsRoute from './calculations/list.handler.js';
import grantCalculationToGroupRoute from './calculations/groups/put.handler.js';
import revokeCalculationToGroupRoute from './calculations/groups/delete.handler.js';

import {
	calculationOutput,
	calculationOutputs,
	calculationParameter,
	calculationParameters,
	calculationResource,
	calculationsList,
	calculationVersionsList,
	editCalculationRequestBody,
	newCalculationRequestBody,
} from './calculations/schemas.js';
import updateCalculationRoute from './calculations/update.handler.js';
import getCalculationVersionRoute from './calculations/versions/get.handler.js';
import listCalculationVersionsRoute from './calculations/versions/list.handler.js';
import moduleAwilix from './plugins/module.awilix.js';
import config from './plugins/config.js';
import sensible from './plugins/sensible.js';
import swagger from './plugins/swagger.js';
import { handleError } from './common/errors.js';
import deleteCalculationRoute from './calculations/delete.handler.js';
import { tags } from '@sif/resource-api-base';
import { listTagsRoute } from './tags/list.handler.js';
import { proxyPlugin } from '@sif/proxy';

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

	app.setErrorHandler(handleError);

	// register all custom plugins
	await app.register(sensible);
	await app.register(config);
	await app.register(moduleAwilix);
	await app.register(proxyPlugin);
	await app.register(authzPlugin);
	await app.register(swagger);

	// register the user schemas and routes
	app.addSchema(calculationParameter);
	app.addSchema(calculationParameters);
	app.addSchema(calculationOutput);
	app.addSchema(calculationOutputs);
	app.addSchema(tags);
	app.addSchema(newCalculationRequestBody);
	app.addSchema(editCalculationRequestBody);
	app.addSchema(calculationResource);
	app.addSchema(calculationsList);
	app.addSchema(calculationVersionsList);

	await app.register(createCalculationRoute);
	await app.register(updateCalculationRoute);
	await app.register(getCalculationRoute);
	await app.register(listCalculationsRoute);
	await app.register(getCalculationVersionRoute);
	await app.register(listCalculationVersionsRoute);
	await app.register(grantCalculationToGroupRoute);
	await app.register(revokeCalculationToGroupRoute);
	await app.register(listTagsRoute);

	if (app.config.ENABLE_DELETE_RESOURCE) {
		await app.register(deleteCalculationRoute);
	}

	return app as unknown as FastifyInstance;
};
