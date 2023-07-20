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
import type { ResultProcessorTaskHandler } from '../tasks/model.js';
import type { PipelineProcessorsService } from '../../api/executions/service.js';
import type { GetSecurityContext } from '../../plugins/module.awilix.js';
import { validateNotEmpty } from '@sif/validators';
import type { ResultProcessorTask } from '../tasks/resultProcessorTask.js';

const app: FastifyInstance = await buildLightApp();
const di: AwilixContainer = app.diContainer;
const task = di.resolve<ResultProcessorTask>('resultProcessorTask');
const service = di.resolve<PipelineProcessorsService>('pipelineProcessorsService');
const getSecurityContext = di.resolve<GetSecurityContext>('getSecurityContext');

export const handler: ResultProcessorTaskHandler = async (event, _context, _callback): Promise<void> => {
	app.log.info(`resultProcessorLambda > handler > event: ${JSON.stringify(event)}`);

	validateNotEmpty(event, 'event');
	validateNotEmpty(event[0].executionId, 'executionId');
	validateNotEmpty(event[0].pipelineId, 'pipelineId');

	const [status, statusMessage] = await task.process(event);
	// set the status
	const { executionId, pipelineId } = event[0];
	await service.update(await getSecurityContext(executionId), pipelineId, executionId, { status, statusMessage });
	app.log.info(`resultProcessorLambda > handler > exit:`);
};
