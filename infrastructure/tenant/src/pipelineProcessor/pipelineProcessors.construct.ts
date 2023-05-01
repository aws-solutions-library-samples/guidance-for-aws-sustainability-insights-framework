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
import { LogLevel, Parallel, StateMachine, CustomState } from 'aws-cdk-lib/aws-stepfunctions';
import { LambdaInvoke } from 'aws-cdk-lib/aws-stepfunctions-tasks';
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
}

export const pipelineProcessorApiUrlParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/pipeline-processor/apiUrl`;
export const pipelineProcessorApiNameParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/pipeline-processor/apiName`;
export const pipelineProcessorApiFunctionArnParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/pipeline-processor/apiFunctionArn`;
export const pipelineProcessorBucketPrefixParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/pipeline-processor/bucketPrefix`;
export const pipelineProcessorJobStateMachineArnParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/pipeline-processor/jobStateMachineArn`;
export const pipelineProcessorInlineStateMachineArnParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/pipeline-processor/inlineStateMachineArn`;
export const pipelineProcessorTableNameParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/pipeline-processor/configTableName`;
export const metricsTableNameParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/pipeline-processor/metricsTableName`;

export const INLINE_PROCESSING_ROWS_LIMIT = '100';

export class PipelineProcessors extends Construct {
	constructor(scope: Construct, id: string, props: PipelineProcessorsConstructProperties) {
		super(scope, id);

		const namePrefix = `sif-${props.tenantId}-${props.environment}`;
		const eventBus = EventBus.fromEventBusName(this, 'DefaultEventBus', props.eventBusName);
		const calculatorLambda = NodejsFunction.fromFunctionName(this, 'CalculatorLambda', props.calculatorFunctionName);
		const pipelineLambda = NodejsFunction.fromFunctionName(this, 'PipelineLambda', props.pipelineApiFunctionName);

		const vpcId = StringParameter.valueFromLookup(this, vpcIdParameter(props.environment));
		const vpc = Vpc.fromLookup(this, 'vpc', { vpcId });

		const bucketPrefix = 'pipelines';
		const bucket = Bucket.fromBucketName(this, 'Bucket', props.bucketName);

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

		/**
		 * Define the DynamoDB config table
		 */
		const table = new Table(this, 'Table', {
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

		table.addGlobalSecondaryIndex({
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
			stringValue: table.tableName,
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
			runtime: Runtime.NODEJS_16_X,
			tracing: Tracing.ACTIVE,
			memorySize: 512,
			logRetention: RetentionDays.ONE_WEEK,
			timeout: Duration.minutes(5),
			environment: {
				INLINE_PROCESSING_ROWS_LIMIT,
				NODE_ENV: props.environment,
				EVENT_BUS_NAME: props.eventBusName,
				TABLE_NAME: table.tableName,
				CHUNK_SIZE: '1',
				BUCKET_NAME: props.bucketName,
				BUCKET_PREFIX: bucketPrefix,
				PIPELINES_FUNCTION_NAME: props.pipelineApiFunctionName,
				CALCULATOR_FUNCTION_NAME: props.calculatorFunctionName,
				METRICS_TABLE_NAME: metricsTable.tableName,
				TENANT_ID: props.tenantId,
				CSV_INPUT_CONNECTOR_NAME: props.csvConnectorName,
			},

			bundling: {
				minify: true,
				format: OutputFormat.ESM,
				target: 'node16.15',
				sourceMap: false,
				sourcesContent: false,
				banner: 'import { createRequire } from \'module\';const require = createRequire(import.meta.url);import { fileURLToPath } from \'url\';import { dirname } from \'path\';const __filename = fileURLToPath(import.meta.url);const __dirname = dirname(__filename);',
				externalModules: ['aws-sdk', 'pg-native'],
			},
			depsLockFilePath: path.join(__dirname, '../../../../common/config/rush/pnpm-lock.yaml'),
		});

		table.grantReadWriteData(verificationLambda);
		bucket.grantReadWrite(verificationLambda);
		pipelineLambda.grantInvoke(verificationLambda);

		const calculationLambda = new NodejsFunction(this, 'ProcessorCalculatorLambda', {
			description: `Pipeline Processors Calculator Task Handler: Tenant ${props.tenantId}`,
			entry: path.join(__dirname, '../../../../typescript/packages/apps/pipeline-processors/src/stepFunction/handlers/calculation.handler.ts'),
			functionName: `${namePrefix}-calculatorTask`,
			runtime: Runtime.NODEJS_16_X,
			tracing: Tracing.ACTIVE,
			memorySize: 512,
			logRetention: RetentionDays.ONE_WEEK,
			timeout: Duration.minutes(10),
			environment: {
				INLINE_PROCESSING_ROWS_LIMIT,
				NODE_ENV: props.environment,
				EVENT_BUS_NAME: props.eventBusName,
				BUCKET_NAME: bucket.bucketName,
				BUCKET_PREFIX: bucketPrefix,
				PIPELINES_FUNCTION_NAME: props.pipelineApiFunctionName,
				CALCULATOR_FUNCTION_NAME: props.calculatorFunctionName,
				TABLE_NAME: table.tableName,
				METRICS_TABLE_NAME: metricsTable.tableName,
				CSV_INPUT_CONNECTOR_NAME: props.csvConnectorName,
			},
			bundling: {
				minify: true,
				format: OutputFormat.ESM,
				target: 'node16.15',
				sourceMap: false,
				sourcesContent: false,
				banner: 'import { createRequire } from \'module\';const require = createRequire(import.meta.url);import { fileURLToPath } from \'url\';import { dirname } from \'path\';const __filename = fileURLToPath(import.meta.url);const __dirname = dirname(__filename);',
				externalModules: ['aws-sdk', 'pg-native'],
			},
			depsLockFilePath: path.join(__dirname, '../../../../common/config/rush/pnpm-lock.yaml'),
		});

		bucket.grantReadWrite(calculationLambda);
		calculatorLambda.grantInvoke(calculationLambda);
		table.grantReadWriteData(calculationLambda);

		const resultProcessorLambda = new NodejsFunction(this, 'ProcessorResultProcessorLambda', {
			description: `Pipeline Processors Resource Verification Task Handler: Tenant ${props.tenantId}`,
			entry: path.join(__dirname, '../../../../typescript/packages/apps/pipeline-processors/src/stepFunction/handlers/resultProcessor.handler.ts'),
			functionName: `${namePrefix}-resultProcessorTask`,
			runtime: Runtime.NODEJS_16_X,
			tracing: Tracing.ACTIVE,
			memorySize: 512,
			logRetention: RetentionDays.ONE_WEEK,
			timeout: Duration.minutes(5),
			environment: {
				INLINE_PROCESSING_ROWS_LIMIT,
				NODE_ENV: props.environment,
				EVENT_BUS_NAME: props.eventBusName,
				TABLE_NAME: table.tableName,
				BUCKET_NAME: bucket.bucketName,
				BUCKET_PREFIX: bucketPrefix,
				PIPELINES_FUNCTION_NAME: props.pipelineApiFunctionName,
				CALCULATOR_FUNCTION_NAME: props.calculatorFunctionName,
				METRICS_TABLE_NAME: metricsTable.tableName,
				CSV_INPUT_CONNECTOR_NAME: props.csvConnectorName,
			},
			bundling: {
				minify: true,
				format: OutputFormat.ESM,
				target: 'node16.15',
				sourceMap: false,
				sourcesContent: false,
				banner: 'import { createRequire } from \'module\';const require = createRequire(import.meta.url);import { fileURLToPath } from \'url\';import { dirname } from \'path\';const __filename = fileURLToPath(import.meta.url);const __dirname = dirname(__filename);',
				externalModules: ['aws-sdk', 'pg-native'],
			},
			depsLockFilePath: path.join(__dirname, '../../../../common/config/rush/pnpm-lock.yaml'),
		});

		table.grantReadWriteData(resultProcessorLambda);
		bucket.grantReadWrite(resultProcessorLambda);

		const pipelineAggregationLambda = new NodejsFunction(this, 'ProcessorPipelineAggregationLambda', {
			description: `Pipeline Output Aggregation Task Handler: Tenant ${props.tenantId}`,
			entry: path.join(__dirname, '../../../../typescript/packages/apps/pipeline-processors/src/stepFunction/handlers/pipelineAggregation.handler.ts'),
			functionName: `${namePrefix}-pipeline-aggregationTask`,
			runtime: Runtime.NODEJS_16_X,
			tracing: Tracing.ACTIVE,
			memorySize: 512,
			logRetention: RetentionDays.ONE_WEEK,
			timeout: Duration.minutes(5),
			environment: {
				INLINE_PROCESSING_ROWS_LIMIT,
				NODE_ENV: props.environment,
				EVENT_BUS_NAME: props.eventBusName,
				TABLE_NAME: table.tableName,
				BUCKET_NAME: bucket.bucketName,
				BUCKET_PREFIX: bucketPrefix,
				PIPELINES_FUNCTION_NAME: props.pipelineApiFunctionName,
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
				target: 'node16.15',
				sourceMap: false,
				sourcesContent: false,
				banner: 'import { createRequire } from \'module\';const require = createRequire(import.meta.url);import { fileURLToPath } from \'url\';import { dirname } from \'path\';const __filename = fileURLToPath(import.meta.url);const __dirname = dirname(__filename);',
				externalModules: ['aws-sdk', 'pg-native'],
			},
			depsLockFilePath: path.join(__dirname, '../../../../common/config/rush/pnpm-lock.yaml'),
		});

		table.grantReadData(pipelineAggregationLambda);
		pipelineLambda.grantInvoke(pipelineAggregationLambda);
		pipelineAggregationLambda.addToRolePolicy(rdsProxyPolicy);

		const metricAggregationLambda = new NodejsFunction(this, 'ProcessorMetricAggregationLambda', {
			description: `Metric Output Aggregation Task Handler: Tenant ${props.tenantId}`,
			entry: path.join(__dirname, '../../../../typescript/packages/apps/pipeline-processors/src/stepFunction/handlers/metricAggregation.handler.ts'),
			functionName: `${namePrefix}-metric-aggregationTask`,
			runtime: Runtime.NODEJS_16_X,
			tracing: Tracing.ACTIVE,
			memorySize: 512,
			logRetention: RetentionDays.ONE_WEEK,
			timeout: Duration.minutes(5),
			environment: {
				INLINE_PROCESSING_ROWS_LIMIT,
				NODE_ENV: props.environment,
				EVENT_BUS_NAME: props.eventBusName,
				TABLE_NAME: table.tableName,
				BUCKET_NAME: bucket.bucketName,
				BUCKET_PREFIX: bucketPrefix,
				PIPELINES_FUNCTION_NAME: props.pipelineApiFunctionName,
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
				target: 'node16.15',
				sourceMap: false,
				sourcesContent: false,
				banner: 'import { createRequire } from \'module\';const require = createRequire(import.meta.url);import { fileURLToPath } from \'url\';import { dirname } from \'path\';const __filename = fileURLToPath(import.meta.url);const __dirname = dirname(__filename);',
				externalModules: ['aws-sdk', 'pg-native'],
			},
			depsLockFilePath: path.join(__dirname, '../../../../common/config/rush/pnpm-lock.yaml'),
		});

		table.grantReadData(metricAggregationLambda);
		metricsTable.grantReadWriteData(metricAggregationLambda);
		pipelineLambda.grantInvoke(metricAggregationLambda);

		metricAggregationLambda.addToRolePolicy(rdsProxyPolicy);

		const verificationTask = new LambdaInvoke(this, 'VerificationTask', {
			lambdaFunction: verificationLambda,
			outputPath: '$.Payload',
		});

		const resultProcessorTask = new LambdaInvoke(this, 'ResultProcessorTask', {
			lambdaFunction: resultProcessorLambda,
		});

		const jobMetricAggregationTask = new LambdaInvoke(this, 'JobMetricAggregationTask', {
			lambdaFunction: metricAggregationLambda,
		});

		const jobPipelineAggregationTask = new LambdaInvoke(this, 'JobPipelineAggregationTask', {
			lambdaFunction: pipelineAggregationLambda,
		});

		const map = new CustomState(this, 'Map State', {
			stateJson: {
				Type: 'Map',
				Next: 'Post Processing Tasks',
				Iterator: {
					'StartAt': 'CalculationTask',
					'States': {
						'CalculationTask': {
							'End': true,
							'Retry': [
								{
									'ErrorEquals': [
										'Lambda.ServiceException',
										'Lambda.AWSLambdaException',
										'Lambda.SdkClientException'
									],
									'IntervalSeconds': 2,
									'MaxAttempts': 6,
									'BackoffRate': 2
								}
							],
							'Type': 'Task',
							'OutputPath': '$.Payload',
							'Resource': 'arn:aws:states:::lambda:invoke',
							'Parameters': {
								'FunctionName': `${calculationLambda.functionArn}`,
								'Payload.$': '$'
							}
						}
					}
				},
				ItemsPath: '$.chunks',
				MaxConcurrency: 5,
				ItemSelector: {
					'source.$': '$.source',
					'context.$': '$.context',
					'chunk': {
						'sequence.$': '$$.Map.Item.Index',
						'range.$': '$$.Map.Item.Value.range'
					}
				}
			}
		});

		const parallel = new Parallel(this, 'Post Processing Tasks').branch(resultProcessorTask).branch(jobMetricAggregationTask).branch(jobPipelineAggregationTask);

		const jobStateMachineLogGroup = new LogGroup(this, 'JobStateMachineLogGroup', { logGroupName: `/aws/stepfunctions/${namePrefix}-job-pipelineProcessor`, removalPolicy: RemovalPolicy.DESTROY });
		const pipelineProcessorJobStateMachine = new StateMachine(this, 'PipelineProcessorJobStateMachine', {
			definition: verificationTask.next(map).next(parallel),
			logs: { destination: jobStateMachineLogGroup, level: LogLevel.ERROR, includeExecutionData: true },
			stateMachineName: `${namePrefix}-jobPipelineProcessor`,
			tracingEnabled: true
		});

		calculationLambda.grantInvoke(pipelineProcessorJobStateMachine);

		const inlineMetricAggregationTask = new LambdaInvoke(this, 'MetricAggregationTask', {
			lambdaFunction: metricAggregationLambda,
		});

		const inlinePipelineAggregationTask = new LambdaInvoke(this, 'PipelineAggregationTask', {
			lambdaFunction: pipelineAggregationLambda,
		});

		const inlineStateMachineLogGroup = new LogGroup(this, 'InlineStateMachineLogGroup', { logGroupName: `/aws/stepfunctions/${namePrefix}-inline-pipelineProcessor`, removalPolicy: RemovalPolicy.DESTROY });
		const pipelineProcessorInlineStateMachine = new StateMachine(this, 'PipelineProcessorInlineStateMachine', {
			definition: new Parallel(this, 'InlineAggregationTask').branch(inlineMetricAggregationTask).branch(inlinePipelineAggregationTask),
			logs: { destination: inlineStateMachineLogGroup, level: LogLevel.ERROR, includeExecutionData: true },
			stateMachineName: `${namePrefix}-inlinePipelineProcessor`,
			tracingEnabled: true
		});

		new StringParameter(this, 'pipelineProcessorJobStateMachineArnParameter', {
			parameterName: pipelineProcessorJobStateMachineArnParameter(props.tenantId, props.environment),
			stringValue: pipelineProcessorJobStateMachine.stateMachineArn,
		});

		new StringParameter(this, 'pipelineProcessorInlineStateMachineArnParameter', {
			parameterName: pipelineProcessorInlineStateMachineArnParameter(props.tenantId, props.environment),
			stringValue: pipelineProcessorInlineStateMachine.stateMachineArn,
		});

		const eventIntegrationLambda = new NodejsFunction(this, 'BucketEventsLambda', {
			description: `Pipeline Processors Bucket Events Handler: Tenant ${props.tenantId}`,
			entry: path.join(__dirname, '../../../../typescript/packages/apps/pipeline-processors/src/lambda_eventbridge.ts'),
			runtime: Runtime.NODEJS_16_X,
			tracing: Tracing.ACTIVE,
			functionName: `${namePrefix}-bucketEvents`,
			timeout: Duration.seconds(30),
			memorySize: 256,
			logRetention: RetentionDays.ONE_WEEK,
			environment: {
				INLINE_PROCESSING_ROWS_LIMIT,
				NODE_ENV: props.environment,
				PIPELINE_JOB_STATE_MACHINE_ARN: pipelineProcessorJobStateMachine.stateMachineArn,
				PIPELINE_INLINE_STATE_MACHINE_ARN: pipelineProcessorInlineStateMachine.stateMachineArn,
				BUCKET_NAME: bucket.bucketName,
				BUCKET_PREFIX: bucketPrefix,
				EVENT_BUS_NAME: props.eventBusName,
				TABLE_NAME: table.tableName,
				PIPELINES_FUNCTION_NAME: props.pipelineApiFunctionName,
				CALCULATOR_FUNCTION_NAME: props.calculatorFunctionName,
				METRICS_TABLE_NAME: metricsTable.tableName,
				CSV_INPUT_CONNECTOR_NAME: props.csvConnectorName,
			},
			bundling: {
				minify: true,
				format: OutputFormat.ESM,
				target: 'node16.15',
				sourceMap: false,
				sourcesContent: false,
				banner: 'import { createRequire } from \'module\';const require = createRequire(import.meta.url);import { fileURLToPath } from \'url\';import { dirname } from \'path\';const __filename = fileURLToPath(import.meta.url);const __dirname = dirname(__filename);',
				externalModules: ['aws-sdk', 'pg-native'],
			},
			depsLockFilePath: path.join(__dirname, '../../../../common/config/rush/pnpm-lock.yaml'),
		});

		pipelineLambda.grantInvoke(eventIntegrationLambda);
		pipelineProcessorJobStateMachine.grantStartExecution(eventIntegrationLambda);
		table.grantReadWriteData(eventIntegrationLambda);
		bucket.grantReadWrite(eventIntegrationLambda);
		eventBus.grantPutEventsTo(eventIntegrationLambda);

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
				detail: {
					bucket: {
						name: [props.bucketName],
					},
					object: {
						key: [{ prefix: `${bucketPrefix}/` }],
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

		const kmsKey = Key.fromKeyArn(this, 'KmsKey', props.kmsKeyArn);

		/**
		 * Define the API Lambda
		 */
		const apiLambda = new NodejsFunction(this, 'Apilambda', {
			description: `Pipeline Executions API: Tenant ${props.tenantId}`,
			entry: path.join(__dirname, '../../../../typescript/packages/apps/pipeline-processors/src/lambda_apiGateway.ts'),
			functionName: `${props.pipelineProcessorApiFunctionName}`,
			runtime: Runtime.NODEJS_16_X,
			tracing: Tracing.ACTIVE,
			memorySize: 256,
			logRetention: RetentionDays.ONE_WEEK,
			environment: {
				INLINE_PROCESSING_ROWS_LIMIT,
				ACCESS_MANAGEMENT_FUNCTION_NAME: props.accessManagementApiFunctionName,
				NODE_ENV: props.environment,
				TABLE_NAME: table.tableName,
				BUCKET_NAME: bucket.bucketName,
				BUCKET_PREFIX: bucketPrefix,
				EVENT_BUS_NAME: eventBus.eventBusName,
				PIPELINE_JOB_STATE_MACHINE_ARN: pipelineProcessorJobStateMachine.stateMachineArn,
				PIPELINE_INLINE_STATE_MACHINE_ARN: pipelineProcessorInlineStateMachine.stateMachineArn,
				PIPELINES_FUNCTION_NAME: props.pipelineApiFunctionName,
				CALCULATOR_FUNCTION_NAME: props.calculatorFunctionName,
				METRICS_TABLE_NAME: metricsTable.tableName,
				TENANT_ID: props.tenantId,
				TASK_PARALLEL_LIMIT: props.downloadAuditFileParallelLimit.toString(),
				CSV_INPUT_CONNECTOR_NAME: props.csvConnectorName,
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
				target: 'node16.15',
				sourceMap: false,
				sourcesContent: false,
				banner: 'import { createRequire } from \'module\';const require = createRequire(import.meta.url);import { fileURLToPath } from \'url\';import { dirname } from \'path\';const __filename = fileURLToPath(import.meta.url);const __dirname = dirname(__filename);',
				externalModules: ['aws-sdk', 'pg-native'],
			},
			depsLockFilePath: path.join(__dirname, '../../../../common/config/rush/pnpm-lock.yaml'),
		});

		kmsKey.grantDecrypt(apiLambda);

		apiLambda.addToRolePolicy(rdsProxyPolicy);

		new StringParameter(this, 'pipelineProcessorApiFunctionArnParameter', {
			parameterName: pipelineProcessorApiFunctionArnParameter(props.tenantId, props.environment),
			stringValue: apiLambda.functionArn,
		});

		// grant the lambda functions access to the table
		table.grantWriteData(apiLambda);
		table.grantReadData(apiLambda);
		bucket.grantReadWrite(apiLambda);
		eventBus.grantPutEventsTo(apiLambda);
		pipelineLambda.grantInvoke(apiLambda);
		metricsTable.grantReadData(apiLambda);
		calculatorLambda.grantInvoke(apiLambda);
		pipelineProcessorInlineStateMachine.grantStartExecution(apiLambda);

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

		NagSuppressions.addResourceSuppressions([apiLambda, eventIntegrationLambda],
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
						'Resource::<PipelineProcessorsTable94FB7C09.Arn>/index/*',
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
				},
				{
					id: 'AwsSolutions-L1',
					reason: 'NODEJS_16_X to NODEJS_18_X upgrade not ready.',
				}
			],
			true);

		NagSuppressions.addResourceSuppressions([verificationLambda],
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
						'Resource::<PipelineProcessorsTable94FB7C09.Arn>/index/*',
						`Resource::arn:<AWS::Partition>:lambda:${region}:${accountId}:function:<pipelineApiFunctionNameParameter>:*`
					],
					reason: 'This policy is required for the lambda to access the resource api table.'

				},
				{
					id: 'AwsSolutions-IAM5',
					appliesTo: ['Resource::*'],
					reason: 'The resource condition in the IAM policy is generated by CDK, this only applies to xray:PutTelemetryRecords and xray:PutTraceSegments.'
				}, 
				{
					id: 'AwsSolutions-L1',
					reason: 'NODEJS_16_X to NODEJS_18_X upgrade not ready.',
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
						'Resource::<PipelineProcessorsTable94FB7C09.Arn>/index/*',
						`Resource::arn:<AWS::Partition>:lambda:${region}:${accountId}:function:<calculatorFunctionNameParameter>:*`,
					],
					reason: 'This policy is required for the lambda to access the resource api table.'

				},
				{
					id: 'AwsSolutions-IAM5',
					appliesTo: ['Resource::*'],
					reason: 'The resource condition in the IAM policy is generated by CDK, this only applies to xray:PutTelemetryRecords and xray:PutTraceSegments.'
				}, 
				{
					id: 'AwsSolutions-L1',
					reason: 'NODEJS_16_X to NODEJS_18_X upgrade not ready.',
				}
			],
			true);

		NagSuppressions.addResourceSuppressions([resultProcessorLambda],
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
						'Resource::<PipelineProcessorsTable94FB7C09.Arn>/index/*',
					],
					reason: 'This policy is required for the lambda to access the resource api table.'

				},
				{
					id: 'AwsSolutions-IAM5',
					appliesTo: ['Resource::*'],
					reason: 'The resource condition in the IAM policy is generated by CDK, this only applies to xray:PutTelemetryRecords and xray:PutTraceSegments.'
				},
				{
					id: 'AwsSolutions-L1',
					reason: 'NODEJS_16_X to NODEJS_18_X upgrade not ready.',
				}
			],
			true);

		NagSuppressions.addResourceSuppressions([metricAggregationLambda, pipelineAggregationLambda],
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
						'Resource::<PipelineProcessorsTable94FB7C09.Arn>/index/*',
						'Resource::<PipelineProcessorsMetricsTable944ED8FD.Arn>/index/*',
						`Resource::arn:<AWS::Partition>:lambda:${region}:${accountId}:function:<pipelineApiFunctionNameParameter>:*`],
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
				},
				{
					id: 'AwsSolutions-L1',
					reason: 'NODEJS_16_X to NODEJS_18_X upgrade not ready.',
				},
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
						`Resource::arn:<AWS::Partition>:lambda:${region}:${accountId}:function:<pipelineApiFunctionNameParameter>:*`],
					reason: 'This policy is required for the lambda to access the resource api table.'

				},
				{
					id: 'AwsSolutions-IAM5',
					appliesTo: [
						'Resource::<PipelineProcessorsTable94FB7C09.Arn>/index/*',
						`Resource::arn:<AWS::Partition>:lambda:${region}:${accountId}:function:<calculatorFunctionNameParameter>:*`,
					],
					reason: 'This policy is required for the lambda to access the resource api table.'

				},
				{
					id: 'AwsSolutions-IAM5',
					appliesTo: [`Resource::arn:<AWS::Partition>:lambda:${region}:${accountId}:function:<accessManagementApiFunctionNameParameter>:*`],
					reason: 'This policy is required to invoke access management and calculation engine.'
				},
				{
					id: 'AwsSolutions-L1',
					reason: 'NODEJS_16_X to NODEJS_18_X upgrade not ready.',
				},
			],
			true);

		NagSuppressions.addResourceSuppressions([deadLetterQueue],
			[
				{
					id: 'AwsSolutions-SQS3',
					reason: 'This is the dead letter queue.'

				},
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
					id: "AwsSolutions-APIG4",
					reason: 'OPTIONS has no auth.'
				},
				{
					id: "AwsSolutions-COG4",
					reason: 'OPTIONS does not use Cognito auth.'
				},
			],
			true);

		NagSuppressions.addResourceSuppressions([pipelineProcessorInlineStateMachine],
			[
				{
					id: 'AwsSolutions-IAM5',
					appliesTo: ['Resource::<PipelineProcessorsProcessorMetricAggregationLambda4ABE57AD.Arn>:*', 'Resource::<PipelineProcessorsProcessorPipelineAggregationLambda21DC6AD2.Arn>:*'],
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

		NagSuppressions.addResourceSuppressions([pipelineProcessorJobStateMachine],
			[
				{
					id: 'AwsSolutions-IAM5',
					appliesTo: [
						'Resource::<PipelineProcessorsProcessorCalculatorLambda22D65AA1.Arn>:*',
						'Resource::<PipelineProcessorsProcessorResultProcessorLambda3587425C.Arn>:*',
						'Resource::<PipelineProcessorsProcessorMetricAggregationLambda4ABE57AD.Arn>:*',
						'Resource::<PipelineProcessorsProcessorPipelineAggregationLambda21DC6AD2.Arn>:*',
						'Resource::<PipelineProcessorsProcessorResourceVerificationLambdaD6D60A28.Arn>:*'],
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
	}
}
