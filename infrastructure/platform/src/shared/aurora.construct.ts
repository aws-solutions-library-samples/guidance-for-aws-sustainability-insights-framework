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
import { Aspects, Duration, RemovalPolicy, CustomResource } from 'aws-cdk-lib';
import { InstanceType, IVpc, Port, SecurityGroup, SubnetType } from 'aws-cdk-lib/aws-ec2';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { DatabaseClusterEngine, SubnetGroup, DatabaseCluster, ParameterGroup, CfnDBProxyEndpoint, CfnDBCluster, AuroraPostgresEngineVersion } from 'aws-cdk-lib/aws-rds';
import { Secret, HostedRotation } from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { NagSuppressions } from 'cdk-nag';
import { Effect, Policy, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import path from 'path';
import type { BundlingOptions } from 'aws-cdk-lib/aws-lambda-nodejs';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime, Tracing } from 'aws-cdk-lib/aws-lambda';
import { Provider } from 'aws-cdk-lib/custom-resources';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


export interface AuroraDatabaseConstructProperties {
	vpc: IVpc;
	environment: string;
	minClusterCapacity: number;
	maxClusterCapacity: number;
	clusterDeletionProtection: boolean;
}

export const rdsClusterWriterEndpoint = (environment: string) => `/sif/shared/${environment}/aurora/rdsClusterWriterEndpoint`;
export const rdsProxyWriterEndpointParameter = (environment: string) => `/sif/shared/${environment}/aurora/rdsWriterEndpoint`;
export const rdsProxyReaderEndpointParameter = (environment: string) => `/sif/shared/${environment}/aurora/rdsReaderEndpoint`;
export const rdsSecretNameParameter = (environment: string) => `/sif/shared/${environment}/aurora/rdsSecretName`;
export const rdsProxySecurityGroupParameter = (environment: string) => `/sif/shared/${environment}/aurora/rdsProxySecurityGroup`;
export const rdsProxyArnParameter = (environment: string) => `/sif/shared/${environment}/aurora/rdsProxyArn`;
export const rdsProxyRoleArnParameter = (environment: string) => `/sif/shared/${environment}/aurora/rdsProxyRoleArn`;
export const rdsProxyNameParameter = (environment: string) => `/sif/shared/${environment}/aurora/rdsProxyName`;
export const platformUsernameParameter = (environment: string) => `/sif/shared/${environment}/aurora/platformUsername`;

export class AuroraDatabase extends Construct {
	instanceName: string;
	auroraSecurityGroup: SecurityGroup;

