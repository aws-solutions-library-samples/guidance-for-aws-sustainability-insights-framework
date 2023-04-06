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

import { asFunction, Lifetime, createContainer } from 'awilix';
import { EventBridgeClient } from '@aws-sdk/client-eventbridge';

import { EventPublisher } from '@sif/events';

import { CsvService } from '../csv/csv.service.js';
import { ConnectorEvents } from '../events/connector.events.js';
import pino, { Logger } from 'pino';
import pretty from 'pino-pretty';
import pkg from 'aws-xray-sdk';

const { captureAWSv3Client } = pkg;

const container = createContainer({
	injectionMode: 'PROXY'
});

const logger: Logger = pino(
	pretty({
		colorize: true,
		translateTime: 'HH:MM:ss Z',
		ignore: 'pid,hostname',
	})
);

// Clients
class EventBridgeClientFactory {
	public static create(region: string | undefined): EventBridgeClient {
		const event = captureAWSv3Client(new EventBridgeClient({ region }));
		return event;
	}
}



// Parameters
	const eventBusName = process.env['EVENT_BUS_NAME'];
	const region = process.env['AWS_REGION'];
	const source = 'com.sif.connectors.input.csv'

	const commonInjectionOptions = {
		lifetime: Lifetime.SINGLETON,
	};



	container.register({

		logger: asFunction(() => logger, {
			...commonInjectionOptions
		}),

		eventBridgeClient: asFunction(() => EventBridgeClientFactory.create(region), {
			...commonInjectionOptions,
		}),

		eventPublisher: asFunction((container) =>
			new EventPublisher(
				logger,
				container.eventBridgeClient,
				eventBusName,
				source
			),
			{
				...commonInjectionOptions,
			}
		),

		connectorEvents: asFunction((container) =>
			new ConnectorEvents(
				logger,
				container.eventPublisher,
				eventBusName,
				region,
				source
			),
			{
				...commonInjectionOptions,
			}
		),

		csvService: asFunction((container) =>
				new CsvService(
					logger,
					container.connectorEvents
				),
			{
				...commonInjectionOptions,
			}
		),

	});


export {
	container
};
