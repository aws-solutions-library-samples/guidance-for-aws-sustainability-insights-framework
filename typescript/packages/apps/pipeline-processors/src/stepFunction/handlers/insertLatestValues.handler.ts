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
import type { InsertLatestValuesTask } from '../tasks/insertLatestValuesTask.js';
import type { InsertLatestValuesTaskHandler, ProcessedTaskEvent } from '../tasks/model.js';

const app: FastifyInstance = await buildLightApp();
const di: AwilixContainer = app.diContainer;

export const handler: InsertLatestValuesTaskHandler = async (event: ProcessedTaskEvent, _context, _callback) => {
	app.log.debug(`InsertLatestValues > handler > event: ${JSON.stringify(event)}`);
	const task = di.resolve<InsertLatestValuesTask>('insertLatestValuesTask');
	event.status = await task.process(event);
	app.log.debug(`InsertLatestValues > handler > exit > event: ${JSON.stringify(event)}`);
	return event;
};
