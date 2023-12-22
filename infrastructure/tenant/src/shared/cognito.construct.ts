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

import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import * as cdk from 'aws-cdk-lib';
import {
	AccountRecovery,
	CfnUserPoolGroup,
	CfnUserPoolUser,
	CfnUserPoolUserToGroupAttachment,
	ClientAttributes,
	StandardAttributesMask,
	StringAttribute,
	UserPool,
	UserPoolClient,
	UserPoolClientIdentityProvider,
	UserPoolDomain,
	UserPoolEmail
} from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import path from 'path';
import { Runtime, Tracing } from 'aws-cdk-lib/aws-lambda';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { fileURLToPath } from 'url';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Policy, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { NagSuppressions } from 'cdk-nag';
import { getLambdaArchitecture } from '@sif/cdk-common';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface CognitoConstructProperties {
	tenantId: string;
	environment: string;
	administratorEmail: string;
	userPoolEmail?: {
		fromEmail: string;
		fromName: string;
		replyTo: string;
		sesVerifiedDomain: string;
	};
}

export const userPoolIdParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/shared/userPoolId`;
export const userPoolArnParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/shared/userPoolArn`;
export const userPoolClientIdParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/shared/userPoolClientId`;
export const adminUserParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/shared/adminUser`;
export const preTokenGenerationFunctionNameParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/shared/preTokenGenerationFunctionName`;
export const preTokenGenerationFunctionArnParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/shared/preTokenGenerationFunctionArn`;

export class Cognito extends Construct {
	public readonly userPoolId: string;

