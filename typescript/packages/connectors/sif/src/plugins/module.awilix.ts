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
import { ActivityClient } from '@sif/clients';
import { ActivityService } from '../pipeline-processor/activities/service.js';
import { SifService } from '../sif/service';
import { EventPublisher } from '@sif/events';
import { ConnectorEvents } from '../events/connector.events.js';
import pino, { Logger } from 'pino';
import pretty from 'pino-pretty';
import pkg from 'aws-xray-sdk';
import { GroupPermissions } from '@sif/authz';
import { Invoker } from '@sif/lambda-invoker';
import { LambdaClient } from '@aws-sdk/client-lambda';

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

class LambdaClientFactory {
	public static create(region: string): LambdaClient {
		return captureAWSv3Client(new LambdaClient({ region }));
	}
}

const pipelineFunctionName = process.env['PIPELINE_PROCESSOR_FUNCTION_NAME'];
const eventBusName = process.env['EVENT_BUS_NAME'];
const region = process.env['AWS_REGION'];
const source = 'com.sif.connectors.input.activity'


const commonInjectionOptions = {
	lifetime: Lifetime.SINGLETON,
};


container.register({
	logger: asFunction(() => logger, {
		...commonInjectionOptions
	}),

	authChecker: asFunction(() => new GroupPermissions(logger), {
		...commonInjectionOptions
	}),

	eventBridgeClient: asFunction(() => EventBridgeClientFactory.create(region), {
		...commonInjectionOptions,
	}),
	eventPublisher: asFunction((container) => new EventPublisher(logger, container.eventBridgeClient, eventBusName, source), {
		...commonInjectionOptions,
	}),
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

	lambdaClient: asFunction(() => LambdaClientFactory.create(region), {
		...commonInjectionOptions
	}),


	invoker: asFunction((container) => new Invoker(logger, container.lambdaClient), {
		...commonInjectionOptions,
	}),

	activityClient: asFunction((container) => new ActivityClient(logger, container.invoker, pipelineFunctionName), {
		...commonInjectionOptions,
	}),


	// Services

	activityService: asFunction(
		(container) =>
			new ActivityService(
				logger,
				container.authChecker,
				container.activityClient
			),
		{
			...commonInjectionOptions,
		}
	),

	sifService: asFunction(
		(container) =>
			new SifService(
				logger,
				container.activityService,
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
