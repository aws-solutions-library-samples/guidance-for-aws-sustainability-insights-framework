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
import { InstanceType, IVpc, Port, SecurityGroup, SubnetFilter } from 'aws-cdk-lib/aws-ec2';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { DatabaseClusterEngine, SubnetGroup, DatabaseCluster, ParameterGroup, CfnDBProxyEndpoint, CfnDBCluster, AuroraPostgresEngineVersion } from 'aws-cdk-lib/aws-rds';
import { Secret, HostedRotation } from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { NagSuppressions } from 'cdk-nag';
import { Effect, Policy, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import path from 'path';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime, Tracing } from 'aws-cdk-lib/aws-lambda';
import { Provider } from 'aws-cdk-lib/custom-resources';
import { fileURLToPath } from 'url';
import { getLambdaArchitecture } from '@sif/cdk-common';
import * as cdk from 'aws-cdk-lib';
import type { SifVpcConfig } from './network.construct';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


export interface AuroraDatabaseConstructProperties {
	vpc: IVpc;
	sifVpcConfig: SifVpcConfig;
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
export const auroraClusterStatusParameter = (environment: string) => `/sif/shared/${environment}/aurora/status`;

export class AuroraDatabase extends Construct {
	instanceName: string;
	auroraSecurityGroup: SecurityGroup;
	clusterIdentifier: string;

	constructor(scope: Construct, id: string, props: AuroraDatabaseConstructProperties) {
		super(scope, id);

		this.instanceName = `sif-${props.environment}`;
		const databaseUsername = 'clusteradmin';
		const clusterName = `sif-${props.environment}-cluster`;

		const commonLambdaConfiguration = {
			runtime: Runtime.NODEJS_18_X,
			tracing: Tracing.ACTIVE,
			memorySize: 256,
			logRetention: RetentionDays.ONE_WEEK,
			timeout: Duration.minutes(2),
			bundling: {
				minify: true,
				format: OutputFormat.ESM,
				target: 'node18.16',
				sourceMap: false,
				sourcesContent: false,
				banner: 'import { createRequire } from \'module\';const require = createRequire(import.meta.url);import { fileURLToPath } from \'url\';import { dirname } from \'path\';const __filename = fileURLToPath(import.meta.url);const __dirname = dirname(__filename);',
				externalModules: ['aws-sdk']
			},
			depsLockFilePath: path.join(__dirname, '../../../../common/config/rush/pnpm-lock.yaml'),
			architecture: getLambdaArchitecture(scope),
		};

		const serviceLinkedRoleSeederLambda = new NodejsFunction(this, 'ServiceLinkedRoleSeederLambda', {
			...commonLambdaConfiguration,
			functionName: `sif-${props.environment}-roleSeeder`,
			environment: {},
			description: `create service linked role if needed: Tenant ${props.environment}`,
			entry: path.join(__dirname, './customResources/serviceLinkedRole.customResource.ts'),
		});

		const iamPolicy = new Policy(this, 'iam-policy', {
			statements: [
				new PolicyStatement({
					sid: 'CreateRDSSLR',
					actions: ['iam:CreateServiceLinkedRole'],
					resources: [
						`arn:aws:iam::*:role/aws-service-role/rds.amazonaws.com/AWSServiceRoleForRDS*`,
					],
					conditions: {
						'StringLike': {
							'iam:AWSServiceName': 'rds.amazonaws.com'
						}
					}
				}),
				new PolicyStatement({
					sid: 'CreateECSSLR',
					actions: ['iam:CreateServiceLinkedRole'],
					resources: [
						'arn:aws:iam::*:role/aws-service-role/ecs.amazonaws.com/AWSServiceRoleForECS*'
					],
					conditions: {
						'StringLike': {
							'iam:AWSServiceName': 'ecs.amazonaws.com'
						}
					}
				})
				, new PolicyStatement({
					sid: 'AttachPolicy',
					actions: [
						'iam:AttachRolePolicy',
						'iam:PutRolePolicy'
					],
					resources: [
						`arn:aws:iam::*:role/aws-service-role/rds.amazonaws.com/AWSServiceRoleForRDS*`,
						`arn:aws:iam::*:role/aws-service-role/ecs.amazonaws.com/AWSServiceRoleForECS*`,
					]
				})
			]
		});

		NagSuppressions.addResourceSuppressions(iamPolicy, [
			{
				id: 'AwsSolutions-IAM5',
				reason: 'This policy only allow the lambda to create RDS service linked role.'
			}
		]);

		serviceLinkedRoleSeederLambda.role?.attachInlinePolicy(
			iamPolicy
		);


		const s3ExportPolicy = new Policy(this, 's3-export-policy', {
			statements: [
				new PolicyStatement({
					sid: 'S3Export',
					actions: [
						's3:PutObject',
						's3:AbortMultipartUpload'
					],
					effect: Effect.ALLOW,
					resources: [`arn:aws:s3:::sif-*/*`]
				})
			]
		});

		const s3ExportRole = new Role(this, 's3-export-role', {
			assumedBy: new ServicePrincipal('rds.amazonaws.com')
		});

		s3ExportRole.attachInlinePolicy(s3ExportPolicy);

		NagSuppressions.addResourceSuppressions(s3ExportPolicy, [
			{
				id: 'AwsSolutions-IAM5',
				appliesTo: [
					'Resource::arn:aws:s3:::sif-*/*'
				],
				reason: 'This policy is only for our RDS cluster to perform S3 exports to any bucket with a sif prefix',
			},
		]);


		const customResourceProvider = new Provider(this, 'CustomResourceProvider', {
			onEventHandler: serviceLinkedRoleSeederLambda
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
				subnetFilters: [SubnetFilter.byIds(props.sifVpcConfig.isolatedSubnetIds)]
			},
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
					subnetFilters: [SubnetFilter.byIds(props.sifVpcConfig.isolatedSubnetIds)]
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
			subnetGroup: subnetGroup,
			s3ExportRole
		});

