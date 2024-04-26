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
import { Function } from 'aws-cdk-lib/aws-lambda';
import { Port, SecurityGroup, SubnetFilter, SubnetSelection, Vpc } from 'aws-cdk-lib/aws-ec2';
import { EventBus, Rule } from 'aws-cdk-lib/aws-events';
import { Construct } from 'constructs';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { IntegrationPattern, JsonPath, Parallel, TaskInput } from 'aws-cdk-lib/aws-stepfunctions';
import { EventBridgePutEvents, SqsSendMessage } from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { AttributeType, BillingMode, ProjectionType, StreamViewType, Table, TableEncryption } from 'aws-cdk-lib/aws-dynamodb';
import { AccessLogFormat, AuthorizationType, CfnMethod, CognitoUserPoolsAuthorizer, Cors, EndpointType, LambdaRestApi, LogGroupLogDestination, MethodLoggingLevel } from 'aws-cdk-lib/aws-apigateway';
import { LogGroup } from 'aws-cdk-lib/aws-logs';
import { fileURLToPath } from 'url';
import path from 'path';
import { UserPool } from 'aws-cdk-lib/aws-cognito';
import { AnyPrincipal, Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Queue } from 'aws-cdk-lib/aws-sqs';
import { Key } from 'aws-cdk-lib/aws-kms';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { NagSuppressions } from 'cdk-nag';
import { PIPELINE_CONNECTOR_SETUP_EVENT, PIPELINE_PROCESSOR_CONNECTOR_RESPONSE_EVENT } from '@sif/events';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { privateSubnetIdsParameter, vpcIdParameter } from '../shared/sharedTenant.stack.js';
import { PipelineProcessorFunction } from './pipelineProcessorFunction.construct.js';
import { ActivityPipelineStateMachine } from './activityPipelineStateMachine.construct.js';
import { DataPipelineStateMachine } from './dataPipelineStateMachine.construct.js';
import { MetricAggregationStateMachine } from './metricAggregationStateMachine.construct.js';
import { ActivityDownloadStateMachine } from './activiyDownloadStateMachine.construct.js';
import { ReferenceDatasetStateMachine } from './referenceDatasetStateMachine.construct.js';


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
	referenceDatasetApiFunctionName: string;
	kmsKeyArn: string;
	cognitoUserPoolId: string;
	bucketName: string;
	vpcId: string;
	rdsProxyEndpoint: string;
	rdsProxySecurityGroupId: string;
	rdsProxyArn: string;
	tenantDatabaseUsername: string;
	tenantDatabaseName: string;
	caCert: string;
	downloadAuditFileParallelLimit: number;
	csvConnectorName: string;
	metricStorage: string;
	auditLogsTableName: string;
	auditLogsDatabaseName: string;
	auditLogWaitTimeSeconds: number;
	activityInsertQueueArn: string;
	acquireLockSqsQueueArn: string;
	releaseLockSqsQueueArn: string;
	environmentEventBusName: string;
	auditVersion: string;
	tableName: string;
	workerQueueArn: string;
	triggerMetricAggregations: boolean;
	kinesisTemplateBucket: string;
	kinesisTemplateKey: string;
}

