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

import { Aspects, aws_iam, Duration, Stack } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { AccessLogFormat, AuthorizationType, CfnMethod, CognitoUserPoolsAuthorizer, Cors, EndpointType, LambdaRestApi, LogGroupLogDestination, MethodLoggingLevel } from 'aws-cdk-lib/aws-apigateway';
import { UserPool } from 'aws-cdk-lib/aws-cognito';
import { Queue } from 'aws-cdk-lib/aws-sqs';
import { Runtime, Function, Tracing } from 'aws-cdk-lib/aws-lambda';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { EventBus } from 'aws-cdk-lib/aws-events';
import path from 'path';
import { fileURLToPath } from 'url';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { AnyPrincipal, Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { NagSuppressions } from 'cdk-nag';
import { getLambdaArchitecture } from '@sif/cdk-common';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ImpactsConstructProperties {
	tenantId: string;
	environment: string;
	accessManagementApiFunctionName: string;
	cognitoUserPoolId: string;
	eventBusName: string;
	tableName: string;
	workerQueueArn: string;
	enableDeleteResource?: boolean;
	permittedOutgoingTenantPaths: string;
	externallySharedGroupIds: string;
	impactsApiFunctionName: string;
}

export const impactsApiFunctionArnParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/impacts/apiFunctionArn`;
export const impactsApiUrlParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/impacts/apiUrl`;
export const impactsApiNameParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/impacts/apiName`;
export const impactsTaskFunctionNameParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/impacts/taskFunctionName`;
export const impactsTaskFunctionArnParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/impacts/taskFunctionArn`;
export const impactsTaskQueueUrlParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/impacts/taskQueueUrl`;

export class ImpactsModule extends Construct {
	constructor(scope: Construct, id: string, props: ImpactsConstructProperties) {
		super(scope, id);

		const namePrefix = `sif-${props.tenantId}-${props.environment}`;

		const eventBus = EventBus.fromEventBusName(this, 'EventBus', props.eventBusName);
		const table = Table.fromTableAttributes(this, 'Table', {
			tableName: props.tableName,
			globalIndexes: ['siKey1-pk-index', 'siKey2-pk-index'],
		});
		const workerQueue = Queue.fromQueueArn(this, 'WorkerQueue', props.workerQueueArn);

		/**
		 * Define the SQS queues
		 */

		const impactsTaskDlq = new Queue(this, `taskDlq`, { queueName: `${namePrefix}-impacts-task-dlq` });

		impactsTaskDlq.addToResourcePolicy(new PolicyStatement({
			sid: 'enforce-ssl',
			effect: Effect.DENY,
			principals: [new AnyPrincipal()],
			actions: ['sqs:*'],
			resources: [impactsTaskDlq.queueArn],
			conditions: {
				'Bool': {
					'aws:SecureTransport': 'false'
				}
			}
		}));

		const impactsTaskQueue = new Queue(this, `taskQueue`, {
			queueName: `${namePrefix}-impacts-task`,
			deadLetterQueue: {
				maxReceiveCount: 10,
				queue: impactsTaskDlq,
			},
			visibilityTimeout: Duration.seconds(90),
		});

		impactsTaskQueue.addToResourcePolicy(new PolicyStatement({
			sid: 'enforce-ssl',
			effect: Effect.DENY,
			principals: [new AnyPrincipal()],
			actions: ['sqs:*'],
			resources: [impactsTaskQueue.queueArn],
			conditions: {
				'Bool': {
					'aws:SecureTransport': 'false'
				}
			}
		}));

		/**
		 * Define the API Lambda
		 */
		const apiLambda = new NodejsFunction(this, 'Apilambda', {
			functionName: props.impactsApiFunctionName,
			description: `Impacts API: Tenant ${props.tenantId}`,
			entry: path.join(__dirname, '../../../../typescript/packages/apps/impacts/src/lambda_apiGateway.ts'),
			runtime: Runtime.NODEJS_18_X,
			tracing: Tracing.ACTIVE,
			memorySize: 512,
			timeout: Duration.seconds(29),
			logRetention: RetentionDays.ONE_WEEK,
			environment: {
				MODULE_NAME: 'impacts',
				ACCESS_MANAGEMENT_FUNCTION_NAME: props.accessManagementApiFunctionName,
				EVENT_BUS_NAME: props.eventBusName,
				NODE_ENV: props.environment,
				TABLE_NAME: props.tableName,
				WORKER_QUEUE_URL: workerQueue.queueUrl,
				TASK_QUEUE_URL: impactsTaskQueue.queueUrl,
				ENABLE_DELETE_RESOURCE: props.enableDeleteResource as unknown as string,
				TENANT_ID: props.tenantId,
				PERMITTED_OUTGOING_TENANT_PATHS: props.permittedOutgoingTenantPaths,
				EXTERNALLY_SHARED_GROUP_IDS: props.externallySharedGroupIds,
			},

			bundling: {
				minify: true,
				format: OutputFormat.ESM,
				target: 'node18.16',
				sourceMap: false,
				sourcesContent: false,
				banner: 'import { createRequire } from \'module\';const require = createRequire(import.meta.url);import { fileURLToPath } from \'url\';import { dirname } from \'path\';const __filename = fileURLToPath(import.meta.url);const __dirname = dirname(__filename);',
				externalModules: ['aws-sdk'],
			},
			depsLockFilePath: path.join(__dirname, '../../../../common/config/rush/pnpm-lock.yaml'),
			architecture: getLambdaArchitecture(scope),
		});

		apiLambda.node.addDependency(table);
		apiLambda.node.addDependency(workerQueue);
		apiLambda.node.addDependency(impactsTaskQueue);

		new ssm.StringParameter(this, 'impactsApiFunctionArnParameter', {
			parameterName: impactsApiFunctionArnParameter(props.tenantId, props.environment),
			stringValue: apiLambda.functionArn,
		});

		// lambda permissions
		table.grantReadWriteData(apiLambda);
		eventBus.grantPutEventsTo(apiLambda);
		workerQueue.grantSendMessages(apiLambda);
		impactsTaskQueue.grantSendMessages(apiLambda);

		/**
		 * Define permissions needed to invoke other tenants
		 * We will need to create a logical or for this policy
		 * To do this :
		 * 1- we will allow all invocation
		 * 3- Attach our inline policy to the lambda role
		 */

		if (props.permittedOutgoingTenantPaths) {
			// 1- Allow Policy
			const allowPolicy = {
				effects: Effect.ALLOW,
				actions: ['lambda:InvokeFunction'],
				resources: [],
			};

			const paths = props.permittedOutgoingTenantPaths.split(';');
			for (const tenantPath of paths) {
				const [tenant] = tenantPath.split(':');
				allowPolicy.resources.push(`arn:aws:lambda:*:*:function:sif-${tenant}-${props.environment}-impactsApi:*`);
				allowPolicy.resources.push(`arn:aws:lambda:*:*:function:sif-${tenant}-${props.environment}-impactsApi`);
			}

			const allowTenantInvocationPolicy = new aws_iam.Policy(this, `${namePrefix}-tenant-invocation-policy`, {
				policyName: `${namePrefix}-tenant-invocation-policy`,
				statements: [new aws_iam.PolicyStatement(allowPolicy)],
			});

			// 2- Attach inline policy to lambda role
			apiLambda.role?.attachInlinePolicy(allowTenantInvocationPolicy);

			NagSuppressions.addResourceSuppressions(allowTenantInvocationPolicy, [
				{
					id: 'AwsSolutions-IAM5',
					reason: 'This policy is required to invoke reference dataset in another tenant.'
				}]);
		}

		new StringParameter(this, `ImpactsTaskQueueUrlParameter`, {
			parameterName: impactsTaskQueueUrlParameter(props.tenantId, props.environment),
			stringValue: impactsTaskQueue.queueUrl,
		});

		/**
		 * Define the SQS Lambdas
		 */
		const sqsLambdaImpactsTask = new NodejsFunction(this, 'SqsLambdaImpactsTask', {
			functionName: `${namePrefix}-impacts-impactTask-sqs`,
			description: `Impacts SQS: Tenant ${props.tenantId}`,
			entry: path.join(__dirname, '../../../../typescript/packages/apps/impacts/src/lambda_impacts_task_sqs.ts'),
			runtime: Runtime.NODEJS_18_X,
			tracing: Tracing.ACTIVE,
			memorySize: 512,
			logRetention: RetentionDays.ONE_WEEK,
			timeout: Duration.seconds(30),
			environment: {
				ACCESS_MANAGEMENT_FUNCTION_NAME: props.accessManagementApiFunctionName,
				EVENT_BUS_NAME: props.eventBusName,
				NODE_ENV: props.environment,
				TABLE_NAME: props.tableName,
				WORKER_QUEUE_URL: workerQueue.queueUrl,
				TASK_QUEUE_URL: impactsTaskQueue.queueUrl,
				ENABLE_DELETE_RESOURCE: props.enableDeleteResource as unknown as string,
				TENANT_ID: props.tenantId,
			},

			bundling: {
				minify: true,
				format: OutputFormat.ESM,
				target: 'node18.16',
				sourceMap: false,
				sourcesContent: false,
				banner: 'import { createRequire } from \'module\';const require = createRequire(import.meta.url);import { fileURLToPath } from \'url\';import { dirname } from \'path\';const __filename = fileURLToPath(import.meta.url);const __dirname = dirname(__filename);',
				externalModules: ['aws-sdk'],
			},
			depsLockFilePath: path.join(__dirname, '../../../../common/config/rush/pnpm-lock.yaml'),
			architecture: getLambdaArchitecture(scope),
		});

		sqsLambdaImpactsTask.node.addDependency(table);
		sqsLambdaImpactsTask.node.addDependency(workerQueue);
		sqsLambdaImpactsTask.node.addDependency(impactsTaskQueue);

		sqsLambdaImpactsTask.addEventSource(
			new SqsEventSource(impactsTaskQueue, {
				batchSize: 10,
				reportBatchItemFailures: true,
			})
		);

		new ssm.StringParameter(this, 'impactsTaskFunctionNameParameter', {
			parameterName: impactsTaskFunctionNameParameter(props.tenantId, props.environment),
			stringValue: sqsLambdaImpactsTask.functionName,
		});

		new ssm.StringParameter(this, 'impactsTaskFunctionArnParameter', {
			parameterName: impactsTaskFunctionArnParameter(props.tenantId, props.environment),
			stringValue: sqsLambdaImpactsTask.functionArn,
		});

		// grant the lambda functions access to the table
		table.grantReadWriteData(sqsLambdaImpactsTask);
		eventBus.grantPutEventsTo(sqsLambdaImpactsTask);
		workerQueue.grantSendMessages(sqsLambdaImpactsTask);
		impactsTaskQueue.grantSendMessages(sqsLambdaImpactsTask);
		impactsTaskQueue.grantConsumeMessages(sqsLambdaImpactsTask);

		/**
		 * Define the API Gateway
		 */

		const userPool = UserPool.fromUserPoolId(this, 'UserPool', props.cognitoUserPoolId);

		const authorizer = new CognitoUserPoolsAuthorizer(this, 'Authorizer', {
			cognitoUserPools: [userPool],
		});

		const logGroup = new LogGroup(this, 'ImpactsApiLogs');
		const apigw = new LambdaRestApi(this, 'ApiGateway', {
			restApiName: `${namePrefix}-ImpactsApi`,
			description: `ImpactsApi: Tenant ${props.tenantId}`,
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
			defaultMethodOptions: {
				authorizationType: AuthorizationType.COGNITO,
				authorizer,
			},
		});

		Aspects.of(apigw).add({
			visit(node) {
				if (node instanceof CfnMethod && node.httpMethod === 'OPTIONS') {
					node.addPropertyOverride('AuthorizationType', 'NONE');
				}
			}
		});

		apigw.node.addDependency(apiLambda);

		new ssm.StringParameter(this, 'ImpactsApiUrlParameter', {
			parameterName: impactsApiUrlParameter(props.tenantId, props.environment),
			stringValue: apigw.url,
		});

		new ssm.StringParameter(this, 'ImpactsApiNameParameter', {
			parameterName: impactsApiNameParameter(props.tenantId, props.environment),
			stringValue: apigw.restApiName,
		});

		const accessManagementLambda = Function.fromFunctionName(this, 'accessManagementLambda', props.accessManagementApiFunctionName);
		accessManagementLambda.grantInvoke(apiLambda);
		accessManagementLambda.grantInvoke(sqsLambdaImpactsTask);

		const accountId = Stack.of(this).account;
		const region = Stack.of(this).region;

		NagSuppressions.addResourceSuppressions([apiLambda, sqsLambdaImpactsTask],
			[
				{
					id: 'AwsSolutions-IAM4',
					appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'],
					reason: 'This policy is the one generated by CDK.'

				},
				{
					id: 'AwsSolutions-IAM5',
					appliesTo: [`Resource::arn:<AWS::Partition>:dynamodb:${region}:${accountId}:table/<ResourceApiBaseTable3133F8B2>/index/*`],
					reason: 'This policy is required for the lambda to access the resource api table.'

				},
				{
					id: 'AwsSolutions-IAM5',
					appliesTo: [
						`Resource::arn:<AWS::Partition>:lambda:${region}:${accountId}:function:<accessManagementApiFunctionNameParameter>:*`,
					],
					reason: 'This policy is required to invoke access management and calculation engine.'
				},
				{
					id: 'AwsSolutions-IAM5',
					appliesTo: ['Resource::*'],
					reason: 'The resource condition in the IAM policy is generated by CDK, this only applies to xray:PutTelemetryRecords and xray:PutTraceSegments actions.'

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
					id: "AwsSolutions-APIG4",
					reason: 'OPTIONS has no auth.'
				},
				{
					id: "AwsSolutions-COG4",
					reason: 'OPTIONS does not use Cognito auth.'
				},
			],
			true);

		NagSuppressions.addResourceSuppressions([impactsTaskDlq],
			[
				{
					id: 'AwsSolutions-SQS3',
					reason: 'This is the dead letter queue.'

				},
			],
			true);
	}
}