	constructor(scope: Construct, id: string, props: CognitoConstructProperties) {
		super(scope, id);

		const namePrefix = `sif-${props.tenantId}-${props.environment}`;

		const commonBundlingOptions = {
			minify: true,
			format: OutputFormat.ESM,
			target: 'node18.16',
			sourceMap: false,
			sourcesContent: false,
			banner: 'import { createRequire } from \'module\';const require = createRequire(import.meta.url);import { fileURLToPath } from \'url\';import { dirname } from \'path\';const __filename = fileURLToPath(import.meta.url);const __dirname = dirname(__filename);',
			externalModules: ['aws-sdk']
		};

		const depsLockFilePath = path.join(__dirname, '../../../../common/config/rush/pnpm-lock.yaml');

		const accessManagementApiFunctionName = `${namePrefix}-accessManagementApi`;

		const preTokenGenerationLambdaTrigger = new NodejsFunction(this, 'PreTokenGenerationLambdaTrigger', {
			functionName: `${namePrefix}-preTokenGenerationLambdaTrigger`,
			description: `Cognito Construct Pre Token Generation Lambda Trigger: Tenant ${props.tenantId}`,
			entry: path.join(__dirname, './triggers/preTokenGeneration.trigger.ts'),
			runtime: Runtime.NODEJS_18_X,
			tracing: Tracing.ACTIVE,
			memorySize: 512,
			logRetention: RetentionDays.ONE_WEEK,
			timeout: Duration.seconds(15),
			bundling: commonBundlingOptions,
			environment: {
				// Access Management Api would not be ready
				ACCESS_MANAGEMENT_FUNCTION_NAME: accessManagementApiFunctionName,
				NODE_ENV: props.environment,
				TENANT_ID: props.tenantId
			},
			depsLockFilePath,
			architecture: getLambdaArchitecture(scope),
		});

		const invokeLambdaPolicy = new PolicyStatement({
			actions: ['lambda:InvokeFunction'],
			resources: [`arn:aws:lambda:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:function:${accessManagementApiFunctionName}`]
		});

		// 👇 add the policy to the Function's role
		preTokenGenerationLambdaTrigger.role?.attachInlinePolicy(
			new Policy(this, 'invoke-lambda-policy', {
				statements: [invokeLambdaPolicy]
			})
		);

		NagSuppressions.addResourceSuppressions(preTokenGenerationLambdaTrigger,
			[
				{
					id: 'AwsSolutions-IAM4',
					appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'],
					reason: 'This managed policy is added by CDK by default'

				},
				{
					id: 'AwsSolutions-IAM5',
					appliesTo: ['Resource::*'],
					reason: 'The resource condition in the IAM policy is generated by CDK, this only applies to xray:PutTelemetryRecords and xray:PutTraceSegments.'
				}],
			true);

		new StringParameter(this, 'preTokenGenerationFunctionNameParameter', {
			parameterName: preTokenGenerationFunctionNameParameter(props.tenantId, props.environment),
			stringValue: preTokenGenerationLambdaTrigger.functionName
		});

		new StringParameter(this, 'preTokenGenerationFunctionArnParameter', {
			parameterName: preTokenGenerationFunctionArnParameter(props.tenantId, props.environment),
			stringValue: preTokenGenerationLambdaTrigger.functionArn
		});

		const userPoolEmailSettings: UserPoolEmail | undefined = props.userPoolEmail
			? cognito.UserPoolEmail.withSES({
				fromEmail: props.userPoolEmail.fromEmail,
				fromName: props.userPoolEmail.fromName,
				replyTo: props.userPoolEmail.replyTo,
				sesVerifiedDomain: props.userPoolEmail.sesVerifiedDomain,
				sesRegion: cdk.Stack.of(this).region
			})
			: undefined;

		/**
		 * Create and configure the Cognito user pool
		 */
		const userPool = new UserPool(this, 'UserPool', {
			userPoolName: namePrefix,
			email: userPoolEmailSettings,
			selfSignUpEnabled: false,
			signInAliases: {
				email: true
			},
			autoVerify: {
				email: true
			},
			customAttributes: {
				role: new StringAttribute({ mutable: true })
			},
			lambdaTriggers: {
				preTokenGeneration: preTokenGenerationLambdaTrigger
			},
			passwordPolicy: {
				minLength: 6,
				requireLowercase: true,
				requireDigits: true,
				requireUppercase: false,
				requireSymbols: false
			},
			accountRecovery: AccountRecovery.EMAIL_ONLY,
			removalPolicy: RemovalPolicy.DESTROY
		});

		NagSuppressions.addResourceSuppressions(userPool,
			[
				{
					id: 'AwsSolutions-COG3',
					reason: 'User can turn on AdvancedSecurity mode if they want to, the open source solution will not enforce it.'
				},
				{
					id: 'AwsSolutions-COG1',
					reason: 'User can modify the password policy as necessary.'

				}],
			true);

		this.userPoolId = userPool.userPoolId;

		new ssm.StringParameter(this, 'cognitoUserPoolIdParameter', {
			parameterName: userPoolIdParameter(props.tenantId, props.environment),
			stringValue: userPool.userPoolId
		});

		new ssm.StringParameter(this, 'cognitoUserPoolArnParameter', {
			parameterName: userPoolArnParameter(props.tenantId, props.environment),
			stringValue: userPool.userPoolArn
		});

		new UserPoolDomain(this, 'UserPoolDomain', {
			userPool: userPool,
			cognitoDomain: {
				domainPrefix: `${cdk.Stack.of(this).account}-${props.tenantId}-${props.environment}`
			}
		});

		// TODO: email via SES
		// const cfnUserPool = userPool.node.defaultChild as cognito.CfnUserPool;
		// cfnUserPool.emailConfiguration = {
		//   emailSendingAccount: 'DEVELOPER',
		//   replyToEmailAddress: 'YOUR_EMAIL@example.com',
		//   sourceArn: `arn:aws:ses:cognito-ses-region:${
		//     cdk.Stack.of(this).account
		//   }:identity/YOUR_EMAIL@example.com`,
		// };

		// 👇 User Pool Client attributes for end users
		const standardCognitoAttributes: StandardAttributesMask = {
			email: true,
			emailVerified: true
		};

		const clientReadAttributes = new ClientAttributes().withStandardAttributes(standardCognitoAttributes);

		const clientWriteAttributes = new ClientAttributes().withStandardAttributes({
			...standardCognitoAttributes,
			emailVerified: false
		});

		// 👇 User Pool Client for end users
		const userPoolClient = new UserPoolClient(this, 'UserPoolClient', {
			userPool,
			authFlows: {
				adminUserPassword: true,
				userSrp: true
			},
			supportedIdentityProviders: [UserPoolClientIdentityProvider.COGNITO],
			readAttributes: clientReadAttributes,
			writeAttributes: clientWriteAttributes
		});
		userPoolClient.node.addDependency(userPool);

		new ssm.StringParameter(this, 'cognitoClientIdParameter', {
			parameterName: userPoolClientIdParameter(props.tenantId, props.environment),
			stringValue: userPoolClient.userPoolClientId
		});

		/**
		 * Seed the default roles/groups for the built in global (/) group
		 */

		const adminGroup = new CfnUserPoolGroup(this, 'GlobalAdminGroup', {
			groupName: '/|||admin',
			userPoolId: userPool.userPoolId
		});
		adminGroup.node.addDependency(userPool);

		const contributorGroup = new CfnUserPoolGroup(this, 'GlobalContributorGroup', {
			groupName: '/|||contributor',
			userPoolId: userPool.userPoolId
		});
		contributorGroup.node.addDependency(userPool);

		const readerGroup = new CfnUserPoolGroup(this, 'GlobalReaderGroup', {
			groupName: '/|||reader',
			userPoolId: userPool.userPoolId
		});
		readerGroup.node.addDependency(userPool);

		/**
		 * Seed the initial admin user
		 */
		const adminUser = new CfnUserPoolUser(this, 'GlobalAdminUser', {
			userPoolId: userPool.userPoolId,
			username: props.administratorEmail,
			userAttributes: [
				{
					name: 'email',
					value: props.administratorEmail
				}
			]
		});
		adminUser.node.addDependency(userPool);

		const membership = new CfnUserPoolUserToGroupAttachment(this, 'AdminUserGroupMembership', {
			groupName: adminGroup.groupName as string,
			username: adminUser.username as string,
			userPoolId: userPool.userPoolId
		});

		membership.node.addDependency(adminGroup);
		membership.node.addDependency(adminUser);
		membership.node.addDependency(userPool);

		new ssm.StringParameter(this, 'adminUserParameter', {
			parameterName: adminUserParameter(props.tenantId, props.environment),
			stringValue: props.administratorEmail
		});
	}
}
