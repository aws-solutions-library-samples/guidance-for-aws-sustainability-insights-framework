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
import  { container } from './plugins/module.awilix.js';
import { PIPELINE_PROCESSOR_CONNECTOR_REQUEST_EVENT } from '@sif/events';
import type { ConnectorIntegrationRequestEvent } from '@sif/clients';
import type { CsvService } from './csv/csv.service.js';
import type { Logger } from 'pino';

const di: AwilixContainer = container;

const csvService = di.resolve<CsvService>('csvService');
const logger = di.resolve<Logger>('logger');

export const handler: EventBridgeHandler<string, ConnectorIntegrationRequestEvent, void> = async (event, _context, _callback) => {

	logger.info(`connectors > csv > eventsLambda > handler > event: ${JSON.stringify(event)}`);
	if (event['detail-type'] === PIPELINE_PROCESSOR_CONNECTOR_REQUEST_EVENT) {
		await csvService.processConnectorIntegrationRequest(event.detail);
	} else {
		logger.warn(`connector > csv > received an unrecognized event: ${JSON.stringify(event)}`);
	}
	logger.info(`connectors > csv > eventsLambda > handler > exit:`);
};
