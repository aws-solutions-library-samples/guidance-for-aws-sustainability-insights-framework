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
import { CfnParameter, Fn, Stack, StackProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import { NagSuppressions } from 'cdk-nag';
import { SSM, auditLogDepositorDatabaseNameParameter, auditLogDepositorTableNameParameter } from './ssm.construct.js';
import { Cognito } from './cognito.construct.js';
import { S3 } from './s3.construct.js';
import { Bus } from './eventbus.construct.js';
import { AuroraSeeder } from './auroraSeeder.construct.js';
import { Kms } from './kms.construct.js';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import * as cdk from 'aws-cdk-lib';
import { DeploymentHelper } from './deploymentHelper.construct.js';

export const accessLogBucketNameParameter = (environment: string) => `/sif/shared/${environment}/s3/accessLogBucketName`;
export const rdsProxyWriterEndpointParameter = (environment: string) => `/sif/shared/${environment}/aurora/rdsWriterEndpoint`;
export const platformUsernameParameter = (environment: string) => `/sif/shared/${environment}/aurora/platformUsername`;
export const vpcIdParameter = (environment: string) => `/sif/shared/${environment}/network/vpcId`;
export const privateSubnetIdsParameter = (environment: string) => `/sif/shared/${environment}/network/privateSubnets`;
export const rdsProxySecurityGroupParameter = (environment: string) => `/sif/shared/${environment}/aurora/rdsProxySecurityGroup`;
export const rdsProxyArnParameter = (environment: string) => `/sif/shared/${environment}/aurora/rdsProxyArn`;
export const rdsProxyNameParameter = (environment: string) => `/sif/shared/${environment}/aurora/rdsProxyName`;
export const rdsProxyRoleArnParameter = (environment: string) => `/sif/shared/${environment}/aurora/rdsProxyRoleArn`;
export const acquireLockSqsQueueArnParameter = (environment: string) => `/sif/shared/${environment}/semaphore/acquireLockSqsQueueArn`;
export const releaseLockSqsQueueArnParameter = (environment: string) => `/sif/shared/${environment}/semaphore/releaseLockSqsQueueArn`;
export const environmentEventBusNameParameter = (environment: string) => `/sif/shared/${environment}/semaphore/eventBusName`;
export const ecsTaskExecutionRoleArnParameter = (environment: string) => `/sif/shared/${environment}/ecs/taskExecutionRoleArn`;
export const ecsClusterArnParameter = (environment: string) => `/sif/shared/${environment}/ecs/clusterArn`;
export const ecsTaskDefinitionArnParameter = (environment: string) => `/sif/shared/${environment}/ecs/taskDefinitionArn`;

export type SharedTenantStackProperties = StackProps & {
	tenantId: string;
	environment: string;
	administratorEmail: string;
	deleteBucket?: boolean;
	userPoolEmail: {
		fromEmail: string;
		fromName: string;
		replyTo: string;
		sesVerifiedDomain: string;
	};
	caCert: string;
};

export class SharedTenantInfrastructureStack extends Stack {
	constructor(scope: Construct, id: string, props: SharedTenantStackProperties) {
		super(scope, id, props);

		// validation
		if (props.tenantId === undefined) {
			throw new Error('tenantId is required');
		}
		if (props.environment === undefined) {
			throw new Error('environment is required');
		}
		if (props.administratorEmail === undefined) {
			throw new Error('administratorEmail is required');
		}

		const ssmConstruct = new SSM(this, 'ApiFunctionNameParameters', {
			tenantId: props.tenantId,
			environment: props.environment
		});

		new Bus(this, 'EventBus', {
			tenantId: props.tenantId,
			environment: props.environment
		});

		new Kms(this, 'EncryptionKey', {
			tenantId: props.tenantId,
			environment: props.environment
		});

		const rdsProxyRoleArn = StringParameter.fromStringParameterAttributes(this, 'rdsProxyRoleArn', {
			parameterName: rdsProxyRoleArnParameter(props.environment),
			simpleName: false
		}).stringValue;

		const accessLogBucketName = StringParameter.fromStringParameterAttributes(this, 'accessLogBucketName', {
			parameterName: accessLogBucketNameParameter(props.environment),
			simpleName: false
		}).stringValue;

		const vpcId = StringParameter.fromStringParameterAttributes(this, 'vpcId', {
			parameterName: vpcIdParameter(props.environment),
			simpleName: false,
		}).stringValue;

		const rdsProxySecurityGroupId = StringParameter.fromStringParameterAttributes(this, 'rdsProxySecurityGroupId', {
			parameterName: rdsProxySecurityGroupParameter(props.environment),
			simpleName: false,
		}).stringValue;

		const subnetIdList = new CfnParameter(this, 'privateSubnetIds', {
			type: 'AWS::SSM::Parameter::Value<String>',
			default: privateSubnetIdsParameter(props.environment),
		});

		const rdsProxyEndpoint = StringParameter.fromStringParameterAttributes(this, 'rdsProxyEndpoint', {
			parameterName: rdsProxyWriterEndpointParameter(props.environment),
			simpleName: false,
		}).stringValue;

		const rdsProxyArn = StringParameter.fromStringParameterAttributes(this, 'rdsProxyArn', {
			parameterName: rdsProxyArnParameter(props.environment),
			simpleName: false,
		}).stringValue;

		const rdsProxyName = StringParameter.fromStringParameterAttributes(this, 'rdsProxyName', {
			parameterName: rdsProxyNameParameter(props.environment),
			simpleName: false,
		}).stringValue;

		const platformUsername = StringParameter.fromStringParameterAttributes(this, 'platformUsername', {
			parameterName: platformUsernameParameter(props.environment),
			simpleName: false,
		}).stringValue;

		const ecsClusterArn = StringParameter.fromStringParameterAttributes(this, 'ecsClusterArn', {
			parameterName: ecsClusterArnParameter(props.environment),
			simpleName: false,
		}).stringValue;

		const ecsTaskDefinitionArn = StringParameter.fromStringParameterAttributes(this, 'ecsTaskDefinitionArn', {
			parameterName: ecsTaskDefinitionArnParameter(props.environment),
			simpleName: false,
		}).stringValue;

		const ecsTaskExecutionRoleArn = StringParameter.fromStringParameterAttributes(this, 'ecsTaskExecutionRoleArn', {
			parameterName: ecsTaskExecutionRoleArnParameter(props.environment),
			simpleName: false,
		}).stringValue;

		const auditLogsTableName = StringParameter.fromStringParameterAttributes(this, 'AuditLogsTableName', {
			parameterName: auditLogDepositorTableNameParameter(props.tenantId, props.environment),
			simpleName: false,
		}).stringValue;

		const auditLogsDatabaseName = StringParameter.fromStringParameterAttributes(this, 'AuditLogsDatabaseName', {
			parameterName: auditLogDepositorDatabaseNameParameter(props.tenantId, props.environment),
			simpleName: false,
		}).stringValue;


		const auroraSeeder = new AuroraSeeder(this, 'AuroraSeeder', {
			tenantId: props.tenantId,
			environment: props.environment,
		});

		new DeploymentHelper(this, 'DeploymentHelper', {
			rdsProxyEndpoint,
			platformUsername,
			rdsProxySecurityGroupId,
			vpcId,
			rdsProxyArn,
			rdsProxyName,
			rdsProxyRoleArn,
			tenantId: props.tenantId,
			environment: props.environment,
			privateSubnetIds: Fn.split(',', subnetIdList.valueAsString),
			tenantSecret: auroraSeeder.tenantSecret,
			tenantDatabaseUsername: auroraSeeder.tenantDatabaseUsername,
			pipelineApiFunctionNameParameter: ssmConstruct.pipelineApiFunctionNameParameter,
			ecsClusterArn,
			ecsTaskDefinitionArn,
			ecsTaskExecutionRoleArn,
			auditLogsDatabaseName,
			auditLogsTableName
		});

		NagSuppressions.addResourceSuppressionsByPath(this, [
				'/SharedTenant/LogRetentionaae0aa3c5b4d4f87b02d85b201efdd8a/ServiceRole/Resource'
			],
			[
				{
					id: 'AwsSolutions-IAM4',
					appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'],
					reason: 'This policy attached to the role is generated by CDK.'

				},
				{
					id: 'AwsSolutions-IAM5',
					appliesTo: ['Resource::*'],
					reason: 'The resource condition in the IAM policy is generated by CDK, this only applies to logs:DeleteRetentionPolicy and logs:PutRetentionPolicy actions.'

				}],
			true);

		const accountId = cdk.Stack.of(this).account;
		const region = cdk.Stack.of(this).region;

		NagSuppressions.addResourceSuppressionsByPath(this, ['/SharedTenant/DeploymentHelper/attach-secret-policy/Resource'], [
			{
				id: 'AwsSolutions-IAM5',
				reason: 'The lambda need be able to list all the RDS proxies.',
				appliesTo: [`Resource::arn:aws:rds:${region}:${accountId}:db-proxy:*`]
			}
		], true);

		NagSuppressions.addResourceSuppressionsByPath(this, ['/SharedTenant/DeploymentHelper/lambda-access-to-cdk-assets/Resource', '/SharedTenant/DeploymentHelper/ecs-access-to-cdk-assets/Resource'], [
			{
				id: 'AwsSolutions-IAM5',
				reason: 'The lambda need to download assets from the cdk bucket.',
				appliesTo: [`Resource::arn:aws:s3:::cdk-*-assets-${accountId}-${region}/*`, 'Action::s3:*']
			}
		], true);

		new Cognito(this, 'Cognito', {
			tenantId: props.tenantId,
			environment: props.environment,
			administratorEmail: props.administratorEmail,
			userPoolEmail: props.userPoolEmail,
		});

		new S3(this, 'S3', {
			tenantId: props.tenantId,
			environment: props.environment,
			deleteBucket: props.deleteBucket,
			accessLogBucketName
		});

		NagSuppressions.addResourceSuppressionsByPath(this, [
				'/SharedTenant/BucketNotificationsHandler050a0587b7544547bf325f094a3db834/Role/Resource'
			],
			[
				{
					id: 'AwsSolutions-IAM4',
					appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'],
					reason: 'This lambda policy and its associated role are generated by CDK.'

				},
				{
					id: 'AwsSolutions-IAM5',
					appliesTo: ['Resource::*'],
					reason: 'This resource condition in IAM policy is generated by CDK and only applied to s3:PutBucketNotification action'

				}],
			true);
	}
}
