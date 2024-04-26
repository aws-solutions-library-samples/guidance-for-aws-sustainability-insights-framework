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
import type { ImpactCreationTaskEvent, ImpactCreationTaskHandler } from '../tasks/model.js';
import { validateDefined, validateNotEmpty } from '@sif/validators';
import type { ImpactCreationTask } from '../tasks/impactCreationTask';

const app: FastifyInstance = await buildLightApp();
const di: AwilixContainer = app.diContainer;

const task = di.resolve<ImpactCreationTask>('impactCreationTask');

export const handler: ImpactCreationTaskHandler = async (event, _context, _callback): Promise<ImpactCreationTaskEvent> => {
	app.log.debug(`dataResultProcessorLambda > handler > event:${JSON.stringify(event)}`);

	validateNotEmpty(event, 'event');
	validateNotEmpty(event?.executionId, 'executionId');
	validateNotEmpty(event?.pipelineId, 'pipelineId');
	validateNotEmpty(event?.pipelineType, 'pipelineType');
	validateNotEmpty(event?.security, 'security');
	validateDefined(event?.errorLocationList, 'errorLocationList');

	const { executionId, pipelineId, pipelineType, security, errorLocationList } = event;

	const response = await task.process({ security, executionId, pipelineType, pipelineId, errorLocationList });

	app.log.debug(`dataResultProcessorLambda > handler > exit>`);

	return { pipelineId, executionId, pipelineType, security, errorLocationList, moreActivitiesToProcess: response.moreActivitiesToProcess };
};
