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

import { Aspects, Duration, Fn, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { Function, Runtime, Tracing } from 'aws-cdk-lib/aws-lambda';
import { Port, SecurityGroup, SubnetType, Vpc } from 'aws-cdk-lib/aws-ec2';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import { EventBus, Rule } from 'aws-cdk-lib/aws-events';
import { Construct } from 'constructs';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { LogLevel, Parallel, StateMachine, CustomState, Wait, Choice, WaitTime, Condition, Fail, Pass, IntegrationPattern, TaskInput, JsonPath, Succeed } from 'aws-cdk-lib/aws-stepfunctions';
import { EventBridgePutEvents, LambdaInvoke, SqsSendMessage, } from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { AttributeType, BillingMode, ProjectionType, StreamViewType, Table, TableEncryption } from 'aws-cdk-lib/aws-dynamodb';
import { AccessLogFormat, AuthorizationType, CfnMethod, CognitoUserPoolsAuthorizer, Cors, EndpointType, LambdaRestApi, LogGroupLogDestination, MethodLoggingLevel } from 'aws-cdk-lib/aws-apigateway';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { fileURLToPath } from 'url';
import path from 'path';
import { UserPool } from 'aws-cdk-lib/aws-cognito';
import { AnyPrincipal, Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { vpcIdParameter } from '../shared/sharedTenant.stack.js';
import { Queue } from 'aws-cdk-lib/aws-sqs';
import { Key } from 'aws-cdk-lib/aws-kms';
import { NagSuppressions } from 'cdk-nag';
import { PIPELINE_PROCESSOR_CONNECTOR_RESPONSE_EVENT } from '@sif/events';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { getLambdaArchitecture } from '@sif/cdk-common';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface PipelineProcessorsConstructProperties {
	tenantId: string;
	calculatorFunctionName: string;
	accessManagementApiFunctionName: string;
	pipelineProcessorApiFunctionName: string;
	environment: string;
	eventBusName: string;
	pipelineApiFunctionName: string;
	impactApiFunctionName: string;
	kmsKeyArn: string;
	cognitoUserPoolId: string;
	bucketName: string;
	vpcId: string;
	rdsProxyEndpoint: string;
	rdsProxySecurityGroupId: string;
	rdsProxyArn: string;
	tenantDatabaseUsername: string;
	tenantDatabaseName: string;
	activityTableName: string;
	activityNumberValueTableName: string;
	activityBooleanValueTableName: string;
	activityStringValueTableName: string;
	activityDateTimeValueTableName: string;
	caCert: string;
	downloadAuditFileParallelLimit: number;
	csvConnectorName: string;
	metricStorage: string;
	auditLogsTableName: string;
	auditLogsDatabaseName: string;
	activityInsertQueueArn: string;
	acquireLockSqsQueueArn: string;
	releaseLockSqsQueueArn: string;
	environmentEventBusName: string;
	auditVersion: string;
	tableName: string;
	workerQueueArn: string;
}

export const pipelineProcessorApiUrlParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/pipeline-processor/apiUrl`;
export const pipelineProcessorApiNameParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/pipeline-processor/apiName`;
export const pipelineProcessorApiFunctionArnParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/pipeline-processor/apiFunctionArn`;
export const pipelineProcessorBucketPrefixParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/pipeline-processor/bucketPrefix`;
export const activityPipelineStateMachineArnParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/pipeline-processor/activityPipelineStateMachineArn`;
export const dataPipelineStateMachineArnParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/pipeline-processor/dataPipelineStateMachineArn`;
export const inlinePipelineStateMachineArnParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/pipeline-processor/inlinePipelineStateMachineArn`;
export const pipelineProcessorTableNameParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/pipeline-processor/configTableName`;
export const metricsTableNameParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/pipeline-processor/metricsTableName`;
export const taskQueueUrlParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/pipeline-processor/taskQueueUrl`;
export const insertActivityQueueUrlParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/pipeline-processor/insertActivityQueueUrl`;
export const pipelineProcessorTaskNameParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/pipeline-processor/taskName`;
export const INLINE_PROCESSING_ROWS_LIMIT = '100';

enum DatabaseTask {
	InsertActivityValues = 'InsertActivityValues',
	InsertActivityLatestValues = 'InsertActivityLatestValues',
	AggregateMetrics = 'AggregateMetrics',
	AggregatePipelineOutput = 'AggregatePipelineOutput',
}

export class PipelineProcessors extends Construct {
	constructor(scope: Construct, id: string, props: PipelineProcessorsConstructProperties) {
		super(scope, id);

		const namePrefix = `sif-${props.tenantId}-${props.environment}`;
		const eventBus = EventBus.fromEventBusName(this, 'DefaultEventBus', props.eventBusName);

		const calculatorLambda = NodejsFunction.fromFunctionName(this, 'CalculatorLambda', props.calculatorFunctionName);

		const pipelineLambda = NodejsFunction.fromFunctionName(this, 'PipelineLambda', props.pipelineApiFunctionName);

		const impactLambda = NodejsFunction.fromFunctionName(this, 'ImpactLambda', props.impactApiFunctionName);

		const environmentEventBus = EventBus.fromEventBusName(this, 'EnvironmentEventBusName', props.environmentEventBusName);

		const vpcId = StringParameter.valueFromLookup(this, vpcIdParameter(props.environment));
		const vpc = Vpc.fromLookup(this, 'vpc', { vpcId });

		const bucketPrefix = 'pipelines';
		const bucket = Bucket.fromBucketName(this, 'Bucket', props.bucketName);

		const acquireLockQueue = Queue.fromQueueArn(this, 'AcquireLockQueue', props.acquireLockSqsQueueArn);
		const releaseLockQueue = Queue.fromQueueArn(this, 'ReleaseLockQueue', props.releaseLockSqsQueueArn);

		new StringParameter(this, 'pipelineProcessorBucketPrefixParameter', {
			parameterName: pipelineProcessorBucketPrefixParameter(props.tenantId, props.environment),
			stringValue: bucketPrefix,
		});

		const rdsSecurityGroup = SecurityGroup.fromSecurityGroupId(this, 'RdsProxySecurityGroup', props.rdsProxySecurityGroupId);

		let lambdaToRDSProxyGroup = new SecurityGroup(this, 'Lambda to RDS Proxy Connection', {
			vpc: vpc,
		});

		rdsSecurityGroup.addIngressRule(lambdaToRDSProxyGroup, Port.tcp(5432), 'allow lambda connection');

		const auroraEnvironmentVariables = {
			CA_CERT: props.caCert,
			RDS_PROXY_ENDPOINT: props.rdsProxyEndpoint,
			TENANT_DATABASE_NAME: props.tenantDatabaseName,
			TENANT_USERNAME: props.tenantDatabaseUsername,
			TENANT_ID: props.tenantId,
			ACTIVITIES_TABLE_NAME: props.activityTableName,
			ACTIVITIES_NUMBER_VALUE_TABLE_NAME: props.activityNumberValueTableName,
			ACTIVITIES_STRING_VALUE_TABLE_NAME: props.activityStringValueTableName,
			ACTIVITIES_BOOLEAN_VALUE_TABLE_NAME: props.activityBooleanValueTableName,
			ACTIVITIES_DATETIME_VALUE_TABLE_NAME: props.activityDateTimeValueTableName,
		};

		const accountId = Stack.of(this).account;
		const region = Stack.of(this).region;

		const rdsProxyPolicy = new PolicyStatement({
			actions: ['rds-db:connect'],
			resources: [`arn:aws:rds-db:${region}:${accountId}:dbuser:${Fn.select(6, Fn.split(':', props.rdsProxyArn))}/${props.tenantDatabaseUsername}`],
		});


		const cloudWatchPublishMetricsPolicy = new PolicyStatement({
			actions: ['cloudwatch:PutMetricData'],
			resources: ['*']
		});

		const SFNGetExecutionHistoryPolicy = new PolicyStatement({
			actions: ['states:GetExecutionHistory'],
			resources: [`arn:aws:states:${region}:${accountId}:execution:sif-${props.tenantId}-${props.environment}-activityPipeline:*`]
		});


		/**
		 * Define the DynamoDB config table
		 */

		const tableV2 = Table.fromTableAttributes(this, 'TableV2', {
			tableName: props.tableName,
			globalIndexes: ['siKey1-pk-index', 'siKey2-pk-index'],
		});
		const workerQueue = Queue.fromQueueArn(this, 'WorkerQueue', props.workerQueueArn);

		const tableV1 = new Table(this, 'Table', {
			tableName: `${namePrefix}-pipelineProcessors`,
			partitionKey: {
				name: 'pk',
				type: AttributeType.STRING,
			},
			sortKey: {
				name: 'sk',
				type: AttributeType.STRING,
			},
			billingMode: BillingMode.PAY_PER_REQUEST,
			encryption: TableEncryption.AWS_MANAGED,
			pointInTimeRecovery: true,
			removalPolicy: RemovalPolicy.DESTROY,
			stream: StreamViewType.NEW_AND_OLD_IMAGES,
			timeToLiveAttribute: 'ttl',
		});

		tableV1.addGlobalSecondaryIndex({
			indexName: 'sk-pk-index',
			partitionKey: {
				name: 'sk',
				type: AttributeType.STRING,
			},
			sortKey: {
				name: 'pk',
				type: AttributeType.STRING,
			},
			projectionType: ProjectionType.ALL,
		});

		new StringParameter(this, 'pipelineProcessorTableNameParameter', {
			parameterName: pipelineProcessorTableNameParameter(props.tenantId, props.environment),
			stringValue: tableV2.tableName,
		});

		/**
		 * Define the DynamoDB metrics table
		 */
		const metricsTable = new Table(this, 'MetricsTable', {
			tableName: `${namePrefix}-pipelineMetrics`,
			partitionKey: {
				name: 'pk',
				type: AttributeType.STRING,
			},
			sortKey: {
				name: 'sk1',
				type: AttributeType.STRING,
			},
			billingMode: BillingMode.PAY_PER_REQUEST,
			encryption: TableEncryption.AWS_MANAGED,
			pointInTimeRecovery: true,
			removalPolicy: RemovalPolicy.DESTROY,
		});

		metricsTable.addLocalSecondaryIndex({
			indexName: 'pk-sk2-index',
			projectionType: ProjectionType.ALL,
			sortKey: {
				name: 'sk2',
				type: AttributeType.STRING,
			},
		});

		new StringParameter(this, 'pipelineMetricsTableNameParameter', {
			parameterName: metricsTableNameParameter(props.tenantId, props.environment),
			stringValue: metricsTable.tableName,
		});

		const verificationLambda = new NodejsFunction(this, 'ProcessorResourceVerificationLambda', {
			description: `Pipeline Processors Resource Verification Task Handler: Tenant ${props.tenantId}`,
			functionName: `${namePrefix}-resourceVerificationTask`,
			entry: path.join(__dirname, '../../../../typescript/packages/apps/pipeline-processors/src/stepFunction/handlers/verification.handler.ts'),
			runtime: Runtime.NODEJS_18_X,
			tracing: Tracing.ACTIVE,
			memorySize: 512,
			logRetention: RetentionDays.ONE_WEEK,
			timeout: Duration.minutes(5),
			environment: {
				INLINE_PROCESSING_ROWS_LIMIT,
				NODE_ENV: props.environment,
				EVENT_BUS_NAME: props.eventBusName,
				TABLE_NAME: tableV2.tableName,
				CHUNK_SIZE: '1',
				BUCKET_NAME: props.bucketName,
				BUCKET_PREFIX: bucketPrefix,
				PIPELINES_FUNCTION_NAME: props.pipelineApiFunctionName,
				IMPACTS_FUNCTION_NAME: props.impactApiFunctionName,
				CALCULATOR_FUNCTION_NAME: props.calculatorFunctionName,
				METRICS_TABLE_NAME: metricsTable.tableName,
				TENANT_ID: props.tenantId,
				CSV_INPUT_CONNECTOR_NAME: props.csvConnectorName,
			},

			bundling: {
				minify: true,
				format: OutputFormat.ESM,
				target: 'node18.16',
				sourceMap: false,
				sourcesContent: false,
				banner: 'import { createRequire } from \'module\';const require = createRequire(import.meta.url);import { fileURLToPath } from \'url\';import { dirname } from \'path\';const __filename = fileURLToPath(import.meta.url);const __dirname = dirname(__filename);',
				externalModules: ['aws-sdk', 'pg-native'],
			},
			depsLockFilePath: path.join(__dirname, '../../../../common/config/rush/pnpm-lock.yaml'),
			architecture: getLambdaArchitecture(scope),
		});

		tableV2.grantReadWriteData(verificationLambda);
		bucket.grantReadWrite(verificationLambda);
		pipelineLambda.grantInvoke(verificationLambda);

		const calculationLambda = new NodejsFunction(this, 'ProcessorCalculatorLambda', {
			description: `Pipeline Processors Calculator Task Handler: Tenant ${props.tenantId}`,
			entry: path.join(__dirname, '../../../../typescript/packages/apps/pipeline-processors/src/stepFunction/handlers/calculation.handler.ts'),
			functionName: `${namePrefix}-calculatorTask`,
			runtime: Runtime.NODEJS_18_X,
			tracing: Tracing.ACTIVE,
			memorySize: 1024,
			logRetention: RetentionDays.ONE_WEEK,
			timeout: Duration.minutes(15),
			environment: {
				INLINE_PROCESSING_ROWS_LIMIT,
				NODE_ENV: props.environment,
				EVENT_BUS_NAME: props.eventBusName,
				BUCKET_NAME: bucket.bucketName,
				BUCKET_PREFIX: bucketPrefix,
				PIPELINES_FUNCTION_NAME: props.pipelineApiFunctionName,
				IMPACTS_FUNCTION_NAME: props.impactApiFunctionName,
				CALCULATOR_FUNCTION_NAME: props.calculatorFunctionName,
				TABLE_NAME: tableV2.tableName,
				METRICS_TABLE_NAME: metricsTable.tableName,
				CSV_INPUT_CONNECTOR_NAME: props.csvConnectorName,
			},
			bundling: {
				minify: true,
				format: OutputFormat.ESM,
				target: 'node18.16',
				sourceMap: false,
				sourcesContent: false,
				banner: 'import { createRequire } from \'module\';const require = createRequire(import.meta.url);import { fileURLToPath } from \'url\';import { dirname } from \'path\';const __filename = fileURLToPath(import.meta.url);const __dirname = dirname(__filename);',
				externalModules: ['aws-sdk', 'pg-native'],
			},
			depsLockFilePath: path.join(__dirname, '../../../../common/config/rush/pnpm-lock.yaml'),
			architecture: getLambdaArchitecture(scope),
		});

		bucket.grantReadWrite(calculationLambda);
		calculatorLambda.grantInvoke(calculationLambda);
		tableV2.grantReadWriteData(calculationLambda);
		pipelineLambda.grantInvoke(calculationLambda);

		const resultProcessorLambda = new NodejsFunction(this, 'ProcessorResultProcessorLambda', {
			description: `Pipeline Processors Resource Verification Task Handler: Tenant ${props.tenantId}`,
			entry: path.join(__dirname, '../../../../typescript/packages/apps/pipeline-processors/src/stepFunction/handlers/resultProcessor.handler.ts'),
			functionName: `${namePrefix}-resultProcessorTask`,
			runtime: Runtime.NODEJS_18_X,
			tracing: Tracing.ACTIVE,
			memorySize: 512,
			logRetention: RetentionDays.ONE_WEEK,
			timeout: Duration.minutes(5),
			environment: {
				INLINE_PROCESSING_ROWS_LIMIT,
				TENANT_ID: props.tenantId,
				NODE_ENV: props.environment,
				EVENT_BUS_NAME: props.eventBusName,
				TABLE_NAME: tableV2.tableName,
				BUCKET_NAME: bucket.bucketName,
				BUCKET_PREFIX: bucketPrefix,
				PIPELINES_FUNCTION_NAME: props.pipelineApiFunctionName,
				IMPACTS_FUNCTION_NAME: props.impactApiFunctionName,
				CALCULATOR_FUNCTION_NAME: props.calculatorFunctionName,
				METRICS_TABLE_NAME: metricsTable.tableName,
				CSV_INPUT_CONNECTOR_NAME: props.csvConnectorName,
			},
			bundling: {
				minify: true,
				format: OutputFormat.ESM,
				target: 'node18.16',
				sourceMap: false,
				sourcesContent: false,
				banner: 'import { createRequire } from \'module\';const require = createRequire(import.meta.url);import { fileURLToPath } from \'url\';import { dirname } from \'path\';const __filename = fileURLToPath(import.meta.url);const __dirname = dirname(__filename);',
				externalModules: ['aws-sdk', 'pg-native'],
			},
			depsLockFilePath: path.join(__dirname, '../../../../common/config/rush/pnpm-lock.yaml'),
			architecture: getLambdaArchitecture(scope),
		});

		tableV2.grantReadWriteData(resultProcessorLambda);
		bucket.grantReadWrite(resultProcessorLambda);
		pipelineLambda.grantInvoke(resultProcessorLambda);
		resultProcessorLambda.addToRolePolicy(SFNGetExecutionHistoryPolicy);
		resultProcessorLambda.addToRolePolicy(cloudWatchPublishMetricsPolicy);

		const pipelineAggregationLambda = new NodejsFunction(this, 'ProcessorPipelineAggregationLambda', {
			description: `Pipeline Output Aggregation Task Handler: Tenant ${props.tenantId}`,
			entry: path.join(__dirname, '../../../../typescript/packages/apps/pipeline-processors/src/stepFunction/handlers/pipelineAggregation.handler.ts'),
			functionName: `${namePrefix}-pipeline-aggregationTask`,
			runtime: Runtime.NODEJS_18_X,
			tracing: Tracing.ACTIVE,
			memorySize: 512,
			logRetention: RetentionDays.ONE_WEEK,
			timeout: Duration.minutes(5),
			environment: {
				INLINE_PROCESSING_ROWS_LIMIT,
				NODE_ENV: props.environment,
				EVENT_BUS_NAME: props.eventBusName,
				TABLE_NAME: tableV2.tableName,
				BUCKET_NAME: bucket.bucketName,
				BUCKET_PREFIX: bucketPrefix,
				PIPELINES_FUNCTION_NAME: props.pipelineApiFunctionName,
				IMPACTS_FUNCTION_NAME: props.impactApiFunctionName,
				CALCULATOR_FUNCTION_NAME: props.calculatorFunctionName,
				METRICS_TABLE_NAME: metricsTable.tableName,
				CSV_INPUT_CONNECTOR_NAME: props.csvConnectorName,
				...auroraEnvironmentVariables,
			},
			securityGroups: [lambdaToRDSProxyGroup],
			vpc,
			vpcSubnets: {
				subnetType: SubnetType.PRIVATE_WITH_NAT,
			},
			bundling: {
				minify: true,
				format: OutputFormat.ESM,
				target: 'node18.16',
				sourceMap: false,
				sourcesContent: false,
				banner: 'import { createRequire } from \'module\';const require = createRequire(import.meta.url);import { fileURLToPath } from \'url\';import { dirname } from \'path\';const __filename = fileURLToPath(import.meta.url);const __dirname = dirname(__filename);',
				externalModules: ['aws-sdk', 'pg-native'],
			},
			depsLockFilePath: path.join(__dirname, '../../../../common/config/rush/pnpm-lock.yaml'),
			architecture: getLambdaArchitecture(scope),
		});

		bucket.grantReadWrite(pipelineAggregationLambda);
		tableV2.grantReadData(pipelineAggregationLambda);
		pipelineLambda.grantInvoke(pipelineAggregationLambda);
		pipelineAggregationLambda.addToRolePolicy(rdsProxyPolicy);

		const metricAggregationLambda = new NodejsFunction(this, 'ProcessorMetricAggregationLambda', {
			description: `Metric Output Aggregation Task Handler: Tenant ${props.tenantId}`,
			entry: path.join(__dirname, '../../../../typescript/packages/apps/pipeline-processors/src/stepFunction/handlers/metricAggregation.handler.ts'),
			functionName: `${namePrefix}-metric-aggregationTask`,
			runtime: Runtime.NODEJS_18_X,
			tracing: Tracing.ACTIVE,
			memorySize: 512,
			logRetention: RetentionDays.ONE_WEEK,
			timeout: Duration.minutes(15),
			environment: {
				INLINE_PROCESSING_ROWS_LIMIT,
				NODE_ENV: props.environment,
				EVENT_BUS_NAME: props.eventBusName,
				TABLE_NAME: tableV2.tableName,
				BUCKET_NAME: bucket.bucketName,
				BUCKET_PREFIX: bucketPrefix,
				METRIC_STORAGE: props.metricStorage,
				PIPELINES_FUNCTION_NAME: props.pipelineApiFunctionName,
				IMPACTS_FUNCTION_NAME: props.impactApiFunctionName,
				CALCULATOR_FUNCTION_NAME: props.calculatorFunctionName,
				METRICS_TABLE_NAME: metricsTable.tableName,
				CSV_INPUT_CONNECTOR_NAME: props.csvConnectorName,
				...auroraEnvironmentVariables,
			},
			securityGroups: [lambdaToRDSProxyGroup],
			vpc,
			vpcSubnets: {
				subnetType: SubnetType.PRIVATE_WITH_NAT,
			},
			bundling: {
				minify: true,
				format: OutputFormat.ESM,
				target: 'node18.16',
				sourceMap: false,
				sourcesContent: false,
				banner: 'import { createRequire } from \'module\';const require = createRequire(import.meta.url);import { fileURLToPath } from \'url\';import { dirname } from \'path\';const __filename = fileURLToPath(import.meta.url);const __dirname = dirname(__filename);',
				externalModules: ['aws-sdk', 'pg-native'],
			},
			depsLockFilePath: path.join(__dirname, '../../../../common/config/rush/pnpm-lock.yaml'),
			architecture: getLambdaArchitecture(scope),
		});

		bucket.grantReadWrite(metricAggregationLambda);
		tableV2.grantReadData(metricAggregationLambda);
		metricsTable.grantReadWriteData(metricAggregationLambda);
		pipelineLambda.grantInvoke(metricAggregationLambda);

		metricAggregationLambda.addToRolePolicy(rdsProxyPolicy);

		const insertLatestValuesLambda = new NodejsFunction(this, 'InsertLatestValuesLambda', {
			description: `Insert Latest Values Task Handler: Tenant ${props.tenantId}`,
			entry: path.join(__dirname, '../../../../typescript/packages/apps/pipeline-processors/src/stepFunction/handlers/insertLatestValues.handler.ts'),
			functionName: `${namePrefix}-insertLatestValuesTask`,
			runtime: Runtime.NODEJS_18_X,
			tracing: Tracing.ACTIVE,
			memorySize: 512,
			logRetention: RetentionDays.ONE_WEEK,
			timeout: Duration.minutes(15),
			environment: {
				INLINE_PROCESSING_ROWS_LIMIT,
				NODE_ENV: props.environment,
				EVENT_BUS_NAME: props.eventBusName,
				TABLE_NAME: tableV2.tableName,
				BUCKET_NAME: bucket.bucketName,
				BUCKET_PREFIX: bucketPrefix,
				METRIC_STORAGE: props.metricStorage,
				PIPELINES_FUNCTION_NAME: props.pipelineApiFunctionName,
				IMPACTS_FUNCTION_NAME: props.impactApiFunctionName,
				CALCULATOR_FUNCTION_NAME: props.calculatorFunctionName,
				METRICS_TABLE_NAME: metricsTable.tableName,
				CSV_INPUT_CONNECTOR_NAME: props.csvConnectorName,
				...auroraEnvironmentVariables,
			},
			securityGroups: [lambdaToRDSProxyGroup],
			vpc,
			vpcSubnets: {
				subnetType: SubnetType.PRIVATE_WITH_NAT,
			},
			bundling: {
				minify: true,
				format: OutputFormat.ESM,
				target: 'node18.16',
				sourceMap: false,
				sourcesContent: false,
				banner: 'import { createRequire } from \'module\';const require = createRequire(import.meta.url);import { fileURLToPath } from \'url\';import { dirname } from \'path\';const __filename = fileURLToPath(import.meta.url);const __dirname = dirname(__filename);',
				externalModules: ['aws-sdk', 'pg-native'],
			},
			depsLockFilePath: path.join(__dirname, '../../../../common/config/rush/pnpm-lock.yaml'),
			architecture: getLambdaArchitecture(scope),
		});

		insertLatestValuesLambda.addToRolePolicy(rdsProxyPolicy);

		const impactCreationLambda = new NodejsFunction(this, 'ImpactCreationLambda', {
			description: `Impact Creation Task Handler: Tenant ${props.tenantId}`,
			entry: path.join(__dirname, '../../../../typescript/packages/apps/pipeline-processors/src/stepFunction/handlers/impactCreation.handler.ts'),
			functionName: `${namePrefix}-impactCreationTask`,
			runtime: Runtime.NODEJS_18_X,
			tracing: Tracing.ACTIVE,
			memorySize: 512,
			logRetention: RetentionDays.ONE_WEEK,
			timeout: Duration.minutes(5),
			environment: {
				NODE_ENV: props.environment,
				BUCKET_NAME: bucket.bucketName,
				BUCKET_PREFIX: bucketPrefix,
				TABLE_NAME: tableV2.tableName,
				EVENT_BUS_NAME: props.eventBusName,
				PIPELINES_FUNCTION_NAME: props.pipelineApiFunctionName,
				IMPACTS_FUNCTION_NAME: props.impactApiFunctionName,
				CALCULATOR_FUNCTION_NAME: props.calculatorFunctionName,
			},
			bundling: {
				minify: true,
				format: OutputFormat.ESM,
				target: 'node18.16',
				sourceMap: false,
				sourcesContent: false,
				banner: 'import { createRequire } from \'module\';const require = createRequire(import.meta.url);import { fileURLToPath } from \'url\';import { dirname } from \'path\';const __filename = fileURLToPath(import.meta.url);const __dirname = dirname(__filename);',
				externalModules: ['aws-sdk', 'pg-native'],
			},
			depsLockFilePath: path.join(__dirname, '../../../../common/config/rush/pnpm-lock.yaml'),
			architecture: getLambdaArchitecture(scope),
		});

		tableV2.grantReadWriteData(impactCreationLambda);
		bucket.grantRead(impactCreationLambda);
		bucket.grantDelete(impactCreationLambda);
		bucket.grantPut(impactCreationLambda);
		impactLambda.grantInvoke(impactCreationLambda);
		eventBus.grantPutEventsTo(impactCreationLambda);

		const rawResultProcessorLambda = new NodejsFunction(this, 'RawResultProcessorLambda', {
			description: `Raw Result Task Handler: Tenant ${props.tenantId}`,
			entry: path.join(__dirname, '../../../../typescript/packages/apps/pipeline-processors/src/stepFunction/handlers/rawResultProcessor.handler.ts'),
			functionName: `${namePrefix}-rawResultProcessorTask`,
			runtime: Runtime.NODEJS_18_X,
			tracing: Tracing.ACTIVE,
			memorySize: 512,
			logRetention: RetentionDays.ONE_WEEK,
			timeout: Duration.minutes(5),
			environment: {
				NODE_ENV: props.environment,
				BUCKET_NAME: bucket.bucketName,
				BUCKET_PREFIX: bucketPrefix,
				TABLE_NAME: tableV2.tableName,
				EVENT_BUS_NAME: props.eventBusName,
			},
			bundling: {
				minify: true,
				format: OutputFormat.ESM,
				target: 'node18.16',
				sourceMap: false,
				sourcesContent: false,
				banner: 'import { createRequire } from \'module\';const require = createRequire(import.meta.url);import { fileURLToPath } from \'url\';import { dirname } from \'path\';const __filename = fileURLToPath(import.meta.url);const __dirname = dirname(__filename);',
				externalModules: ['aws-sdk', 'pg-native'],
			},
			depsLockFilePath: path.join(__dirname, '../../../../common/config/rush/pnpm-lock.yaml'),
			architecture: getLambdaArchitecture(scope),
		});

		tableV2.grantReadWriteData(rawResultProcessorLambda);
		bucket.grantRead(rawResultProcessorLambda);
		bucket.grantReadWrite(rawResultProcessorLambda);
		eventBus.grantPutEventsTo(rawResultProcessorLambda);

		const sqlResultProcessorLambda = new NodejsFunction(this, 'SqlResultProcessorLambda', {
			description: `Sql Result Task Handler: Tenant ${props.tenantId}`,
			entry: path.join(__dirname, '../../../../typescript/packages/apps/pipeline-processors/src/stepFunction/handlers/sqlResultProcessor.handler.ts'),
			functionName: `${namePrefix}-sqlResultProcessorTask`,
			runtime: Runtime.NODEJS_18_X,
			tracing: Tracing.ACTIVE,
			memorySize: 512,
			logRetention: RetentionDays.ONE_WEEK,
			timeout: Duration.minutes(5),
			environment: {
				NODE_ENV: props.environment,
				BUCKET_NAME: bucket.bucketName,
				BUCKET_PREFIX: bucketPrefix,
				TABLE_NAME: tableV2.tableName,
				EVENT_BUS_NAME: props.eventBusName,
				...auroraEnvironmentVariables,
			},

			securityGroups: [lambdaToRDSProxyGroup],
			vpc,
			vpcSubnets: {
				subnetType: SubnetType.PRIVATE_WITH_NAT,
			},
			bundling: {
				minify: true,
				format: OutputFormat.ESM,
				target: 'node18.16',
				sourceMap: false,
				sourcesContent: false,
				banner: 'import { createRequire } from \'module\';const require = createRequire(import.meta.url);import { fileURLToPath } from \'url\';import { dirname } from \'path\';const __filename = fileURLToPath(import.meta.url);const __dirname = dirname(__filename);',
				externalModules: ['aws-sdk', 'pg-native'],
			},
			depsLockFilePath: path.join(__dirname, '../../../../common/config/rush/pnpm-lock.yaml'),
			architecture: getLambdaArchitecture(scope),
		});

		sqlResultProcessorLambda.addToRolePolicy(rdsProxyPolicy);
		tableV2.grantReadWriteData(sqlResultProcessorLambda);
		bucket.grantRead(sqlResultProcessorLambda);
		bucket.grantDelete(sqlResultProcessorLambda);

		/*
		 * Data/Impacts Type State Machine
		 */

		const dataVerificationTask = new LambdaInvoke(this, 'DataVerificationTask', {
			lambdaFunction: verificationLambda,
			outputPath: '$.Payload',
		});

		const rawResultProcessorTask = new LambdaInvoke(this, 'RawResultProcessorTask', {
				lambdaFunction: rawResultProcessorLambda,
				payload: TaskInput.fromObject({
					'inputs.$': '$',
					'executionStartTime.$': '$$.Execution.StartTime',
					'executionArn.$': '$$.Execution.Id'
				}),
				outputPath: '$.Payload',
			}
		);


		const impactCreationTask = new LambdaInvoke(this, 'ImpactCreationTask', {
				lambdaFunction: impactCreationLambda,
				inputPath: '$.inputs'
			}
		);

		const calculateDataPipelineTask = new CustomState(this, 'Data Map State', {
			stateJson: {
				Type: 'Map',
				Next: 'RawResultProcessorTask',
				ItemProcessor: {
					ProcessorConfig: {
						Mode: 'INLINE'
					},
					StartAt: 'CalculationTask',
					States: {
						CalculationTask: {
							Type: 'Task',
							Resource: 'arn:aws:states:::lambda:invoke',
							OutputPath: '$.Payload',
							Parameters: {
								FunctionName: `${calculationLambda.functionArn}`,
								'Payload.$': '$'
							},
							End: true,
							Retry: [
								{
									ErrorEquals: [
										'Lambda.ServiceException',
										'Lambda.AWSLambdaException',
										'Lambda.SdkClientException'
									],
									IntervalSeconds: 2,
									MaxAttempts: 6,
									BackoffRate: 2
								}
							]
						}
					},
				},
				ItemsPath: '$.chunks',
				ItemSelector: {
					'source.$': '$.source',
					'context.$': '$.context',
					'chunk': {
						'sequence.$': '$$.Map.Item.Index',
						'range.$': '$$.Map.Item.Value.range'
					}
				},
				MaxConcurrency: 10,
			}
		});

		const dataPipelineStateMachineLogGroup = new LogGroup(this, 'DataPipelineLogGroup', { logGroupName: `/aws/stepfunctions/${namePrefix}-dataPipeline`, removalPolicy: RemovalPolicy.DESTROY });

		const dataPipelineStateMachine = new StateMachine(this, 'DataPipelineStateMachine', {
			definition: dataVerificationTask
				.next(calculateDataPipelineTask)
				.next(rawResultProcessorTask)
				.next(new Choice(this, 'Is Pipeline Type Equal To Impact?')
					.otherwise(new Succeed(this, 'Pipeline Succeeded'))
					.when(Condition.stringEquals('$.inputs[0].pipelineType', 'impacts'), impactCreationTask)),
			logs: { destination: dataPipelineStateMachineLogGroup, level: LogLevel.ERROR, includeExecutionData: true },
			stateMachineName: `${namePrefix}-dataPipeline`,
			tracingEnabled: true
		});

		new StringParameter(this, 'DataPipelineStateMachineArnParameter', {
			parameterName: dataPipelineStateMachineArnParameter(props.tenantId, props.environment),
			stringValue: dataPipelineStateMachine.stateMachineArn,
		});

		calculationLambda.grantInvoke(dataPipelineStateMachine);

		/*
		 * Activities Type State Machine
		 */

		const verificationTask = new LambdaInvoke(this, 'VerificationTask', {
			lambdaFunction: verificationLambda,
			outputPath: '$.Payload',
		});

		const resultProcessorTask = new LambdaInvoke(this, 'ResultProcessorTask', {
				lambdaFunction: resultProcessorLambda,
				payload: TaskInput.fromObject({
					'inputs.$': '$',
					'executionStartTime.$': '$$.Execution.StartTime',
					'executionArn.$': '$$.Execution.Id'
				})
			}
		);

		const jobInsertLatestValuesTask = new LambdaInvoke(this, 'JobInsertLatestValuesTask', {
			lambdaFunction: insertLatestValuesLambda,
			inputPath: '$',
			outputPath: '$.Payload',
		}
		);

		const jobMetricAggregationTask = new LambdaInvoke(this, 'JobMetricAggregationTask', {
			lambdaFunction: metricAggregationLambda,
			inputPath: '$',
			outputPath: '$.Payload',
		});

		const jobPipelineAggregationTask = new LambdaInvoke(this, 'JobPipelineAggregationTask', {
			lambdaFunction: pipelineAggregationLambda,
			inputPath: '$',
			outputPath: '$.Payload',
		});

		const map = new CustomState(this, 'Map State', {
			stateJson: {
				Type: 'Map',
				Next: 'Wait For SQL Insert Result',
				ItemProcessor: {
					ProcessorConfig: {
						Mode: 'INLINE'
					},
					StartAt: 'CalculationTask',
					States: {
						CalculationTask: {
							Type: 'Task',
							Resource: 'arn:aws:states:::lambda:invoke',
							OutputPath: '$.Payload',
							Parameters: {
								FunctionName: `${calculationLambda.functionArn}`,
								'Payload.$': '$'
							},
							End: true,
							Retry: [
								{
									ErrorEquals: [
										'Lambda.ServiceException',
										'Lambda.AWSLambdaException',
										'Lambda.SdkClientException'
									],
									IntervalSeconds: 2,
									MaxAttempts: 6,
									BackoffRate: 2
								}
							]
						}
					},
				},
				ItemsPath: '$.chunks',
				ItemSelector: {
					'source.$': '$.source',
					'context.$': '$.context',
					'chunk': {
						'sequence.$': '$$.Map.Item.Index',
						'range.$': '$$.Map.Item.Value.range'
					}
				},
				MaxConcurrency: 10,
			}
		});

		const environmentPrefix = `sif-${props.environment}`;
		const queueManagerPayload = (taskName: string) => {
			return {
				detail: TaskInput.fromObject({
					taskName,
					tenantId: props.tenantId,
					executionName: JsonPath.stringAt('$$.Execution.Name')
				}),
				detailType: `SIF>com.aws.sif.pipelineProcessors>semaphoreLock`,
				source: 'com.aws.sif.pipelineProcessors',
				eventBus: environmentEventBus
			};
		};

		/**
		 * Define the Acquire and Release Locks
		 */
		const acquireLock = (id: string, taskName: string) => {
			return new Parallel(this, id, { outputPath: '$[1]' })
				.branch(
					new EventBridgePutEvents(this, `${id}EventBridgeAcquireLock`, {
						entries: [queueManagerPayload(taskName)],
					})
				).branch(
					new SqsSendMessage(this, `${id}SqsAcquireLock`, {
						queue: acquireLockQueue,
						integrationPattern: IntegrationPattern.WAIT_FOR_TASK_TOKEN,
						resultPath: JsonPath.DISCARD,
						messageGroupId: environmentPrefix,
						messageDeduplicationId: JsonPath.format(`${taskName}-{}`, JsonPath.stringAt('$$.Execution.Name')),
						messageBody: TaskInput.fromObject({
							tenantId: props.tenantId,
							execution: JsonPath.objectAt('$$.Execution'),
							taskName,
							token: JsonPath.taskToken,
						})
					})
				);
		};

		const releaseLock = (id: string, taskName: string) => new Parallel(this, id, { outputPath: '$[1]' })
			.branch(
				new EventBridgePutEvents(this, `${id}EventBridgeReleaseLock`, {
					entries: [queueManagerPayload(taskName)],
				}))
			.branch(new SqsSendMessage(this, `${id}SqsReleaseLock`, {
				queue: releaseLockQueue,
				resultPath: JsonPath.DISCARD,
				messageGroupId: taskName,
				messageDeduplicationId: JsonPath.format(`${taskName}-{}`, JsonPath.stringAt('$$.Execution.Name')),
				messageBody: TaskInput.fromObject({
					tenantId: props.tenantId,
					executionName: JsonPath.stringAt('$$.Execution.Name'),
					taskName,
				})
			}));


		const acquireLockInsertLatest = acquireLock('AcquireLockInsertLatestActivityValues', DatabaseTask.InsertActivityLatestValues);
		const releaseLockInsertLatest = releaseLock('ReleaseLockInsertLatestActivityValues', DatabaseTask.InsertActivityLatestValues);

		const acquireLockPipelineAggregation = acquireLock('AcquireLockPipelineAggregation', DatabaseTask.AggregatePipelineOutput);
		const releaseLockPipelineAggregation = releaseLock('ReleaseLockPipelineAggregation', DatabaseTask.AggregatePipelineOutput);

		const acquireLockMetricAggregation = acquireLock('AcquireLockMetricAggregation', DatabaseTask.AggregateMetrics);
		const releaseLockMetricAggregation = releaseLock('ReleaseLockMetricAggregation', DatabaseTask.AggregateMetrics);

		const acquireLockInsertValues = acquireLock('AcquireLockInsertActivityValues', DatabaseTask.InsertActivityValues);
		const releaseLockInsertValuesSuccess = releaseLock('ReleaseLockInsertActivityValuesSuccess', DatabaseTask.InsertActivityValues);
		const releaseLockInsertValuesFail = releaseLock('ReleaseLockInsertActivityValuesFail', DatabaseTask.InsertActivityValues);

		const parallel = new Parallel(this, 'Post Processing Tasks')
			.branch(
				acquireLockMetricAggregation
					.next(jobMetricAggregationTask)
					.next((new Choice(this, 'Processing Metric Complete (Job)?')
						.when(Condition.stringEquals('$[0].status', 'SUCCEEDED'),
							releaseLockMetricAggregation.next(new Pass(this, 'Processing Metric Pass (Job)', { outputPath: '$[0]' })))
						.when(Condition.stringEquals('$[0].status', 'IN_PROGRESS'),
							jobMetricAggregationTask)))
			)
			.branch(acquireLockPipelineAggregation
				.next(jobPipelineAggregationTask)
				.next(releaseLockPipelineAggregation));

		const waitForSqlInsert = new Wait(this, 'Wait For SQL Insert Result', { time: WaitTime.duration(Duration.seconds(10)) });

		const sqlResultProcessorTask = new LambdaInvoke(this, 'Process SQL Insert Result', {
			lambdaFunction: sqlResultProcessorLambda,
			payload: TaskInput.fromObject({
				'inputs.$': '$',
				'executionStartTime.$': '$$.Execution.StartTime'
			})
			, outputPath: '$.Payload',
		});

		const activityPipelineLogGroup = new LogGroup(this, 'ActivityPipelineLogGroup', { logGroupName: `/aws/stepfunctions/${namePrefix}-activityPipeline`, removalPolicy: RemovalPolicy.DESTROY });

		const activityPipelineStateMachine = new StateMachine(this, 'ActivityPipelineStateMachine', {
			definition: verificationTask
				.next(acquireLockInsertValues)
				.next(map)
				.next(waitForSqlInsert)
				.next(sqlResultProcessorTask)
				.next(new Choice(this, 'Job Complete?')
					.when(Condition.stringEquals('$[0].status', 'FAILED'),
						releaseLockInsertValuesFail
							.next(resultProcessorTask))
					.when(Condition.stringEquals('$[0].status', 'SUCCEEDED'),
						releaseLockInsertValuesSuccess
							.next(acquireLockInsertLatest
								.next(jobInsertLatestValuesTask)
								.next(releaseLockInsertLatest))
							.next(parallel)
							.next(resultProcessorTask))
					.otherwise(waitForSqlInsert)),
			logs: { destination: activityPipelineLogGroup, level: LogLevel.ERROR, includeExecutionData: true },
			stateMachineName: `${namePrefix}-activityPipeline`,
			tracingEnabled: true
		});

		new StringParameter(this, 'ActivityPipelineStateMachineArnParameter', {
			parameterName: activityPipelineStateMachineArnParameter(props.tenantId, props.environment),
			stringValue: activityPipelineStateMachine.stateMachineArn,
		});

		calculationLambda.grantInvoke(activityPipelineStateMachine);


		/*
		 * Inline Pipeline Definition
		 */
		const inlineWaitForSqlInsert = new Wait(this, 'Wait For SQL Insert Result (Inline)', { time: WaitTime.duration(Duration.seconds(10)) });

		const inlineSqlResultProcessorTask = new LambdaInvoke(this, 'Process SQL Insert Result (Inline)', {
			lambdaFunction: sqlResultProcessorLambda,
			payload: TaskInput.fromObject({
				'inputs.$': '$',
				'executionStartTime.$': '$$.Execution.StartTime'
			}), outputPath: '$.Payload',
		});

		const inlineStateMachineLogGroup = new LogGroup(this, 'InlineStateMachineLogGroup', { logGroupName: `/aws/stepfunctions/${namePrefix}-inlinePipeline`, removalPolicy: RemovalPolicy.DESTROY });

		const inlineInsertLatestValuesTask = new LambdaInvoke(this, 'InsertLatestValuesTask', {
			lambdaFunction: insertLatestValuesLambda,
			inputPath: '$',
			outputPath: '$.Payload',
		}
		);

		const inlineMetricAggregationTask = new LambdaInvoke(this, 'InlineMetricAggregationTask', {
			lambdaFunction: metricAggregationLambda,
			outputPath: '$.Payload',
		});

		const inlinePipelineAggregationTask = new LambdaInvoke(this, 'InlinePipelineAggregationTask', {
			lambdaFunction: pipelineAggregationLambda,
		});

		const parallelInlineTask = new Parallel(this, 'InlineAggregationTask')
			.branch(inlineMetricAggregationTask.next(
				(new Choice(this, 'Metric Processing Complete (Inline)?')
					.when(Condition.stringEquals('$[0].status', 'SUCCEEDED'), new Pass(this, 'Processing Metric Pass (Inline)', {
						outputPath: '$[0]'
					}))
					.when(Condition.stringEquals('$[0].status', 'IN_PROGRESS'), inlineMetricAggregationTask))))
			.branch(inlinePipelineAggregationTask);


		const inlinePipelineStateMachine = new StateMachine(this, 'InlinePipelineStateMachine', {
			definition:
				inlineWaitForSqlInsert
					.next(inlineSqlResultProcessorTask)
					.next(new Choice(this, 'Inline SQL insert Complete?')
						.when(Condition.stringEquals('$[0].status', 'FAILED'), new Fail(this, 'Fail Inserting SQL'))
						.when(Condition.stringEquals('$[0].status', 'SUCCEEDED'),
							inlineInsertLatestValuesTask
								.next(parallelInlineTask))
						.otherwise(inlineWaitForSqlInsert)),
			logs: { destination: inlineStateMachineLogGroup, level: LogLevel.ERROR, includeExecutionData: true },
			stateMachineName: `${namePrefix}-inlinePipeline`,
			tracingEnabled: true
		});


		new StringParameter(this, 'InlinePipelineStateMachineArnParameter', {
			parameterName: inlinePipelineStateMachineArnParameter(props.tenantId, props.environment),
			stringValue: inlinePipelineStateMachine.stateMachineArn,
		});

		const eventIntegrationLambda = new NodejsFunction(this, 'BucketEventsLambda', {
			description: `Pipeline Processors Bucket Events Handler: Tenant ${props.tenantId}`,
			entry: path.join(__dirname, '../../../../typescript/packages/apps/pipeline-processors/src/lambda_eventbridge.ts'),
			runtime: Runtime.NODEJS_18_X,
			tracing: Tracing.ACTIVE,
			functionName: `${namePrefix}-bucketEvents`,
			timeout: Duration.seconds(30),
			memorySize: 512,
			logRetention: RetentionDays.ONE_WEEK,
			environment: {
				INLINE_PROCESSING_ROWS_LIMIT,
				NODE_ENV: props.environment,
				DATA_PIPELINE_JOB_STATE_MACHINE_ARN: dataPipelineStateMachine.stateMachineArn,
				ACTIVITIES_PIPELINE_JOB_STATE_MACHINE_ARN: activityPipelineStateMachine.stateMachineArn,
				INLINE_PIPELINE_STATE_MACHINE_ARN: inlinePipelineStateMachine.stateMachineArn,
				BUCKET_NAME: bucket.bucketName,
				BUCKET_PREFIX: bucketPrefix,
				EVENT_BUS_NAME: props.eventBusName,
				TABLE_NAME: tableV2.tableName,
				PIPELINES_FUNCTION_NAME: props.pipelineApiFunctionName,
				IMPACTS_FUNCTION_NAME: props.impactApiFunctionName,
				CALCULATOR_FUNCTION_NAME: props.calculatorFunctionName,
				METRICS_TABLE_NAME: metricsTable.tableName,
				CSV_INPUT_CONNECTOR_NAME: props.csvConnectorName,
			},
			bundling: {
				minify: true,
				format: OutputFormat.ESM,
				target: 'node18.16',
				sourceMap: false,
				sourcesContent: false,
				banner: 'import { createRequire } from \'module\';const require = createRequire(import.meta.url);import { fileURLToPath } from \'url\';import { dirname } from \'path\';const __filename = fileURLToPath(import.meta.url);const __dirname = dirname(__filename);',
				externalModules: ['aws-sdk', 'pg-native'],
			},
			depsLockFilePath: path.join(__dirname, '../../../../common/config/rush/pnpm-lock.yaml'),
			architecture: getLambdaArchitecture(scope),
		});

		pipelineLambda.grantInvoke(eventIntegrationLambda);
		activityPipelineStateMachine.grantStartExecution(eventIntegrationLambda);
		dataPipelineStateMachine.grantStartExecution(eventIntegrationLambda);
		tableV2.grantReadWriteData(eventIntegrationLambda);
		bucket.grantReadWrite(eventIntegrationLambda);
		eventBus.grantPutEventsTo(eventIntegrationLambda);
		environmentEventBus.grantPutEventsTo(activityPipelineStateMachine);

		const deadLetterQueue = new Queue(this, 'DeadLetterQueue');

		deadLetterQueue.addToResourcePolicy(new PolicyStatement({
			sid: 'enforce-ssl',
			effect: Effect.DENY,
			principals: [new AnyPrincipal()],
			actions: ['sqs:*'],
			resources: [deadLetterQueue.queueArn],
			conditions: {
				'Bool': {
					'aws:SecureTransport': 'false'
				}
			}
		}));

		const dataSourcesUploadRule = new Rule(this, 'DataSourcesUploadRule', {
			eventPattern: {
				source: ['aws.s3'],
				detailType: ['Object Created'],
				detail: {
					bucket: {
						name: [props.bucketName],
					},
					object: {
						key: [{ suffix: 'raw' }],
					},
				},
			},
		});


		const connectorIntegrationResponseRule = new Rule(this, 'ConnectorIntegrationResponseRule', {
			eventBus: eventBus,
			eventPattern: {
				detailType: [PIPELINE_PROCESSOR_CONNECTOR_RESPONSE_EVENT]
			}
		});

		connectorIntegrationResponseRule.addTarget(
			new LambdaFunction(eventIntegrationLambda, {
				deadLetterQueue: deadLetterQueue,
				maxEventAge: Duration.minutes(5),
				retryAttempts: 2,
			})
		);

		dataSourcesUploadRule.addTarget(
			new LambdaFunction(eventIntegrationLambda, {
				deadLetterQueue: deadLetterQueue,
				maxEventAge: Duration.minutes(5),
				retryAttempts: 2,
			})
		);

		eventBus.grantPutEventsTo(verificationLambda);
		eventBus.grantPutEventsTo(calculationLambda);
		eventBus.grantPutEventsTo(eventIntegrationLambda);
		eventBus.grantPutEventsTo(resultProcessorLambda);
		eventBus.grantPutEventsTo(sqlResultProcessorLambda);

		const kmsKey = Key.fromKeyArn(this, 'KmsKey', props.kmsKeyArn);

		/*
		 * Define task queue
		*/
		const taskDlq = new Queue(this, `taskDlq`, { queueName: `${namePrefix}-pipelineProcessor-task-dlq` });
		taskDlq.addToResourcePolicy(new PolicyStatement({
			sid: 'enforce-ssl',
			effect: Effect.DENY,
			principals: [new AnyPrincipal()],
			actions: ['sqs:*'],
			resources: [taskDlq.queueArn],
			conditions: {
				'Bool': {
					'aws:SecureTransport': 'false'
				}
			}
		}));
		const taskQueue = new Queue(this, `taskQueue`, {
			queueName: `${namePrefix}-pipelineProcessor-task-queue`,
			deadLetterQueue: {
				maxReceiveCount: 10,
				queue: taskDlq
			},
			visibilityTimeout: Duration.minutes(15),
		});

		taskQueue.addToResourcePolicy(new PolicyStatement({
			sid: 'enforce-ssl',
			effect: Effect.DENY,
			principals: [new AnyPrincipal()],
			actions: ['sqs:*'],
			resources: [taskQueue.queueArn],
			conditions: {
				'Bool': {
					'aws:SecureTransport': 'false'
				}
			}
		}));


		/*
		 * Insert activities in bulk into the database
		*/
		const insertActivityQueue = Queue.fromQueueArn(this, 'calculatorInsertActivityQueue', props.activityInsertQueueArn);

		const insertActivityBulkLambda = new NodejsFunction(this, 'InsertActivityBulkLambda', {
			description: `Insert Activity Bulk Task Handler: Tenant ${props.tenantId}`,
			entry: path.join(__dirname, '../../../../typescript/packages/apps/pipeline-processors/src/lambda_bulk_insert_sqs.ts'),
			functionName: `${namePrefix}-insertActivityBulk`,
			runtime: Runtime.NODEJS_18_X,
			tracing: Tracing.ACTIVE,
			memorySize: 512,
			logRetention: RetentionDays.ONE_WEEK,
			timeout: Duration.minutes(5),
			environment: {
				NODE_ENV: props.environment,
				EVENT_BUS_NAME: props.eventBusName,
				BUCKET_NAME: bucket.bucketName,
				BUCKET_PREFIX: bucketPrefix,
				PIPELINES_FUNCTION_NAME: props.pipelineApiFunctionName,
				ACTIVITY_QUEUE_URL: insertActivityQueue.queueUrl,
				TABLE_NAME: tableV2.tableName,
				IMPACTS_FUNCTION_NAME: props.impactApiFunctionName,
				AUDIT_VERSION: props.auditVersion,
				...auroraEnvironmentVariables,
			},
			securityGroups: [lambdaToRDSProxyGroup],
			vpc,
			vpcSubnets: {
				subnetType: SubnetType.PRIVATE_WITH_NAT,
			},
			bundling: {
				minify: true,
				format: OutputFormat.ESM,
				target: 'node18.16',
				sourceMap: false,
				sourcesContent: false,
				banner: 'import { createRequire } from \'module\';const require = createRequire(import.meta.url);import { fileURLToPath } from \'url\';import { dirname } from \'path\';const __filename = fileURLToPath(import.meta.url);const __dirname = dirname(__filename);',
				externalModules: ['aws-sdk', 'pg-native'],
			},
			depsLockFilePath: path.join(__dirname, '../../../../common/config/rush/pnpm-lock.yaml'),
			architecture: getLambdaArchitecture(scope),
		});
		insertActivityBulkLambda.node.addDependency(insertActivityQueue);

		tableV2.grantReadData(insertActivityBulkLambda);
		bucket.grantReadWrite(insertActivityBulkLambda);
		bucket.grantDelete(insertActivityBulkLambda);
		insertActivityBulkLambda.addToRolePolicy(rdsProxyPolicy);
		insertActivityBulkLambda.addEventSource(new SqsEventSource(insertActivityQueue, {
			batchSize: 1,
			reportBatchItemFailures: true,
		})
		);

		/**
		 * Define the API Lambda
		 */
		const apiLambda = new NodejsFunction(this, 'Apilambda', {
			description: `Pipeline Executions API: Tenant ${props.tenantId}`,
			entry: path.join(__dirname, '../../../../typescript/packages/apps/pipeline-processors/src/lambda_apiGateway.ts'),
			functionName: `${props.pipelineProcessorApiFunctionName}`,
			runtime: Runtime.NODEJS_18_X,
			tracing: Tracing.ACTIVE,
			memorySize: 512,
			logRetention: RetentionDays.ONE_WEEK,
			environment: {
				INLINE_PROCESSING_ROWS_LIMIT,
				ACCESS_MANAGEMENT_FUNCTION_NAME: props.accessManagementApiFunctionName,
				NODE_ENV: props.environment,
				TABLE_NAME: tableV2.tableName,
				WORKER_QUEUE_URL: workerQueue.queueUrl,
				BUCKET_NAME: bucket.bucketName,
				BUCKET_PREFIX: bucketPrefix,
				EVENT_BUS_NAME: eventBus.eventBusName,
				DATA_PIPELINE_JOB_STATE_MACHINE_ARN: dataPipelineStateMachine.stateMachineArn,
				ACTIVITIES_PIPELINE_JOB_STATE_MACHINE_ARN: activityPipelineStateMachine.stateMachineArn,
				INLINE_PIPELINE_STATE_MACHINE_ARN: inlinePipelineStateMachine.stateMachineArn,
				PIPELINES_FUNCTION_NAME: props.pipelineApiFunctionName,
				IMPACTS_FUNCTION_NAME: props.impactApiFunctionName,
				CALCULATOR_FUNCTION_NAME: props.calculatorFunctionName,
				METRICS_TABLE_NAME: metricsTable.tableName,
				TENANT_ID: props.tenantId,
				METRIC_STORAGE: props.metricStorage,
				TASK_PARALLEL_LIMIT: props.downloadAuditFileParallelLimit.toString(),
				CSV_INPUT_CONNECTOR_NAME: props.csvConnectorName,
				TASK_QUEUE_URL: taskQueue.queueUrl,
				ATHENA_AUDIT_LOGS_TABLE_NAME: props.auditLogsTableName,
				ATHENA_DATABASE_NAME: props.auditLogsDatabaseName,
				AUDIT_VERSION: props.auditVersion,
				...auroraEnvironmentVariables,
			},
			securityGroups: [lambdaToRDSProxyGroup],
			vpc,
			vpcSubnets: {
				subnetType: SubnetType.PRIVATE_WITH_NAT,
			},
			timeout: Duration.minutes(5),
			bundling: {
				minify: true,
				format: OutputFormat.ESM,
				target: 'node18.16',
				sourceMap: false,
				sourcesContent: false,
				banner: 'import { createRequire } from \'module\';const require = createRequire(import.meta.url);import { fileURLToPath } from \'url\';import { dirname } from \'path\';const __filename = fileURLToPath(import.meta.url);const __dirname = dirname(__filename);',
				externalModules: ['aws-sdk', 'pg-native'],
			},
			depsLockFilePath: path.join(__dirname, '../../../../common/config/rush/pnpm-lock.yaml'),
			architecture: getLambdaArchitecture(scope),
		});

		apiLambda.node.addDependency(taskQueue);
		apiLambda.node.addDependency(workerQueue);
		apiLambda.addToRolePolicy(rdsProxyPolicy);
		// grant the lambda functions access to the table
		tableV2.grantReadWriteData(apiLambda);
		workerQueue.grantSendMessages(apiLambda);
		kmsKey.grantDecrypt(apiLambda);
		bucket.grantReadWrite(apiLambda);
		bucket.grantDelete(apiLambda);
		eventBus.grantPutEventsTo(apiLambda);
		pipelineLambda.grantInvoke(apiLambda);
		metricsTable.grantReadData(apiLambda);
		calculatorLambda.grantInvoke(apiLambda);
		inlinePipelineStateMachine.grantStartExecution(apiLambda);
		taskQueue.grantSendMessages(apiLambda);
		impactLambda.grantInvoke(apiLambda);

		new StringParameter(this, 'pipelineProcessorApiFunctionArnParameter', {
			parameterName: pipelineProcessorApiFunctionArnParameter(props.tenantId, props.environment),
			stringValue: apiLambda.functionArn,
		});

		const athenaPolicy = new PolicyStatement({
			actions: [
				'athena:StartQueryExecution',
				'athena:GetQueryExecution',
				'athena:GetQueryResults',
				`glue:GetTables`,
				`glue:GetTable`,
				`glue:GetPartitions`,
			],
			resources: [
				`arn:aws:athena:${region}:${accountId}:workgroup/primary`,
				`arn:aws:glue:${region}:${accountId}:catalog`,
				`arn:aws:glue:${region}:${accountId}:database/${props.auditLogsDatabaseName}`,
				`arn:aws:glue:${region}:${accountId}:table/${props.auditLogsDatabaseName}/${props.auditLogsTableName}*`
			],
		});

		apiLambda.addToRolePolicy(athenaPolicy);

		const taskQueueLambda = new NodejsFunction(this, 'Tasklambda', {
			description: `Pipeline Executions Task processor: Tenant ${props.tenantId}`,
			entry: path.join(__dirname, '../../../../typescript/packages/apps/pipeline-processors/src/lambda_sqs.ts'),
			functionName: `${namePrefix}-pipelineProcessor-task-sqs`,
			runtime: Runtime.NODEJS_18_X,
			tracing: Tracing.ACTIVE,
			memorySize: 512,
			logRetention: RetentionDays.ONE_WEEK,
			environment: {
				ACCESS_MANAGEMENT_FUNCTION_NAME: props.accessManagementApiFunctionName,
				NODE_ENV: props.environment,
				TABLE_NAME: tableV2.tableName,
				BUCKET_NAME: bucket.bucketName,
				BUCKET_PREFIX: bucketPrefix,
				TENANT_ID: props.tenantId,
				PIPELINES_FUNCTION_NAME: props.pipelineApiFunctionName,
				PIPELINE_PROCESSOR_FUNCTION_NAME: props.pipelineProcessorApiFunctionName,
				IMPACTS_FUNCTION_NAME: props.impactApiFunctionName,
				TASK_QUEUE_URL: taskQueue.queueUrl,
				METRICS_TABLE_NAME: metricsTable.tableName,
				EVENT_BUS_NAME: eventBus.eventBusName,
				DATA_PIPELINE_JOB_STATE_MACHINE_ARN: dataPipelineStateMachine.stateMachineArn,
				ACTIVITIES_PIPELINE_JOB_STATE_MACHINE_ARN: activityPipelineStateMachine.stateMachineArn,
				INLINE_PIPELINE_STATE_MACHINE_ARN: inlinePipelineStateMachine.stateMachineArn,
				CALCULATOR_FUNCTION_NAME: props.calculatorFunctionName,
				ATHENA_AUDIT_LOGS_TABLE_NAME: props.auditLogsTableName,
				ATHENA_DATABASE_NAME: props.auditLogsDatabaseName,
				AUDIT_VERSION: props.auditVersion,
				...auroraEnvironmentVariables,
			},
			securityGroups: [lambdaToRDSProxyGroup],
			vpc,
			vpcSubnets: {
				subnetType: SubnetType.PRIVATE_WITH_NAT,
			},
			timeout: Duration.minutes(10),
			bundling: {
				minify: true,
				format: OutputFormat.ESM,
				target: 'node18.16',
				sourceMap: false,
				sourcesContent: false,
				banner: 'import { createRequire } from \'module\';const require = createRequire(import.meta.url);import { fileURLToPath } from \'url\';import { dirname } from \'path\';const __filename = fileURLToPath(import.meta.url);const __dirname = dirname(__filename);',
				externalModules: ['aws-sdk', 'pg-native'],
			},
			depsLockFilePath: path.join(__dirname, '../../../../common/config/rush/pnpm-lock.yaml'),
			architecture: getLambdaArchitecture(scope),
		});

		kmsKey.grantDecrypt(taskQueueLambda);
		taskQueueLambda.node.addDependency(taskQueue);
		tableV2.grantReadData(taskQueueLambda);
		bucket.grantReadWrite(taskQueueLambda);
		bucket.grantDelete(taskQueueLambda);
		pipelineLambda.grantInvoke(taskQueueLambda);
		taskQueueLambda.addToRolePolicy(athenaPolicy);
		kmsKey.grantDecrypt(taskQueueLambda);
		taskQueueLambda.addToRolePolicy(rdsProxyPolicy);


		taskQueueLambda.addEventSource(
			new SqsEventSource(taskQueue, {
				batchSize: 10,
				reportBatchItemFailures: true,
			})
		);

		new StringParameter(this, `PipelineProcessorTaskQueueUrlParameter`, {
			parameterName: taskQueueUrlParameter(props.tenantId, props.environment),
			stringValue: taskQueue.queueUrl,
		});


		/**
		 * Define the API Gateway
		 */

		const userPool = UserPool.fromUserPoolId(this, 'UserPool', props.cognitoUserPoolId);
		const authorizer = new CognitoUserPoolsAuthorizer(this, 'Authorizer', {
			cognitoUserPools: [userPool],
		});
		const authOptions = {
			authorizationType: AuthorizationType.COGNITO,
			authorizer: authorizer,
		};

		const logGroup = new LogGroup(this, 'PipelineExecutionsApiLogs');

		const apigw = new LambdaRestApi(this, 'ApiGateway', {
			restApiName: `${namePrefix}-pipelineProcessorsApi`,
			description: `PipelineExecutions API: Tenant ${props.tenantId}`,
			handler: apiLambda,
			proxy: true,
			deployOptions: {
				stageName: 'prod',
				accessLogDestination: new LogGroupLogDestination(logGroup),
				accessLogFormat: AccessLogFormat.jsonWithStandardFields(),
				loggingLevel: MethodLoggingLevel.INFO,
			},
			defaultCorsPreflightOptions: {
				allowOrigins: Cors.ALL_ORIGINS,
				allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key', 'X-Amz-Security-Token', 'X-Amz-User-Agent', 'Accept-Version', 'x-groupcontextid']
			},
			endpointTypes: [EndpointType.REGIONAL],
			defaultMethodOptions: authOptions,
		});

		Aspects.of(apigw).add({
			visit(node) {
				if (node instanceof CfnMethod && node.httpMethod === 'OPTIONS') {
					node.addPropertyOverride('AuthorizationType', 'NONE');
				}
			}
		});

		apigw.node.addDependency(apiLambda);

		new StringParameter(this, 'pipelineProcessorApiUrlParameter', {
			parameterName: pipelineProcessorApiUrlParameter(props.tenantId, props.environment),
			stringValue: apigw.url,
		});

		new StringParameter(this, 'pipelineProcessorApiNameParameter', {
			parameterName: pipelineProcessorApiNameParameter(props.tenantId, props.environment),
			stringValue: apigw.url,
		});

		const accessManagementLambda = Function.fromFunctionName(this, 'accessManagementLambda', props.accessManagementApiFunctionName);
		accessManagementLambda.grantInvoke(apiLambda);


		NagSuppressions.addResourceSuppressions([apiLambda, eventIntegrationLambda, taskQueueLambda, resultProcessorLambda],
			[
				{
					id: 'AwsSolutions-IAM4',
					appliesTo: [
						'Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
					],
					reason: 'This policy is the one generated by CDK.'

				},
				{
					id: 'AwsSolutions-IAM5',
					appliesTo: [
						`Resource::arn:<AWS::Partition>:dynamodb:${region}:${accountId}:table/<ResourceApiBaseTable3133F8B2>/index/*`,
						`Resource::arn:<AWS::Partition>:lambda:${region}:${accountId}:function:<pipelineApiFunctionNameParameter>:*`
					],
					reason: 'This policy is required for the lambda to access the resource api table.'

				},
				{
					id: 'AwsSolutions-IAM5',
					appliesTo: ['Action::s3:Abort*', 'Action::s3:DeleteObject*', 'Action::s3:GetBucket*', 'Action::s3:GetObject*', 'Action::s3:List*', 'Resource::arn:<AWS::Partition>:s3:::<bucketNameParameter>/*'],
					reason: 'This policy is required for the lambda to access the s3 bucket that contains reference datasets file.'
				},
				{
					id: 'AwsSolutions-IAM5',
					appliesTo: ['Resource::*'],
					reason: 'The resource condition in the IAM policy is generated by CDK, this only applies to xray:PutTelemetryRecords and xray:PutTraceSegments.'
				}
			],
			true);

		NagSuppressions.addResourceSuppressions([verificationLambda, sqlResultProcessorLambda, insertLatestValuesLambda, taskQueueLambda, insertActivityBulkLambda, metricAggregationLambda, pipelineAggregationLambda, rawResultProcessorLambda, impactCreationLambda],
			[
				{
					id: 'AwsSolutions-IAM4',
					appliesTo: [
						'Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'],
					reason: 'This policy is the one generated by CDK.'

				},
				{
					id: 'AwsSolutions-IAM5',
					appliesTo: ['Action::s3:Abort*', 'Action::s3:DeleteObject*', 'Action::s3:GetBucket*', 'Action::s3:GetObject*', 'Action::s3:List*', 'Resource::arn:<AWS::Partition>:s3:::<bucketNameParameter>/*'],
					reason: 'This policy is required for the lambda to access the s3 bucket that contains reference datasets file.'
				},
				{
					id: 'AwsSolutions-IAM5',
					appliesTo: [
						`Resource::arn:<AWS::Partition>:dynamodb:${region}:${accountId}:table/<ResourceApiBaseTable3133F8B2>/index/*`,
						`Resource::arn:<AWS::Partition>:lambda:${region}:${accountId}:function:<pipelineApiFunctionNameParameter>:*`
					],
					reason: 'This policy is required for the lambda to access the resource api table.'

				},
				{
					id: 'AwsSolutions-IAM5',
					appliesTo: ['Resource::*'],
					reason: 'The resource condition in the IAM policy is generated by CDK, this only applies to xray:PutTelemetryRecords and xray:PutTraceSegments.'
				}
			],
			true);

		NagSuppressions.addResourceSuppressions([calculationLambda],
			[
				{
					id: 'AwsSolutions-IAM4',
					appliesTo: [
						'Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'],
					reason: 'This policy is the one generated by CDK.'

				},
				{
					id: 'AwsSolutions-IAM5',
					appliesTo: ['Action::s3:Abort*', 'Action::s3:DeleteObject*', 'Action::s3:GetBucket*', 'Action::s3:GetObject*', 'Action::s3:List*', 'Resource::arn:<AWS::Partition>:s3:::<bucketNameParameter>/*'],
					reason: 'This policy is required for the lambda to access the s3 bucket that contains reference datasets file.'
				},
				{
					id: 'AwsSolutions-IAM5',
					appliesTo: [
						`Resource::arn:<AWS::Partition>:dynamodb:${region}:${accountId}:table/<ResourceApiBaseTable3133F8B2>/index/*`,
						`Resource::arn:<AWS::Partition>:lambda:${region}:${accountId}:function:<pipelineApiFunctionNameParameter>:*`,
						`Resource::arn:<AWS::Partition>:lambda:${region}:${accountId}:function:<calculatorFunctionNameParameter>:*`,
					],
					reason: 'This policy is required for the lambda to access the resource api table.'
				},
				{
					id: 'AwsSolutions-IAM5',
					appliesTo: ['Resource::*'],
					reason: 'The resource condition in the IAM policy is generated by CDK, this only applies to xray:PutTelemetryRecords and xray:PutTraceSegments.'
				}
			],
			true);

		NagSuppressions.addResourceSuppressions([resultProcessorLambda, sqlResultProcessorLambda],
			[
				{
					id: 'AwsSolutions-IAM4',
					appliesTo: [
						'Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'],
					reason: 'This policy is the one generated by CDK.'

				},
				{
					id: 'AwsSolutions-IAM5',
					appliesTo: ['Action::s3:Abort*', 'Action::s3:DeleteObject*', 'Action::s3:GetBucket*', 'Action::s3:GetObject*', 'Action::s3:List*', 'Resource::arn:<AWS::Partition>:s3:::<bucketNameParameter>/*'],
					reason: 'This policy is required for the lambda to access the s3 bucket that contains reference datasets file.'
				},
				{
					id: 'AwsSolutions-IAM5',
					appliesTo: [
						`Resource::arn:<AWS::Partition>:dynamodb:${region}:${accountId}:table/<ResourceApiBaseTable3133F8B2>/index/*`,
					],
					reason: 'This policy is required for the lambda to access the resource api table.'

				},
				{
					id: 'AwsSolutions-IAM5',
					appliesTo: ['Resource::*'],
					reason: 'The resource condition in the IAM policy is generated by CDK, this only applies to xray:PutTelemetryRecords and xray:PutTraceSegments.'
				}
			],
			true);

		NagSuppressions.addResourceSuppressions([metricAggregationLambda, pipelineAggregationLambda, insertLatestValuesLambda, insertActivityBulkLambda, sqlResultProcessorLambda, rawResultProcessorLambda, impactCreationLambda],
			[
				{
					id: 'AwsSolutions-IAM4',
					appliesTo: [
						'Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
						'Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole'],
					reason: 'This policy is the one generated by CDK.'

				},
				{
					id: 'AwsSolutions-IAM5',
					appliesTo: [
						`Resource::arn:<AWS::Partition>:dynamodb:${region}:${accountId}:table/<ResourceApiBaseTable3133F8B2>/index/*`,
						`Resource::arn:<AWS::Partition>:dynamodb:${region}:${accountId}:table/<ResourceApiBaseTable3133F8B2>/index/*`,
						'Resource::<PipelineProcessorsMetricsTable944ED8FD.Arn>/index/*',
						`Resource::arn:<AWS::Partition>:lambda:${region}:${accountId}:function:<pipelineApiFunctionNameParameter>:*`,
						`Resource::arn:<AWS::Partition>:lambda:${region}:${accountId}:function:<impactApiFunctionNameParameter>:*`],
					reason: 'This policy is required for the lambda to access the resource api table.'

				},
				{
					id: 'AwsSolutions-IAM5',
					appliesTo: [`Resource::arn:<AWS::Partition>:lambda:${region}:${accountId}:function:<accessManagementApiFunctionNameParameter>:*`],
					reason: 'This policy is required to invoke access management and calculation engine.'
				},
				{
					id: 'AwsSolutions-IAM5',
					appliesTo: ['Resource::*'],
					reason: 'The resource condition in the IAM policy is generated by CDK, this only applies to xray:PutTelemetryRecords and xray:PutTraceSegments.'
				}
			],
			true);

		NagSuppressions.addResourceSuppressions([apiLambda],
			[
				{
					id: 'AwsSolutions-IAM4',
					appliesTo: [
						'Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole'],
					reason: 'This policy is the one generated by CDK.'

				},
				{
					id: 'AwsSolutions-IAM5',
					appliesTo: [
						`Resource::arn:<AWS::Partition>:dynamodb:${region}:${accountId}:table/<ResourceApiBaseTable3133F8B2>/index/*`,
						'Resource::<PipelineProcessorsMetricsTable944ED8FD.Arn>/index/*',
						`Resource::arn:<AWS::Partition>:lambda:${region}:${accountId}:function:<pipelineApiFunctionNameParameter>:*`,
						`Resource::arn:<AWS::Partition>:lambda:${region}:${accountId}:function:<impactApiFunctionNameParameter>:*`],

					reason: 'This policy is required for the lambda to access the resource api table.'

				},
				{
					id: 'AwsSolutions-IAM5',
					appliesTo: [
						`Resource::arn:<AWS::Partition>:dynamodb:${region}:${accountId}:table/<ResourceApiBaseTable3133F8B2>/index/*`,
						`Resource::arn:<AWS::Partition>:lambda:${region}:${accountId}:function:<calculatorFunctionNameParameter>:*`,
					],
					reason: 'This policy is required for the lambda to access the resource api table.'

				},
				{
					id: 'AwsSolutions-IAM5',
					appliesTo: [`Resource::arn:<AWS::Partition>:lambda:${region}:${accountId}:function:<accessManagementApiFunctionNameParameter>:*`],
					reason: 'This policy is required to invoke access management and calculation engine.'
				}
			],
			true);

		NagSuppressions.addResourceSuppressions([taskQueueLambda],
			[
				{
					id: 'AwsSolutions-IAM4',
					appliesTo: [
						'Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole'],
					reason: 'This policy is the one generated by CDK.'

				},
				{
					id: 'AwsSolutions-IAM5',
					appliesTo: [
						`Resource::arn:<AWS::Partition>:dynamodb:${region}:${accountId}:table/<ResourceApiBaseTable3133F8B2>/index/*`,

						'Resource::<PipelineProcessorsMetricsTable944ED8FD.Arn>/index/*',
						`Resource::arn:<AWS::Partition>:lambda:${region}:${accountId}:function:<pipelineApiFunctionNameParameter>:*`],
					reason: 'This policy is required for the lambda to access the resource api table.'

				},
				{
					id: 'AwsSolutions-IAM5',
					appliesTo: [
						`Resource::arn:<AWS::Partition>:dynamodb:${region}:${accountId}:table/<ResourceApiBaseTable3133F8B2>/index/*`,
						`Resource::arn:<AWS::Partition>:lambda:${region}:${accountId}:function:<calculatorFunctionNameParameter>:*`,
					],
					reason: 'This policy is required for the lambda to access the resource api table.'

				},
				{
					id: 'AwsSolutions-IAM5',
					appliesTo: [`Resource::arn:<AWS::Partition>:lambda:${region}:${accountId}:function:<accessManagementApiFunctionNameParameter>:*`],
					reason: 'This policy is required to invoke access management and calculation engine.'
				}
			],
			true);

		NagSuppressions.addResourceSuppressions([apigw],
			[
				{
					id: 'AwsSolutions-APIG2',
					reason: 'Request validation is being done by the Fastify module.'

				},
				{
					id: 'AwsSolutions-IAM4',
					appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AmazonAPIGatewayPushToCloudWatchLogs'],
					reason: 'API GW needs this policy to push logs to cloudwatch.'

				},
				{
					id: 'AwsSolutions-APIG4',
					reason: 'OPTIONS has no auth.'
				},
				{
					id: 'AwsSolutions-COG4',
					reason: 'OPTIONS does not use Cognito auth.'
				},
			],
			true);

		NagSuppressions.addResourceSuppressions([inlinePipelineStateMachine],
			[
				{
					id: 'AwsSolutions-IAM5',
					appliesTo: [
						'Resource::<AcquireLockLambdaFunctionArnParameter>:*',
						'Resource::<PipelineProcessorsProcessorMetricAggregationLambda4ABE57AD.Arn>:*',
						'Resource::<PipelineProcessorsProcessorPipelineAggregationLambda21DC6AD2.Arn>:*',
						'Resource::<PipelineProcessorsSqlResultProcessorLambda0313E998.Arn>:*',
						'Resource::<PipelineProcessorsInsertLatestValuesLambda017685D2.Arn>:*',
					],
					reason: 'this policy is required to invoke lambda specified in the state machine definition'
				},
				{
					id: 'AwsSolutions-SF1',
					reason: 'We only care about logging the error for now.'

				},
				{
					id: 'AwsSolutions-IAM5',
					reason: 'This resource policy only applies to log.',
					appliesTo: ['Resource::*']

				}],
			true);

		NagSuppressions.addResourceSuppressions([dataPipelineStateMachine],
			[
				{
					id: 'AwsSolutions-IAM5',
					appliesTo: [
						'Resource::<PipelineProcessorsProcessorCalculatorLambda22D65AA1.Arn>:*',
						'Resource::<PipelineProcessorsProcessorResourceVerificationLambdaD6D60A28.Arn>:*',
						'Resource::<PipelineProcessorsRawResultProcessorLambdaCC09052D.Arn>:*',
						'Resource::<PipelineProcessorsImpactCreationLambdaD7A8708E.Arn>:*'
					],
					reason: 'this policy is required to invoke lambda specified in the state machine definition'
				},
				{
					id: 'AwsSolutions-SF1',
					reason: 'We only care about logging the error for now.'
				},
				{
					id: 'AwsSolutions-IAM5',
					reason: 'This resource policy only applies to log.',
					appliesTo: ['Resource::*']

				}],
			true);

		NagSuppressions.addResourceSuppressions([activityPipelineStateMachine],
			[
				{
					id: 'AwsSolutions-IAM5',
					appliesTo: [
						'Resource::<PipelineProcessorsProcessorCalculatorLambda22D65AA1.Arn>:*',
						'Resource::<PipelineProcessorsProcessorResultProcessorLambda3587425C.Arn>:*',
						'Resource::<PipelineProcessorsProcessorSqlResultProcessorLambdaA17928AB.Arn>:*',
						'Resource::<PipelineProcessorsProcessorMetricAggregationLambda4ABE57AD.Arn>:*',
						'Resource::<PipelineProcessorsProcessorPipelineAggregationLambda21DC6AD2.Arn>:*',
						'Resource::<PipelineProcessorsProcessorResourceVerificationLambdaD6D60A28.Arn>:*',
						'Resource::<PipelineProcessorsSqlResultProcessorLambda0313E998.Arn>:*',
						'Resource::<PipelineProcessorsInsertLatestValuesLambda017685D2.Arn>:*'
					],
					reason: 'this policy is required to invoke lambda specified in the state machine definition'
				},
				{
					id: 'AwsSolutions-SF1',
					reason: 'We only care about logging the error for now.'

				},
				{
					id: 'AwsSolutions-IAM5',
					reason: 'This resource policy only applies to log.',
					appliesTo: ['Resource::*']

				}],
			true);

		NagSuppressions.addResourceSuppressions([taskDlq, deadLetterQueue],
			[
				{
					id: 'AwsSolutions-SQS3',
					reason: 'This is the dead letter queue.'

				},
			],
			true);

		NagSuppressions.addResourceSuppressions([apiLambda, taskQueueLambda],
			[
				{
					id: 'AwsSolutions-IAM5',
					reason: 'Given access to versioned glue tables',
					appliesTo: [`Resource::arn:aws:glue:${region}:${accountId}:table/<AuditLogsDatabaseNameParameter>/<AuditLogsTableNameParameter>*`],

				},
			],
			true);

		NagSuppressions.addResourceSuppressions([resultProcessorLambda],
			[
				{
					id: 'AwsSolutions-IAM5',
					reason: 'Given access to versioned glue tables',
					appliesTo: [`Resource::arn:aws:states:${region}:${accountId}:execution:sif-${props.tenantId}-${props.environment}-activityPipeline:*`],

				},
			],
			true);
	}
}
