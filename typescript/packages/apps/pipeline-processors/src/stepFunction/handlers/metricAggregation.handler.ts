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
import type { MetricAggregationTaskServiceV2 } from '../tasks/metricAggregationTaskV2.service.js';
import type { MetricAggregationTaskHandler } from '../tasks/model.js';

const app: FastifyInstance = await buildLightApp();
const di: AwilixContainer = app.diContainer;

export const handler: MetricAggregationTaskHandler = async (event, _context, _callback) => {
	app.log.debug(`MetricAggregationTaskHandler> handler> event: ${JSON.stringify(event)}`);

	const taskV2 = di.resolve<MetricAggregationTaskServiceV2>('aggregationTaskServiceV2');
	const processedEvent = await taskV2.process(event);

	app.log.debug(`MetricAggregationTaskHandler> handler> exit > processedEvent: ${processedEvent}`);
	return processedEvent;
};
