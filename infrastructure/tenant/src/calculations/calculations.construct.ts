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
import { AccessLogFormat, AuthorizationType, CfnMethod, CognitoUserPoolsAuthorizer, Cors, EndpointType, LambdaRestApi, LogGroupLogDestination, MethodLoggingLevel } from 'aws-cdk-lib/aws-apigateway';
import { UserPool } from 'aws-cdk-lib/aws-cognito';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { EventBus } from 'aws-cdk-lib/aws-events';
import { Runtime, Function, Tracing } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Queue } from 'aws-cdk-lib/aws-sqs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Effect } from 'aws-cdk-lib/aws-iam';
import { NagSuppressions } from 'cdk-nag';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface CalculationConstructProperties {
	tenantId: string;
	environment: string;
	accessManagementApiFunctionName: string;
	cognitoUserPoolId: string;
	eventBusName: string;
	tableName: string;
	workerQueueArn: string;
	enableDeleteResource?: boolean;
	calculatorFunctionName: string;
	permittedOutgoingTenantPaths: string;
	externallySharedGroupIds: string;
	calculationsApiFunctionName: string;
}

export const calculationsApiFunctionArnParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/calculations/apiFunctionArn`;
export const calculationsApiUrlParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/calculations/apiUrl`;
export const calculationsApiNameParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/calculations/apiName`;

export class CalculationsModule extends Construct {

	public calculationsFunctionName: string;

	constructor(scope: Construct, id: string, props: CalculationConstructProperties) {
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
			functionName: props.calculationsApiFunctionName,
			description: `Calculation API: Tenant ${props.tenantId}`,
			entry: path.join(__dirname, '../../../../typescript/packages/apps/calculations/src/lambda_apiGateway.ts'),
			runtime: Runtime.NODEJS_16_X,
			tracing: Tracing.ACTIVE,
			memorySize: 256,
			timeout: Duration.seconds(29),
			logRetention: RetentionDays.ONE_WEEK,
			environment: {
				MODULE_NAME: 'calculations',
				ACCESS_MANAGEMENT_FUNCTION_NAME: props.accessManagementApiFunctionName,
				EVENT_BUS_NAME: props.eventBusName,
				NODE_ENV: props.environment,
				TABLE_NAME: props.tableName,
				WORKER_QUEUE_URL: workerQueue.queueUrl,
				ENABLE_DELETE_RESOURCE: props.enableDeleteResource as unknown as string,
				CALCULATOR_FUNCTION_NAME: props.calculatorFunctionName,

				TENANT_ID: props.tenantId,
				PERMITTED_OUTGOING_TENANT_PATHS: props.permittedOutgoingTenantPaths,
				EXTERNALLY_SHARED_GROUP_IDS: props.externallySharedGroupIds,
			},

			bundling: {
				minify: true,
				format: OutputFormat.ESM,
				target: 'node16.15',
				sourceMap: false,
				sourcesContent: false,
				banner: 'import { createRequire } from \'module\';const require = createRequire(import.meta.url);import { fileURLToPath } from \'url\';import { dirname } from \'path\';const __filename = fileURLToPath(import.meta.url);const __dirname = dirname(__filename);',
				externalModules: ['aws-sdk'],
			},
			depsLockFilePath: path.join(__dirname, '../../../../common/config/rush/pnpm-lock.yaml'),
		});
		apiLambda.node.addDependency(table);
		apiLambda.node.addDependency(workerQueue);
		calculatorLambda.grantInvoke(apiLambda);

		this.calculationsFunctionName = apiLambda.functionName;

		new ssm.StringParameter(this, 'calculationsApiFunctionArnParameter', {
			parameterName: calculationsApiFunctionArnParameter(props.tenantId, props.environment),
			stringValue: apiLambda.functionArn,
		});

		// lambda permissions
		table.grantWriteData(apiLambda);
		table.grantReadData(apiLambda);
		eventBus.grantPutEventsTo(apiLambda);
		workerQueue.grantSendMessages(apiLambda);

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
				allowPolicy.resources.push(`arn:aws:lambda:*:*:function:sif-${tenant}-${props.environment}-calculationsApi:*`);
				allowPolicy.resources.push(`arn:aws:lambda:*:*:function:sif-${tenant}-${props.environment}-calculationsApi`);
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

		/**
		 * Define the API Gateway
		 */

		const userPool = UserPool.fromUserPoolId(this, 'UserPool', props.cognitoUserPoolId);

		const authorizer = new CognitoUserPoolsAuthorizer(this, 'Authorizer', {
			cognitoUserPools: [userPool],
		});

		const logGroup = new LogGroup(this, 'CalculationApiLogs');
		const apigw = new LambdaRestApi(this, 'ApiGateway', {
			restApiName: `${namePrefix}-calculations`,
			description: `CalculationApi: Tenant ${props.tenantId}`,
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

		new ssm.StringParameter(this, 'calculationsApiUrlParameter', {
			parameterName: calculationsApiUrlParameter(props.tenantId, props.environment),
			stringValue: apigw.url,
		});

		new ssm.StringParameter(this, 'calculationsApiNameParameter', {
			parameterName: calculationsApiNameParameter(props.tenantId, props.environment),
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
					appliesTo: ['Action::s3:Abort*', 'Action::s3:DeleteObject*', 'Action::s3:GetBucket*', 'Action::s3:GetObject*', 'Action::s3:List*', 'Resource::arn:<AWS::Partition>:s3:::<bucketNameParameter>/*'],
					reason: 'This policy is required for the lambda to access the s3 bucket that contains reference datasets file.'
				},
				{
					id: 'AwsSolutions-IAM5',
					appliesTo: [`Resource::arn:<AWS::Partition>:dynamodb:${region}:${accountId}:table/<ResourceApiBaseTable3133F8B2>/index/*`],
					reason: 'This policy is required for the lambda to access the resource api table.'

				},
				{
					id: 'AwsSolutions-IAM5',
					appliesTo: [
						`Resource::arn:<AWS::Partition>:lambda:${region}:${accountId}:function:<calculatorFunctionNameParameter>:*`,
						`Resource::arn:<AWS::Partition>:lambda:${region}:${accountId}:function:<accessManagementApiFunctionNameParameter>:*`,],
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
			],
			true);
	}
}