		this.clusterIdentifier = databaseCluster.clusterIdentifier;

		databaseCluster.node.addDependency(customResource);
		databaseCluster.node.addDependency(s3ExportRole);

		if (!props.clusterDeletionProtection) {
			NagSuppressions.addResourceSuppressions(databaseCluster, [
				{
					id: 'AwsSolutions-RDS10',
					reason: 'Cluster deletion protection is a configurable value (it\'s set to true by default).'
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

		const accountId = cdk.Stack.of(this).account;
		const region = cdk.Stack.of(this).region;

		rdsProxyRole.addToPolicy(new PolicyStatement({
			sid: 's3',
			effect: Effect.ALLOW,
			actions: [
				'secretsmanager:DescribeSecret',
				'secretsmanager:GetSecretValue'
			],
			resources: [
				`arn:aws:secretsmanager:${region}:${accountId}:secret:sif-${props.environment}-*`,
				`arn:aws:secretsmanager:${region}:${accountId}:secret:sif-*-${props.environment}-*`]
		}));

		NagSuppressions.addResourceSuppressions([rdsProxyRole],
			[
				{
					id: 'AwsSolutions-IAM5',
					appliesTo: [
						`Resource::arn:aws:secretsmanager:<AWS::Region>:<AWS::AccountId>:secret:sif-${props.environment}-*`,
						`Resource::arn:aws:secretsmanager:${region}:${accountId}:secret:sif-${props.environment}-*`,
						`Resource::arn:aws:secretsmanager:<AWS::Region>:<AWS::AccountId>:secret:sif-*-${props.environment}-*`,
						`Resource::arn:aws:secretsmanager:${region}:${accountId}:secret:sif-*-${props.environment}-*`],
					reason: 'This policy is scoped to only secret generated by SIF.'
				}
			],
			true);

		new ssm.StringParameter(this, 'rdsProxyRoleArnParameter', {
			parameterName: rdsProxyRoleArnParameter(props.environment),
			stringValue: rdsProxyRole.roleArn
		});

		const proxy = databaseCluster.addProxy('RdsProxy', {
			secrets: [databaseCredentialsSecret],
			debugLogging: true,
			vpc: props.vpc,
			vpcSubnets: {
				subnetFilters: [SubnetFilter.byIds(props.sifVpcConfig.privateSubnetIds)]
			},
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
			vpcSubnetIds: props.sifVpcConfig.publicSubnetIds
		});

		const secretsManagerCustomResourceLambda = new NodejsFunction(this, 'SecretsManagerCustomResourceLambda', {
			...commonLambdaConfiguration,
			functionName: `sif-${props.environment}-secretsManager`,
			description: `attach tenant secret if needed: Environment ${props.environment}`,
			entry: path.join(__dirname, './customResources/secretsManager.customResource.ts'),
			environment: {
				RDS_PROXY_NAME: proxy.dbProxyName,
				SIF_ENVIRONMENT: props.environment
			}
		});

		const modifyDbProxyPolicy = new Policy(this, 'modify-db-proxy', {
			statements: [
				new PolicyStatement({
					actions: ['secretsmanager:ListSecrets'],
					resources: ['*']
				}),
				new PolicyStatement({
					actions: ['rds:ModifyDBProxy'],
					resources: [proxy.dbProxyArn]
				}),
				new PolicyStatement({
					actions: ['rds:DescribeDBProxies'],
					resources: [`arn:aws:rds:${region}:${accountId}:db-proxy:*`]
				})
			]
		});

		secretsManagerCustomResourceLambda.role?.attachInlinePolicy(
			modifyDbProxyPolicy
		);

		const secretsManagerResourceProvider = new Provider(this, 'SecretsManagerResourceProvider', {
			onEventHandler: secretsManagerCustomResourceLambda
		});

		const customResourceSecretsManager = new CustomResource(this, 'CustomResourceSecretsManager', {
			serviceToken: secretsManagerResourceProvider.serviceToken,
			properties: {
				uniqueToken: Date.now()
			}
		});

		customResourceSecretsManager.node.addDependency(modifyDbProxyPolicy, proxy);

		NagSuppressions.addResourceSuppressions(secretsManagerResourceProvider, [
			{
				id: 'AwsSolutions-IAM4',
				reason: 'This only contains the policy the create and insert log to log group.',
				appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole']
			},
			{
				id: 'AwsSolutions-IAM5',
				reason: 'This only applies to the seeder lambda defined in this construct and its versions.',
				/*
				 * Semgrep issue https://sg.run/l2o5
				 * Ignore reason: this is not a secret
				 */
				appliesTo: ['Resource::<AuroraSecretsManagerCustomResourceLambda2DA7E0CE.Arn>:*'] // nosemgrep
			},
			{
				id: 'AwsSolutions-L1',
				reason: 'The cr.Provider library is not maintained by this project.'
			}
		], true);

		NagSuppressions.addResourceSuppressions([serviceLinkedRoleSeederLambda, secretsManagerCustomResourceLambda], [
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

		NagSuppressions.addResourceSuppressions([modifyDbProxyPolicy], [
			{
				id: 'AwsSolutions-IAM5',
				appliesTo: ['Resource::*', 'Resource::arn:aws:rds:<AWS::Region>:<AWS::AccountId>:db-proxy:*', `Resource::arn:aws:rds:${region}:${accountId}:db-proxy:*`],
				reason: 'This IAM policy is needed to list tenant secrets and get the details of RDS proxy to determine which secrets that need to be re-attached'
			}
		], true);

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
