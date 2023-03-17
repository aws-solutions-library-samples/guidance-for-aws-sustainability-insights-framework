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
import swagger from './plugins/swagger.js';
import moduleAwilix from './plugins/module.awilix.js';
import fastifySensible from '@fastify/sensible';
import multipart from '@fastify/multipart';
import { editReferenceDatasetRequestBody, referenceDatasetResource, referenceDatasetList, newReferenceDatasetRequestBody, signedUrlResponse, signedUrlRequest, referenceDatasetVersionList } from './referenceDatasets/schemas.js';
import createReferenceDataRoute from './referenceDatasets/create.handler.js';
import getReferenceDatasetRoute from './referenceDatasets/get.handler.js';
import getReferenceDatasetByVersionRoute from './referenceDatasets/versions/get.handler.js';
import listReferenceDatasetsRoute from './referenceDatasets/list.handler.js';
import listReferenceDatasetsByVersionRoute from './referenceDatasets/versions/list.handler.js';
import deleteReferenceDatasetRoute from './referenceDatasets/delete.handler.js';
import updateReferenceDatasetRoute from './referenceDatasets/update.handler.js';
import revokeReferenceDatasetToGroupRoute from './referenceDatasets/groups/delete.handler.js';
import grantReferenceDatasetToGroupRoute from './referenceDatasets/groups/put.handler.js';
import createReferenceDatasetDataDownloadRoute from './referenceDatasets/data/createDownloadUrl.handler.js';
import createReferenceDatasetVersionDownloadDataRoute from './referenceDatasets/versions/data/createDownloadUrl.handler.js';
import createReferenceDatasetIndexDownloadRoute from './referenceDatasets/data/createIndexDownloadUrl.js';
import createReferenceDatasetVersionIndexDataRoute from './referenceDatasets/versions/data/createIndexDownloadUrl.handler.js';
import { tags } from '@sif/resource-api-base';
import { authzPlugin } from '@sif/authz';
import { proxyPlugin } from '@sif/proxy';
import { handleError } from './common/errors.js';
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

	app.setErrorHandler(handleError);

	// register all plugins
	await app.register(swagger);
	await app.register(config);
	await app.register(multipart, { attachFieldsToBody: 'keyValues' });
	await app.register(moduleAwilix);
	await app.register(proxyPlugin);
	await app.register(authzPlugin);
	await app.register(fastifySensible);

	// register the user schemas
	app.addSchema(tags);
	app.addSchema(referenceDatasetResource);
	app.addSchema(newReferenceDatasetRequestBody);
	app.addSchema(editReferenceDatasetRequestBody);
	app.addSchema(referenceDatasetList);
	app.addSchema(referenceDatasetVersionList);
	app.addSchema(signedUrlRequest);
	app.addSchema(signedUrlResponse);

	// register the routes
	await app.register(createReferenceDataRoute);
	await app.register(getReferenceDatasetRoute);
	await app.register(getReferenceDatasetByVersionRoute);
	await app.register(grantReferenceDatasetToGroupRoute);
	await app.register(revokeReferenceDatasetToGroupRoute);
	await app.register(listReferenceDatasetsRoute);
	await app.register(listReferenceDatasetsByVersionRoute);
	await app.register(updateReferenceDatasetRoute);
	await app.register(createReferenceDatasetDataDownloadRoute);
	await app.register(createReferenceDatasetVersionDownloadDataRoute);
	await app.register(createReferenceDatasetIndexDownloadRoute);
	await app.register(createReferenceDatasetVersionIndexDataRoute);
	await app.register(listTagsRoute);

	if (app.config.ENABLE_DELETE_RESOURCE) {
		await app.register(deleteReferenceDatasetRoute);
	}
	return app as unknown as FastifyInstance;
};
