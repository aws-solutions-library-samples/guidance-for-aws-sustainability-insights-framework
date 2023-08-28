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
import type { ProcessedTaskEventWithExecutionDetails, RawResultProcessorTaskHandler } from '../tasks/model.js';
import type { RawResultProcessorTask } from '../tasks/rawResultProcessorTask.js';
import type { PipelineProcessorsService } from '../../api/executions/service.js';
import type { GetSecurityContext } from '../../plugins/module.awilix.js';
import { validateNotEmpty } from '@sif/validators';

const app: FastifyInstance = await buildLightApp();
const di: AwilixContainer = app.diContainer;

const task = di.resolve<RawResultProcessorTask>('rawResultProcessorTask');
const service = di.resolve<PipelineProcessorsService>('pipelineProcessorsService');
const getSecurityContext = di.resolve<GetSecurityContext>('getSecurityContext');

export const handler: RawResultProcessorTaskHandler = async (event, _context, _callback): Promise<ProcessedTaskEventWithExecutionDetails> => {
	app.log.debug(`rawResultProcessorLambda > handler > event:${JSON.stringify(event)}`);
	validateNotEmpty(event, 'event');
	validateNotEmpty(event.inputs, 'inputs');
	validateNotEmpty(event.inputs[0].executionId, 'executionId');
	validateNotEmpty(event.inputs[0].pipelineId, 'pipelineId');
	const { executionId, pipelineId } = event.inputs[0];
	// process the result
	const [status, statusMessage] = await task.process(event);
	// set the status
	await service.update(await getSecurityContext(executionId), pipelineId, executionId, { status, statusMessage });
	app.log.debug(`rawResultProcessorLambda > handler > exit:`);
	return event;
};
