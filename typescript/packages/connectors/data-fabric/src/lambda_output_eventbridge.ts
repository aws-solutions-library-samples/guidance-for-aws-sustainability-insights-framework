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

import type { EventBridgeHandler } from 'aws-lambda';
import type { AwilixContainer } from 'awilix';
import { container } from './plugins/module.awilix.js';
import type { Logger } from 'pino';
import type { ConnectorOutputIntegrationRequestEvent } from '@sif/clients';
import type { ExportService } from './services/export.service.js';

const di: AwilixContainer = container;

const logger = di.resolve<Logger>('logger');
const exportService = di.resolve<ExportService>('exportService');

export const handler: EventBridgeHandler<any, ConnectorOutputIntegrationRequestEvent, any> = async (event, _context, _callback) => {
	logger.info(`connectors > datafabric > eventsLambda > handler > event: ${JSON.stringify(event)}`);
	await exportService.process(event.detail);
	logger.info(`connectors > datafabric > eventsLambda > handler > exit:`);
};
