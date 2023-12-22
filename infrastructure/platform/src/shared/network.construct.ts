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

import * as cdk from 'aws-cdk-lib';
import { Aspects, Duration, Fn, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import type { IVpc } from 'aws-cdk-lib/aws-ec2';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { CfnSubnet } from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { NagSuppressions } from 'cdk-nag';

export interface SifVpcConfig {
	vpcId: string;
	publicSubnetIds: string[],		// currently not actual public - see note below
	privateSubnetIds: string[],
	isolatedSubnetIds: string[]
}

export interface NetworkConstructProperties {
	environment: string;
	deleteBucket?: boolean;
	userVpcConfig?: SifVpcConfig;
}

export const accessLogBucketNameParameter = (environment: string) => `/sif/shared/${environment}/s3/accessLogBucketName`;
export const vpcIdParameter = (environment: string) => `/sif/shared/${environment}/network/vpcId`;
export const privateSubnetIdsParameter = (environment: string) => `/sif/shared/${environment}/network/privateSubnets`;
export const isolatedSubnetIdsParameter = (environment: string) => `/sif/shared/${environment}/network/isolatedSubnets`;

export class Network extends Construct {
	public vpc: IVpc;
	public sifVpcConfig: SifVpcConfig;

	constructor(scope: Construct, id: string, props: NetworkConstructProperties) {
		super(scope, id);

		const accessLogBucketName = `sif-access-logs-${props.environment}-${cdk.Stack.of(this).account}-${cdk.Stack.of(this).region}`;

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

		new ssm.StringParameter(this, 'accessLogBucketNameParameter', {
			parameterName: accessLogBucketNameParameter(props.environment),
			stringValue: accessLogBucket.bucketName
		});

		NagSuppressions.addResourceSuppressions(accessLogBucket, [
			{
				id: 'AwsSolutions-S1',
				reason: 'This is only the access log not the log that contains the vpc traffic information.'
			}
		]);

		if (props.userVpcConfig === undefined) {
			const vpc = new ec2.Vpc(this, 'Vpc', {
				maxAzs: 2,
				subnetConfiguration: [
					{
						// this is named public-subnet even though its private, this is to anticipate
						// future requirement where we might need access to new services that  does not have
						// vpc endpoint support
						name: 'public-subnet',
						subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
						cidrMask: 24,
					},
					{
						name: 'private-subnet',
						subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
						cidrMask: 24
					},
					{
						name: 'isolated-subnet',
						subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
						cidrMask: 24
					}
				]
			});

			// this is a fix to ensure that the cdk generated match with the previous version
			Aspects.of(vpc).add({
				visit(node) {
					if (node instanceof CfnSubnet) {
						if (node.cidrBlock == '10.0.0.0/24') {
							node.availabilityZone = Fn.select(0, Fn.getAzs());
						}

						if (node.cidrBlock == '10.0.1.0/24') {
							node.availabilityZone = Fn.select(1, Fn.getAzs());
						}

						if (node.cidrBlock == '10.0.2.0/24') {
							node.availabilityZone = Fn.select(0, Fn.getAzs());
						}

						if (node.cidrBlock == '10.0.3.0/24') {
							node.availabilityZone = Fn.select(1, Fn.getAzs());
						}

						if (node.cidrBlock == '10.0.4.0/24') {
							node.availabilityZone = Fn.select(0, Fn.getAzs());
						}

						if (node.cidrBlock == '10.0.5.0/24') {
							node.availabilityZone = Fn.select(1, Fn.getAzs());
						}
					}
				}
			});

			const bucketName = `sif-vpc-logs-${props.environment}-${cdk.Stack.of(this).account}-${cdk.Stack.of(this).region}`;

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
				service: ec2.GatewayVpcEndpointAwsService.DYNAMODB,
				subnets: [{
					subnetGroupName: 'private-subnet'
				}]
			});

			vpc.addGatewayEndpoint('s3Endpoint', {
				service: ec2.GatewayVpcEndpointAwsService.S3,
				subnets: [
					{
						subnetGroupName: 'private-subnet'
					},
					// we need s3 endpoint attached to isolated subnet because we're using the s3_import feature of RDS
					// and that's where RDS id deployed.
					{
						subnetGroupName: 'isolated-subnet'
					}]
			});

			vpc.addInterfaceEndpoint('kmsEndpoint', {
				service: ec2.InterfaceVpcEndpointAwsService.KMS,
				subnets: {
					subnetGroupName: 'private-subnet'
				}
			});

			vpc.addInterfaceEndpoint('athenaEndpoint', {
				service: ec2.InterfaceVpcEndpointAwsService.ATHENA,
				subnets: {
					subnetGroupName: 'private-subnet'
				}
			});

			vpc.addInterfaceEndpoint('cloudformationEndpoint', {
				service: ec2.InterfaceVpcEndpointAwsService.CLOUDFORMATION,
				subnets: {
					subnetGroupName: 'private-subnet'
				}
			});

			vpc.addInterfaceEndpoint('eventBridgeEndpoint', {
				service: ec2.InterfaceVpcEndpointAwsService.EVENTBRIDGE,
				subnets: {
					subnetGroupName: 'private-subnet'
				}
			});

			vpc.addInterfaceEndpoint('sqsEndpoint', {
				service: ec2.InterfaceVpcEndpointAwsService.SQS,
				subnets: {
					subnetGroupName: 'private-subnet'
				}
			});

			vpc.addInterfaceEndpoint('xrayEndpoint', {
				service: ec2.InterfaceVpcEndpointAwsService.XRAY,
				subnets: {
					subnetGroupName: 'private-subnet'
				}
			});

			vpc.addInterfaceEndpoint('secretsManagerEndpoint', {
				service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
				subnets: {
					subnetGroupName: 'private-subnet'
				}
			});

			vpc.addInterfaceEndpoint('ecsEndpoint', {
				service: ec2.InterfaceVpcEndpointAwsService.ECS,
				subnets: {
					subnetGroupName: 'private-subnet'
				}
			});

			vpc.addInterfaceEndpoint('cloudwatchLogsEndpoint', {
				service: ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
				subnets: {
					subnetGroupName: 'private-subnet'
				}
			});

			vpc.addInterfaceEndpoint('ecrEndpoint', {
				service: ec2.InterfaceVpcEndpointAwsService.ECR,
				subnets: {
					subnetGroupName: 'private-subnet'
				}
			});

			vpc.addInterfaceEndpoint('ecrDockerEndpoint', {
				service: ec2.InterfaceVpcEndpointAwsService.ECR_DOCKER,
				subnets: {
					subnetGroupName: 'private-subnet'
				}
			});

			vpc.addInterfaceEndpoint('ssmEndpoint', {
				service: ec2.InterfaceVpcEndpointAwsService.SSM,
				subnets: {
					subnetGroupName: 'private-subnet'
				}
			});

			vpc.addInterfaceEndpoint('rdsEndpoint', {
				service: ec2.InterfaceVpcEndpointAwsService.RDS, subnets: {
					subnetGroupName: 'private-subnet'
				}
			});

			vpc.addInterfaceEndpoint('glueEndpoint', {
				service: ec2.InterfaceVpcEndpointAwsService.GLUE,
				subnets: {
					subnetGroupName: 'private-subnet'
				}
			});

			vpc.addInterfaceEndpoint('cloudWatchEndpoint', {
				service: ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH,
				subnets: {
					subnetGroupName: 'private-subnet'
				}
			});

			vpc.addInterfaceEndpoint('lambdaEndpoint', {
				service: ec2.InterfaceVpcEndpointAwsService.LAMBDA,
				subnets: {
					subnetGroupName: 'private-subnet'
				}
			});

			vpc.addInterfaceEndpoint('stepFunctionEndpoint', {
				service: ec2.InterfaceVpcEndpointAwsService.STEP_FUNCTIONS,
				subnets: {
					subnetGroupName: 'private-subnet',
				}
			});

			this.vpc = vpc;

			new ssm.StringParameter(this, 'vpcIdParameter', {
				parameterName: vpcIdParameter(props.environment),
				stringValue: this.vpc.vpcId
			});

			new ssm.StringParameter(this, 'privateSubnetIdsParameter', {
				parameterName: privateSubnetIdsParameter(props.environment),
				description: 'Private subnet IDs used for SIF.',
				stringValue: this.vpc.selectSubnets({ subnetGroupName: 'private-subnet' }).subnets.map((o) => o.subnetId).join(',')
			});

			new ssm.StringParameter(this, 'isolatedSubnetIdsParameter', {
				parameterName: isolatedSubnetIdsParameter(props.environment),
				description: 'Isolated subnet IDs used for SIF.',
				stringValue: this.vpc.selectSubnets({ subnetGroupName: 'isolated-subnet' }).subnets.map((o) => o.subnetId).join(',')
			});

			this.sifVpcConfig = {
				vpcId: this.vpc.vpcId,
				publicSubnetIds: this.vpc.selectSubnets({ subnetGroupName: 'public-subnet' }).subnets.map((o) => o.subnetId),
				privateSubnetIds: this.vpc.selectSubnets({ subnetGroupName: 'private-subnet' }).subnets.map((o) => o.subnetId),
				isolatedSubnetIds: this.vpc.selectSubnets({ subnetGroupName: 'isolated-subnet' }).subnets.map((o) => o.subnetId)
			};

		} else {
			// user provided a VPC, use that
			this.vpc = ec2.Vpc.fromLookup(this, 'vpc', { vpcId: props.userVpcConfig?.vpcId });

			new ssm.StringParameter(this, 'vpcIdParameter', {
				parameterName: vpcIdParameter(props.environment),
				stringValue: this.vpc.vpcId
			});

			new ssm.StringParameter(this, 'privateSubnetIdsParameter', {
				parameterName: privateSubnetIdsParameter(props.environment),
				description: 'Private subnet IDs used for SIF.',
				stringValue: props.userVpcConfig.privateSubnetIds.join(',')
			});

			new ssm.StringParameter(this, 'isolatedSubnetIdsParameter', {
				parameterName: isolatedSubnetIdsParameter(props.environment),
				description: 'Isolated subnet IDs used for SIF.',
				stringValue: props.userVpcConfig.isolatedSubnetIds.join(',')
			});

			// public subnets are not used at the moment and are interchangeable with private subnets (see note above)
			// internally SIF keeps 3 subnet groups to be compatible with deployments before removing public subnets
			// for now pass on the private subnet IDs provided by the user
			this.sifVpcConfig = {
				vpcId: this.vpc.vpcId,
				publicSubnetIds: props.userVpcConfig.privateSubnetIds,		// see comment above - use private subnets as public are not required
				privateSubnetIds: props.userVpcConfig.privateSubnetIds,
				isolatedSubnetIds: props.userVpcConfig.isolatedSubnetIds
			};
		}
	}
}
