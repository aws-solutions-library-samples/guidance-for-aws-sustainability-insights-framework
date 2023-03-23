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

import { Construct } from 'constructs';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import path from 'path';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Runtime, Tracing } from 'aws-cdk-lib/aws-lambda';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Duration, Fn } from 'aws-cdk-lib';
import { fileURLToPath } from 'url';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as cdk from 'aws-cdk-lib';
import { Port, SecurityGroup, SubnetType, Vpc } from 'aws-cdk-lib/aws-ec2';
import { Policy, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import type { DatabaseSecret } from 'aws-cdk-lib/aws-rds';
import { NagSuppressions } from 'cdk-nag';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface DeploymentHelperConstructProperties {
	tenantId: string;
	environment: string;
	vpcId: string;
	privateSubnetIds: string[];
	rdsProxyEndpoint: string;
	platformUsername: string;
	rdsProxySecurityGroupId: string;
	rdsProxyArn: string;
	rdsProxyName: string;
	rdsProxyRoleArn: string;
	tenantSecret: DatabaseSecret;
	tenantDatabaseUsername: string;
}

export const customResourceProviderTokenParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/shared/customResourceProviderToken`;

export class DeploymentHelper extends Construct {
	constructor(scope: Construct, id: string, props?: DeploymentHelperConstructProperties) {
		super(scope, id);
		const namePrefix = `sif-${props.tenantId}-${props.environment}`;

		const vpc = Vpc.fromVpcAttributes(this, 'vpc', {
			vpcId: props.vpcId,
			availabilityZones: cdk.Fn.getAzs(),
			privateSubnetIds: props.privateSubnetIds
		});

		const rdsSecurityGroup = SecurityGroup.fromSecurityGroupId(this, 'RdsProxySecurityGroup', props.rdsProxySecurityGroupId);

		const lambdaToRDSProxyGroup = new SecurityGroup(this, 'Deployment Helper Lambda to RDS Proxy Connection', {
			vpc: vpc
		});

		rdsSecurityGroup.addIngressRule(lambdaToRDSProxyGroup, Port.tcp(5432), 'allow lambda connection');

		// need to do this because of postgresql limitation
		const deploymentHelperLambda = new NodejsFunction(this, 'DeploymentHelperLambda', {
			functionName: `${namePrefix}-deploymentHelper`,
			description: `Deployment Helper Lambda: Tenant ${props.tenantId}`,
			entry: path.join(__dirname, '../../../../typescript/packages/libraries/deployment-helper/src/handler.ts'),
			runtime: Runtime.NODEJS_16_X,
			tracing: Tracing.ACTIVE,
			memorySize: 256,
			logRetention: RetentionDays.ONE_WEEK,
			timeout: Duration.minutes(5),
			environment: {
				NODE_ENV: props.environment,
				TENANT_ID: props.tenantId,
				PLATFORM_USERNAME: props.platformUsername,
				ENVIRONMENT: props.environment,
				RDS_PROXY_ENDPOINT: props.rdsProxyEndpoint,
				RDS_PROXY_NAME: props.rdsProxyName,
			},
			securityGroups: [lambdaToRDSProxyGroup],
			vpc,
			vpcSubnets: {
				subnetType: SubnetType.PRIVATE_WITH_NAT
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
			depsLockFilePath: path.join(__dirname, '../../../../common/config/rush/pnpm-lock.yaml')
		});

		const accountId = cdk.Stack.of(this).account;
		const region = cdk.Stack.of(this).region;

		deploymentHelperLambda.role?.attachInlinePolicy(
			new Policy(this, 'access-to-cdk-assets', {
				statements: [
					new PolicyStatement({
						actions: ['s3:*'],
						resources: [`arn:aws:s3:::cdk-*-assets-${accountId}-${region}/*`]
					})]
			})
		);

		const deploymentHelperResourceProvider = new cr.Provider(this, 'DeploymentHelperResourceProvider', {
			onEventHandler: deploymentHelperLambda
		});

		NagSuppressions.addResourceSuppressions(deploymentHelperResourceProvider, [
			{
				id: 'AwsSolutions-IAM4',
				reason: 'This only contains the policy the create and insert log to log group.',
				appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole']
			},
			{
				id: 'AwsSolutions-IAM5',
				reason: 'This only applies to the seeder lambda defined in this construct and its versions.',
				appliesTo: ['Resource::<DeploymentHelperDeploymentHelperLambdaAF4A69AD.Arn>:*']
			},
			{
				id: 'AwsSolutions-L1',
				reason: 'The cr.Provider library is not maintained by this project.'
			}
		], true);

		new ssm.StringParameter(this, 'customResourceProviderToken', {
			parameterName: customResourceProviderTokenParameter(props.tenantId, props.environment),
			stringValue: deploymentHelperResourceProvider.serviceToken,
		});

		props.tenantSecret.grantRead(deploymentHelperLambda);

		NagSuppressions.addResourceSuppressions([deploymentHelperLambda], [
			{
				id: 'AwsSolutions-IAM4',
				reason: 'This only contains the policy the create and insert log to log group.',
				appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole']
			},
			{
				id: 'AwsSolutions-IAM4',
				reason: 'Lambda needs AWSLambdaVPCAccessExecutionRole to run inside VPC',
				appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole']
			},
			{
				id: 'AwsSolutions-IAM5',
				appliesTo: ['Resource::*'],
				reason: 'The resource condition in the IAM policy is generated by CDK, this only applies to xray:PutTelemetryRecords and xray:PutTraceSegments.'
			}
		], true);


		const rdsProxyPolicy = new PolicyStatement({
			actions: ['rds-db:connect'],
			resources: [
				`arn:aws:rds-db:${region}:${accountId}:dbuser:${Fn.select(6, Fn.split(':', props.rdsProxyArn))}/${props.tenantDatabaseUsername}`,
				`arn:aws:rds-db:${region}:${accountId}:dbuser:${Fn.select(6, Fn.split(':', props.rdsProxyArn))}/${props.platformUsername}`
			]
		});

		deploymentHelperLambda.role?.attachInlinePolicy(
			new Policy(this, 'rds-proxy-policy', {
				statements: [rdsProxyPolicy]
			})
		);

		deploymentHelperLambda.role?.attachInlinePolicy(
			new Policy(this, 'attach-secret-policy', {
				statements: [
					new PolicyStatement({
						actions: ['iam:PutRolePolicy', 'iam:DeleteRolePolicy'],
						resources: [props.rdsProxyRoleArn]
					}),
					new PolicyStatement({
						actions: ['rds:ModifyDBProxy'],
						resources: [props.rdsProxyArn]
					}),
					new PolicyStatement({
						actions: ['rds:DescribeDBProxies'],
						resources: [`arn:aws:rds:${region}:${accountId}:db-proxy:*`]
					})
				]
			})
		);
	}
}