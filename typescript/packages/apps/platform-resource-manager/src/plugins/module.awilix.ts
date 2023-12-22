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

import { asFunction, Lifetime } from 'awilix';
import fp from 'fastify-plugin';
import { diContainer, FastifyAwilixOptions, fastifyAwilixPlugin } from '@fastify/awilix';
import { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import { S3Client } from '@aws-sdk/client-s3';
import { SFNClient } from '@aws-sdk/client-sfn';
import pkg from 'aws-xray-sdk';

const { captureAWSv3Client } = pkg;
import { SSMClient } from '@aws-sdk/client-ssm';
import { ResourceService } from '../resources/service.js';
import { ActionService } from '../actions/service.js';
import { RDSClient } from '@aws-sdk/client-rds';
import { LockService } from '@sif/concurrency-manager';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import pino from 'pino';
import { AuroraService } from '../actions/aurora.service.js';

declare module '@fastify/awilix' {
	interface Cradle {
		eventBridgeClient: EventBridgeClient;
		s3Client: S3Client;
		stepFunctionClient: SFNClient;
		ssmClient: SSMClient;
		dynamoDBClient: DynamoDBClient;
		resourceService: ResourceService<string>;
		actionService: ActionService;
		rdsClient: RDSClient;
		lockService: LockService;
		auroraService: AuroraService;
	}
}

class DynamoDBClientFactory {
	public static create(region: string): DynamoDBClient {
		const s3 = captureAWSv3Client(new DynamoDBClient({ region }));
		return s3;
	}
}

class S3ClientFactory {
	public static create(region: string): S3Client {
		const s3 = captureAWSv3Client(new S3Client({ region }));
		return s3;
	}
}

class EventBridgeClientFactory {
	public static create(region: string | undefined): EventBridgeClient {
		const eb = captureAWSv3Client(new EventBridgeClient({ region }));
		return eb;
	}
}

class RDSClientFactory {
	public static create(region: string | undefined): RDSClient {
		const rdsClient = captureAWSv3Client(new RDSClient({ region }));
		return rdsClient;
	}
}

class SSMClientFactory {
	public static create(region: string | undefined): SSMClient {
		const eb = captureAWSv3Client(new SSMClient({ region }));
		return eb;
	}
}

class StepFunctionClientFactory {
	public static create(region: string | undefined): SFNClient {
		const sfn = captureAWSv3Client(new SFNClient({ region }));
		return sfn;
	}
}

export default fp<FastifyAwilixOptions>(async (app): Promise<void> => {
	// first register the DI plugin
	await app.register(fastifyAwilixPlugin, {
		disposeOnClose: true,
		disposeOnResponse: false
	});

	const commonInjectionOptions = {
		lifetime: Lifetime.SINGLETON
	};
	const resourceStatusParameterPrefix = process.env['RESOURCE_STATUS_PARAMETER_PREFIX'];
	const eventBusName = process.env['EVENT_BUS_NAME'];
	const lockTable: string = process.env['LOCK_MANAGER_TABLE'];
	const lockName: string = process.env['LOCK_NAME'];
	const rdsConcurrencyLimit: number = parseInt(process.env['RDS_CONCURRENCY_LIMIT']);
	const clusterIdentifier = process.env['CLUSTER_IDENTIFIER'];

	const logger = pino();
	logger.level = process.env['LOG_LEVEL'] ?? 'info';

	// then we can register our classes with the DI container
	diContainer.register({

		s3Client: asFunction(() => S3ClientFactory.create(app.config.AWS_REGION), {
			...commonInjectionOptions
		}),

		stepFunctionClient: asFunction(() => StepFunctionClientFactory.create(app.config.AWS_REGION), {
			...commonInjectionOptions
		}),

		dynamoDBClient: asFunction(() => DynamoDBClientFactory.create(app.config.AWS_REGION), {
			...commonInjectionOptions
		}),

		eventBridgeClient: asFunction(() => EventBridgeClientFactory.create(app.config.AWS_REGION), {
			...commonInjectionOptions
		}),

		ssmClient: asFunction(() => SSMClientFactory.create(app.config.AWS_REGION), {
			...commonInjectionOptions
		}),

		rdsClient: asFunction(() => RDSClientFactory.create(app.config.AWS_REGION), {
			...commonInjectionOptions
		}),

		resourceService: asFunction((container) => new ResourceService(app.log, container.ssmClient, resourceStatusParameterPrefix), {
			...commonInjectionOptions
		}),

		actionService: asFunction((container) => new ActionService(app.log, container.auroraService), {
			...commonInjectionOptions
		}),

		auroraService: asFunction((container) => new AuroraService(app.log, container.rdsClient, clusterIdentifier, container.eventBridgeClient, eventBusName, container.resourceService), {
			...commonInjectionOptions
		}),

		lockService: asFunction((container) => new LockService(logger, container.dynamoDBClient, lockTable, rdsConcurrencyLimit, lockName), {
			...commonInjectionOptions
		})
	});
});
