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
import type { ActivityResultProcessorTaskHandler } from '../tasks/model.js';
import { validateNotEmpty } from '@sif/validators';
import type { ActivityResultProcessorTask } from '../tasks/activityResultProcessorTask.js';

const app: FastifyInstance = await buildLightApp();
const di: AwilixContainer = app.diContainer;
const task = di.resolve<ActivityResultProcessorTask>('activityResultProcessorTask');

export const handler: ActivityResultProcessorTaskHandler = async (event, _context, _callback): Promise<void> => {
	app.log.info(`activityResultProcessorHandler > handler > event: ${JSON.stringify(event)}`);

	validateNotEmpty(event, 'event');
	validateNotEmpty(event.input?.executionId, 'executionId');
	validateNotEmpty(event.input?.pipelineId, 'pipelineId');
	validateNotEmpty(event.input?.security, 'security');
	await task.process(event);

	app.log.info(`activityResultProcessorHandler > handler > exit:`);
};
