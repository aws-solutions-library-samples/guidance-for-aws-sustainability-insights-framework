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

import type { fastifyEnvOpt } from '@fastify/env';
import { baseConfigSchema } from '@sif/resource-api-base';

// eslint-disable-next-line @rushstack/typedef-var
export const moduleConfigSchema = Type.Object({
	ACCESS_MANAGEMENT_FUNCTION_NAME: Type.String(),
	BUCKET_NAME: Type.String(),
	BUCKET_PREFIX: Type.String(),
	CALCULATOR_FUNCTION_NAME: Type.String(),
	PIPELINES_FUNCTION_NAME: Type.String(),
	PIPELINE_JOB_STATE_MACHINE_ARN: Type.String(),
	PIPELINE_INLINE_STATE_MACHINE_ARN: Type.String(),
	PORT: Type.Number({ default: 30004 }),
	TABLE_NAME: Type.String(),
	METRICS_TABLE_NAME: Type.String(),
	RDS_PROXY_ENDPOINT: Type.String(),
	TENANT_USERNAME: Type.String(),
	TENANT_DATABASE_NAME: Type.String(),
	TENANT_ID: Type.String(),
	INLINE_PROCESSING_ROWS_LIMIT: Type.Number({ default: 100 }),
	SUPPORTED_PIPELINE_S3_VERSION: Type.String({ default: 2 }),
});
export const configSchema = Type.Intersect([moduleConfigSchema, baseConfigSchema]);

export type ConfigSchemaType = Static<typeof configSchema>;

export default fp<fastifyEnvOpt>(async (app): Promise<void> => {
	await app.register(fastifyEnv, {
		confKey: 'config',
		schema: configSchema,
		dotenv: true,
	});
	app.log.info(`config: ${JSON.stringify(app.config)}`);
});

declare module 'fastify' {
	interface FastifyInstance {
		config: ConfigSchemaType;
	}
}
