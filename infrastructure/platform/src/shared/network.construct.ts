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
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as cdk from 'aws-cdk-lib';
import type { IVpc } from 'aws-cdk-lib/aws-ec2';
import { NagSuppressions } from 'cdk-nag';

export interface NetworkConstructProperties {
	environment: string;
	deleteBucket?: boolean;
}

export const accessLogBucketNameParameter = (environment: string) => `/sif/shared/${environment}/s3/accessLogBucketName`;
export const vpcIdParameter = (environment: string) => `/sif/shared/${environment}/network/vpcId`;
export const privateSubnetIdsParameter = (environment: string) => `/sif/shared/${environment}/network/privateSubnets`;
export const isolatedSubnetIdsParameter = (environment: string) => `/sif/shared/${environment}/network/isolatedSubnets`;

export class Network extends Construct {
	public vpc: IVpc;

	constructor(scope: Construct, id: string, props?: NetworkConstructProperties) {
		super(scope, id);

		// Define subnets.
		const vpc = new ec2.Vpc(this, 'Vpc', {
			subnetConfiguration: [
				{
					name: 'public-subnet',
					subnetType: ec2.SubnetType.PUBLIC,
					cidrMask: 24
				},
				{
					name: 'private-subnet',
					subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
					cidrMask: 24
				},
				{
					name: 'isolated-subnet',
					subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
					cidrMask: 24
				}
			]
		});

		const accessLogBucketName = `sif-access-logs-${props.environment}-${cdk.Stack.of(this).account}-${cdk.Stack.of(this).region}`;

		const bucketName = `sif-vpc-logs-${props.environment}-${cdk.Stack.of(this).account}-${cdk.Stack.of(this).region}`;

		const accessLogBucket = new s3.Bucket(this, 's3AccessLog', {
			bucketName: accessLogBucketName,
			encryption: s3.BucketEncryption.S3_MANAGED,
			intelligentTieringConfigurations: [
				{
					name: 'archive',
					archiveAccessTierTime: Duration.days(90),
					deepArchiveAccessTierTime: Duration.days(180)
				}
			],
			blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
			enforceSSL: true,
			autoDeleteObjects: props.deleteBucket,
			versioned: !props.deleteBucket,
			removalPolicy: props.deleteBucket ? RemovalPolicy.DESTROY : RemovalPolicy.RETAIN,
		});

		NagSuppressions.addResourceSuppressions(accessLogBucket, [
			{
				id: 'AwsSolutions-S1',
				reason: 'This is only the access log not the log that contains the vpc traffic information.'
			}
		]);

		// Create log bucket.
		const s3LogBucket = new s3.Bucket(this, 's3LogBucket', {
			bucketName,
			encryption: s3.BucketEncryption.S3_MANAGED,
			serverAccessLogsBucket: accessLogBucket,
			serverAccessLogsPrefix: `vpc-logs/`,
			intelligentTieringConfigurations: [
				{
					name: 'archive',
					archiveAccessTierTime: Duration.days(90),
					deepArchiveAccessTierTime: Duration.days(180)
				}
			],
			blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
			enforceSSL: true,
			autoDeleteObjects: props.deleteBucket,
			removalPolicy: props.deleteBucket ? RemovalPolicy.DESTROY : RemovalPolicy.RETAIN,
			versioned: !props.deleteBucket,

		});

		const flowLogName = `sif-${props.environment}-flowlogs`;

		// Add flow logs.
		const vpcFlowLogRole = new iam.Role(this, 'vpcFlowLogRole', {
			assumedBy: new iam.ServicePrincipal('vpc-flow-logs.amazonaws.com')
		});

		s3LogBucket.grantWrite(vpcFlowLogRole, `${flowLogName}/*`);

		NagSuppressions.addResourceSuppressions(vpcFlowLogRole, [
			{
				id: 'AwsSolutions-IAM5',
				reason: 'The role an only modify to a specific flowlog.',
				appliesTo: ['Action::s3:Abort*', 'Action::s3:DeleteObject*', `Resource::<Networks3LogBucketD8B712E9.Arn>/sif-${props.environment}-flowlogs/*`]
			}
		], true);

		// Create flow logs to S3.
		new ec2.FlowLog(this, 'sharedVpcLowLogs', {
			destination: ec2.FlowLogDestination.toS3(s3LogBucket, `${flowLogName}/`),
			trafficType: ec2.FlowLogTrafficType.ALL,
			flowLogName: flowLogName,
			resourceType: ec2.FlowLogResourceType.fromVpc(vpc)
		});

		// Create VPC endpoints for common services.
		vpc.addGatewayEndpoint('dynamoDBEndpoint', {
			service: ec2.GatewayVpcEndpointAwsService.DYNAMODB
		});

		vpc.addGatewayEndpoint('s3Endpoint', {
			service: ec2.GatewayVpcEndpointAwsService.S3
		});

		vpc.addInterfaceEndpoint('kmsEndpoint', {
			service: ec2.InterfaceVpcEndpointAwsService.KMS
		});

		vpc.addInterfaceEndpoint('stepFunctionEndpoint', {
			service: ec2.InterfaceVpcEndpointAwsService.STEP_FUNCTIONS
		});

		new ssm.StringParameter(this, 'vpcIdParameter', {
			parameterName: vpcIdParameter(props.environment),
			stringValue: vpc.vpcId
		});

		new ssm.StringParameter(this, 'privateSubnetIdsParameter', {
			parameterName: privateSubnetIdsParameter(props.environment),
			stringValue: vpc.privateSubnets.map((o) => o.subnetId).join(',')
		});

		new ssm.StringParameter(this, 'isolatedSubnetIdsParameter', {
			parameterName: isolatedSubnetIdsParameter(props.environment),
			stringValue: vpc.isolatedSubnets.map((o) => o.subnetId).join(',')
		});

		new ssm.StringParameter(this, 'accessLogBucketNameParameter', {
			parameterName: accessLogBucketNameParameter(props.environment),
			stringValue: accessLogBucket.bucketName
		});

		this.vpc = vpc;
	}
}
