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

import { AthenaClient } from '@aws-sdk/client-athena';
import { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import { S3Client } from '@aws-sdk/client-s3';
import { SQSClient } from '@aws-sdk/client-sqs';
import { SFNClient } from '@aws-sdk/client-sfn';
import { CloudWatchClient } from '@aws-sdk/client-cloudwatch';
import { CloudFormationClient } from '@aws-sdk/client-cloudformation';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Client, Command } from '@aws-sdk/smithy-client';
import type { MetadataBearer, RequestPresigningArguments } from '@aws-sdk/types';
import { Cradle, diContainer, FastifyAwilixOptions, fastifyAwilixPlugin } from '@fastify/awilix';
import { asFunction, asValue, Lifetime } from 'awilix';
import pkg from 'aws-xray-sdk';
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import type { LambdaRequestContext } from '@sif/clients';
import { CalculatorClient, ConnectorClient, ExecutionClient, ImpactClient, MetricClient, PipelineClient, ReferenceDatasetClient } from '@sif/clients';
import { DynamoDbUtils } from '@sif/dynamodb-utils';
import { EventPublisher, PIPELINE_PROCESSOR_EVENT_SOURCE } from '@sif/events';
import { BaseCradle, registerBaseAwilix } from '@sif/resource-api-base';
import { ActivityAuditRepository } from '../api/activities/audits/repository.js';
import { ActivityAuditService } from '../api/activities/audits/service.js';
import { ActivitiesRepository } from '../api/activities/repository.js';
import { ActivityService } from '../api/activities/service.js';
import { PipelineProcessorsRepository } from '../api/executions/repository.js';
import { PipelineProcessorsService } from '../api/executions/service.js';
import { PipelineExecutionUtils } from '../api/executions/utils.js';
import { MetricsService } from '../api/metrics/service.js';
import { BaseRepositoryClient } from '../data/base.repository.js';
import { AggregationTaskAuroraRepository } from '../stepFunction/services/aggregationTask.aurora.repository.js';
import { CalculationTask } from '../stepFunction/tasks/calculationTask.js';
import { PipelineAggregationTask } from '../stepFunction/tasks/pipelineAggregationTask';
import { ActivityResultProcessorTask } from '../stepFunction/tasks/activityResultProcessorTask';
import { VerifyTask } from '../stepFunction/tasks/verifyTask.js';
import { ActivityDownloadStartTask } from '../stepFunction/tasks/activityDownloadStartTask.js';
import { ConnectorUtility } from '../utils/connectorUtility.js';

import { convertGroupRolesToCognitoGroups, SecurityContext, SecurityScope } from '@sif/authz';
import { ExecutionAuditExportService } from '../api/executions/auditExport.service.js';
import { MetricsRepositoryV2 } from '../api/metrics/repositoryV2.js';
import { InsertLatestValuesTask } from '../stepFunction/tasks/insertLatestValuesTask.js';
import { MetricAggregationRepository } from '../stepFunction/services/metricAggregationRepository.js';
import { MetricAggregationTaskV2 } from '../stepFunction/tasks/metricAggregationTaskV2.js';
import { SqlResultProcessorTask } from '../stepFunction/tasks/sqlResultProcessorTask.js';
import { AuditExportUtil } from '../utils/auditExport.util.js';
import { InsertActivityBulkTask } from '../stepFunction/tasks/insertActivityBulkTask';
import { MetricsMigrationUtil } from '../utils/metricsMigration.util.js';
import { AggregationUtil } from '../utils/aggregation.util.js';
import { DataResultProcessorTask } from '../stepFunction/tasks/dataResultProcessorTask';
import { InlineExecutionService } from '../api/executions/inlineExecution.service.js';
import { ActivityDownloadUtil } from '../utils/activityDownload.util.js';
import { ActivityDownloadInitiateTask } from '../stepFunction/tasks/activityDownloadInitiateTask.js';
import { ActivityDownloadVerifyTask } from '../stepFunction/tasks/activityDownloadVerifyTask.js';
import { SSMClient } from '@aws-sdk/client-ssm';
import { MetricAggregationJobService } from '../api/aggregations/service.js';
import { MetricAggregationJobRepository } from '../api/aggregations/repository.js';
import { SaveAggregationJobTask } from '../stepFunction/tasks/saveAggregationJobTask';
import { PlatformResourceUtility } from '../utils/platformResource.utility.js';
import { CalculatorResultUtil } from '../utils/calculatorResult.util.js';
import { ConnectorIntegrationEventProcessor } from '../events/connectorIntegration.eventProcessor.js';
import { ConnectorSetupEventProcessor } from '../events/connectorSetup.eventProcessor.js';
import { ReferenceDatasetCreationTask } from '../stepFunction/tasks/referenceDatasetCreationTask.js';
import { ReferenceDatasetVerificationTask } from '../stepFunction/tasks/referenceDatasetVerificationTask.js';
import { CloudWatchMetricService } from '../stepFunction/services/cloudWatchMetric.service.js';
import { ResourceTagsService } from '../stepFunction/services/resourceTags.service.js';
import { MetricExportTask } from '../stepFunction/tasks/metricExportTask.js';
import { ImpactCreationTask } from '../stepFunction/tasks/impactCreationTask.js';

