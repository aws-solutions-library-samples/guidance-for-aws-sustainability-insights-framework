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
import type { AggregationTaskEvent } from '../tasks/model.js';

import type { AwilixContainer } from 'awilix';
import type { FastifyInstance } from 'fastify';
import type { MetricAggregationTaskHandler } from '../tasks/model.js';
import type { MetricAggregationTaskService } from '../tasks/metricAggregationTask.service.js';

const app: FastifyInstance = await buildLightApp();
const di: AwilixContainer = app.diContainer;

export const handler: MetricAggregationTaskHandler = async (event: AggregationTaskEvent[], _context, _callback) => {
	app.log.debug(`MetricAggregationTaskHandler> handler> event: ${JSON.stringify(event)}`);
	const task = di.resolve<MetricAggregationTaskService>('aggregationTaskService');

	// the handler takes in an array of AggregationTaskEvent as it occurs after a map of calculation tasks, but
	// the parameters that this task needs are the same for all calculation tasks, hence why we just grab the
	// 1st AggregationTaskEvent to process. What's important here is the AggregationTask does not start until
	// all calculation tasks have completed.
	await task.process(event?.[0]);
	app.log.debug(`MetricAggregationTaskHandler> handler> exit:`);
};
