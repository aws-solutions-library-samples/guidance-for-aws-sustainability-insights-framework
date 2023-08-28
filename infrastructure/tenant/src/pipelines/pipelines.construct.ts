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

import { Aspects, Duration, Stack } from 'aws-cdk-lib';
import { AccessLogFormat, AuthorizationType, CfnMethod, CognitoUserPoolsAuthorizer, Cors, EndpointType, LambdaRestApi, LogGroupLogDestination, MethodLoggingLevel } from 'aws-cdk-lib/aws-apigateway';
import { UserPool } from 'aws-cdk-lib/aws-cognito';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { Function, Runtime, Tracing } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Queue } from 'aws-cdk-lib/aws-sqs';
import { EventBus } from 'aws-cdk-lib/aws-events';
import { NagSuppressions } from 'cdk-nag';
import { getLambdaArchitecture } from '@sif/cdk-common';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface PipelineConstructProperties {
	tenantId: string;
	environment: string;
	accessManagementApiFunctionName: string;
	calculatorFunctionName: string;
	cognitoUserPoolId: string;
	eventBusName: string;
	tableName: string;
	workerQueueArn: string;
	enableDeleteResource?: boolean;
	pipelinesApiFunctionName: string;
}

export const pipelinesApiFunctionArnParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/pipelines/apiFunctionArn`;
export const pipelinesApiUrlParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/pipelines/apiUrl`;
export const pipelinesApiNameParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/pipelines/apiName`;

export class PipelinesModule extends Construct {
	constructor(scope: Construct, id: string, props: PipelineConstructProperties) {
		super(scope, id);

		const namePrefix = `sif-${props.tenantId}-${props.environment}`;

		const eventBus = EventBus.fromEventBusName(this, 'EventBus', props.eventBusName);
		const table = Table.fromTableAttributes(this, 'Table', {
			tableName: props.tableName,
			globalIndexes: ['siKey1-pk-index', 'siKey2-pk-index'],
		});
		const workerQueue = Queue.fromQueueArn(this, 'WorkerQueue', props.workerQueueArn);
		const calculatorLambda = NodejsFunction.fromFunctionName(this, 'CalculatorLambda', props.calculatorFunctionName);

		/**
		 * Define the API Lambda
		 */
		const apiLambda = new NodejsFunction(this, 'ApiLambda', {
			functionName: props.pipelinesApiFunctionName,
			description: `Pipeline API: Tenant ${props.tenantId}`,
			entry: path.join(__dirname, '../../../../typescript/packages/apps/pipelines/src/lambda_apiGateway.ts'),
			runtime: Runtime.NODEJS_18_X,
			tracing: Tracing.ACTIVE,
			memorySize: 512,
			timeout: Duration.seconds(29),
			logRetention: RetentionDays.ONE_WEEK,
			environment: {
				ACCESS_MANAGEMENT_FUNCTION_NAME: props.accessManagementApiFunctionName,
				EVENT_BUS_NAME: props.eventBusName,
				NODE_ENV: props.environment,
				TABLE_NAME: props.tableName,
				WORKER_QUEUE_URL: workerQueue.queueUrl,
				ENABLE_DELETE_RESOURCE: props.enableDeleteResource as unknown as string,
				CALCULATOR_FUNCTION_NAME: props.calculatorFunctionName,
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
		calculatorLambda.grantInvoke(apiLambda);

		new ssm.StringParameter(this, 'pipelineFunctionArnParameter', {
			parameterName: pipelinesApiFunctionArnParameter(props.tenantId, props.environment),
			stringValue: apiLambda.functionArn,
		});

		// grant the lambda functions access to the table
		table.grantWriteData(apiLambda);
		table.grantReadData(apiLambda);
		eventBus.grantPutEventsTo(apiLambda);
		workerQueue.grantSendMessages(apiLambda);

		/**
		 * Define the API Gateway
		 */

		const logGroup = new LogGroup(this, 'PipelineApiLogs');
		const userPool = UserPool.fromUserPoolId(this, 'UserPool', props.cognitoUserPoolId);
		const authorizer = new CognitoUserPoolsAuthorizer(this, 'Authorizer', {
			cognitoUserPools: [userPool],
		});

		const authOptions = {
			authorizationType: AuthorizationType.COGNITO,
			authorizer: authorizer,
		};

		const apigw = new LambdaRestApi(this, 'ApiGateway', {
			restApiName: `${namePrefix}-pipelineApi`,
			description: `PipelineApi: Tenant ${props.tenantId}`,
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

		new ssm.StringParameter(this, 'pipelineApiUrlParameter', {
			parameterName: pipelinesApiUrlParameter(props.tenantId, props.environment),
			stringValue: apigw.url,
		});

		new ssm.StringParameter(this, 'pipelineApiNameParameter', {
			parameterName: pipelinesApiNameParameter(props.tenantId, props.environment),
			stringValue: apigw.restApiName,
		});

		const accessManagementLambda = Function.fromFunctionName(this, 'accessManagementLambda', props.accessManagementApiFunctionName);
		accessManagementLambda.grantInvoke(apiLambda);

		const accountId = Stack.of(this).account;
		const region = Stack.of(this).region;

		NagSuppressions.addResourceSuppressions([apiLambda],
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
						`Resource::arn:<AWS::Partition>:lambda:${region}:${accountId}:function:<calculatorFunctionNameParameter>:*`],
					reason: 'This policy is required to invoke access management and calculation engine.'
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
					id: "AwsSolutions-APIG4",
					reason: 'OPTIONS has no auth.'
				},
				{
					id: "AwsSolutions-COG4",
					reason: 'OPTIONS does not use Cognito auth.'
				},
			],
			true);
	}
}
