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
import type { FastifyInstance } from 'fastify';
import { Cradle, diContainer, FastifyAwilixOptions, fastifyAwilixPlugin } from '@fastify/awilix';

import { DynamoDbUtils } from '@sif/dynamodb-utils';
import { BaseCradle, registerBaseAwilix } from '@sif/resource-api-base';

import { ActivityRepository } from '../activities/repository.js';
import { ActivityService } from '../activities/service.js';
import { ActivityValidator } from '../activities/validator.js';
import { CommonUtils } from '../common/common.utils.js';
import { ComponentService } from '../components/service.js';
import { ComponentValidator } from '../components/validator.js';
import { ImpactService } from '../impacts/service.js';
import { ImpactValidator } from '../impacts/validator.js';
import { ActivityTaskRepository } from '../tasks/repository.js';
import { ActivityTaskItemRepository } from '../taskItems/repository.js';
import { ActivityTaskService } from '../tasks/service.js';
import { ActivityTaskItemService } from '../taskItems/service.js';
import { ActivityTaskWorkflowProcessor } from '../tasks/workflows/processor.js';

// declaration merging to allow for typescript checking
declare module '@fastify/awilix' {
	interface Cradle extends BaseCradle {
		dynamoDbUtils: DynamoDbUtils;

		activityRepository: ActivityRepository;
		activityTaskRepository: ActivityTaskRepository;
		activityTaskItemRepository: ActivityTaskItemRepository;

		activityService: ActivityService;
		impactService: ImpactService;
		componentService: ComponentService;

		activityValidator: ActivityValidator;
		impactValidator: ImpactValidator;
		componentValidator: ComponentValidator;

		commonUtils: CommonUtils;

		activityTaskService: ActivityTaskService;
		activityTaskItemService: ActivityTaskItemService;
		activityTaskWorkflowProcessor: ActivityTaskWorkflowProcessor;
	}
}

export default fp<FastifyAwilixOptions>(async (app: FastifyInstance): Promise<void> => {
	// first register the DI plugin
	await app.register(fastifyAwilixPlugin, {
		disposeOnClose: true,
		disposeOnResponse: false,
	});

	const commonInjectionOptions = {
		lifetime: Lifetime.SINGLETON,
	};

	registerBaseAwilix(app.log);

	diContainer.register({
		dynamoDbUtils: asFunction((container: Cradle) => new DynamoDbUtils(app.log, container.dynamoDBDocumentClient), {
			...commonInjectionOptions,
		}),

		//Validators
		activityValidator: asFunction(() => new ActivityValidator(), {
			...commonInjectionOptions,
		}),

		impactValidator: asFunction(() => new ImpactValidator(), {
			...commonInjectionOptions,
		}),

		componentValidator: asFunction(() => new ComponentValidator(), {
			...commonInjectionOptions,
		}),

		// Repositories

		activityRepository: asFunction(
			(container) =>
				new ActivityRepository(
					app.log,
					container.dynamoDBDocumentClient,
					app.config.TABLE_NAME,
					container.tagRepository,
					container.groupRepository,
					container.dynamoDbUtils
				),
			{
				...commonInjectionOptions,
			}
		),

		// Services

		commonUtils: asFunction(() => new CommonUtils(), {
			...commonInjectionOptions,
		}),

		activityService: asFunction(
			(container) =>
				new ActivityService(
					app.log,
					container.authChecker,
					container.activityValidator,
					container.activityRepository,
					container.resourceService,
					container.groupService,
					container.tagService,
					container.commonUtils,
					container.mergeUtils
				),
			{
				...commonInjectionOptions,
			}
		),

		impactService: asFunction(
			(container) => new ImpactService(app.log, container.authChecker, container.impactValidator, container.activityService, container.commonUtils),
			{
				...commonInjectionOptions,
			}
		),

		componentService: asFunction(
			(container) => new ComponentService(app.log, container.authChecker, container.componentValidator, container.activityService),
			{
				...commonInjectionOptions,
			}
		),

		activityTaskRepository: asFunction(
			(container) =>
				new ActivityTaskRepository(
					app.log,
					container.dynamoDBDocumentClient,
					app.config.TABLE_NAME,
					container.groupRepository,
					container.dynamoDbUtils
				),
			{
				...commonInjectionOptions,
			}
		),

		activityTaskItemRepository: asFunction(
			(container) => new ActivityTaskItemRepository(app.log, container.dynamoDBDocumentClient, app.config.TABLE_NAME),
			{
				...commonInjectionOptions,
			}
		),

		activityTaskService: asFunction(
			(container) =>
				new ActivityTaskService(
					app.log,
					container.authChecker,
					container.activityTaskRepository,
					container.sqsClient,
					app.config.TASK_QUEUE_URL,
					app.config.TASK_BATCH_SIZE,
					app.config.TASK_PARALLEL_LIMIT,
					container.resourceService
				),
			{
				...commonInjectionOptions,
			}
		),
		activityTaskItemService: asFunction((container) => new ActivityTaskItemService(app.log, container.authChecker, container.activityTaskItemRepository), {
			...commonInjectionOptions,
		}),

		activityTaskWorkflowProcessor: asFunction(
			(container) =>
				new ActivityTaskWorkflowProcessor(
					app.log,
					container.activityService,
					container.activityTaskService,
					container.activityTaskItemService,
					app.config.TASK_PARALLEL_LIMIT
				),
			{
				...commonInjectionOptions,
			}
		),
	});
});
