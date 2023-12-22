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

import type { EventBridgeHandler, Context, Callback, CloudFormationCustomResourceSuccessResponse } from 'aws-lambda';
import type { AwilixContainer } from 'awilix';
import type { FastifyInstance } from 'fastify';
import { buildLightApp } from './app.light';
import type { ConnectorSetupRequestEvent } from '@sif/clients';
import { PIPELINE_CONNECTOR_SETUP_EVENT, PIPELINE_EVENT_SOURCE } from '@sif/events';
import type { ConnectorSetupEventProcessor } from './events/connectorSetup.eventProcessor.js';

const app: FastifyInstance = await buildLightApp();
const di: AwilixContainer = app.diContainer;

const eventProcessor = di.resolve<ConnectorSetupEventProcessor>('connectorSetupEventProcessor');

const environment = process.env['NODE_ENV'];
const tenantId = process.env['TENANT_ID'];


export const handler: EventBridgeHandler<string, EventDetails, void> = async (event, _context: Context, _callback: Callback) => {
	app.log.info(`EventBridgeInfrastructureLambda > handler > event: ${JSON.stringify(event)}`);

	if (event.source === PIPELINE_EVENT_SOURCE && event['detail-type'] === PIPELINE_CONNECTOR_SETUP_EVENT) {
		// process plugin setup event
		await eventProcessor.processConnectorSetupRequestEvent(event.detail as ConnectorSetupRequestEvent);
		// any other events are not handled
	} else if (event.source === 'aws.cloudformation' && event['detail-type'] === 'CloudFormation Stack Status Change' && event['detail']['stack-id'].includes(`sif-${tenantId}-${environment}-kinesis-`)) {
		await eventProcessor.processConnectorSetupResponseEvent(event.detail as CloudFormationCustomResourceSuccessResponse);
	} else {
		app.log.error('EventBridgeInfrastructureLambda > handler > Unimplemented event: ${JSON.Stringify(event)}');
	}

};

type EventDetails = ConnectorSetupRequestEvent | CloudFormationCustomResourceSuccessResponse


