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
import { S3Client } from '@aws-sdk/client-s3';
import { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import { EventPublisher } from '@sif/events';
import pino, { Logger } from 'pino';
import pretty from 'pino-pretty';
import pkg from 'aws-xray-sdk';
import { KinesisService } from '../kinesis/kinesis.service.js';
import { ConnectorEvents } from '@sif/connector-utils';
import { ConnectorConfig, ExecutionClient } from '@sif/clients';
import { TransformService } from '../kinesis/transform.service.js';
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
class S3ClientFactory {
	public static create(region: string | undefined): S3Client {
		const s3 = captureAWSv3Client(new S3Client({ region }));
		return s3;
	}
}

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

// Parameters
const handlebarsTemplate = process.env['HANDLEBARS_TEMPLATE'];
const eventBusName = process.env['EVENT_BUS_NAME'];
const region = process.env['AWS_REGION'];
const bucketName = process.env['BUCKET_NAME'];
const bucketPrefix = process.env['BUCKET_PREFIX'];
const pipelineId = process.env['PIPELINE_ID'];
const groupId = process.env['GROUP_CONTEXT_ID'];
const pipelineProcessorFunctionName = process.env['PIPELINE_PROCESSOR_FUNCTION_NAME'];
const connectorConfig: ConnectorConfig = JSON.parse(process.env['CONNECTOR_CONFIG']);
const source = `com.sif.connectors.input.kinesis`;
const commonInjectionOptions = {
	lifetime: Lifetime.SINGLETON,
};

container.register({

	logger: asFunction(() => logger, {
		...commonInjectionOptions
	}),

	s3Client: asFunction(() => S3ClientFactory.create(region), {
		...commonInjectionOptions,
	}),

	lambdaClient: asFunction(() => LambdaClientFactory.create(region), {
		...commonInjectionOptions
	}),

	eventBridgeClient: asFunction(() => EventBridgeClientFactory.create(region), {
		...commonInjectionOptions,
	}),

	invoker: asFunction((container) => new Invoker(logger, container.lambdaClient), {
		...commonInjectionOptions,
	}),

	executionClient: asFunction((container) =>
			new ExecutionClient(
				logger,
				container.invoker,
				pipelineProcessorFunctionName
			),
		{
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

	transformService: asFunction(() =>
			new TransformService(
				logger,
				handlebarsTemplate
			),
		{
			...commonInjectionOptions,
		}
	),

	kinesisService: asFunction((container) =>
			new KinesisService(
				logger,
				bucketName,
				bucketPrefix,
				container.s3Client,
				container.executionClient,
				container.transformService,
				connectorConfig,
				pipelineId,
				groupId,
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
