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

import { asFunction, asValue, Lifetime } from 'awilix';
import fp from 'fastify-plugin';
import pkg from 'aws-xray-sdk';
const { captureAWSv3Client } = pkg;
import { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import { S3Client } from '@aws-sdk/client-s3';
import { SFNClient } from '@aws-sdk/client-sfn';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Cradle, diContainer, FastifyAwilixOptions, fastifyAwilixPlugin } from '@fastify/awilix';
import { SecurityScope } from '@sif/authz';
import { EventPublisher } from '@sif/events';
import { BaseCradle, registerBaseAwilix } from '@sif/resource-api-base';
import { CalculatorClient } from '@sif/clients';
import { MetricClient } from '@sif/clients';
import { PipelineClient } from '@sif/clients';
import { PipelineProcessorsRepository } from '../api/executions/repository.js';
import { PipelineProcessorsService } from '../api/executions/service.js';
import { MetricAggregationTaskService } from '../stepFunction/tasks/metricAggregationTask.service.js';
import { CalculationTask } from '../stepFunction/tasks/calculationTask.js';
import { ResultProcessorTask } from '../stepFunction/tasks/resultProcessorTask.js';
import { TriggerTask } from '../stepFunction/tasks/triggerTask.js';
import { VerifyTask } from '../stepFunction/tasks/verifyTask.js';
import type { FastifyInstance } from 'fastify';
import type { MetadataBearer, RequestPresigningArguments } from '@aws-sdk/types';
import type { Client, Command } from '@aws-sdk/smithy-client';
import { DynamoDbUtils } from '@sif/dynamodb-utils';
import { ActivityService } from '../api/activities/service.js';
import { MetricsService } from '../api/metrics/service.js';
import { MetricsRepository } from '../api/metrics/repository.js';
import { BaseRepositoryClient } from '../data/base.repository.js';
import { ActivitiesRepository } from '../api/activities/repository.js';
import { AggregationTaskAuroraRepository } from '../stepFunction/tasks/aggregationTask.aurora.repository.js';
import { PipelineAggregationTaskService } from '../stepFunction/tasks/pipelineAggregationTask.service.js';

const { BUCKET_NAME, BUCKET_PREFIX } = process.env;

declare module '@fastify/awilix' {
	interface Cradle extends BaseCradle {
		aggregationTaskAuroraRepository: AggregationTaskAuroraRepository;
		aggregationTaskService: MetricAggregationTaskService;
		pipelineAggregationTaskService: PipelineAggregationTaskService;
		calculationTask: CalculationTask;
		calculatorClient: CalculatorClient;
		dynamoDbUtils: DynamoDbUtils;
		eventBridgeClient: EventBridgeClient;
		eventPublisher: EventPublisher;
		metricClient: MetricClient;
		outputTask: ResultProcessorTask;
		pipelineClient: PipelineClient;
		pipelineProcessorsRepository: PipelineProcessorsRepository;
		pipelineProcessorsService: PipelineProcessorsService;
		s3Client: S3Client;
		stepFunctionClient: SFNClient;
		triggerTask: TriggerTask;
		verifyTask: VerifyTask;

		activityService: ActivityService;
		activitiesRepository: ActivitiesRepository;
		metricsService: MetricsService;
		metricsRepo: MetricsRepository;

		baseRepositoryClient: BaseRepositoryClient;

		getSignedUrl: <InputTypesUnion extends object, InputType extends InputTypesUnion, OutputType extends MetadataBearer = MetadataBearer>(
			client: Client<any, InputTypesUnion, MetadataBearer, any>,
			command: Command<InputType, OutputType, any, InputTypesUnion, MetadataBearer>,
			options?: RequestPresigningArguments
		) => Promise<string>;
	}
}

// factories for instantiation of 3rd party object

class EventBridgeClientFactory {
	public static create(region: string | undefined): EventBridgeClient {
		const eb = captureAWSv3Client(new EventBridgeClient({ region }));
		return eb;
	}
}

