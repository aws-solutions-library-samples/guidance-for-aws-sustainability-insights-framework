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

import type { AwilixContainer } from 'awilix';
import type { FastifyInstance } from 'fastify';
import { buildLightApp } from '../../app.light';
import type { ImpactCreationTaskHandler } from '../tasks/model.js';
import type { PipelineProcessorsService } from '../../api/executions/service.js';
import type { ImpactCreationTask } from '../tasks/impactCreationTask.js';
import { validateNotEmpty } from '@sif/validators';

const app: FastifyInstance = await buildLightApp();
const di: AwilixContainer = app.diContainer;
const task = di.resolve<ImpactCreationTask>('impactCreationTask');
const service = di.resolve<PipelineProcessorsService>('pipelineProcessorsService');

export const handler: ImpactCreationTaskHandler = async (event, _context, _callback): Promise<void> => {
	app.log.debug(`impactCreationTask > handler > event:${JSON.stringify(event)}`);
	validateNotEmpty(event, 'event');
	validateNotEmpty(event.executionId, 'executionId');
	validateNotEmpty(event.pipelineId, 'pipelineId');
	validateNotEmpty(event.security, 'security');
	const { executionId, pipelineId, security } = event;
	// create the impact factors
	const [status, statusMessage] = await task.process(event);
	// set the status
	await service.update(security, pipelineId, executionId, { status, statusMessage });
	app.log.debug(`impactCreationTask > handler > exit:`);
};
