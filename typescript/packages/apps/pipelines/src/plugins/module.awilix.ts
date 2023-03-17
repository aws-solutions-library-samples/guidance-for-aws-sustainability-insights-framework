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
import { DynamoDbUtils } from '@sif/dynamodb-utils';
import { BaseCradle, registerBaseAwilix } from '@sif/resource-api-base';

import { PipelineRepository } from '../pipelines/repository.js';
import { PipelineService } from '../pipelines/service.js';

import type { FastifyInstance } from 'fastify';
import { TransformerValidator } from '@sif/validators';
import { CalculatorClient } from '@sif/clients';
import { MetricRepository } from '../metrics/repository.js';
import { MetricService } from '../metrics/service.js';

declare module '@fastify/awilix' {
	interface Cradle extends BaseCradle {
		pipelineRepository: PipelineRepository;
		pipelineService: PipelineService;
		metricRepository: MetricRepository;
		metricService: MetricService;
		dynamoDbUtils: DynamoDbUtils;
		validator: TransformerValidator;
		calculatorClient: CalculatorClient;
	}
}

export default fp<FastifyAwilixOptions>(async (app: FastifyInstance): Promise<void> => {
	const calculatorFunctionName = process.env['CALCULATOR_FUNCTION_NAME'];

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
		dynamoDbUtils: asFunction((container: Cradle) => new DynamoDbUtils(app.log, container.dynamoDBDocumentClient), {
			...commonInjectionOptions,
		}),
		validator: asFunction(() => new TransformerValidator(app.log), {
			...commonInjectionOptions,
		}),
		calculatorClient: asFunction((container) => new CalculatorClient(app.log, container.lambdaClient, calculatorFunctionName), {
			...commonInjectionOptions,
		}),

		pipelineRepository: asFunction((container) => new PipelineRepository(app.log, container.dynamoDBDocumentClient, app.config.TABLE_NAME, container.tagRepository, container.groupRepository, container.dynamoDbUtils), {
			...commonInjectionOptions,
		}),
		pipelineService: asFunction(
			(container) =>
				new PipelineService(
					app.log,
					container.authChecker,
					container.pipelineRepository,
					container.groupService,
					container.tagService,
					container.resourceService,
					container.validator,
					container.mergeUtils,
					container.calculatorClient,
					container.metricService
				),
			{
				...commonInjectionOptions,
			}
		),

		metricRepository: asFunction((container) => new MetricRepository(app.log, container.dynamoDBDocumentClient, app.config.TABLE_NAME, container.tagRepository, container.groupRepository, container.dynamoDbUtils), {
			...commonInjectionOptions,
		}),
		metricService: asFunction((container) => new MetricService(app.log, container.authChecker, container.metricRepository, container.groupService, container.tagService, container.resourceService, container.mergeUtils), {
			...commonInjectionOptions,
		}),
	});
});
