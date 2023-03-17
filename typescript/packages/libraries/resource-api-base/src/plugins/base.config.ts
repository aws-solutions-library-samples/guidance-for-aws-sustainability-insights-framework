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

import { Static, Type } from '@sinclair/typebox';

// eslint-disable-next-line @rushstack/typedef-var
export const baseConfigSchema = Type.Object({
	AWS_REGION: Type.String(),
	LOG_LEVEL: Type.String({ default: 'info' }),
	NODE_ENV: Type.String(),
	EVENT_BUS_NAME: Type.String(),
	TABLE_NAME: Type.Optional(Type.String()),
	WORKER_QUEUE_URL: Type.Optional(Type.String()),
	MODULE_NAME: Type.Optional(Type.String()),

	TENANT_ID: Type.Optional(Type.String()),
	PERMITTED_OUTGOING_TENANT_PATHS: Type.Optional(Type.String()),
	EXTERNALLY_SHARED_GROUP_IDS: Type.Optional(Type.String()),
});

export type BaseConfigSchemaType = Static<typeof baseConfigSchema>;
