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

import type { ActivityDownloadStartTaskHandler as Handler, ActivityDownloadTaskResponse } from '../tasks/model';
import type { FastifyInstance } from 'fastify';
import { buildLightApp } from '../../app.light';
import type { AwilixContainer } from 'awilix';
import type { ActivityDownloadStartTask } from '../tasks/activityDownloadStartTask';

const app: FastifyInstance = await buildLightApp();
const di: AwilixContainer = app.diContainer;

export const handler: Handler = async (event: ActivityDownloadTaskResponse, _context, _callback): Promise<ActivityDownloadTaskResponse> => {
	app.log.info(`activityDownloadStart > handler > event:${JSON.stringify(event)}`);
	const task = di.resolve<ActivityDownloadStartTask>('activityDownloadStartTask');
	const output = await task.process(event);
	app.log.info(`activityDownloadStart > handler > exit > output : ${JSON.stringify(output)}`);
	return output;
};