class S3ClientFactory {
	public static create(region: string | undefined): S3Client {
		const s3 = captureAWSv3Client(new S3Client({ region }));
		return s3;
	}
}

class StepFunctionClientFactory {
	public static create(region: string | undefined): SFNClient {
		const sfn = captureAWSv3Client(new SFNClient({ region }));
		return sfn;
	}
}

const registerContainer = (app?: FastifyInstance) => {
	const commonInjectionOptions = {
		lifetime: Lifetime.SINGLETON,
	};

	const taskParallelLimit = parseInt(process.env['TASK_PARALLEL_LIMIT']);
	const auditFileProcessingTime = parseInt(process.env['AUDIT_FILE_PROCESSING_TIME']);
	const awsRegion = process.env['AWS_REGION'];
	const eventBusName = process.env['EVENT_BUS_NAME'];
	const tableName = process.env['TABLE_NAME'];
	const calculatorFunctionName = process.env['CALCULATOR_FUNCTION_NAME'];
	const pipelineFunctionName = process.env['PIPELINES_FUNCTION_NAME'];
	const chunkSize = parseInt(process.env['CHUNK_SIZE']);
	const sourceDataBucket = process.env['BUCKET_NAME'];
	const sourceDataBucketPrefix = process.env['BUCKET_PREFIX'];
	const stateMachineArn = process.env['PIPELINE_STATE_MACHINE_ARN'];
	const metricsTableName = process.env['METRICS_TABLE_NAME'];
	const rdsDBHost = process.env['RDS_PROXY_ENDPOINT'];
	const rdsTenantUsername = process.env['TENANT_USERNAME'];
	const rdsTenantDatabase = process.env['TENANT_DATABASE_NAME'];
	const nodeEnv = process.env['NODE_ENV'];
	const caCert = process.env['CA_CERT'];
	// TODO: We need to add other table details
	const activitiesTableName = process.env['ACTIVITIES_TABLE_NAME'];
	const activitiesNumberValueTableName = process.env['ACTIVITIES_NUMBER_VALUE_TABLE_NAME'];
	const activitiesStringValueTableName = process.env['ACTIVITIES_STRING_VALUE_TABLE_NAME'];
	const activitiesBooleanTableName = process.env['ACTIVITIES_BOOLEAN_VALUE_TABLE_NAME'];
	const activitiesDateTimeTableName = process.env['ACTIVITIES_DATETIME_VALUE_TABLE_NAME'];

	const securityContext = {
		email: 'sif-pipeline-execution',
		groupId: '/',
		groupRoles: { '/': SecurityScope.reader },
	};

	diContainer.register({
		getSignedUrl: asValue(getSignedUrl),
		eventBridgeClient: asFunction(() => EventBridgeClientFactory.create(awsRegion), {
			...commonInjectionOptions,
		}),
		s3Client: asFunction(() => S3ClientFactory.create(awsRegion), {
			...commonInjectionOptions,
		}),
		stepFunctionClient: asFunction(() => StepFunctionClientFactory.create(awsRegion), {
			...commonInjectionOptions,
		}),
		baseRepositoryClient: asFunction(() => new BaseRepositoryClient(app.log, rdsDBHost, rdsTenantUsername, rdsTenantDatabase, nodeEnv, caCert), {
			...commonInjectionOptions,
		}),
		dynamoDbUtils: asFunction((container: Cradle) => new DynamoDbUtils(app.log, container.dynamoDBDocumentClient)),

		eventPublisher: asFunction((container: Cradle) => new EventPublisher(app.log, container.eventBridgeClient, eventBusName, 'com.aws.sif.pipelinePublishers'), {
			...commonInjectionOptions,
		}),
		pipelineProcessorsRepository: asFunction((container: Cradle) => new PipelineProcessorsRepository(app.log, container.dynamoDBDocumentClient, tableName), {
			...commonInjectionOptions,
		}),
		pipelineClient: asFunction((container: Cradle) => new PipelineClient(app.log, container.invoker, pipelineFunctionName), {
			...commonInjectionOptions,
		}),
		pipelineProcessorsService: asFunction(
			(container: Cradle) =>
				new PipelineProcessorsService(
					app.log,
					container.authChecker,
					container.s3Client,
					container.getSignedUrl,
					container.pipelineProcessorsRepository,
					BUCKET_NAME as string,
					BUCKET_PREFIX as string,
					container.eventPublisher,
					container.pipelineClient,
					taskParallelLimit,
					auditFileProcessingTime
				),
			{
				...commonInjectionOptions,
			}
		),
		calculatorClient: asFunction((container: Cradle) => new CalculatorClient(app.log, container.lambdaClient, calculatorFunctionName), {
			...commonInjectionOptions,
		}),
		triggerTask: asFunction(
			(container: Cradle) =>
				new TriggerTask(app.log, container.stepFunctionClient, container.pipelineProcessorsService, sourceDataBucket, sourceDataBucketPrefix, stateMachineArn, securityContext, container.s3Client, container.eventPublisher),
			{
				...commonInjectionOptions,
			}
		),
		calculationTask: asFunction((container: Cradle) => new CalculationTask(app.log, container.pipelineProcessorsService, container.calculatorClient, securityContext), {
			...commonInjectionOptions,
		}),

		verifyTask: asFunction((container: Cradle) => new VerifyTask(app.log, container.pipelineClient, container.pipelineProcessorsService, container.s3Client, securityContext, chunkSize), {
			...commonInjectionOptions,
		}),
		outputTask: asFunction((container: Cradle) => new ResultProcessorTask(app.log, securityContext, container.pipelineProcessorsService, container.s3Client, sourceDataBucket, sourceDataBucketPrefix), {
			...commonInjectionOptions,
		}),
		metricClient: asFunction((container: Cradle) => new MetricClient(app.log, container.invoker, pipelineFunctionName), {
			...commonInjectionOptions,
		}),
		aggregationTaskAuroraRepository: asFunction((container: Cradle) => new AggregationTaskAuroraRepository(app.log, container.baseRepositoryClient, activitiesTableName, activitiesNumberValueTableName), {
			...commonInjectionOptions,
		}),
		aggregationTaskService: asFunction((container: Cradle) => new MetricAggregationTaskService(app.log, container.metricClient, container.aggregationTaskAuroraRepository, container.metricsRepo, container.utils), {
			...commonInjectionOptions,
		}),
		pipelineAggregationTaskService: asFunction((container: Cradle) => new PipelineAggregationTaskService(app.log, container.activitiesRepository, container.pipelineProcessorsRepository, container.pipelineClient), {
			...commonInjectionOptions,
		}),
		activitiesRepository: asFunction(
			(container: Cradle) =>
				new ActivitiesRepository(app.log, container.baseRepositoryClient, activitiesTableName, activitiesStringValueTableName, activitiesNumberValueTableName, activitiesBooleanTableName, activitiesDateTimeTableName),
			{
				...commonInjectionOptions,
			}
		),
		activityService: asFunction((container: Cradle) => new ActivityService(app.log, container.activitiesRepository, container.authChecker, container.pipelineClient, container.pipelineProcessorsService), {
			...commonInjectionOptions,
		}),

		metricsRepo: asFunction((container: Cradle) => new MetricsRepository(app.log, container.dynamoDBDocumentClient, metricsTableName, container.dynamoDbUtils), {
			...commonInjectionOptions,
		}),
		metricsService: asFunction((container: Cradle) => new MetricsService(app.log, container.metricsRepo, container.authChecker, container.metricClient), {
			...commonInjectionOptions,
		}),
	});
};

export default fp<FastifyAwilixOptions>(async (app: FastifyInstance): Promise<void> => {
	// first register the DI plugin
	await app.register(fastifyAwilixPlugin, {
		disposeOnClose: true,
		disposeOnResponse: false,
	});

	registerBaseAwilix(app.log);

	registerContainer(app);
});

export { registerContainer };
