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
import type { CreateReferenceDatasetOutput, ReferenceDatasetVerificationTaskHandler } from '../tasks/model.js';
import type { ReferenceDatasetVerificationTask } from '../tasks/referenceDatasetVerificationTask.js';

const app: FastifyInstance = await buildLightApp();
const di: AwilixContainer = app.diContainer;
const task = di.resolve<ReferenceDatasetVerificationTask>('referenceDatasetVerificationTask');

export const handler: ReferenceDatasetVerificationTaskHandler = async (event: CreateReferenceDatasetOutput, _context, _callback): Promise<CreateReferenceDatasetOutput> => {
	app.log.debug(`referenceDatasetVerificationTaskHandler > handler > event:${JSON.stringify(event)}`);
	const result = await task.process(event);
	app.log.debug(`referenceDatasetVerificationTaskHandler > handler > exit:`);
	return result;
};
