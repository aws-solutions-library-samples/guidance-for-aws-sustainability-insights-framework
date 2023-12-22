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
import type { ImpactCreationTaskEvent, RawResultProcessorTaskHandler } from '../tasks/model.js';
import type { RawResultProcessorTask } from '../tasks/rawResultProcessorTask.js';
import { validateNotEmpty } from '@sif/validators';

const app: FastifyInstance = await buildLightApp();
const di: AwilixContainer = app.diContainer;

const task = di.resolve<RawResultProcessorTask>('rawResultProcessorTask');

export const handler: RawResultProcessorTaskHandler = async (event, _context, _callback): Promise<ImpactCreationTaskEvent> => {
	app.log.debug(`rawResultProcessorLambda > handler > event:${JSON.stringify(event)}`);

	validateNotEmpty(event, 'event');
	validateNotEmpty(event?.inputs?.[0]?.context?.executionId, 'executionId');
	validateNotEmpty(event?.inputs?.[0]?.context?.pipelineId, 'pipelineId');
	validateNotEmpty(event?.inputs?.[0]?.context?.pipelineType, 'pipelineType');
	validateNotEmpty(event?.inputs?.[0]?.context?.security, 'security');

	const { executionId, pipelineId, pipelineType, security } = event.inputs[0].context;

	const sequenceList = event.inputs.map(o => o.calculatorTransformResponse?.sequence);
	const errorLocationList = event.inputs.filter(o => o.calculatorTransformResponse?.errorLocation !== undefined).map(o => o.calculatorTransformResponse?.errorLocation);

	await task.process({ security, executionId, pipelineType, pipelineId, sequenceList, errorLocationList });

	const resultEvent = { pipelineId, executionId, errorLocationList, sequenceList, pipelineType, security };
	app.log.debug(`rawResultProcessorLambda > handler > exit: ${resultEvent}`);
	return resultEvent;
};