	constructor(scope: Construct, id: string, props: AuroraDatabaseConstructProperties) {
		super(scope, id);

		this.instanceName = `sif-${props.environment}`;
		const databaseUsername = 'clusteradmin';
		const clusterName = `sif-${props.environment}-cluster`;

		const commonBundlingOptions: BundlingOptions = {
			minify: true,
			format: OutputFormat.ESM,
			target: 'node16.15',
			sourceMap: false,
			sourcesContent: false,
			banner: 'import { createRequire } from \'module\';const require = createRequire(import.meta.url);import { fileURLToPath } from \'url\';import { dirname } from \'path\';const __filename = fileURLToPath(import.meta.url);const __dirname = dirname(__filename);',
			externalModules: ['aws-sdk']
		};

		const depsLockFilePath = path.join(__dirname, '../../../../common/config/rush/pnpm-lock.yaml');

		const customResourceLambda = new NodejsFunction(this, 'ServiceLinkedRoleSeederLambda', {
			functionName: `sif-${props.environment}-roleSeeder`,
			description: `create service linked role if needed: Tenant ${props.environment}`,
			entry: path.join(__dirname, './customResources/serviceLinkedRole.customResource.ts'),
			runtime: Runtime.NODEJS_16_X,
			tracing: Tracing.ACTIVE,
			memorySize: 256,
			logRetention: RetentionDays.ONE_WEEK,
			timeout: Duration.minutes(2),
			bundling: commonBundlingOptions,
			environment: {},
			depsLockFilePath
		});

		NagSuppressions.addResourceSuppressions(customResourceLambda, [
			{
				id: 'AwsSolutions-L1',
				reason: 'NODEJS_16_X to NODEJS_18_X upgrade not ready.',
			},
		]);

		const iamPolicy = new Policy(this, 'iam-policy', {
			statements: [new PolicyStatement({
				sid: 'CreateSLRs',
				actions: ['iam:CreateServiceLinkedRole'],
				resources: [
					`arn:aws:iam::*:role/aws-service-role/rds.amazonaws.com/AWSServiceRoleForRDS*`
				],
				conditions: {
					'StringLike': {
						'iam:AWSServiceName': 'rds.amazonaws.com'
					}
				}
			}), new PolicyStatement({
				sid: 'AttachPolicy',
				actions: [
					'iam:AttachRolePolicy',
					'iam:PutRolePolicy'],
				resources: [
					`arn:aws:iam::*:role/aws-service-role/rds.amazonaws.com/AWSServiceRoleForRDS*`,
				]
			})]
		});

		NagSuppressions.addResourceSuppressions(iamPolicy, [
			{
				id: 'AwsSolutions-IAM5',
				reason: 'This policy only allow the lambda to create RDS service linked role.',
			},
		]);

		customResourceLambda.role?.attachInlinePolicy(
			iamPolicy
		);

		NagSuppressions.addResourceSuppressions(customResourceLambda, [
			{
				id: 'AwsSolutions-IAM4',
				reason: 'This only contains the policy the create and insert log to log group.',
				appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole']
			},
			{
				id: 'AwsSolutions-IAM5',
				appliesTo: ['Resource::*'],
				reason: 'The resource condition in the IAM policy is generated by CDK, this only applies to xray:PutTelemetryRecords and xray:PutTraceSegments.'
			}
		], true);


		const customResourceProvider = new Provider(this, 'CustomResourceProvider', {
			onEventHandler: customResourceLambda
		});

		NagSuppressions.addResourceSuppressions(customResourceProvider, [
			{
				id: 'AwsSolutions-IAM4',
				reason: 'This only contains the policy the create and insert log to log group.',
				appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole']
			},
			{
				id: 'AwsSolutions-IAM5',
				reason: 'This only applies to the seeder lambda defined in this construct and its versions.',
				appliesTo: ['Resource::<AuroraServiceLinkedRoleSeederLambdaF2A40AE8.Arn>:*']
			},
			{
				id: 'AwsSolutions-L1',
				reason: 'The cr.Provider library is not maintained by this project.'
			}
		], true);

		const customResource = new CustomResource(this, 'CustomResourceRoleSeeder', {
			serviceToken: customResourceProvider.serviceToken,
			properties: {
				uniqueToken: Date.now()
			}
		});

		customResource.node.addDependency(iamPolicy);

		this.auroraSecurityGroup = new SecurityGroup(this, id.concat(`${this.instanceName}-sg`), {
			vpc: props.vpc,
			description: `${this.instanceName}-instance-sg`,
			securityGroupName: `${this.instanceName}-instance-sg`,
			allowAllOutbound: true
		});

		const databaseCredentialsSecret = new Secret(this, 'DBCredentialsSecret', {
			secretName: `${this.instanceName}-credentials`,
			generateSecretString: {
				secretStringTemplate: JSON.stringify({
					username: databaseUsername
				}),
				excludePunctuation: true,
				includeSpace: false,
				generateStringKey: 'password'
			}
		});

		databaseCredentialsSecret.addRotationSchedule('RotationSchedule', {
			hostedRotation: HostedRotation.postgreSqlSingleUser({
				functionName: `sif-${props.environment}-platform-secret-rotation`
			})
		});

		new ssm.StringParameter(this, 'rdsSecretName', {
			parameterName: rdsSecretNameParameter(props.environment),
			stringValue: databaseCredentialsSecret.secretName
		});

		/** Version "8.0.postgresql_aurora.3.01.0". */
		const dbEngine = DatabaseClusterEngine.auroraPostgres({ version: AuroraPostgresEngineVersion.VER_14_4 });

		/**
		 let's suppose you need to create a trigger on your database,
		 this custom parameter group it's responsible to perform this with the following parameter log_bin_trust_function_creators,
		 because the default parameter group is not editable
		 */
		const parameterGroupForInstance = new ParameterGroup(this, `${this.instanceName}-${dbEngine.engineVersion?.fullVersion}`, {
			engine: dbEngine,
			description: `Aurora RDS Instance Parameter Group for database ${this.instanceName}`,
			parameters: {}
		});

		const subnetGroup = new SubnetGroup(this, 'aurora-rds-subnet-group', {
			description: `Aurora RDS Subnet Group for database ${this.instanceName}`,
			subnetGroupName: `sif-${props.environment}-aurora-rds-subnet-group`,
			vpc: props.vpc,
			removalPolicy: RemovalPolicy.DESTROY,
			vpcSubnets: {
				subnets: props.vpc.isolatedSubnets
			}
		});

		const databaseCluster = new DatabaseCluster(this, clusterName, {
			engine: dbEngine,
			storageEncrypted: true,
			// This is the only valid option for postgresql
			cloudwatchLogsExports: ['postgresql'],
			instanceProps: {
				instanceType: new InstanceType('serverless'),
				vpc: props.vpc,
				vpcSubnets: {
					subnetType: SubnetType.PRIVATE_ISOLATED
				},
				securityGroups: [this.auroraSecurityGroup],
				parameterGroup: parameterGroupForInstance
			},
			backup: {
				retention: Duration.days(RetentionDays.ONE_WEEK),
				preferredWindow: '03:00-04:00'
			},
			credentials: {
				username: databaseUsername,
				password: databaseCredentialsSecret.secretValueFromJson('password')
			},
			// something wrong with the construct where it always accepts parameter as string
			deletionProtection: props.clusterDeletionProtection,
			instances: 1,
			cloudwatchLogsRetention: RetentionDays.ONE_WEEK,
			iamAuthentication: false,
			clusterIdentifier: `sif-${props.environment}-aurora-cluster`,
			subnetGroup: subnetGroup
		});

		databaseCluster.node.addDependency(customResource);

		if (!props.clusterDeletionProtection) {
			NagSuppressions.addResourceSuppressions(databaseCluster, [
				{
					id: 'AwsSolutions-RDS10',
					reason: 'Cluster deletion protection is a configurable value (it\'s set to true by default).',
				}
			], true);
		}

		new ssm.StringParameter(this, 'rdsClusterWriterEndpoint', {
			parameterName: rdsClusterWriterEndpoint(props.environment),
			stringValue: databaseCluster.clusterEndpoint.hostname
		});

		// this is temporary workaround cause cdk does not have support for
		// serverlessV2ScalingConfiguration yet
		Aspects.of(databaseCluster).add({
			visit(node) {
				if (node instanceof CfnDBCluster) {
					node.serverlessV2ScalingConfiguration = {
						minCapacity: props.minClusterCapacity,
						maxCapacity: props.maxClusterCapacity
					};
				}
			}
		});

		NagSuppressions.addResourceSuppressions(databaseCluster, [
			{
				id: 'AwsSolutions-RDS6',
				reason: 'All connection to RDS is through the RDS proxy (IAM database authentication is enabled for this), RDS proxy needs to connect to RDS using database auth.'
			}
		]);

		this.auroraSecurityGroup.addIngressRule(this.auroraSecurityGroup, Port.tcp(5432), 'allow db connection');

		new ssm.StringParameter(this, 'rdsProxySecurityGroupParameter', {
			parameterName: rdsProxySecurityGroupParameter(props.environment),
			stringValue: this.auroraSecurityGroup.securityGroupId
		});

		const rdsProxyRole = new Role(this, 'RdsProxyRole', { assumedBy: new ServicePrincipal('rds.amazonaws.com') });

		rdsProxyRole.addToPolicy(new PolicyStatement({
			sid: 's3',
			effect: Effect.ALLOW,
			actions: [
				'secretsmanager:DescribeSecret',
				'secretsmanager:GetSecretValue'],
			resources: [databaseCredentialsSecret.secretArn]
		}));

		new ssm.StringParameter(this, 'rdsProxyRoleArnParameter', {
			parameterName: rdsProxyRoleArnParameter(props.environment),
			stringValue: rdsProxyRole.roleArn
		});

		const proxy = databaseCluster.addProxy('RdsProxy', {
			secrets: [databaseCredentialsSecret],
			debugLogging: true,
			vpc: props.vpc,
			securityGroups: [this.auroraSecurityGroup],
			dbProxyName: `sif-${props.environment}-rds-proxy`,
			iamAuth: true,
			role: rdsProxyRole
		});

		const rdsReaderEndpoint = new CfnDBProxyEndpoint(this, 'RdsReaderEndpoint', {
			dbProxyEndpointName: `sif-${props.environment}-rds-reader-endpoint`,
			dbProxyName: proxy.dbProxyName,
			targetRole: 'READ_ONLY',
			vpcSecurityGroupIds: [this.auroraSecurityGroup.securityGroupId],
			vpcSubnetIds: props.vpc.publicSubnets.map((o) => o.subnetId)
		});

		new ssm.StringParameter(this, 'proxyWriterEndpointParameter', {
			parameterName: rdsProxyWriterEndpointParameter(props.environment),
			stringValue: proxy.endpoint
		});

		new ssm.StringParameter(this, 'proxyReaderEndpointParameter', {
			parameterName: rdsProxyReaderEndpointParameter(props.environment),
			stringValue: rdsReaderEndpoint.attrEndpoint
		});

		new ssm.StringParameter(this, 'proxyArnParameter', {
			parameterName: rdsProxyArnParameter(props.environment),
			stringValue: proxy.dbProxyArn
		});

		new ssm.StringParameter(this, 'proxyNameParameter', {
			parameterName: rdsProxyNameParameter(props.environment),
			stringValue: proxy.dbProxyName
		});

		new ssm.StringParameter(this, 'platformUsernameParameter', {
			parameterName: platformUsernameParameter(props.environment),
			stringValue: databaseUsername
		});
	}
}
