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

import type { VerificationTaskHandler as VerificationHandler, VerificationTaskEvent, VerificationTaskOutput } from '../tasks/model';
import type { FastifyInstance } from 'fastify';
import { buildLightApp } from '../../app.light';
import type { AwilixContainer } from 'awilix';
import type { VerifyTask } from '../tasks/verifyTask';

const app: FastifyInstance = await buildLightApp();
const di: AwilixContainer = app.diContainer;

export const handler: VerificationHandler = async (event: VerificationTaskEvent, _context, _callback): Promise<VerificationTaskOutput> => {
	app.log.info(`resourceVerification > handler > event:${JSON.stringify(event.source)}`);
	const task = di.resolve<VerifyTask>('verifyTask');
	const tasks = await task.process(event);
	app.log.info(`resourceVerification > handler > exit > tasks : ${JSON.stringify(tasks)}`);
	return tasks;
};
