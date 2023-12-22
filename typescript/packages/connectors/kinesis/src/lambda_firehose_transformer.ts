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
import  { container } from './plugins/module.awilix.js';
import type { KinesisService } from './kinesis/kinesis.service.js';
import type { Logger } from 'pino';

const di: AwilixContainer = container;

const kinesisService = di.resolve<KinesisService>('kinesisService');
const logger = di.resolve<Logger>('logger');
logger.level = process.env['LOG_LEVEL'] ?? 'info';

export const handler = async (event:any, _context, _callback) => {

	logger.info(`connectors > kinesis > eventsLambda > handler > event: ${JSON.stringify(event)}`);
	const results = await kinesisService.process(event);
	logger.info(`connectors > kinesis > eventsLambda > handler > exit:`);
	return results;
};