const { captureAWSv3Client } = pkg;

const { BUCKET_NAME, BUCKET_PREFIX, AUDIT_VERSION } = process.env;

export type GetSecurityContext = (executionId: string, role?: string, groupContextId?: string) => Promise<SecurityContext>;
export type GetLambdaRequestContext = (sc: SecurityContext) => LambdaRequestContext;
export type GetSignedUrl = <InputTypesUnion extends object, InputType extends InputTypesUnion, OutputType extends MetadataBearer = MetadataBearer>(
	client: Client<any, InputTypesUnion, MetadataBearer, any>,
	command: Command<InputType, OutputType, any, InputTypesUnion, MetadataBearer>,
	options?: RequestPresigningArguments
) => Promise<string>;

declare module '@fastify/awilix' {
	interface Cradle extends BaseCradle {
		aggregationTaskAuroraRepository: AggregationTaskAuroraRepository;
		aggregationTaskV2: MetricAggregationTaskV2;
		pipelineAggregationTask: PipelineAggregationTask;
		calculationTask: CalculationTask;
		calculatorClient: CalculatorClient;
		dynamoDbUtils: DynamoDbUtils;
		eventBridgeClient: EventBridgeClient;
		ssmClient: SSMClient;
		eventPublisher: EventPublisher;
		metricClient: MetricClient;
		impactClient: ImpactClient;
		activityResultProcessorTask: ActivityResultProcessorTask;
		sqlResultProcessorTask: SqlResultProcessorTask;
		pipelineClient: PipelineClient;
		executionClient: ExecutionClient;
		connectorClient: ConnectorClient;
		referenceDatasetClient: ReferenceDatasetClient;
		connectorUtility: ConnectorUtility;
		pipelineProcessorsRepository: PipelineProcessorsRepository;
		pipelineProcessorsService: PipelineProcessorsService;
		s3Client: S3Client;
		cloudWatchClient: CloudWatchClient;
		stepFunctionClient: SFNClient;
		sqsClient: SQSClient;
		cloudFormationClient: CloudFormationClient;
		connectorIntegrationEventProcessor: ConnectorIntegrationEventProcessor;
		connectorSetupEventProcessor: ConnectorSetupEventProcessor;
		verifyTask: VerifyTask;
		referenceDatasetCreationTask: ReferenceDatasetCreationTask;
		referenceDatasetVerificationTask: ReferenceDatasetVerificationTask;
		activityDownloadInitiateTask: ActivityDownloadInitiateTask;
		activityDownloadStartTask: ActivityDownloadStartTask;
		activityDownloadVerifyTask: ActivityDownloadVerifyTask;
		activityService: ActivityService;
		activitiesRepository: ActivitiesRepository;
		metricsService: MetricsService;
		metricRepoV2: MetricsRepositoryV2;
		activityAuditRepository: ActivityAuditRepository;
		activityAuditService: ActivityAuditService;
		baseRepositoryClient: BaseRepositoryClient;
		getSecurityContext: GetSecurityContext;
		getLambdaRequestContext: GetLambdaRequestContext;
		getSignedUrl: GetSignedUrl;
		metricAggregationRepository: MetricAggregationRepository;
		insertLatestValuesTask: InsertLatestValuesTask;
		pipelineExecutionUtils: PipelineExecutionUtils;
		athenaClient: AthenaClient;
		auditExportUtil: AuditExportUtil;
		activityDownloadUtil: ActivityDownloadUtil;
		executionAuditExportService: ExecutionAuditExportService;
		insertActivityBulkTask: InsertActivityBulkTask;
		metricsMigrationUtil: MetricsMigrationUtil;
		aggregationUtil: AggregationUtil;
		dataResultProcessorTask: DataResultProcessorTask;
		inlineExecutionService: InlineExecutionService;
		metricAggregationJobService: MetricAggregationJobService;
		metricAggregationJobRepository: MetricAggregationJobRepository;
		saveAggregationJobTask: SaveAggregationJobTask;
		platformResourceUtility: PlatformResourceUtility;
		calculatorUtil: CalculatorResultUtil;
		cloudWatchMetricService: CloudWatchMetricService;
		resourceTagsService: ResourceTagsService;
		metricExportTask: MetricExportTask;
		impactCreationTask: ImpactCreationTask;
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

class SQSClientFactory {
	public static create(region: string | undefined): SQSClient {
		const sqs = captureAWSv3Client(new SQSClient({ region }));
		return sqs;
	}
}

class AthenaClientFactory {
	public static create(region: string | undefined): AthenaClient {
		const athena = captureAWSv3Client(new AthenaClient({ region }));
		return athena;
	}
}

class SSMClientFactory {
	public static create(region: string | undefined): SSMClient {
		const ssm = captureAWSv3Client(new SSMClient({ region }));
		return ssm;
	}
}


class CloudWatchClientFactory {
	public static create(region: string | undefined): CloudWatchClient {
		const cloudwatch = captureAWSv3Client(new CloudWatchClient({ region }));
		return cloudwatch;
	}
}

class CloudFormationClientFactory {
	public static create(region: string | undefined): CloudFormationClient {
		const cloudFormation = captureAWSv3Client(new CloudFormationClient({ region }));
		return cloudFormation;
	}
}

const getLambdaRequestContext: GetLambdaRequestContext = (securityContext: SecurityContext): LambdaRequestContext => {
	const { email, groupRoles, groupId } = securityContext;
	const requestContext: LambdaRequestContext = {
		authorizer: {
			claims: {
				email: email,
				'cognito:groups': convertGroupRolesToCognitoGroups(groupRoles),
				groupContextId: groupId
			}
		}
	};
	return requestContext;
};

const registerContainer = (app?: FastifyInstance) => {
	const commonInjectionOptions = {
		lifetime: Lifetime.SINGLETON
	};

	const taskParallelLimit = parseInt(process.env['TASK_PARALLEL_LIMIT'] ?? '10');
	const awsRegion = process.env['AWS_REGION'];
	const eventBusName = process.env['EVENT_BUS_NAME'];
	const tableName = process.env['TABLE_NAME'];
	const calculatorFunctionName = process.env['CALCULATOR_FUNCTION_NAME'];
	const pipelineFunctionName = process.env['PIPELINES_FUNCTION_NAME'];
	const referenceDatasetFunctionName = process.env['REFERENCE_DATASETS_FUNCTION_NAME'];
	const pipelineProcessorFunctionName = process.env['PIPELINE_PROCESSOR_FUNCTION_NAME'];
	const impactFunctionName = process.env['IMPACTS_FUNCTION_NAME'];
	const chunkSize = parseInt(process.env['CHUNK_SIZE']);
	const sourceDataBucket = process.env['BUCKET_NAME'];
	const sourceDataBucketPrefix = process.env['BUCKET_PREFIX'];
	const dataJobStateMachineArn = process.env['DATA_PIPELINE_JOB_STATE_MACHINE_ARN'];
	const activitiesJobStateMachineArn = process.env['ACTIVITIES_PIPELINE_JOB_STATE_MACHINE_ARN'];
	const activitiesDownloadStateMachineArn = process.env['ACTIVITIES_DOWNLOAD_STATE_MACHINE_ARN'];
	const referenceDatasetStateMachineArn = process.env['REFERENCE_DATASET_STATE_MACHINE_ARN'];
	const metricAggregationStateMachineArn = process.env['METRIC_AGGREGATION_STATE_MACHINE_ARN'];
	const rdsDBHost = process.env['RDS_PROXY_ENDPOINT'];
	const rdsTenantUsername = process.env['TENANT_USERNAME'];
	const rdsTenantDatabase = process.env['TENANT_DATABASE_NAME'];
	const nodeEnv = process.env['NODE_ENV'];
	const tenantId = process.env['TENANT_ID'];
	const caCert = process.env['CA_CERT'];
	const csvInputConnectorName = process.env['CSV_INPUT_CONNECTOR_NAME'];
	const taskQueueUrl = process.env['TASK_QUEUE_URL'];
	const activityQueueUrl = process.env['ACTIVITY_QUEUE_URL'];
	const athenaDatabaseName = process.env['ATHENA_DATABASE_NAME'];
	const athenaAuditLogsTableName = process.env['ATHENA_AUDIT_LOGS_TABLE_NAME'];
	const triggerMetricAggregations = process.env['TRIGGER_METRIC_AGGREGATIONS'] === 'true';
	const resourceStatusParameterPrefix = process.env['RESOURCE_STATUS_PARAMETER_PREFIX'];
	const auditLogWaitTimeSeconds = parseInt(process.env['AUDIT_LOG_WAIT_TIME_SECONDS']);

	const templateBucket = process.env['KINESIS_TEMPLATE_BUCKET'];
	const templateKey = process.env['KINESIS_TEMPLATE_KEY'];


	diContainer.register({
		getSignedUrl: asValue(getSignedUrl),
		eventBridgeClient: asFunction(() => EventBridgeClientFactory.create(awsRegion), {
			...commonInjectionOptions
		}),
		s3Client: asFunction(() => S3ClientFactory.create(awsRegion), {
			...commonInjectionOptions
		}),
		athenaClient: asFunction(() => AthenaClientFactory.create(awsRegion), {
			...commonInjectionOptions
		}),
		ssmClient: asFunction(() => SSMClientFactory.create(awsRegion), {
			...commonInjectionOptions
		}),
		stepFunctionClient: asFunction(() => StepFunctionClientFactory.create(awsRegion), {
			...commonInjectionOptions
		}),
		sqsClient: asFunction(() => SQSClientFactory.create(awsRegion), {
			...commonInjectionOptions
		}),
		cloudWatchClient: asFunction(() => CloudWatchClientFactory.create(awsRegion), {
			...commonInjectionOptions
		}),
		cloudFormationClient: asFunction(() => CloudFormationClientFactory.create(awsRegion), {
			...commonInjectionOptions,
		}),
		baseRepositoryClient: asFunction(() => new BaseRepositoryClient(app.log, rdsDBHost, rdsTenantUsername, rdsTenantDatabase, nodeEnv, caCert), {
			...commonInjectionOptions
		}),
		calculatorUtil: asFunction((container: Cradle) => new CalculatorResultUtil(app.log, container.s3Client, sourceDataBucket, sourceDataBucketPrefix)),
		dynamoDbUtils: asFunction((container: Cradle) => new DynamoDbUtils(app.log, container.dynamoDBDocumentClient)),
		platformResourceUtility: asFunction((container: Cradle) => new PlatformResourceUtility(app.log, container.ssmClient, resourceStatusParameterPrefix)),
		eventPublisher: asFunction((container: Cradle) => new EventPublisher(app.log, container.eventBridgeClient, eventBusName, PIPELINE_PROCESSOR_EVENT_SOURCE), {
			...commonInjectionOptions
		}),
		pipelineProcessorsRepository: asFunction((container: Cradle) => new PipelineProcessorsRepository(app.log, container.dynamoDBDocumentClient, tableName, container.tagRepository,
			container.groupRepository, container.dynamoDbUtils), {
			...commonInjectionOptions
		}),
		pipelineClient: asFunction((container: Cradle) => new PipelineClient(app.log, container.invoker, pipelineFunctionName), {
			...commonInjectionOptions
		}),
		referenceDatasetClient: asFunction((container: Cradle) => new ReferenceDatasetClient(app.log, container.invoker, referenceDatasetFunctionName), {
			...commonInjectionOptions
		}),
		executionClient: asFunction((container: Cradle) => new ExecutionClient(app.log, container.invoker, pipelineProcessorFunctionName), {
			...commonInjectionOptions
		}),
		connectorClient: asFunction((container: Cradle) => new ConnectorClient(app.log, container.invoker, pipelineFunctionName), {
			...commonInjectionOptions
		}),
		impactClient: asFunction((container: Cradle) => new ImpactClient(app.log, container.invoker, impactFunctionName), {
			...commonInjectionOptions
		}),
		connectorUtility: asFunction(
			(container: Cradle) =>
				new ConnectorUtility(app.log, container.s3Client, container.getSignedUrl, container.eventPublisher, container.connectorClient, BUCKET_NAME as string, BUCKET_PREFIX as string, eventBusName, csvInputConnectorName),
			{
				...commonInjectionOptions
			}
		),
		resourceTagsService: asFunction((container: Cradle) => new ResourceTagsService(app.log, container.referenceDatasetClient, container.impactClient, getLambdaRequestContext, taskParallelLimit)),
		pipelineExecutionUtils: asFunction((container: Cradle) => new PipelineExecutionUtils(app.log, container.authChecker, auditLogWaitTimeSeconds)),
		inlineExecutionService: asFunction((container: Cradle) =>
			new InlineExecutionService(
				app.log,
				container.pipelineProcessorsRepository,
				container.calculatorClient,
				container.metricClient,
				container.stepFunctionClient,
				metricAggregationStateMachineArn,
				container.insertActivityBulkTask,
				container.sqlResultProcessorTask,
				container.dataResultProcessorTask,
				container.insertLatestValuesTask,
				container.pipelineAggregationTask,
				container.activityResultProcessorTask,
				container.saveAggregationJobTask,
				container.eventPublisher,
				container.calculatorUtil,
				container.impactCreationTask)),
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
					container.connectorUtility,
					container.getLambdaRequestContext,
					container.pipelineExecutionUtils,
					container.inlineExecutionService,
					Number(AUDIT_VERSION),
					container.resourceService,
					container.tagService,
					container.accessManagementClient,
					triggerMetricAggregations,
					container.platformResourceUtility
				),
			{
				...commonInjectionOptions
			}
		),
		calculatorClient: asFunction((container: Cradle) => new CalculatorClient(app.log, container.lambdaClient, calculatorFunctionName), {
			...commonInjectionOptions
		}),
		connectorIntegrationEventProcessor: asFunction(
			(container: Cradle) =>
				new ConnectorIntegrationEventProcessor(
					app.log,
					container.stepFunctionClient,
					container.pipelineProcessorsService,
					container.getSecurityContext,
					container.connectorUtility,
					container.s3Client,
					activitiesJobStateMachineArn,
					dataJobStateMachineArn,
					referenceDatasetStateMachineArn,
					sourceDataBucket,
					sourceDataBucketPrefix,
					container.pipelineClient,
					container.getLambdaRequestContext,
				),
			{
				...commonInjectionOptions
			}
		),
		connectorSetupEventProcessor: asFunction(
			(container: Cradle) =>
				new ConnectorSetupEventProcessor(
					app.log,
					container.s3Client,
					container.cloudFormationClient,
					container.pipelineClient,
					container.getLambdaRequestContext,
					nodeEnv,
					tenantId,
					container.getSignedUrl,
					templateBucket,
					templateKey
				),
			{
				...commonInjectionOptions
			}
		),
		calculationTask: asFunction((container: Cradle) => new CalculationTask(
			app.log,
			container.pipelineProcessorsService,
			container.calculatorClient,
			container.sqsClient,
			activityQueueUrl,
			container.stepFunctionClient
		), {
			...commonInjectionOptions
		}),
		cloudWatchMetricService: asFunction(
			(container: Cradle) =>
				new CloudWatchMetricService(
					app.log,
					container.cloudWatchClient,
					container.stepFunctionClient
				),
			{
				...commonInjectionOptions
			}
		),
		verifyTask: asFunction((container: Cradle) => new VerifyTask(app.log, container.pipelineClient, container.pipelineProcessorsService, container.s3Client, chunkSize, container.getLambdaRequestContext), {
			...commonInjectionOptions
		}),
		activityDownloadInitiateTask: asFunction((container: Cradle) => new ActivityDownloadInitiateTask(app.log, container.activityDownloadUtil), {
			...commonInjectionOptions
		}),
		activityDownloadStartTask: asFunction((container: Cradle) => new ActivityDownloadStartTask(app.log, container.activityDownloadUtil), {
			...commonInjectionOptions
		}),
		activityDownloadVerifyTask: asFunction((container: Cradle) => new ActivityDownloadVerifyTask(app.log, container.activityDownloadUtil), {
			...commonInjectionOptions
		}),
		activityResultProcessorTask: asFunction((container: Cradle) => new ActivityResultProcessorTask(app.log, container.s3Client, container.stepFunctionClient, container.cloudWatchMetricService, container.pipelineClient, container.getLambdaRequestContext, container.calculatorUtil, container.pipelineProcessorsRepository, container.eventPublisher, container.resourceTagsService, container.connectorUtility), {
			...commonInjectionOptions
		}),
		referenceDatasetCreationTask: asFunction((container: Cradle) => new ReferenceDatasetCreationTask(app.log, container.getLambdaRequestContext, container.referenceDatasetClient, container.pipelineClient, container.pipelineProcessorsService, container.s3Client, container.calculatorClient, container.calculatorUtil), {
			...commonInjectionOptions
		}),

		referenceDatasetVerificationTask: asFunction((container: Cradle) => new ReferenceDatasetVerificationTask(app.log, container.getLambdaRequestContext, container.referenceDatasetClient, container.pipelineProcessorsService, container.pipelineClient, container.connectorUtility, BUCKET_PREFIX), {
			...commonInjectionOptions
		}),

		sqlResultProcessorTask: asFunction((container: Cradle) => new SqlResultProcessorTask(app.log, container.pipelineProcessorsRepository, container.metricClient, container.getLambdaRequestContext, container.activitiesRepository, container.eventPublisher, container.calculatorUtil), {
			...commonInjectionOptions
		}),
		impactCreationTask: asFunction((container: Cradle) => new ImpactCreationTask(app.log, container.s3Client, BUCKET_NAME, container.impactClient, container.pipelineProcessorsRepository, container.eventPublisher, container.pipelineClient, container.getLambdaRequestContext, container.connectorUtility), {
			...commonInjectionOptions
		}),
		dataResultProcessorTask: asFunction((container: Cradle) => new DataResultProcessorTask(app.log, container.calculatorUtil), {
			...commonInjectionOptions
		}),
		metricClient: asFunction((container: Cradle) => new MetricClient(app.log, container.invoker, pipelineFunctionName), {
			...commonInjectionOptions
		}),
		aggregationTaskAuroraRepository: asFunction((container: Cradle) => new AggregationTaskAuroraRepository(app.log, container.baseRepositoryClient), {
			...commonInjectionOptions
		}),
		aggregationTaskV2: asFunction((container: Cradle) => new MetricAggregationTaskV2(app.log, container.metricClient, container.aggregationTaskAuroraRepository, container.utils, container.metricAggregationRepository, container.aggregationUtil, container.metricAggregationJobService), {
			...commonInjectionOptions
		}),
		pipelineAggregationTask: asFunction((container: Cradle) => new PipelineAggregationTask(app.log, container.activitiesRepository, container.pipelineProcessorsRepository, container.pipelineClient, container.aggregationUtil), {
			...commonInjectionOptions
		}),
		activitiesRepository: asFunction((container: Cradle) => new ActivitiesRepository(app.log, container.baseRepositoryClient), {
			...commonInjectionOptions
		}),
		activityService: asFunction((container: Cradle) => new ActivityService(app.log, container.activitiesRepository, container.authChecker, container.pipelineClient, container.pipelineProcessorsService, taskQueueUrl, container.sqsClient, container.s3Client, sourceDataBucket, 'queries', container.getSignedUrl, container.platformResourceUtility), {
			...commonInjectionOptions
		}),
		activityAuditRepository: asFunction((container: Cradle) => new ActivityAuditRepository(app.log, container.athenaClient, sourceDataBucket, sourceDataBucketPrefix, athenaDatabaseName, athenaAuditLogsTableName, container.auditExportUtil), {
			...commonInjectionOptions
		}),
		activityAuditService: asFunction((container: Cradle) => new ActivityAuditService(app.log, container.s3Client, sourceDataBucket, container.activityAuditRepository, container.activitiesRepository, container.authChecker, taskParallelLimit), {
			...commonInjectionOptions
		}),
		metricAggregationRepository: asFunction((container: Cradle) => new MetricAggregationRepository(app.log, container.baseRepositoryClient), {
			...commonInjectionOptions
		}),
		metricRepoV2: asFunction((container: Cradle) => new MetricsRepositoryV2(app.log, container.baseRepositoryClient), {
			...commonInjectionOptions
		}),
		metricsService: asFunction((container: Cradle) => new MetricsService(app.log, container.metricRepoV2, container.authChecker, container.metricClient, sourceDataBucket, 'queries', container.s3Client, container.getSignedUrl, container.sqsClient, taskQueueUrl, container.platformResourceUtility), {
			...commonInjectionOptions
		}),
		insertActivityBulkTask: asFunction((container: Cradle) => new InsertActivityBulkTask(app.log, container.activitiesRepository, container.s3Client, sourceDataBucket, sourceDataBucketPrefix, Number(AUDIT_VERSION), container.stepFunctionClient), {
			...commonInjectionOptions
		}),
		insertLatestValuesTask: asFunction((container: Cradle) => new InsertLatestValuesTask(app.log, container.activitiesRepository), {
			...commonInjectionOptions
		}),
		metricsMigrationUtil: asFunction((container: Cradle) => new MetricsMigrationUtil(app.log, container.baseRepositoryClient), {
			...commonInjectionOptions
		}),
		aggregationUtil: asFunction((container: Cradle) => new AggregationUtil(app.log, container.s3Client, sourceDataBucket, sourceDataBucketPrefix), {
			...commonInjectionOptions
		}),

		metricAggregationJobRepository: asFunction((container: Cradle) => new MetricAggregationJobRepository(app.log, container.dynamoDBDocumentClient, tableName, container.groupRepository, container.dynamoDbUtils), {
			...commonInjectionOptions
		}),

		metricAggregationJobService: asFunction((container: Cradle) => new MetricAggregationJobService(app.log, container.metricAggregationJobRepository, container.authChecker, container.resourceService, container.stepFunctionClient, metricAggregationStateMachineArn, container.pipelineClient, container.metricClient, getLambdaRequestContext, container.utils, container.aggregationUtil, container.platformResourceUtility), {
			...commonInjectionOptions
		}),

		saveAggregationJobTask: asFunction((container: Cradle) => new SaveAggregationJobTask(app.log, container.metricAggregationJobService, container.activitiesRepository, container.aggregationUtil), {
			...commonInjectionOptions
		}),
		metricExportTask: asFunction((container: Cradle) => new MetricExportTask(app.log, container.metricRepoV2, container.utils, sourceDataBucket, container.connectorUtility, container.pipelineClient, container.pipelineProcessorsService, container.getLambdaRequestContext), {
			...commonInjectionOptions
		}),
		activityDownloadUtil: asFunction((container: Cradle) => new ActivityDownloadUtil(app.log, container.s3Client, container.stepFunctionClient, sourceDataBucket, 'queries', container.activitiesRepository, container.metricRepoV2, activitiesDownloadStateMachineArn), {
			...commonInjectionOptions
		}),
		executionAuditExportService: asFunction((container: Cradle) => new ExecutionAuditExportService(app.log, container.authChecker, container.pipelineExecutionUtils, container.pipelineProcessorsService, container.auditExportUtil)),
		auditExportUtil: asFunction(
			(container: Cradle) =>
				new AuditExportUtil(
					app.log,
					container.s3Client,
					getSignedUrl,
					BUCKET_NAME as string,
					BUCKET_PREFIX as string,
					container.sqsClient,
					container.athenaClient,
					taskQueueUrl,
					container.pipelineClient,
					container.executionClient,
					getLambdaRequestContext,
					athenaDatabaseName,
					athenaAuditLogsTableName
				)
		),
		getLambdaRequestContext: asValue(getLambdaRequestContext),
		// This function construct the lambda request context with reduced scope but can be extended
		getSecurityContext: asFunction(
			(container: Cradle) => {
				return async (executionId: string, role?: SecurityScope, groupContextId?: string) => {
					let email = 'sif-pipeline-execution';
					if (!groupContextId) {
						const pipelineExecution = await container.pipelineProcessorsRepository.get(executionId);
						groupContextId = pipelineExecution.groupContextId;
						email = pipelineExecution.createdBy;
					}
					return {
						email,
						groupId: `${groupContextId}`,
						groupRoles: { [`${groupContextId}`]: role ?? SecurityScope.contributor }
					};
				};
			},
			{
				...commonInjectionOptions
			}
		)
	});
};

export default fp<FastifyAwilixOptions>(async (app: FastifyInstance): Promise<void> => {
	// first register the DI plugin
	await app.register(fastifyAwilixPlugin, {
		disposeOnClose: true,
		disposeOnResponse: false
	});

	registerBaseAwilix(app.log);

	registerContainer(app);
});

export { registerContainer };
