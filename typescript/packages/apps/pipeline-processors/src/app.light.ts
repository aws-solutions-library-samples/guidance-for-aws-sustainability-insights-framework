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

import type { FastifyInstance } from 'fastify';
import { fastify } from 'fastify';
import awilix from './plugins/module.awilix.js';

export const buildLightApp = async (): Promise<FastifyInstance> => {
	// initialize fastify, using TypeBox as the type provider
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
	});
	// register ioc plugin
	await app.register(awilix);

	return app as unknown as FastifyInstance;
};
