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

import { CalculationRepository } from '../calculations/repository.js';
import { CalculationService } from '../calculations/service.js';

import type { FastifyInstance } from 'fastify';
import { CalculationValidator } from '@sif/validators';
import { CalculatorClient } from '@sif/clients';

// declaration merging to allow for typescript checking
declare module '@fastify/awilix' {
	interface Cradle extends BaseCradle {
		calculationRepository: CalculationRepository;
		calculationService: CalculationService;
		dynamoDbUtils: DynamoDbUtils;
		validator: CalculationValidator;
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

	diContainer.register({
		dynamoDbUtils: asFunction((container: Cradle) => new DynamoDbUtils(app.log, container.dynamoDBDocumentClient), {
			...commonInjectionOptions,
		}),
		validator: asFunction(() => new CalculationValidator(app.log), {
			...commonInjectionOptions,
		}),
		calculatorClient: asFunction((container) => new CalculatorClient(app.log, container.lambdaClient, calculatorFunctionName), {
			...commonInjectionOptions,
		}),

		calculationRepository: asFunction(
			(container: Cradle) =>
				new CalculationRepository(
					app.log,
					container.dynamoDBDocumentClient,
					app.config.TABLE_NAME,
					container.dynamoDbUtils,
					container.tagRepository,
					container.groupRepository
				),
			{
				...commonInjectionOptions,
			}
		),

		calculationService: asFunction(
			(container: Cradle) =>
				new CalculationService(
					app.log,
					container.authChecker,
					container.validator,
					container.calculationRepository,
					container.groupService,
					container.tagService,
					container.resourceService,
					container.mergeUtils,
					container.calculatorClient
				),
			{
				...commonInjectionOptions,
			}
		),
	});
});
