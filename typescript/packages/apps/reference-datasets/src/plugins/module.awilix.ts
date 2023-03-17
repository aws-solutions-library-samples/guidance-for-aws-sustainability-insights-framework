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
import { Cradle, diContainer, FastifyAwilixOptions, fastifyAwilixPlugin } from '@fastify/awilix';
import { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import { S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { SFNClient } from '@aws-sdk/client-sfn';
import pkg from 'aws-xray-sdk';
const { captureAWSv3Client } = pkg;
import { EventPublisher } from '@sif/events';
import { BaseCradle, registerBaseAwilix } from '@sif/resource-api-base';
import { DynamoDbUtils } from '@sif/dynamodb-utils';

import { ReferenceDatasetRepository } from '../referenceDatasets/repository.js';
import { ReferenceDatasetService } from '../referenceDatasets/service.js';

declare module '@fastify/awilix' {
	interface Cradle extends BaseCradle {
		dynamoDbUtils: DynamoDbUtils;
		eventBridgeClient: EventBridgeClient;
		eventPublisher: EventPublisher;
		referenceDatasetRepository: ReferenceDatasetRepository;
		referenceDatasetService: ReferenceDatasetService;
		s3Client: S3Client;
		stepFunctionClient: SFNClient;
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
		disposeOnResponse: false,
	});

	const commonInjectionOptions = {
		lifetime: Lifetime.SINGLETON,
	};

	const stateMachineArn = process.env['REFERENCE_DATASETS_STATE_MACHINE_ARN'];

	registerBaseAwilix(app.log);

	// then we can register our classes with the DI container
	diContainer.register({
		dynamoDbUtils: asFunction((container: Cradle) => new DynamoDbUtils(app.log, container.dynamoDBDocumentClient), {
			...commonInjectionOptions,
		}),

		s3Client: asFunction(() => S3ClientFactory.create(app.config.AWS_REGION), {
			...commonInjectionOptions,
		}),

		stepFunctionClient: asFunction(() => StepFunctionClientFactory.create(app.config.AWS_REGION), {
			...commonInjectionOptions,
		}),

		eventBridgeClient: asFunction(() => EventBridgeClientFactory.create(app.config.AWS_REGION), {
			...commonInjectionOptions,
		}),

		referenceDatasetRepository: asFunction((container) => new ReferenceDatasetRepository(app.log, container.dynamoDBDocumentClient, app.config.TABLE_NAME, container.tagRepository, container.groupRepository, container.dynamoDbUtils), {
			...commonInjectionOptions,
		}),
		eventPublisher: asFunction((container: Cradle) => new EventPublisher(app.log, container.eventBridgeClient, app.config.EVENT_BUS_NAME, 'com.aws.sif.referenceDatasets'), {
			...commonInjectionOptions,
		}),
		referenceDatasetService: asFunction(
			(container) =>
				new ReferenceDatasetService(
					app.log,
					container.authChecker,
					container.eventPublisher,
					container.referenceDatasetRepository,
					container.s3Client,
					app.config.BUCKET_NAME,
					app.config.BUCKET_PREFIX,
					getSignedUrl,
					container.groupService,
					container.tagService,
					container.resourceService,
					container.mergeUtils,
					container.stepFunctionClient,
					stateMachineArn
				),
			{
				...commonInjectionOptions,
			}
		),
	});
});
