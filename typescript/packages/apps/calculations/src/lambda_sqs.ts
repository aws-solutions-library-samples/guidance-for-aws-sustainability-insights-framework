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

import type { Context, SQSEvent } from 'aws-lambda';

import { buildLightApp } from './app.light.js';

import type { FastifyInstance } from 'fastify';
import type { AwilixContainer } from 'awilix';
import type { MessageService } from '@sif/resource-api-base';

const app: FastifyInstance = await buildLightApp();
const di: AwilixContainer = app.diContainer;

export const handler = async (event: SQSEvent, _context: Context): Promise<void> => {
	app.log.debug(`lambda_sqs> handler> in> ${JSON.stringify(event)}`);

	const svc: MessageService = di.resolve('messageService');
	await svc.handleEvent(event);
	app.log.debug(`lambda_sqs> handler> exit:`);
};
