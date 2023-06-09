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

import { buildLightApp } from '../../app.light';
import type { AwilixContainer } from 'awilix';
import type { FastifyInstance } from 'fastify';
import type { S3NotificationEventBridgeHandler } from 'aws-lambda';
import type { InsertActivityTaskService } from '../tasks/insertyActivityService';
import type { S3ObjectCreatedNotificationEventDetail } from 'aws-lambda';

const app: FastifyInstance = await buildLightApp();
const di: AwilixContainer = app.diContainer;

export const handler: S3NotificationEventBridgeHandler = async (event, _context, _callback) => {
	app.log.debug(`InsertActivityHandler > handler > event: ${JSON.stringify(event)}`);
	const task = di.resolve<InsertActivityTaskService>('insertActivityTaskService');
	await task.process(event.detail as S3ObjectCreatedNotificationEventDetail);
	app.log.debug(`InsertActivityHandler > handler > exit:`);
};