export const auroraClusterStatusParameterName = (environment: string) => `/sif/shared/${environment}/aurora-cluster/status`;
export const pipelineProcessorApiUrlParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/pipeline-processor/apiUrl`;
export const pipelineProcessorApiNameParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/pipeline-processor/apiName`;
export const pipelineProcessorApiFunctionArnParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/pipeline-processor/apiFunctionArn`;
export const pipelineProcessorBucketPrefixParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/pipeline-processor/bucketPrefix`;
export const pipelineProcessorTableNameParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/pipeline-processor/configTableName`;
export const metricsTableNameParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/pipeline-processor/metricsTableName`;
export const taskQueueUrlParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/pipeline-processor/taskQueueUrl`;
export const INLINE_PROCESSING_ROWS_LIMIT = '100';

enum DatabaseTask {
	InsertActivityValues = 'InsertActivityValues',
	InsertActivityLatestValues = 'InsertActivityLatestValues',
	AggregateMetrics = 'AggregateMetrics',
	AggregatePipelineOutput = 'AggregatePipelineOutput',
	ActivityDownload = 'ActivityDownload'
}

export class PipelineProcessors extends Construct {
	constructor(scope: Construct, id: string, props: PipelineProcessorsConstructProperties) {
		super(scope, id);

		const namePrefix = `sif-${props.tenantId}-${props.environment}`;
		const eventBus = EventBus.fromEventBusName(this, 'DefaultEventBus', props.eventBusName);
		// SIF modules dependencies
		const calculatorLambda = NodejsFunction.fromFunctionName(this, 'CalculatorLambda', props.calculatorFunctionName);
		const pipelineLambda = NodejsFunction.fromFunctionName(this, 'PipelineLambda', props.pipelineApiFunctionName);
		const impactLambda = NodejsFunction.fromFunctionName(this, 'ImpactLambda', props.impactApiFunctionName);
		const referenceDatasetLambda = NodejsFunction.fromFunctionName(this, 'ReferenceDatasetsLambda', props.referenceDatasetApiFunctionName);

		const sifModulesEnvironmentVariables = {
			PIPELINES_FUNCTION_NAME: props.pipelineApiFunctionName,
			IMPACTS_FUNCTION_NAME: props.impactApiFunctionName,
			CALCULATOR_FUNCTION_NAME: props.calculatorFunctionName,
		};

		// Network dependencies
		const vpcId = StringParameter.valueFromLookup(this, vpcIdParameter(props.environment));
		const vpc = Vpc.fromLookup(this, 'vpc', { vpcId });
		const privateSubnetIds = StringParameter.valueFromLookup(this, privateSubnetIdsParameter(props.environment)).split(',');
		const vpcSubnets: SubnetSelection = { subnetFilters: [SubnetFilter.byIds(privateSubnetIds)] };
		const rdsSecurityGroup = SecurityGroup.fromSecurityGroupId(this, 'RdsProxySecurityGroup', props.rdsProxySecurityGroupId);
		let lambdaToRDSProxyGroup = new SecurityGroup(this, 'Lambda to RDS Proxy Connection', {
			vpc: vpc
		});
		rdsSecurityGroup.addIngressRule(lambdaToRDSProxyGroup, Port.tcp(5432), 'allow lambda connection');

		// Resource dependencies
		const environmentEventBus = EventBus.fromEventBusName(this, 'EnvironmentEventBusName', props.environmentEventBusName);
		const bucketPrefix = 'pipelines';
		const bucket = Bucket.fromBucketName(this, 'Bucket', props.bucketName);

		const acquireLockQueue = Queue.fromQueueArn(this, 'AcquireLockQueue', props.acquireLockSqsQueueArn);
		const releaseLockQueue = Queue.fromQueueArn(this, 'ReleaseLockQueue', props.releaseLockSqsQueueArn);

		new StringParameter(this, 'pipelineProcessorBucketPrefixParameter', {
			parameterName: pipelineProcessorBucketPrefixParameter(props.tenantId, props.environment),
			stringValue: bucketPrefix
		});

		const auroraEnvironmentVariables = {
			CA_CERT: props.caCert,
			RDS_PROXY_ENDPOINT: props.rdsProxyEndpoint,
			TENANT_DATABASE_NAME: props.tenantDatabaseName,
			TENANT_USERNAME: props.tenantDatabaseUsername,
			TENANT_ID: props.tenantId
		};

		const accountId = Stack.of(this).account;
		const region = Stack.of(this).region;

		const rdsProxyPolicy = new PolicyStatement({
			actions: ['rds-db:connect'],
			resources: [`arn:aws:rds-db:${region}:${accountId}:dbuser:${Fn.select(6, Fn.split(':', props.rdsProxyArn))}/${props.tenantDatabaseUsername}`]
		});

		const cloudWatchPublishMetricsPolicy = new PolicyStatement({
			actions: ['cloudwatch:PutMetricData'],
			resources: ['*']
		});

		/**
		 * The policy needs to be set manually (we cannot use grantRead method of StateMachine construct) to avoid circular dependency
		 */
		const SFNGetExecutionHistoryPolicy = new PolicyStatement({
			actions: ['states:GetExecutionHistory', 'states:DescribeExecution'],
			resources: [`arn:aws:states:${region}:${accountId}:execution:sif-${props.tenantId}-${props.environment}-activityPipelineSM:*`]
		});

		/**
		 * Define the DynamoDB config table
		 */

		const tableV2 = Table.fromTableAttributes(this, 'TableV2', {
			tableName: props.tableName,
			globalIndexes: ['siKey1-pk-index', 'siKey2-pk-index']
		});
		const workerQueue = Queue.fromQueueArn(this, 'WorkerQueue', props.workerQueueArn);

		const tableV1 = new Table(this, 'Table', {
			tableName: `${namePrefix}-pipelineProcessors`,
			partitionKey: {
				name: 'pk',
				type: AttributeType.STRING
			},
			sortKey: {
				name: 'sk',
				type: AttributeType.STRING
			},
			billingMode: BillingMode.PAY_PER_REQUEST,
			encryption: TableEncryption.AWS_MANAGED,
			pointInTimeRecovery: true,
			removalPolicy: RemovalPolicy.DESTROY,
			stream: StreamViewType.NEW_AND_OLD_IMAGES,
			timeToLiveAttribute: 'ttl'
		});

		tableV1.addGlobalSecondaryIndex({
			indexName: 'sk-pk-index',
			partitionKey: {
				name: 'sk',
				type: AttributeType.STRING
			},
			sortKey: {
				name: 'pk',
				type: AttributeType.STRING
			},
			projectionType: ProjectionType.ALL
		});

		new StringParameter(this, 'pipelineProcessorTableNameParameter', {
			parameterName: pipelineProcessorTableNameParameter(props.tenantId, props.environment),
			stringValue: tableV2.tableName
		});

		/**
		 * Define the DynamoDB metrics table
		 */
		const metricsTable = new Table(this, 'MetricsTable', {
			tableName: `${namePrefix}-pipelineMetrics`,
			partitionKey: {
				name: 'pk',
				type: AttributeType.STRING
			},
			sortKey: {
				name: 'sk1',
				type: AttributeType.STRING
			},
			billingMode: BillingMode.PAY_PER_REQUEST,
			encryption: TableEncryption.AWS_MANAGED,
			pointInTimeRecovery: true,
			removalPolicy: RemovalPolicy.DESTROY
		});

		metricsTable.addLocalSecondaryIndex({
			indexName: 'pk-sk2-index',
			projectionType: ProjectionType.ALL,
			sortKey: {
				name: 'sk2',
				type: AttributeType.STRING
			}
		});

		new StringParameter(this, 'pipelineMetricsTableNameParameter', {
			parameterName: metricsTableNameParameter(props.tenantId, props.environment),
			stringValue: metricsTable.tableName
		});

		const resourcesEnvironmentVariables = {
			EVENT_BUS_NAME: props.eventBusName,
			TABLE_NAME: tableV2.tableName,
			BUCKET_NAME: props.bucketName,
			BUCKET_PREFIX: bucketPrefix,
			METRICS_TABLE_NAME: metricsTable.tableName,
		};

		const verificationLambda = new PipelineProcessorFunction(this, 'ProcessorResourceVerificationLambda', {
			description: `Pipeline Processors Resource Verification Task Handler: Tenant ${props.tenantId}`,
			functionName: `${namePrefix}-resourceVerificationTask`,
			entry: path.join(__dirname, '../../../../typescript/packages/apps/pipeline-processors/src/stepFunction/handlers/verification.handler.ts'),
			memorySize: 512,
			timeout: Duration.minutes(5),
			environment: {
				INLINE_PROCESSING_ROWS_LIMIT,
				NODE_ENV: props.environment,
				CHUNK_SIZE: '1',
				TENANT_ID: props.tenantId,
				CSV_INPUT_CONNECTOR_NAME: props.csvConnectorName,
				...sifModulesEnvironmentVariables,
				...resourcesEnvironmentVariables
			},
		});

		tableV2.grantReadWriteData(verificationLambda);
		bucket.grantReadWrite(verificationLambda);
		pipelineLambda.grantInvoke(verificationLambda);

		const insertActivityQueue = Queue.fromQueueArn(this, 'calculatorInsertActivityQueue', props.activityInsertQueueArn);

		const calculationLambda = new PipelineProcessorFunction(this, 'ProcessorCalculatorLambda', {
			description: `Pipeline Processors Calculator Task Handler: Tenant ${props.tenantId}`,
			entry: path.join(__dirname, '../../../../typescript/packages/apps/pipeline-processors/src/stepFunction/handlers/calculation.handler.ts'),
			functionName: `${namePrefix}-calculatorTask`,
			memorySize: 1024,
			timeout: Duration.minutes(15),
			environment: {
				INLINE_PROCESSING_ROWS_LIMIT,
				NODE_ENV: props.environment,
				ACTIVITY_QUEUE_URL: insertActivityQueue.queueUrl,
				CSV_INPUT_CONNECTOR_NAME: props.csvConnectorName,
				...sifModulesEnvironmentVariables,
				...resourcesEnvironmentVariables
			},
		});

		bucket.grantReadWrite(calculationLambda);
		calculatorLambda.grantInvoke(calculationLambda);
		calculationLambda.addToRolePolicy(new PolicyStatement({
			sid: 'stepfunction',
			effect: Effect.ALLOW,
			actions: [
				'states:SendTaskSuccess',
				'states:SendTaskFailure',
				'states:DescribeExecution'
			],
			resources: ['*']
		}));
		tableV2.grantReadWriteData(calculationLambda);
		pipelineLambda.grantInvoke(calculationLambda);
		insertActivityQueue.grantSendMessages(calculationLambda);

		const activityResultProcessorLambda = new PipelineProcessorFunction(this, 'ActivityResultProcessorLambda', {
			description: `Activity Result Processor Task Handler: Tenant ${props.tenantId}`,
			entry: path.join(__dirname, '../../../../typescript/packages/apps/pipeline-processors/src/stepFunction/handlers/activityResultProcessor.handler.ts'),
			functionName: `${namePrefix}-activityResultProcessorTask`,
			memorySize: 512,
			timeout: Duration.minutes(5),
			environment: {
				INLINE_PROCESSING_ROWS_LIMIT,
				TENANT_ID: props.tenantId,
				NODE_ENV: props.environment,
				CSV_INPUT_CONNECTOR_NAME: props.csvConnectorName,
				REFERENCE_DATASETS_FUNCTION_NAME: referenceDatasetLambda.functionName,
				...sifModulesEnvironmentVariables,
				...resourcesEnvironmentVariables
			},
		});

		const sendTaskSuccessStepFunctionPolicy = new PolicyStatement({
			sid: 'stepfunction',
			effect: Effect.ALLOW,
			actions: [
				'states:SendTaskSuccess',
				'states:DescribeExecution'
			],
			resources: ['*']
		});
		activityResultProcessorLambda.addToRolePolicy(sendTaskSuccessStepFunctionPolicy);

		tableV2.grantReadWriteData(activityResultProcessorLambda);
		bucket.grantReadWrite(activityResultProcessorLambda);
		pipelineLambda.grantInvoke(activityResultProcessorLambda);
		impactLambda.grantInvoke(activityResultProcessorLambda);
		referenceDatasetLambda.grantInvoke(activityResultProcessorLambda);
		activityResultProcessorLambda.addToRolePolicy(SFNGetExecutionHistoryPolicy);
		activityResultProcessorLambda.addToRolePolicy(cloudWatchPublishMetricsPolicy);

		const pipelineAggregationLambda = new PipelineProcessorFunction(this, 'ProcessorPipelineAggregationLambda', {
			description: `Pipeline Output Aggregation Task Handler: Tenant ${props.tenantId}`,
			entry: path.join(__dirname, '../../../../typescript/packages/apps/pipeline-processors/src/stepFunction/handlers/pipelineAggregation.handler.ts'),
			functionName: `${namePrefix}-pipeline-aggregationTask`,
			memorySize: 512,
			timeout: Duration.minutes(5),
			environment: {
				INLINE_PROCESSING_ROWS_LIMIT,
				NODE_ENV: props.environment,
				CSV_INPUT_CONNECTOR_NAME: props.csvConnectorName,
				...auroraEnvironmentVariables,
				...sifModulesEnvironmentVariables,
				...resourcesEnvironmentVariables
			},
			securityGroups: [lambdaToRDSProxyGroup],
			vpc,
			vpcSubnets
		});

		bucket.grantReadWrite(pipelineAggregationLambda);
		tableV2.grantReadData(pipelineAggregationLambda);
		pipelineLambda.grantInvoke(pipelineAggregationLambda);
		pipelineAggregationLambda.addToRolePolicy(rdsProxyPolicy);

		const saveAggregationJobLambda = new PipelineProcessorFunction(this, 'SaveAggregationJobLambda', {
			description: `Save Aggregation Job Task Handler: Tenant ${props.tenantId}`,
			entry: path.join(__dirname, '../../../../typescript/packages/apps/pipeline-processors/src/stepFunction/handlers/saveAggregationJob.handler.ts'),
			functionName: `${namePrefix}-saveAggregationJob-task`,
			memorySize: 256,
			timeout: Duration.minutes(2),
			environment: {
				INLINE_PROCESSING_ROWS_LIMIT,
				NODE_ENV: props.environment,
				ACCESS_MANAGEMENT_FUNCTION_NAME: props.accessManagementApiFunctionName,
				METRIC_STORAGE: props.metricStorage,
				CSV_INPUT_CONNECTOR_NAME: props.csvConnectorName,
				...auroraEnvironmentVariables,
				...sifModulesEnvironmentVariables,
				...resourcesEnvironmentVariables
			},
			securityGroups: [lambdaToRDSProxyGroup],
			vpc,
			vpcSubnets
		});

		bucket.grantReadWrite(saveAggregationJobLambda);
		tableV2.grantReadWriteData(saveAggregationJobLambda);
		pipelineLambda.grantInvoke(saveAggregationJobLambda);
		saveAggregationJobLambda.addToRolePolicy(rdsProxyPolicy);

		const metricAggregationLambda = new PipelineProcessorFunction(this, 'ProcessorMetricAggregationLambda', {
			description: `Metric Output Aggregation Task Handler: Tenant ${props.tenantId}`,
			entry: path.join(__dirname, '../../../../typescript/packages/apps/pipeline-processors/src/stepFunction/handlers/metricAggregation.handler.ts'),
			functionName: `${namePrefix}-metric-aggregationTask`,
			memorySize: 512,
			timeout: Duration.minutes(15),
			environment: {
				INLINE_PROCESSING_ROWS_LIMIT,
				NODE_ENV: props.environment,
				METRIC_STORAGE: props.metricStorage,
				CSV_INPUT_CONNECTOR_NAME: props.csvConnectorName,
				...auroraEnvironmentVariables,
				...sifModulesEnvironmentVariables,
				...resourcesEnvironmentVariables
			},
			securityGroups: [lambdaToRDSProxyGroup],
			vpc,
			vpcSubnets
		});

		bucket.grantReadWrite(metricAggregationLambda);
		tableV2.grantReadWriteData(metricAggregationLambda);
		metricsTable.grantReadWriteData(metricAggregationLambda);
		pipelineLambda.grantInvoke(metricAggregationLambda);
		metricAggregationLambda.addToRolePolicy(rdsProxyPolicy);

		const metricExportLambda = new PipelineProcessorFunction(this, 'MetricExportLambda', {
			description: `Metric Export Task Handler: Tenant ${props.tenantId}`,
			entry: path.join(__dirname, '../../../../typescript/packages/apps/pipeline-processors/src/stepFunction/handlers/metricExport.handler.ts'),
			functionName: `${namePrefix}-metric-exportTask`,
			memorySize: 512,
			timeout: Duration.minutes(15),
			environment: {
				INLINE_PROCESSING_ROWS_LIMIT,
				NODE_ENV: props.environment,
				METRIC_STORAGE: props.metricStorage,
				CSV_INPUT_CONNECTOR_NAME: props.csvConnectorName,
				...auroraEnvironmentVariables,
				...sifModulesEnvironmentVariables,
				...resourcesEnvironmentVariables
			},
			securityGroups: [lambdaToRDSProxyGroup],
			vpc,
			vpcSubnets
		});

		bucket.grantReadWrite(metricExportLambda);
		tableV2.grantReadWriteData(metricExportLambda);
		metricsTable.grantReadWriteData(metricExportLambda);
		pipelineLambda.grantInvoke(metricExportLambda);
		metricExportLambda.addToRolePolicy(rdsProxyPolicy);
		eventBus.grantPutEventsTo(metricExportLambda);

		const insertLatestValuesLambda = new PipelineProcessorFunction(this, 'InsertLatestValuesLambda', {
			description: `Insert Latest Values Task Handler: Tenant ${props.tenantId}`,
			entry: path.join(__dirname, '../../../../typescript/packages/apps/pipeline-processors/src/stepFunction/handlers/insertLatestValues.handler.ts'),
			functionName: `${namePrefix}-insertLatestValuesTask`,
			memorySize: 512,
			timeout: Duration.minutes(15),
			environment: {
				INLINE_PROCESSING_ROWS_LIMIT,
				NODE_ENV: props.environment,
				METRIC_STORAGE: props.metricStorage,
				CSV_INPUT_CONNECTOR_NAME: props.csvConnectorName,
				...auroraEnvironmentVariables,
				...sifModulesEnvironmentVariables,
				...resourcesEnvironmentVariables
			},
			securityGroups: [lambdaToRDSProxyGroup],
			vpc,
			vpcSubnets
		});

		insertLatestValuesLambda.addToRolePolicy(rdsProxyPolicy);

		const dataResultProcessorLambda = new PipelineProcessorFunction(this, 'DataResultProcessorLambda', {
			description: `Data Result Task Handler: Tenant ${props.tenantId}`,
			entry: path.join(__dirname, '../../../../typescript/packages/apps/pipeline-processors/src/stepFunction/handlers/dataResultProcessor.handler.ts'),
			functionName: `${namePrefix}-dataResultProcessorTask`,
			memorySize: 512,
			timeout: Duration.minutes(5),
			environment: {
				NODE_ENV: props.environment,
				...sifModulesEnvironmentVariables,
				...resourcesEnvironmentVariables
			}
		});

		dataResultProcessorLambda.addToRolePolicy(sendTaskSuccessStepFunctionPolicy);

		tableV2.grantReadWriteData(dataResultProcessorLambda);
		bucket.grantReadWrite(dataResultProcessorLambda);
		eventBus.grantPutEventsTo(dataResultProcessorLambda);
		pipelineLambda.grantInvoke(dataResultProcessorLambda);
		impactLambda.grantInvoke(dataResultProcessorLambda);

		const impactCreationLambda = new PipelineProcessorFunction(this, 'ImpactCreationLambda', {
			description: `Impact Creation Task Handler: Tenant ${props.tenantId}`,
			entry: path.join(__dirname, '../../../../typescript/packages/apps/pipeline-processors/src/stepFunction/handlers/impactCreation.handler.ts'),
			functionName: `${namePrefix}-impactCreationTask`,
			memorySize: 512,
			timeout: Duration.minutes(5),
			environment: {
				NODE_ENV: props.environment,
				...sifModulesEnvironmentVariables,
				...resourcesEnvironmentVariables
			}
		});

		impactCreationLambda.addToRolePolicy(sendTaskSuccessStepFunctionPolicy);

		tableV2.grantReadWriteData(impactCreationLambda);
		bucket.grantReadWrite(impactCreationLambda);
		eventBus.grantPutEventsTo(impactCreationLambda);
		pipelineLambda.grantInvoke(impactCreationLambda);
		impactLambda.grantInvoke(impactCreationLambda);

		const sqlResultProcessorLambda = new PipelineProcessorFunction(this, 'SqlResultProcessorLambda', {
			description: `Sql Result Task Handler: Tenant ${props.tenantId}`,
			entry: path.join(__dirname, '../../../../typescript/packages/apps/pipeline-processors/src/stepFunction/handlers/sqlResultProcessor.handler.ts'),
			functionName: `${namePrefix}-sqlResultProcessorTask`,
			memorySize: 512,
			timeout: Duration.minutes(5),
			environment: {
				NODE_ENV: props.environment,
				ACCESS_MANAGEMENT_FUNCTION_NAME: props.accessManagementApiFunctionName,
				...sifModulesEnvironmentVariables,
				...resourcesEnvironmentVariables,
				...auroraEnvironmentVariables
			},
			securityGroups: [lambdaToRDSProxyGroup],
			vpc,
			vpcSubnets
		});

		pipelineLambda.grantInvoke(sqlResultProcessorLambda);
		sqlResultProcessorLambda.addToRolePolicy(rdsProxyPolicy);
		tableV2.grantReadWriteData(sqlResultProcessorLambda);
		bucket.grantReadWrite(sqlResultProcessorLambda);
		bucket.grantDelete(sqlResultProcessorLambda);

		const referenceDatasetCreationLambda = new PipelineProcessorFunction(this, 'ReferenceDatasetCreationLambda', {
			description: `Pipeline Processors Reference Dataset Creation Task Handler: Tenant ${props.tenantId}`,
			entry: path.join(__dirname, '../../../../typescript/packages/apps/pipeline-processors/src/stepFunction/handlers/referenceDatasetCreation.handler.ts'),
			functionName: `${namePrefix}-referenceDatasetCreationTask`,
			memorySize: 512,
			timeout: Duration.minutes(1),
			environment: {
				TENANT_ID: props.tenantId,
				NODE_ENV: props.environment,
				CSV_INPUT_CONNECTOR_NAME: props.csvConnectorName,
				REFERENCE_DATASETS_FUNCTION_NAME: referenceDatasetLambda.functionName,
				...sifModulesEnvironmentVariables,
				...resourcesEnvironmentVariables
			},
		});

		tableV2.grantReadWriteData(referenceDatasetCreationLambda);
		bucket.grantReadWrite(referenceDatasetCreationLambda);
		referenceDatasetLambda.grantInvoke(referenceDatasetCreationLambda);
		pipelineLambda.grantInvoke(referenceDatasetCreationLambda);
		calculatorLambda.grantInvoke(referenceDatasetCreationLambda);

		const referenceDatasetVerificationLambda = new PipelineProcessorFunction(this, 'ReferenceDatasetVerificationLambda', {
			description: `Pipeline Processors Reference Dataset Verification Task Handler: Tenant ${props.tenantId}`,
			entry: path.join(__dirname, '../../../../typescript/packages/apps/pipeline-processors/src/stepFunction/handlers/referenceDatasetVerification.handler.ts'),
			functionName: `${namePrefix}-referenceDatasetVerificationTask`,
			memorySize: 512,
			timeout: Duration.minutes(1),
			environment: {
				TENANT_ID: props.tenantId,
				NODE_ENV: props.environment,
				CSV_INPUT_CONNECTOR_NAME: props.csvConnectorName,
				REFERENCE_DATASETS_FUNCTION_NAME: referenceDatasetLambda.functionName,
				...sifModulesEnvironmentVariables,
				...resourcesEnvironmentVariables
			},
		});

		tableV2.grantReadWriteData(referenceDatasetVerificationLambda);
		bucket.grantReadWrite(referenceDatasetVerificationLambda);
		referenceDatasetLambda.grantInvoke(referenceDatasetVerificationLambda);
		pipelineLambda.grantInvoke(referenceDatasetVerificationLambda);
		eventBus.grantPutEventsTo(referenceDatasetVerificationLambda);
		referenceDatasetVerificationLambda.addToRolePolicy(sendTaskSuccessStepFunctionPolicy);

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
						entries: [queueManagerPayload(taskName)]
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
							token: JsonPath.taskToken
						})
					})
				);
		};

		const releaseLock = (id: string, taskName: string) => new Parallel(this, id, { outputPath: '$[1]' })
			.branch(
				new EventBridgePutEvents(this, `${id}EventBridgeReleaseLock`, {
					entries: [queueManagerPayload(taskName)]
				}))
			.branch(new SqsSendMessage(this, `${id}SqsReleaseLock`, {
				queue: releaseLockQueue,
				resultPath: JsonPath.DISCARD,
				messageGroupId: taskName,
				messageDeduplicationId: JsonPath.format(`${taskName}-{}`, JsonPath.stringAt('$$.Execution.Name')),
				messageBody: TaskInput.fromObject({
					tenantId: props.tenantId,
					executionName: JsonPath.stringAt('$$.Execution.Name'),
					taskName
				})
			}));


		const dataPipelineStateMachine = new DataPipelineStateMachine(this, 'DataPipelineStateMachine', {
			verificationLambda,
			dataResultProcessorLambda,
			calculationLambda,
			impactCreationLambda,
			namePrefix
		});

		calculationLambda.grantInvoke(dataPipelineStateMachine);

		const referenceDatasetStateMachine = new ReferenceDatasetStateMachine(this, 'ReferenceDatasetStateMachine', {
			namePrefix,
			referenceDatasetVerificationLambda,
			referenceDatasetCreationLambda,
		});

		const metricAggregationStateMachine = new MetricAggregationStateMachine(this, 'MetricAggregationStateMachine', {
			namePrefix,
			metricAggregationLambda,
			metricExportLambda,
			acquireLockState: acquireLock('AcquireLockMetricAggregation', DatabaseTask.AggregateMetrics),
			releaseLockState: releaseLock('ReleaseLockMetricAggregation', DatabaseTask.AggregateMetrics)
		});

		const activityPipelineStateMachine = new ActivityPipelineStateMachine(this, 'ActivityPipelineStateMachine', {
			acquireLockState: acquireLock('AcquireLockInsertActivityValues', DatabaseTask.InsertActivityValues),
			releaseLockState: releaseLock('ReleaseLockInsertActivityValuesSuccess', DatabaseTask.InsertActivityValues),
			verificationLambda,
			activityResultProcessorLambda: activityResultProcessorLambda,
			insertLatestValuesLambda,
			saveAggregationJobLambda,
			calculationLambda,
			pipelineAggregationLambda,
			sqlResultProcessorLambda,
			metricAggregationStateMachine: metricAggregationStateMachine.stateMachine,
			namePrefix
		});

		calculationLambda.grantInvoke(activityPipelineStateMachine);

		const eventIntegrationLambda = new PipelineProcessorFunction(this, 'BucketEventsLambda', {
			description: `Pipeline Processors Bucket Events Handler: Tenant ${props.tenantId}`,
			entry: path.join(__dirname, '../../../../typescript/packages/apps/pipeline-processors/src/lambda_eventbridge.ts'),
			functionName: `${namePrefix}-bucketEvents`,
			timeout: Duration.seconds(30),
			memorySize: 512,
			environment: {
				INLINE_PROCESSING_ROWS_LIMIT,
				NODE_ENV: props.environment,
				DATA_PIPELINE_JOB_STATE_MACHINE_ARN: dataPipelineStateMachine.stateMachineArn,
				ACTIVITIES_PIPELINE_JOB_STATE_MACHINE_ARN: activityPipelineStateMachine.stateMachineArn,
				REFERENCE_DATASET_STATE_MACHINE_ARN: referenceDatasetStateMachine.stateMachineArn,
				CSV_INPUT_CONNECTOR_NAME: props.csvConnectorName,
				...sifModulesEnvironmentVariables,
				...resourcesEnvironmentVariables,
			}
		});

		pipelineLambda.grantInvoke(eventIntegrationLambda);
		activityPipelineStateMachine.grantStartExecution(eventIntegrationLambda);
		dataPipelineStateMachine.grantStartExecution(eventIntegrationLambda);
		referenceDatasetStateMachine.grantStartExecution(eventIntegrationLambda);
		tableV2.grantReadWriteData(eventIntegrationLambda);
		bucket.grantReadWrite(eventIntegrationLambda);
		eventBus.grantPutEventsTo(eventIntegrationLambda);
		environmentEventBus.grantPutEventsTo(activityPipelineStateMachine);

		const eventInfrastructureLambda = new PipelineProcessorFunction(this, 'InfrastructureEventsLambda', {
			description: `Pipeline Processors Connector setup event handler: Tenant ${props.tenantId}`,
			entry: path.join(__dirname, '../../../../typescript/packages/apps/pipeline-processors/src/lambda_eventbridge_infra.ts'),
			functionName: `${namePrefix}-infrastructureEvents`,
			timeout: Duration.seconds(30),
			memorySize: 512,
			environment: {
				INLINE_PROCESSING_ROWS_LIMIT,
				NODE_ENV: props.environment,
				TENANT_ID: props.tenantId,
				DATA_PIPELINE_JOB_STATE_MACHINE_ARN: dataPipelineStateMachine.stateMachineArn,
				ACTIVITIES_PIPELINE_JOB_STATE_MACHINE_ARN: activityPipelineStateMachine.stateMachineArn,
				REFERENCE_DATASET_STATE_MACHINE_ARN: referenceDatasetStateMachine.stateMachineArn,
				CSV_INPUT_CONNECTOR_NAME: props.csvConnectorName,
				KINESIS_TEMPLATE_BUCKET: props.kinesisTemplateBucket,
				KINESIS_TEMPLATE_KEY: props.kinesisTemplateKey,
				...sifModulesEnvironmentVariables,
				...resourcesEnvironmentVariables,
			}
		});

		bucket.grantReadWrite(eventInfrastructureLambda);
		eventBus.grantPutEventsTo(eventInfrastructureLambda);
		environmentEventBus.grantPutEventsTo(eventInfrastructureLambda);


		const infrastructureDeploymentPolicy = new PolicyStatement({
			actions: [
				's3:GetObject',
				'cloudformation:CreateStack',
				'cloudformation:UpdateStack',
				'cloudformation:DeleteStack',
				'cloudformation:DescribeStacks',
				'ssm:GetParameters',
				'lambda:AddPermission',
				'lambda:CreateAlias',
				'lambda:CreateFunction',
				'lambda:UpdateAlias',
				'lambda:DeleteAlias',
				'lambda:DeleteFunction',
				'lambda:GetFunction',
				'lambda:GetFunctionCodeSigningConfig',
				'lambda:GetRuntimeManagementConfig',
				'lambda:ListTags',
				'lambda:ListVersionsByFunction',
				'lambda:PublishVersion',
				'lambda:RemovePermission',
				'lambda:TagResource',
				'lambda:UntagResource',
				'lambda:UpdateFunctionCode',
				'lambda:InvokeFunction',
				'lambda:UpdateFunctionConfiguration',
				'iam:GetRole',
				'iam:PassRole',
				'iam:CreateRole',
				'iam:DeleteRole',
				'iam:TagRole',
				'iam:getRolePolicy',
				'iam:PutRolePolicy',
				'iam:AttachRolePolicy',
				'iam:DetachRolePolicy',
				'iam:DeleteRolePolicy',
				'logs:DescribeLogGroups',
				'logs:TagResource',
				'logs:PutRetentionPolicy',
				'logs:DeleteLogGroup',
				'kinesis:AddTagsToStream',
				'kinesis:CreateStream',
				'kinesis:DeleteStream',
				'kinesis:DescribeStreamSummary',
				'kinesis:ListTagsForStream',
				'kinesis:RemoveTagsFromStream',
				'kinesis:StartStreamEncryption',
				'firehose:CreateDeliveryStream',
				'firehose:DeleteDeliveryStream',
				'firehose:DescribeDeliveryStream',
				'firehose:TagDeliveryStream',
				'firehose:UntagDeliveryStream',
				'firehose:UpdateDestination',
				'kms:DescribeKey',
			],
			resources: [
				`*`
			],
		});

		eventInfrastructureLambda.addToRolePolicy(infrastructureDeploymentPolicy);

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
						name: [props.bucketName]
					},
					object: {
						key: [{ suffix: 'raw' }]
					}
				}
			}
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
				retryAttempts: 2
			})
		);

		dataSourcesUploadRule.addTarget(
			new LambdaFunction(eventIntegrationLambda, {
				deadLetterQueue: deadLetterQueue,
				maxEventAge: Duration.minutes(5),
				retryAttempts: 2
			})
		);


		const pipelineConnectorSetupRule = new Rule(this, 'PipelineConnectorSetupRule', {
			eventBus: eventBus,
			eventPattern: {
				detailType: [PIPELINE_CONNECTOR_SETUP_EVENT]
			}
		});

		pipelineConnectorSetupRule.addTarget(
			new LambdaFunction(eventInfrastructureLambda, {
				deadLetterQueue: deadLetterQueue,
				maxEventAge: Duration.minutes(5),
				retryAttempts: 2,
			})
		);

		const stackChangeRule = new Rule(this, 'StackChangeRule', {
			eventPattern: {
				source: ['aws.cloudformation'],
				detailType: ['CloudFormation Stack Status Change'],
				detail: {
					'status-details': {
						'status': ['CREATE_COMPLETE']
					}
					,
					'stack-id': [{
						'wildcard': `*/sif-${props.tenantId}-${props.environment}-*`
					}]
				},
			},
		});

		stackChangeRule.addTarget(
			new LambdaFunction(eventInfrastructureLambda, {
				deadLetterQueue: deadLetterQueue,
				maxEventAge: Duration.minutes(5),
				retryAttempts: 2,
			})
		);

		eventBus.grantPutEventsTo(verificationLambda);
		eventBus.grantPutEventsTo(calculationLambda);
		eventBus.grantPutEventsTo(eventIntegrationLambda);
		eventBus.grantPutEventsTo(activityResultProcessorLambda);
		eventBus.grantPutEventsTo(sqlResultProcessorLambda);
		eventBus.grantPutEventsTo(eventInfrastructureLambda);
		eventBus.grantPutEventsTo(referenceDatasetCreationLambda);
		eventBus.grantPutEventsTo(referenceDatasetVerificationLambda);

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
			visibilityTimeout: Duration.minutes(15)
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

		const insertActivityBulkLambda = new PipelineProcessorFunction(this, 'InsertActivityBulkLambda', {
			description: `Insert Activity Bulk Task Handler: Tenant ${props.tenantId}`,
			entry: path.join(__dirname, '../../../../typescript/packages/apps/pipeline-processors/src/lambda_bulk_insert_sqs.ts'),
			functionName: `${namePrefix}-insertActivityBulk`,
			memorySize: 512,
			timeout: Duration.minutes(5),
			environment: {
				NODE_ENV: props.environment,
				ACTIVITY_QUEUE_URL: insertActivityQueue.queueUrl,
				AUDIT_VERSION: props.auditVersion,
				...auroraEnvironmentVariables,
				...sifModulesEnvironmentVariables,
				...resourcesEnvironmentVariables,
			},
			securityGroups: [lambdaToRDSProxyGroup],
			vpc,
			vpcSubnets
		});
		insertActivityBulkLambda.node.addDependency(insertActivityQueue);
		insertActivityBulkLambda.addToRolePolicy(new PolicyStatement({
			sid: 'stepfunction',
			effect: Effect.ALLOW,
			actions: [
				'states:SendTaskSuccess',
				'states:SendTaskFailure',
				'states:DescribeExecution'
			],
			resources: ['*']
		}));

		tableV2.grantReadData(insertActivityBulkLambda);
		bucket.grantReadWrite(insertActivityBulkLambda);
		bucket.grantDelete(insertActivityBulkLambda);
		insertActivityBulkLambda.addToRolePolicy(rdsProxyPolicy);
		insertActivityBulkLambda.addEventSource(new SqsEventSource(insertActivityQueue, {
				batchSize: 1,
				reportBatchItemFailures: true
			})
		);

		const auroraClusterStatusParameter = StringParameter.fromStringParameterName(this, 'AuroraClusterStatusParameter', auroraClusterStatusParameterName(props.environment));

		/**
		 * Define the API Lambda
		 */
		const apiLambda = new PipelineProcessorFunction(this, 'Apilambda', {
			description: `Pipeline Executions API: Tenant ${props.tenantId}`,
			entry: path.join(__dirname, '../../../../typescript/packages/apps/pipeline-processors/src/lambda_apiGateway.ts'),
			functionName: `${props.pipelineProcessorApiFunctionName}`,
			memorySize: 512,
			environment: {
				INLINE_PROCESSING_ROWS_LIMIT,
				ACCESS_MANAGEMENT_FUNCTION_NAME: props.accessManagementApiFunctionName,
				NODE_ENV: props.environment,
				WORKER_QUEUE_URL: workerQueue.queueUrl,
				DATA_PIPELINE_JOB_STATE_MACHINE_ARN: dataPipelineStateMachine.stateMachineArn,
				ACTIVITIES_PIPELINE_JOB_STATE_MACHINE_ARN: activityPipelineStateMachine.stateMachineArn,
				METRIC_AGGREGATION_STATE_MACHINE_ARN: metricAggregationStateMachine.stateMachineArn,
				REFERENCE_DATASET_STATE_MACHINE_ARN: referenceDatasetStateMachine.stateMachineArn,
				METRIC_STORAGE: props.metricStorage,
				TASK_PARALLEL_LIMIT: props.downloadAuditFileParallelLimit.toString(),
				CSV_INPUT_CONNECTOR_NAME: props.csvConnectorName,
				TASK_QUEUE_URL: taskQueue.queueUrl,
				ATHENA_AUDIT_LOGS_TABLE_NAME: props.auditLogsTableName,
				ATHENA_DATABASE_NAME: props.auditLogsDatabaseName,
				TRIGGER_METRIC_AGGREGATIONS: props.triggerMetricAggregations.toString(),
				AUDIT_VERSION: props.auditVersion,
				RESOURCE_STATUS_PARAMETER_PREFIX: `/sif/shared/${props.environment}`,
				AUDIT_LOG_WAIT_TIME_SECONDS: props.auditLogWaitTimeSeconds.toString(),
				...auroraEnvironmentVariables,
				...sifModulesEnvironmentVariables,
				...resourcesEnvironmentVariables,
			},
			securityGroups: [lambdaToRDSProxyGroup],
			vpc,
			vpcSubnets,
			timeout: Duration.minutes(5)
		});

		auroraClusterStatusParameter.grantRead(apiLambda);
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
		metricAggregationStateMachine.grantStartExecution(apiLambda);
		taskQueue.grantSendMessages(apiLambda);
		impactLambda.grantInvoke(apiLambda);

		new StringParameter(this, 'pipelineProcessorApiFunctionArnParameter', {
			parameterName: pipelineProcessorApiFunctionArnParameter(props.tenantId, props.environment),
			stringValue: apiLambda.functionArn
		});

		const athenaPolicy = new PolicyStatement({
			actions: [
				'athena:StartQueryExecution',
				'athena:GetQueryExecution',
				'athena:GetQueryResults',
				`glue:GetTables`,
				`glue:GetTable`,
				`glue:GetDatabase`,
				`glue:GetPartitions`
			],
			resources: [
				`arn:aws:athena:${region}:${accountId}:workgroup/primary`,
				`arn:aws:glue:${region}:${accountId}:catalog`,
				`arn:aws:glue:${region}:${accountId}:database/${props.auditLogsDatabaseName}`,
				`arn:aws:glue:${region}:${accountId}:table/${props.auditLogsDatabaseName}/${props.auditLogsTableName}*`
			]
		});

		apiLambda.addToRolePolicy(athenaPolicy);

		const activityDownloadInitiateLambda = new PipelineProcessorFunction(this, 'ActivityDownloadInitiateLambda', {
			description: `Pipeline Processors Activity Download Initiate Task Handler: Tenant ${props.tenantId}`,
			functionName: `${namePrefix}-activityDownloadInitiateTask`,
			entry: path.join(__dirname, '../../../../typescript/packages/apps/pipeline-processors/src/stepFunction/handlers/activityDownloadInitiate.handler.ts'),
			memorySize: 256,
			timeout: Duration.minutes(5),
			environment: {
				INLINE_PROCESSING_ROWS_LIMIT,
				NODE_ENV: props.environment,
				CHUNK_SIZE: '1',
				...auroraEnvironmentVariables,
				...sifModulesEnvironmentVariables,
				...resourcesEnvironmentVariables,
			},
			securityGroups: [lambdaToRDSProxyGroup],
		});
		bucket.grantReadWrite(activityDownloadInitiateLambda);

		const activityDownloadStartLambda = new PipelineProcessorFunction(this, 'ActivityDownloadStartLambda', {
			description: `Pipeline Processors Activity Download Start Task Handler: Tenant ${props.tenantId}`,
			functionName: `${namePrefix}-activityDownloadStartTask`,
			entry: path.join(__dirname, '../../../../typescript/packages/apps/pipeline-processors/src/stepFunction/handlers/activityDownloadStart.handler.ts'),
			memorySize: 256,
			timeout: Duration.minutes(5),
			environment: {
				INLINE_PROCESSING_ROWS_LIMIT,
				NODE_ENV: props.environment,
				CHUNK_SIZE: '1',
				...auroraEnvironmentVariables,
				...sifModulesEnvironmentVariables,
				...resourcesEnvironmentVariables,
			},
			securityGroups: [lambdaToRDSProxyGroup],
			vpc,
			vpcSubnets,
		});
		activityDownloadStartLambda.addToRolePolicy(rdsProxyPolicy);
		bucket.grantReadWrite(activityDownloadStartLambda);


		const activityDownloadVerifyLambda = new PipelineProcessorFunction(this, 'ActivityDownloadVerifyLambda', {
			description: `Pipeline Processors Activity Download Verification Task Handler: Tenant ${props.tenantId}`,
			functionName: `${namePrefix}-activityDownloadVerifyTask`,
			entry: path.join(__dirname, '../../../../typescript/packages/apps/pipeline-processors/src/stepFunction/handlers/activityDownloadVerify.handler.ts'),
			memorySize: 256,
			timeout: Duration.minutes(5),
			environment: {
				INLINE_PROCESSING_ROWS_LIMIT,
				NODE_ENV: props.environment,
				CHUNK_SIZE: '1',
				...auroraEnvironmentVariables,
				...sifModulesEnvironmentVariables,
				...resourcesEnvironmentVariables,
			},
			securityGroups: [lambdaToRDSProxyGroup],
			vpc,
			vpcSubnets
		});
		activityDownloadVerifyLambda.addToRolePolicy(rdsProxyPolicy);
		bucket.grantReadWrite(activityDownloadVerifyLambda);

		const activityDownloadStateMachine = new ActivityDownloadStateMachine(this, 'ActivityDownloadStateMachine', {
			acquireLockActivityDownload: acquireLock('AcquireLockActivityDownload', DatabaseTask.ActivityDownload),
			releaseLockActivityDownloadSuccess: releaseLock('ReleaseLockActivityDownloadSuccess', DatabaseTask.ActivityDownload),
			releaseLockActivityDownloadFail: releaseLock('ReleaseLockActivityDownloadFail', DatabaseTask.ActivityDownload),
			activityDownloadInitiateLambda,
			activityDownloadVerifyLambda,
			activityDownloadStartLambda,
			namePrefix
		});

		const taskQueueLambda = new PipelineProcessorFunction(this, 'Tasklambda', {
			description: `Pipeline Executions Task processor: Tenant ${props.tenantId}`,
			entry: path.join(__dirname, '../../../../typescript/packages/apps/pipeline-processors/src/lambda_sqs.ts'),
			functionName: `${namePrefix}-pipelineProcessor-task-sqs`,
			memorySize: 512,
			environment: {
				ACCESS_MANAGEMENT_FUNCTION_NAME: props.accessManagementApiFunctionName,
				NODE_ENV: props.environment,
				PIPELINE_PROCESSOR_FUNCTION_NAME: props.pipelineProcessorApiFunctionName,
				ACTIVITIES_DOWNLOAD_STATE_MACHINE_ARN: activityDownloadStateMachine.stateMachineArn,
				TASK_QUEUE_URL: taskQueue.queueUrl,
				DATA_PIPELINE_JOB_STATE_MACHINE_ARN: dataPipelineStateMachine.stateMachineArn,
				ACTIVITIES_PIPELINE_JOB_STATE_MACHINE_ARN: activityPipelineStateMachine.stateMachineArn,
				REFERENCE_DATASET_STATE_MACHINE_ARN: referenceDatasetStateMachine.stateMachineArn,
				ATHENA_AUDIT_LOGS_TABLE_NAME: props.auditLogsTableName,
				ATHENA_DATABASE_NAME: props.auditLogsDatabaseName,
				AUDIT_VERSION: props.auditVersion,
				...auroraEnvironmentVariables,
				...sifModulesEnvironmentVariables,
				...resourcesEnvironmentVariables,
			},
			securityGroups: [lambdaToRDSProxyGroup],
			vpc,
			vpcSubnets,
			timeout: Duration.minutes(10)
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
		activityDownloadStateMachine.grantStartExecution(taskQueueLambda);
		apiLambda.grantInvoke(taskQueueLambda);


		taskQueueLambda.addEventSource(
			new SqsEventSource(taskQueue, {
				batchSize: 10,
				reportBatchItemFailures: true
			})
		);

		new StringParameter(this, `PipelineProcessorTaskQueueUrlParameter`, {
			parameterName: taskQueueUrlParameter(props.tenantId, props.environment),
			stringValue: taskQueue.queueUrl
		});


		/**
		 * Define the API Gateway
		 */

		const userPool = UserPool.fromUserPoolId(this, 'UserPool', props.cognitoUserPoolId);
		const authorizer = new CognitoUserPoolsAuthorizer(this, 'Authorizer', {
			cognitoUserPools: [userPool]
		});
		const authOptions = {
			authorizationType: AuthorizationType.COGNITO,
			authorizer: authorizer
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
				loggingLevel: MethodLoggingLevel.INFO
			},
			defaultCorsPreflightOptions: {
				allowOrigins: Cors.ALL_ORIGINS,
				allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key', 'X-Amz-Security-Token', 'X-Amz-User-Agent', 'Accept-Version', 'x-groupcontextid']
			},
			endpointTypes: [EndpointType.REGIONAL],
			defaultMethodOptions: authOptions
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
			stringValue: apigw.url
		});

		new StringParameter(this, 'pipelineProcessorApiNameParameter', {
			parameterName: pipelineProcessorApiNameParameter(props.tenantId, props.environment),
			stringValue: apigw.url
		});

		const accessManagementLambda = Function.fromFunctionName(this, 'accessManagementLambda', props.accessManagementApiFunctionName);
		accessManagementLambda.grantInvoke(apiLambda);
		accessManagementLambda.grantInvoke(saveAggregationJobLambda);


		NagSuppressions.addResourceSuppressions([apiLambda, eventIntegrationLambda, taskQueueLambda, activityResultProcessorLambda, eventInfrastructureLambda],
			[
				{
					id: 'AwsSolutions-IAM4',
					appliesTo: [
						'Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'
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

		NagSuppressions.addResourceSuppressions([verificationLambda, sqlResultProcessorLambda, insertLatestValuesLambda, taskQueueLambda, insertActivityBulkLambda, metricAggregationLambda, metricExportLambda, pipelineAggregationLambda, dataResultProcessorLambda, impactCreationLambda, saveAggregationJobLambda, referenceDatasetCreationLambda, referenceDatasetVerificationLambda],
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


		NagSuppressions.addResourceSuppressions([referenceDatasetCreationLambda, referenceDatasetVerificationLambda],
			[
				{
					id: 'AwsSolutions-IAM5',
					appliesTo: [
						`Resource::arn:<AWS::Partition>:lambda:${region}:${accountId}:function:<referenceDatasetApiFunctionNameParameter>:*`
					],
					reason: 'This policy is required for the lambda invoke the reference dataset api.'
				},
			],
			true);

		NagSuppressions.addResourceSuppressions([calculationLambda, referenceDatasetCreationLambda],
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
						`Resource::arn:<AWS::Partition>:lambda:${region}:${accountId}:function:<calculatorFunctionNameParameter>:live:*`
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

		NagSuppressions.addResourceSuppressions([activityResultProcessorLambda, sqlResultProcessorLambda],
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
						`Resource::arn:<AWS::Partition>:dynamodb:${region}:${accountId}:table/<ResourceApiBaseTable3133F8B2>/index/*`
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

		NagSuppressions.addResourceSuppressions([
				metricExportLambda,
				metricAggregationLambda,
				pipelineAggregationLambda,
				insertLatestValuesLambda,
				insertActivityBulkLambda,
				sqlResultProcessorLambda,
				dataResultProcessorLambda,
				impactCreationLambda,
				saveAggregationJobLambda,
				referenceDatasetCreationLambda,
				referenceDatasetVerificationLambda
			],
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
						`Resource::arn:<AWS::Partition>:lambda:${region}:${accountId}:function:<calculatorFunctionNameParameter>:live:*`
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
						`Resource::<PipelineProcessorsApilambdaD72EC6E5.Arn>:*`,
						'Resource::<PipelineProcessorsMetricsTable944ED8FD.Arn>/index/*',
						`Resource::arn:<AWS::Partition>:lambda:${region}:${accountId}:function:<pipelineApiFunctionNameParameter>:*`],
					reason: 'This policy is required for the lambda to access the resource api table.'

				},
				{
					id: 'AwsSolutions-IAM5',
					appliesTo: [
						`Resource::arn:<AWS::Partition>:dynamodb:${region}:${accountId}:table/<ResourceApiBaseTable3133F8B2>/index/*`,
						`Resource::arn:<AWS::Partition>:lambda:${region}:${accountId}:function:<calculatorFunctionNameParameter>:live:*`
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

		NagSuppressions.addResourceSuppressions([activityDownloadInitiateLambda, activityDownloadStartLambda, activityDownloadVerifyLambda],
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
				}
			],
			true);

		NagSuppressions.addResourceSuppressions([metricAggregationStateMachine],
			[
				{
					id: 'AwsSolutions-IAM5',
					appliesTo: [
						'Resource::<AcquireLockLambdaFunctionArnParameter>:*',
						'Resource::<PipelineProcessorsProcessorMetricAggregationLambda4ABE57AD.Arn>:*',
						'Resource::<PipelineProcessorsMetricExportLambda824FD583.Arn>:*'

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

		NagSuppressions.addResourceSuppressions([referenceDatasetStateMachine],
			[
				{
					id: 'AwsSolutions-IAM5',
					appliesTo: [
						'Resource::<PipelineProcessorsReferenceDatasetCreationLambdaD34F131E.Arn>:*',
						'Resource::<PipelineProcessorsReferenceDatasetVerificationLambda19B11E24.Arn>:*',
						'Resource::<PipelineProcessorsOutputConnectorLambda1A6A079B.Arn>:*',
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
						'Resource::<PipelineProcessorsOutputConnectorLambda1A6A079B.Arn>:*',
						'Resource::<PipelineProcessorsDataResultProcessorLambda0ADB88FB.Arn>:*',
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
						'Resource::<PipelineProcessorsOutputConnectorLambda1A6A079B.Arn>:*',
						'Resource::<PipelineProcessorsActivityResultProcessorLambda3597503C.Arn>:*',
						'Resource::<PipelineProcessorsProcessorSqlResultProcessorLambdaA17928AB.Arn>:*',
						'Resource::<PipelineProcessorsProcessorMetricAggregationLambda4ABE57AD.Arn>:*',
						'Resource::<PipelineProcessorsProcessorPipelineAggregationLambda21DC6AD2.Arn>:*',
						'Resource::<PipelineProcessorsProcessorResourceVerificationLambdaD6D60A28.Arn>:*',
						'Resource::<PipelineProcessorsSqlResultProcessorLambda0313E998.Arn>:*',
						'Resource::<PipelineProcessorsInsertLatestValuesLambda017685D2.Arn>:*',
						'Resource::<PipelineProcessorsSaveAggregationJobLambda76A7DCB6.Arn>:*',
						`Resource::arn:<AWS::Partition>:states:${region}:${accountId}:execution:{"Fn::Select":[6,{"Fn::Split":[":",{"Ref":"PipelineProcessorsMetricAggregationStateMachine34185FA0"}]}]}*`
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

		NagSuppressions.addResourceSuppressions([activityDownloadStateMachine],
			[
				{
					id: 'AwsSolutions-IAM5',
					appliesTo: [
						'Resource::<PipelineProcessorsActivityDownloadInitiateLambdaA283B8D1.Arn>:*',
						'Resource::<PipelineProcessorsActivityDownloadStartLambda6021AA7C.Arn>:*',
						'Resource::<PipelineProcessorsActivityDownloadVerifyLambda0E540FA5.Arn>:*'
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

				}
			],
			true);

		NagSuppressions.addResourceSuppressions([apiLambda, taskQueueLambda],
			[
				{
					id: 'AwsSolutions-IAM5',
					reason: 'Given access to versioned glue tables',
					appliesTo: [`Resource::arn:aws:glue:${region}:${accountId}:table/<AuditLogsDatabaseNameParameter>/<AuditLogsTableNameParameter>*`]

				}
			],
			true);

		NagSuppressions.addResourceSuppressions([activityResultProcessorLambda],
			[
				{
					id: 'AwsSolutions-IAM5',
					reason: 'Allow resultProcessorLambda to retrieve input of the execution history. ',
					appliesTo: [`Resource::arn:aws:states:${region}:${accountId}:execution:sif-${props.tenantId}-${props.environment}-activityPipelineSM:*`]

				},
				{
					id: 'AwsSolutions-IAM5',
					reason: 'Allow resultProcessorLambda to retrieve input of the execution history. ',
					appliesTo: [
						`Resource::arn:<AWS::Partition>:lambda:${region}:${accountId}:function:<impactApiFunctionNameParameter>:*`,
						`Resource::arn:<AWS::Partition>:lambda:${region}:${accountId}:function:<referenceDatasetApiFunctionNameParameter>:*`
					]

				}
			],
			true);
	}
}
