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
import fastifyEnv from '@fastify/env';
import { Static, Type } from '@sinclair/typebox';
import { baseConfigSchema } from '@sif/resource-api-base';
import type { FastifyEnvOptions } from '@fastify/env';
import { convertFromTypeBoxIntersectToJSONSchema } from '@sif/resource-api-base';

export const moduleConfigSchema = Type.Object({
	PORT: Type.Number({ default: 30001 }),
	USER_POOL_ID: Type.String(),
});
export const configSchema = Type.Intersect([moduleConfigSchema, baseConfigSchema]);

export type ConfigSchemaType = Static<typeof configSchema>;

export default fp<FastifyEnvOptions>(async (app): Promise<void> => {
	await app.register(fastifyEnv, {
		confKey: 'config',
		schema: convertFromTypeBoxIntersectToJSONSchema(configSchema),
		dotenv: true
	});
	app.log.info(`config: ${JSON.stringify(app.config)}`);
});

declare module 'fastify' {
	interface FastifyInstance {
		config: ConfigSchemaType;
	}
}
