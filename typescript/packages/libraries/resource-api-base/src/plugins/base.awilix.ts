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
import pkg from 'aws-xray-sdk';
const { captureAWSv3Client } = pkg;
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { LambdaClient } from '@aws-sdk/client-lambda';
import { SQSClient } from '@aws-sdk/client-sqs';
import { DynamoDBDocumentClient, TranslateConfig } from '@aws-sdk/lib-dynamodb';
import { Cradle, diContainer } from '@fastify/awilix';
import { GroupPermissions } from '@sif/authz';
import { Invoker } from '@sif/lambda-invoker';

import { AccessManagementClient } from '../clients/accessManagement.client.js';
import { Utils } from '../common/utils.js';
import { GroupRepository } from '../groups/repository.js';
import { GroupService } from '../groups/service.js';
import { MessageService } from '../messages.service.js';
import { ResourceRepository } from '../resources/repository.js';
import { ResourceService } from '../resources/service.js';
import { TagRepository } from '../tags/repository.js';
import { TagService } from '../tags/service.js';

import type { FastifyBaseLogger } from 'fastify';
import { MergeUtils } from '../common/merge.js';
import { ProxyClient } from '@sif/proxy';

// declaration merging to allow for typescript checking
declare module '@fastify/awilix' {
	interface Cradle extends BaseCradle {
	}
}

export interface BaseCradle {
	accessManagementClient: AccessManagementClient;
	authChecker: GroupPermissions;
	dynamoDBDocumentClient: DynamoDBDocumentClient;
	groupRepository: GroupRepository;
	groupService: GroupService;
	invoker: Invoker;
	lambdaClient: LambdaClient;
	mergeUtils: MergeUtils;
	messageService: MessageService;
	proxyClient: ProxyClient;
	resourceRepository: ResourceRepository;
	resourceService: ResourceService;
	sqsClient: SQSClient;
	tagRepository: TagRepository;
	tagService: TagService;
	utils: Utils;
}

// factories for instantiation of 3rd party objects
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

class LambdaClientFactory {
	public static create(region: string): LambdaClient {
		return captureAWSv3Client(new LambdaClient({ region }));
	}
}

class SQSClientFactory {
	public static create(region: string): SQSClient {
		return captureAWSv3Client(new SQSClient({ region }));
	}
}

export function registerBaseAwilix(logger: FastifyBaseLogger) {
	const commonInjectionOptions = {
		lifetime: Lifetime.SINGLETON
	};

	const awsRegion = process.env['AWS_REGION'];
	const workerQueueUrl = process.env['WORKER_QUEUE_URL'];
	const tableName = process.env['TABLE_NAME'];
	const groupPartitionSize = parseInt(process.env['GROUP_PARTITION_SIZE']) || 3;
	const taskParallelLimit = parseInt(process.env['TASK_PARALLEL_LIMIT']) || 10;

	// then we can register our classes with the DI container
	diContainer.register({
		authChecker: asFunction(() => new GroupPermissions(logger), {
			...commonInjectionOptions
		}),

		dynamoDBDocumentClient: asFunction(() => DynamoDBDocumentClientFactory.create(awsRegion), {
			...commonInjectionOptions
		}),

		lambdaClient: asFunction(() => LambdaClientFactory.create(awsRegion), {
			...commonInjectionOptions
		}),

		sqsClient: asFunction(() => SQSClientFactory.create(awsRegion), {
			...commonInjectionOptions
		}),

		invoker: asFunction((container: Cradle) => new Invoker(logger, container.lambdaClient), {
			...commonInjectionOptions
		}),

		accessManagementClient: asFunction((container: Cradle) => new AccessManagementClient(logger, container.invoker, taskParallelLimit), {
			...commonInjectionOptions
		}),

		utils: asFunction(() => new Utils(logger, groupPartitionSize), {
			...commonInjectionOptions
		}),

		tagRepository: asFunction((container: Cradle) => new TagRepository(logger, container.dynamoDBDocumentClient, tableName), {
			...commonInjectionOptions
		}),

		tagService: asFunction((container: Cradle) => new TagService(logger, container.tagRepository, container.authChecker, container.sqsClient, workerQueueUrl, container.accessManagementClient), {
			...commonInjectionOptions
		}),

		groupRepository: asFunction((container: Cradle) => new GroupRepository(logger, container.dynamoDBDocumentClient, tableName, container.tagRepository, container.utils), {
			...commonInjectionOptions
		}),

		groupService: asFunction(
			(container: Cradle) => new GroupService(logger, container.groupRepository, container.tagService, container.accessManagementClient, workerQueueUrl, container.sqsClient, container.utils, container.resourceRepository),
			{
				...commonInjectionOptions
			}
		),

		resourceRepository: asFunction((container: Cradle) => new ResourceRepository(logger, container.dynamoDBDocumentClient, tableName, container.utils, taskParallelLimit), {
			...commonInjectionOptions
		}),

		resourceService: asFunction((container: Cradle) => new ResourceService(logger, container.resourceRepository, container.accessManagementClient, container.utils), {
			...commonInjectionOptions
		}),

		messageService: asFunction((container: Cradle) => new MessageService(logger, container.groupService, container.tagService), {
			...commonInjectionOptions
		}),

		mergeUtils: asFunction((container: Cradle) => new MergeUtils(container.tagService), {
			...commonInjectionOptions
		}),

		proxyClient: asFunction((container: Cradle) => new ProxyClient(logger, container.invoker), {
			...commonInjectionOptions
		})
	});
}
