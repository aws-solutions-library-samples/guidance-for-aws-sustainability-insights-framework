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
import { CleanRoomsClient } from '@aws-sdk/client-cleanrooms';
import { EventPublisher } from '@sif/events';
import pino, { Logger } from 'pino';
import pretty from 'pino-pretty';
import pkg from 'aws-xray-sdk';
import { CleanRoomsService } from '../clean-rooms/cleanRooms.service';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import type { TranslateConfig } from '@aws-sdk/lib-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { CleanRoomsRepository } from '../clean-rooms/cleanRooms.repository';
import { S3Client } from '@aws-sdk/client-s3';
import { ConnectorEvents } from '@sif/connector-utils';

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

class CleanRoomsClientFactory {
	public static create(region: string | undefined): CleanRoomsClient {
		const cleanRooms = captureAWSv3Client(new CleanRoomsClient({ region }));
		return cleanRooms;
	}
}

class S3ClientFactory {
	public static create(region: string | undefined): CleanRoomsClient {
		const s3 = captureAWSv3Client(new S3Client({ region }));
		return s3;
	}
}

class DynamoDBDocumentClientFactory {
	public static create(region: string): DynamoDBDocumentClient {
		const ddb = captureAWSv3Client(new DynamoDBClient({ region }));
		const marshallOptions = {
			convertEmptyValues: false,
			removeUndefinedValues: true,
			convertClassInstanceToMap: false
		};
		const unmarshallOptions = {
			wrapNumbers: false
		};
		const translateConfig: TranslateConfig = { marshallOptions, unmarshallOptions };
		const dbc = DynamoDBDocumentClient.from(ddb, translateConfig);
		return dbc;
	}
}

// Parameters
const eventBusName = process.env['EVENT_BUS_NAME'];
const region = process.env['AWS_REGION'];
const bucketName = process.env['BUCKET_NAME'];
const bucketPrefix = process.env['BUCKET_PREFIX'];
const tableName = process.env['TABLE_NAME'];

const source = 'com.sif.connectors.input.cleanrooms';

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

	cleanRoomsClient: asFunction(() => CleanRoomsClientFactory.create(region), {
		...commonInjectionOptions,
	}),

	s3Client: asFunction(() => S3ClientFactory.create(region), {
		...commonInjectionOptions,
	}),

	dynamoDBDocumentClient: asFunction(() => DynamoDBDocumentClientFactory.create(region), {
		...commonInjectionOptions
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

	cleanRoomsRepository: asFunction((container) =>
			new CleanRoomsRepository(
				logger,
				container.dynamoDBDocumentClient,
				tableName
			),
		{
			...commonInjectionOptions,
		}
	),

	cleanRoomsService: asFunction((container) =>
			new CleanRoomsService(
				logger,
				container.cleanRoomsClient,
				bucketName,
				bucketPrefix,
				container.cleanRoomsRepository,
				container.s3Client,
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
