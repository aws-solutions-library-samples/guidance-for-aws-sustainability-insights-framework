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
import { tags } from '@sif/resource-api-base';

import { handleError } from './common/errors.js';
import createGroupRoute from './groups/create.handler.js';
import deleteGroupRoute from './groups/delete.handler.js';
import getGroupRoute from './groups/get.handler.js';
import listGroupsRoute from './groups/list.handler.js';
import { editGroupRequestBody, groupResource, groupRole, groupsList, newGroupRequestBody } from './groups/schemas.js';
import updateGroupRoute from './groups/update.handler.js';
import config from './plugins/config.js';
import moduleAwilix from './plugins/module.awilix.js';
import swagger from './plugins/swagger.js';
import getUserRoute from './users/get.handler.js';
import grantUserRoute from './users/grant.handler.js';
import listUsersRoute from './users/list.handler.js';
import revokeUserRoute from './users/revoke.handler.js';
import { editUserRequestBody, newUserRequestBody, userResource, usersList } from './users/schemas.js';
import updateUserRoute from './users/update.handler.js';

import type { SecurityContext } from '@sif/authz';
import { listTagsRoute } from './tags/list.handler.js';

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

	app.setErrorHandler(handleError);

	// register all plugins
	await app.register(config);
	await app.register(swagger);
	await app.register(moduleAwilix);
	await app.register(authzPlugin, { skipGroupCheck: true });
	await app.register(fastifySensible);

	// register the user schemas and routes
	app.addSchema(tags);
	app.addSchema(newUserRequestBody);
	app.addSchema(editUserRequestBody);
	app.addSchema(userResource);
	app.addSchema(usersList);
	await app.register(grantUserRoute);
	await app.register(revokeUserRoute);
	await app.register(updateUserRoute);
	await app.register(getUserRoute);
	await app.register(listUsersRoute);

	// register the group schemas and routes
	app.addSchema(newGroupRequestBody);
	app.addSchema(editGroupRequestBody);
	app.addSchema(groupResource);
	app.addSchema(groupsList);
	app.addSchema(groupRole);
	await app.register(createGroupRoute);
	await app.register(updateGroupRoute);
	await app.register(getGroupRoute);
	await app.register(listGroupsRoute);
	await app.register(deleteGroupRoute);

	await app.register(listTagsRoute);

	return app as unknown as FastifyInstance;
};

// helper declaration merging
declare module 'fastify' {
	interface FastifyRequest {
		authz: SecurityContext;
	}
}
