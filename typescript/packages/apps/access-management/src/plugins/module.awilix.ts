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

import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import { Cradle, diContainer, FastifyAwilixOptions, fastifyAwilixPlugin } from '@fastify/awilix';
import { DynamoDbUtils } from '@sif/dynamodb-utils';
import { EventPublisher } from '@sif/events';
import { BaseCradle, registerBaseAwilix } from '@sif/resource-api-base';

import { GroupModuleRepository } from '../groups/repository.js';
import { GroupModuleService } from '../groups/service.js';
import { UserRepository } from '../users/repository.js';
import { UserService } from '../users/service.js';

declare module '@fastify/awilix' {
	interface Cradle extends BaseCradle {
		cognitoIdentityProviderClient: CognitoIdentityProviderClient;
		eventBridgeClient: EventBridgeClient;

		dynamoDbUtils: DynamoDbUtils;
		userRepository: UserRepository;
		userService: UserService;
		groupModuleRepository: GroupModuleRepository;
		groupModuleService: GroupModuleService;
		eventPublisher: EventPublisher;
	}
}

class CognitoIdentityProviderClientFactory {
	public static create(region: string): CognitoIdentityProviderClient {
		return new CognitoIdentityProviderClient({ region });
	}
}

class EventBridgeClientFactory {
	public static create(region: string): EventBridgeClient {
		return new EventBridgeClient({ region });
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

	registerBaseAwilix(app.log);

	// then we can register our classes with the DI container
	diContainer.register({
		cognitoIdentityProviderClient: asFunction(() => CognitoIdentityProviderClientFactory.create(app.config.AWS_REGION), {
			...commonInjectionOptions,
		}),

		eventBridgeClient: asFunction(() => EventBridgeClientFactory.create(app.config.AWS_REGION), {
			...commonInjectionOptions,
		}),

		dynamoDbUtils: asFunction((container: Cradle) => new DynamoDbUtils(app.log, container.dynamoDBDocumentClient), {
			...commonInjectionOptions,
		}),

		userRepository: asFunction((container: Cradle) => new UserRepository(app.log, container.dynamoDBDocumentClient, app.config.TABLE_NAME, container.tagRepository, container.dynamoDbUtils), {
			...commonInjectionOptions,
		}),

		eventPublisher: asFunction((container: Cradle) => new EventPublisher(app.log, container.eventBridgeClient, app.config.EVENT_BUS_NAME, 'com.aws.sif.accessManagement'), {
			...commonInjectionOptions,
		}),

		userService: asFunction(
			(container: Cradle) =>
				new UserService(
					app.log,
					container.authChecker,
					container.cognitoIdentityProviderClient,
					app.config.USER_POOL_ID,
					container.groupModuleService,
					container.userRepository,
					container.eventPublisher,
					container.tagRepository,
					container.tagService,
					container.resourceService,
					container.mergeUtils
				),
			{
				...commonInjectionOptions,
			}
		),

		groupModuleRepository: asFunction((container: Cradle) => new GroupModuleRepository(app.log, container.dynamoDBDocumentClient, app.config.TABLE_NAME, container.dynamoDbUtils, container.tagRepository, container.utils), {
			...commonInjectionOptions,
		}),

		groupModuleService: asFunction(
			(container: Cradle) =>
				new GroupModuleService(
					app.log,
					container.authChecker,
					container.cognitoIdentityProviderClient,
					app.config.USER_POOL_ID,
					container.groupModuleRepository,
					container.eventPublisher,
					container.tagRepository,
					container.tagService,
					container.resourceService,
					container.mergeUtils,
					container.utils
				),
			{
				...commonInjectionOptions,
			}
		),
	});
});
