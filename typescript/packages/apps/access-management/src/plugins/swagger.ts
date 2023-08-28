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

import fp from 'fastify-plugin';

import FastifySwagger, { FastifySwaggerOptions } from '@fastify/swagger';

import { writeFile } from 'fs';

export default fp<FastifySwaggerOptions>(async (app) => {
	await app.register(FastifySwagger, {
		openapi: {
			info: {
				title: 'SIF SaaS: Access Management',
				description: `
Has accountability for:
- User management
- Group and permission management

Supported security roles within each group:
- admin
- contributor
- reader

API version is managed via \`Accept-Version\` request header. Supported versions:
- 1.0.0
`,
				version: '0.0.1',
			},
			servers: [
				{
					url: 'http://localhost',
				},
			],
			tags: [
				{
					name: 'Users',
					description: 'User management',
				},
				{
					name: 'Groups',
					description: `Manages application groups.

Upon initial deployment the module is seeded with the global group \`/\`. This set of APIs allow for the management of application groups in a hierarchical nature. The different resources (e.g. reference datasets) and users are assigned to these application groups which in turn dictates the user's permissions throughout the platform.

It is recommended that a group structure be created beneath the built-in global \`/\` group to reflect the stucture of your business: it could represent account and sub-accounts, organization and business units, teams, or any combination of.
`,
				},
			],
			components: {
				securitySchemes: {
					tenantUserPool: {
						type: 'apiKey',
						name: 'Authorization',
						in: 'header',
					},
				},
			},
			security: [],
		},
	});

	if (process.env['NODE_ENV'] === 'local') {
		const specFile = './docs/swagger.json';

		app.ready(() => {
			const apiSpec = JSON.stringify(app.swagger(), null, 2);

			writeFile(specFile, apiSpec, (err) => {
				if (err) {
					return app.log.error(`failed to save api spec to ${specFile} - err:${err}`);
				}
				app.log.debug(`saved api spec to ${specFile}`);
			});
		});
	}
});
