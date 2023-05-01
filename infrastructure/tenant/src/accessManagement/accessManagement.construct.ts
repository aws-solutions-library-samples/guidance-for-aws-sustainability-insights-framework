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

import {
	AccessLogFormat,
	AuthorizationType,
	CognitoUserPoolsAuthorizer,
	Cors,
	EndpointType,
	LambdaRestApi,
	LogGroupLogDestination,
	MethodLoggingLevel,
	CfnMethod
} from 'aws-cdk-lib/aws-apigateway';
import { UserPool } from 'aws-cdk-lib/aws-cognito';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { EventBus } from 'aws-cdk-lib/aws-events';
import { Runtime, Tracing } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import path from 'path';
import { fileURLToPath } from 'url';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { NagSuppressions } from 'cdk-nag';
import { Aspects, Stack } from 'aws-cdk-lib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type AccessManagementConstructProperties = {
	tenantId: string;
	environment: string;
	cognitoUserPoolId: string;
	eventBusName: string;
	tableName: string;
	accessManagementApiFunctionName: string;
};

export const accessManagementApiFunctionArnParameter = (tenantId: string, environment: string) =>
	`/sif/${tenantId}/${environment}/accessManagement/apiFunctionArn`;
export const accessManagementApiUrlParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/accessManagement/apiUrl`;
export const accessManagementApiNameParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/accessManagement/apiName`;

export class AccessManagementModule extends Construct {
	public readonly tableName: string;

	constructor(scope: Construct, id: string, props: AccessManagementConstructProperties) {
		super(scope, id);

		const namePrefix = `sif-${props.tenantId}-${props.environment}`;

		const eventBus = EventBus.fromEventBusName(this, 'EventBus', props.eventBusName);
		const table = Table.fromTableAttributes(this, 'Table', {
			tableName: props.tableName,
			globalIndexes: ['siKey1-pk-index', 'siKey2-pk-index'],
		});

		/**
		 * Define the API Lambda
		 */
		const apiLambda = new NodejsFunction(this, 'Apilambda', {
			functionName: props.accessManagementApiFunctionName,
			description: `Access Management API: Tenant ${props.tenantId}`,
			entry: path.join(__dirname, '../../../../typescript/packages/apps/access-management/src/lambda_apiGateway.ts'),
			runtime: Runtime.NODEJS_16_X,
			tracing: Tracing.ACTIVE,
			memorySize: 256,
			logRetention: RetentionDays.ONE_WEEK,
			environment: {
				EVENT_BUS_NAME: props.eventBusName,
				NODE_ENV: props.environment,
				TABLE_NAME: table.tableName,
				USER_POOL_ID: props.cognitoUserPoolId,
				WORKER_QUEUE_URL: 'not used',
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

		new StringParameter(this, 'accessManagementApiFunctionArnParameter', {
			parameterName: accessManagementApiFunctionArnParameter(props.tenantId, props.environment),
			stringValue: apiLambda.functionArn,
		});

		// lambda permissions
		table.grantReadWriteData(apiLambda);
		eventBus.grantPutEventsTo(apiLambda);

		// grant the lambda access to the user pool
		const userPool = UserPool.fromUserPoolId(this, 'UserPool', props.cognitoUserPoolId);
		userPool.grant(
			apiLambda,
			'cognito-idp:AdminAddUserToGroup',
			'cognito-idp:AdminCreateUser',
			'cognito-idp:AdminDeleteUser',
			'cognito-idp:AdminDisableUser',
			'cognito-idp:AdminEnableUser',
			'cognito-idp:AdminGetUser',
			'cognito-idp:AdminListGroupsForUser',
			'cognito-idp:AdminRemoveUserFromGroup',
			'cognito-idp:AdminSetUserPassword',
			'cognito-idp:CreateGroup',
			'cognito-idp:DeleteGroup',
			'cognito-idp:GetGroup',
			'cognito-idp:ListUsersInGroup'
		);

		/**
		 * Define the API Gateway
		 */

		const authorizer = new CognitoUserPoolsAuthorizer(this, 'Authorizer', {
			cognitoUserPools: [userPool],
		});

		const logGroup = new LogGroup(this, 'AccessManagementApiLogs');
		const apigw = new LambdaRestApi(this, 'ApiGateway', {
			restApiName: `${namePrefix}-accessManagement`,
			description: `Access Management API: Tenant ${props.tenantId}`,
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

		new StringParameter(this, 'accessManagementApiUrlParameter', {
			parameterName: accessManagementApiUrlParameter(props.tenantId, props.environment),
			stringValue: apigw.url,
		});

		new StringParameter(this, 'accessManagementApiNameParameter', {
			parameterName: accessManagementApiNameParameter(props.tenantId, props.environment),
			stringValue: apigw.restApiName,
		});

		const accountId = Stack.of(this).account;
		const region = Stack.of(this).region;

		NagSuppressions.addResourceSuppressions([apiLambda],
			[
				{
					id: 'AwsSolutions-IAM4',
					appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'],
					reason: 'This policy is generated by CDK.'

				},
				{
					id: 'AwsSolutions-IAM5',
					appliesTo: [`Resource::arn:<AWS::Partition>:dynamodb:${region}:${accountId}:table/<ResourceApiBaseTable3133F8B2>/index/*`],
					reason: 'This policy is required for the lambda to access the resource api table.'

				},
				{
					id: 'AwsSolutions-IAM5',
					appliesTo: ['Resource::*'],
					reason: 'The resource condition in the IAM policy is generated by CDK, this only applies to xray:PutTelemetryRecords and xray:PutTraceSegments actions.'

				},
				{
					id: 'AwsSolutions-L1',
					reason: 'NODEJS_16_X to NODEJS_18_X upgrade not ready.',
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
	}
}
