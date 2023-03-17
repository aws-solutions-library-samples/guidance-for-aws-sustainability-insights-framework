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

import { Duration, Fn, RemovalPolicy, Size, Stack, CustomResource } from 'aws-cdk-lib';
import { ScalableTarget, ServiceNamespace } from 'aws-cdk-lib/aws-applicationautoscaling';
import { Metric } from 'aws-cdk-lib/aws-cloudwatch';
import { AttributeType, BillingMode, Table, TableEncryption } from 'aws-cdk-lib/aws-dynamodb';
import { Port, SecurityGroup, SubnetType, Vpc } from 'aws-cdk-lib/aws-ec2';
import { Effect, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { CfnDeliveryStream } from 'aws-cdk-lib/aws-kinesisfirehose';
import { Key } from 'aws-cdk-lib/aws-kms';
import { Alias, Code, Function, Runtime, Tracing } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { Asset } from 'aws-cdk-lib/aws-s3-assets';
import { execSync, ExecSyncOptions } from 'child_process';
import { Construct } from 'constructs';
import path from 'path';
import { fileURLToPath } from 'url';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { vpcIdParameter } from '../shared/sharedTenant.stack.js';
import { NagSuppressions } from 'cdk-nag';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface CalculatorConstructProperties {
	accessManagementApiFunctionName: string;
	impactsApiFunctionName: string;
	activityBooleanValueTableName: string;
	activityDateTimeValueTableName: string;
	activityNumberValueTableName: string;
	activityStringValueTableName: string;
	activityTableName: string;
	bucketName: string;
	caCert: string;
	calculationsApiFunctionName: string;
	calculatorFunctionName: string;
	environment: string;
	maxScaling: number;
	minScaling: number;
	pipelinesApiFunctionName: string;
	rdsProxyArn: string;
	rdsProxyEndpoint: string;
	rdsProxySecurityGroupId: string;
	referenceDatasetsApiFunctionName: string;
	tenantDatabaseName: string;
	tenantDatabaseUsername: string;
	tenantSecretArn: string;
	tenantId: string;
	vpcId: string;
	kmsKeyArn: string;
	customResourceProviderToken: string;
}

export const calculatorFunctionArnParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/calculator/functionArn`;

export class CalculatorModule extends Construct {
	constructor(scope: Construct, id: string, props: CalculatorConstructProperties) {
		super(scope, id);

		const namePrefix = `sif-${props.tenantId}-${props.environment}`;

		const execOptions: ExecSyncOptions = { stdio: ['ignore', process.stderr, 'inherit'] };

		const vpcId = StringParameter.valueFromLookup(this, vpcIdParameter(props.environment));
		const vpc = Vpc.fromLookup(this, 'vpc', { vpcId });

		const bucket = Bucket.fromBucketName(this, 'Bucket', props.bucketName);
		const rdsSecurityGroup = SecurityGroup.fromSecurityGroupId(this, 'RdsProxySecurityGroup', props.rdsProxySecurityGroupId);
		const calculationsLambda = NodejsFunction.fromFunctionName(this, 'CalculationsLambda', props.calculationsApiFunctionName);
		const pipelineLambda = NodejsFunction.fromFunctionName(this, 'PipelineLambda', props.pipelinesApiFunctionName);
		const impactsLambda = NodejsFunction.fromFunctionName(this, 'ImpactsLambda', props.impactsApiFunctionName);
		const accessManagementLambda = NodejsFunction.fromFunctionName(this, 'AccessManagementLambda', props.accessManagementApiFunctionName);
		const referenceDatasetsLambda = NodejsFunction.fromFunctionName(this, 'ReferenceDatasetsLambda', props.referenceDatasetsApiFunctionName);

		let calculatorLambdaToRDSProxy = new SecurityGroup(this, 'Calculator Lambda to RDS Proxy Connection', {
			vpc: vpc,
		});

		rdsSecurityGroup.addIngressRule(calculatorLambdaToRDSProxy, Port.tcp(5432), 'Allow calculator lambda to connect');

		const accountId = Stack.of(this).account;
		const region = Stack.of(this).region;
		const stackName = Stack.of(this).stackName;
		const rdsProxyPolicy = new PolicyStatement({
			actions: ['rds-db:connect'],
			resources: [`arn:aws:rds-db:${region}:${accountId}:dbuser:${Fn.select(6, Fn.split(':', props.rdsProxyArn))}/${props.tenantDatabaseUsername}`],
		});

		const sqlAsset = new Asset(this, 'SqlAsset', {
			path: path.join(__dirname, 'assets'),
		});

		new CustomResource(this, 'CustomResourceDatabaseSeeder', {
			serviceToken: props.customResourceProviderToken,
			resourceType: 'Custom::DatabaseSeeder',
			properties: {
				uniqueToken: Date.now(),
				assetBucket: sqlAsset.s3BucketName,
				assetPath: sqlAsset.s3ObjectKey,
				tenantSecretArn: props.tenantSecretArn,
				tenantDatabaseName: props.tenantDatabaseName
			}
		});

		const resourceMappingTable = new Table(this, 'CalculatorTable', {
			tableName: `${namePrefix}-calculator`,
			partitionKey: {
				name: 'pk',
				type: AttributeType.STRING,
			},
			sortKey: {
				name: 'sk',
				type: AttributeType.STRING,
			},
			billingMode: BillingMode.PAY_PER_REQUEST,
			encryption: TableEncryption.AWS_MANAGED,
			pointInTimeRecovery: true,
			removalPolicy: RemovalPolicy.DESTROY,
		});

		const kmsKey = Key.fromKeyArn(this, 'KmsKey', props.kmsKeyArn);

		const logGroup = new LogGroup(this, 'KinesisLogGroup', {
			logGroupName: `/aws/kinesisfirehose/${stackName}`,
			retention: RetentionDays.ONE_WEEK,
			removalPolicy: RemovalPolicy.DESTROY
		});

		const deliveryStreamRole = new Role(this, 'DeliveryStreamRole', {
			assumedBy: new ServicePrincipal('firehose.amazonaws.com')
		});

		deliveryStreamRole.addToPolicy(new PolicyStatement({
			sid: 's3',
			effect: Effect.ALLOW,
			actions: ['s3:AbortMultipartUpload',
				's3:GetBucketLocation',
				's3:GetObject',
				's3:ListBucket',
				's3:ListBucketMultipartUploads',
				's3:PutObject'],
			resources: [bucket.bucketArn, `${bucket.bucketArn}/*`]
		}));

		deliveryStreamRole.addToPolicy(new PolicyStatement({
			sid: 'kms',
			effect: Effect.ALLOW,
			actions: ['kms:GenerateDataKey',
				'kms:Decrypt'],
			resources: [kmsKey.keyArn],
			conditions: {
				'StringEquals': {
					'kms:ViaService': `s3.${region}.amazonaws.com`
				},
				'StringLike': {
					'kms:EncryptionContext:aws:s3:arn': [bucket.bucketArn, `${bucket.bucketArn}/*`]
				}
			}
		}));
		var deliveryStreamName = `${namePrefix}-calculatorAudits`;

		deliveryStreamRole.addToPolicy(new PolicyStatement({
			sid: 'logs',
			effect: Effect.ALLOW,
			actions: ['logs:PutLogEvents'],
			resources: [`${logGroup.logGroupArn}: *`],
		}));

		const kinesisDeliveryStream = new CfnDeliveryStream(this, 'DeliveryStream', {
			deliveryStreamName,
			deliveryStreamEncryptionConfigurationInput: {
				keyType: 'AWS_OWNED_CMK'
			},
			extendedS3DestinationConfiguration: {
				cloudWatchLoggingOptions: {
					logGroupName: logGroup.logGroupName,
					logStreamName: 'auditlog',
					enabled: true
				},
				bucketArn: bucket.bucketArn,
				roleArn: deliveryStreamRole.roleArn,
				encryptionConfiguration: {
					kmsEncryptionConfig: {
						awskmsKeyArn: kmsKey.keyArn
					}
				},
				prefix: 'pipelines/!{partitionKeyFromQuery:pipelineId}/executions/!{partitionKeyFromQuery:executionId}/audit/',
				errorOutputPrefix: 'pipelines/deliveryFailures/!{firehose:error-output-type}',
				bufferingHints: {
					intervalInSeconds: 60,
					sizeInMBs: 64,
				},
				dynamicPartitioningConfiguration: {
					enabled: true,
					retryOptions: {
						durationInSeconds: 60
					}
				},
				processingConfiguration: {
					enabled: true,
					processors: [{
						type: 'MetadataExtraction',
						parameters: [
							{ parameterName: 'MetadataExtractionQuery', parameterValue: '{pipelineId:.pipelineId,executionId:.executionId}' },
							{ parameterName: 'JsonParsingEngine', parameterValue: 'JQ-1.6' }]

					}, {
						type: 'AppendDelimiterToRecord',
						parameters: [
							{
								parameterName: 'Delimiter',
								parameterValue: '\\n'
							}
						]

					}]
				}
			}
		});

		const calculatorPath = path.join(__dirname, '../../../../java/apps/calculator');

		const calculatorLambda = new Function(this, 'CalculatorHandler', {
			functionName: props.calculatorFunctionName,
			description: `Calculator Function: Tenant ${props.tenantId} `,
			runtime: Runtime.JAVA_11,
			handler: 'com.aws.sif.HandlerStream',
			memorySize: 2048,
			timeout: Duration.minutes(10),
			logRetention: RetentionDays.ONE_WEEK,
			ephemeralStorageSize: Size.gibibytes(5),
			tracing: Tracing.ACTIVE,
			environment: {
				'TENANT_ID': props.tenantId,
				'ENVIRONMENT': props.environment,
				'BUCKET_NAME': props.bucketName,
				'CA_CERT': props.caCert,
				'CALCULATIONS_FUNCTION_NAME': props.calculationsApiFunctionName,
				'REFERENCEDATASETS_FUNCTION_NAME': props.referenceDatasetsApiFunctionName,
				'IMPACTS_FUNCTION_NAME': props.impactsApiFunctionName,
				'USERS_FUNCTION_NAME': props.accessManagementApiFunctionName,
				'RESOURCE_MAPPING_TABLE_NAME': resourceMappingTable.tableName,
				'DELIVERY_STREAM_NAME': kinesisDeliveryStream.deliveryStreamName,
				'PROCESSED_ACTIVITIES_DATABASE_RDS_NAME': props.tenantDatabaseName,
				'PROCESSED_ACTIVITIES_DATABASE_USER': props.tenantDatabaseUsername,
				'PROCESSED_ACTIVITIES_DATABASE_WRITER_ENDPOINT': props.rdsProxyEndpoint,
				'PROCESSED_ACTIVITIES_TABLE_ACTIVITY': props.activityTableName,
				'PROCESSED_ACTIVITIES_TABLE_ACTIVITY_STRING_VALUE': props.activityStringValueTableName,
				'PROCESSED_ACTIVITIES_TABLE_ACTIVITY_NUMBER_VALUE': props.activityNumberValueTableName,
				'PROCESSED_ACTIVITIES_TABLE_ACTIVITY_BOOLEAN_VALUE': props.activityBooleanValueTableName,
				'PROCESSED_ACTIVITIES_TABLE_ACTIVITY_DATETIME_VALUE': props.activityDateTimeValueTableName
			},
			securityGroups: [calculatorLambdaToRDSProxy],
			vpc,
			vpcSubnets: {
				subnetType: SubnetType.PRIVATE_WITH_NAT,
			},
			code: Code.fromAsset(calculatorPath, {
				bundling: {
					workingDirectory: calculatorPath,
					image: Runtime.JAVA_11.bundlingImage,
					local: {
						tryBundle(outputDir: string): boolean {
							try {
								execSync(`mvn clean install`, {
									...execOptions,
									cwd: calculatorPath,
								});
								/*
								 * semgrep issue https://sg.run/l2lo
								 * Ignore reason: there is no risk of command injection in this context
								*/
								// nosemgrep
								execSync(`cp ./target/calculator.jar ${outputDir}`, {
									...execOptions,
									cwd: calculatorPath,
								});
							} catch (err) {
								return false;
							}
							return true;
						},
					},
				},
			}),
		});


		new StringParameter(this, 'calculatorFunctionArnParameter', {
			parameterName: calculatorFunctionArnParameter(props.tenantId, props.environment),
			stringValue: calculatorLambda.functionArn,
		});


		resourceMappingTable.grantReadWriteData(calculatorLambda);
		bucket.grantReadWrite(calculatorLambda);
		pipelineLambda.grantInvoke(calculatorLambda);
		accessManagementLambda.grantInvoke(calculatorLambda);
		calculationsLambda.grantInvoke(calculatorLambda);
		referenceDatasetsLambda.grantInvoke(calculatorLambda);
		impactsLambda.grantInvoke(calculatorLambda);

		calculatorLambda.addToRolePolicy(new PolicyStatement({
			sid: 'firehose',
			effect: Effect.ALLOW,
			actions: [
				'firehose:PutRecord',
				'firehose:PutRecordBatch'],
			resources: [kinesisDeliveryStream.attrArn]
		}));

		calculatorLambda.addToRolePolicy(new PolicyStatement({
			sid: 'vpc',
			effect: Effect.ALLOW,
			actions: [
				'logs:CreateLogGroup',
				'logs:CreateLogStream',
				'logs:PutLogEvents',
				'ec2:CreateNetworkInterface',
				'ec2:DescribeNetworkInterfaces',
				'ec2:DeleteNetworkInterface',
				'ec2:AssignPrivateIpAddresses',
				'ec2:UnassignPrivateIpAddresses'
			],
			resources: ['*'],
			conditions: {
				'StringEquals': {
					'ec2:vpc': `arn:aws:ec2:${region}:${accountId}:vpc/${vpc.vpcId}`
				}
			}
		}));

		calculatorLambda.addToRolePolicy(new PolicyStatement({
			sid: 'rds',
			effect: Effect.ALLOW,
			actions: [
				'rds-db:connect'
			],
			resources: [`arn:aws:rds-db:${region}:${accountId}:dbuser:${Fn.select(6, Fn.split(':', props.rdsProxyArn))}/${props.tenantDatabaseUsername}`],
		}));

		const alias = new Alias(this, 'CalculatorHandlerAlias', {
			aliasName: 'live',
			provisionedConcurrentExecutions: props.minScaling,
			version: calculatorLambda.currentVersion
		});

		calculatorLambda.addToRolePolicy(rdsProxyPolicy);

		alias.node.addDependency(calculatorLambda);

		const scalableTarget = new ScalableTarget(this, 'CalculatorHandlerScalableTarget', {
			serviceNamespace: ServiceNamespace.LAMBDA,
			minCapacity: props.minScaling,
			maxCapacity: props.maxScaling,
			resourceId: `function:${calculatorLambda.functionName}:${alias.aliasName}`,
			scalableDimension: 'lambda:function:ProvisionedConcurrency'
		});

		scalableTarget.node.addDependency(calculatorLambda);
		scalableTarget.node.addDependency(alias);

		const maximumMetric = new Metric({
			namespace: 'AWS/Lambda', metricName: 'ProvisionedConcurrencyUtilization', statistic: 'Maximum', dimensionsMap: {
				'FunctionName': calculatorLambda.functionName,
				'Resource': `${calculatorLambda.functionName}:${alias.aliasName} `
			}
		});

		scalableTarget.scaleToTrackMetric('PCU', { customMetric: maximumMetric, targetValue: 0.7 });

		NagSuppressions.addResourceSuppressions([deliveryStreamRole],
			[
				{
					id: 'AwsSolutions-IAM5',
					appliesTo: [
						'Resource::arn:<AWS::Partition>:s3:::<bucketNameParameter>/*',
						'Resource::<CalculatorKinesisLogGroup1E496427.Arn>: *'
					],
					reason: 'This policy is needed for kinesis delivery stream to store data in bucket and do logging.'
				}
			],
			true);

		NagSuppressions.addResourceSuppressions([calculatorLambda],
			[
				{
					id: 'AwsSolutions-IAM4',
					appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'],
					reason: 'this policy is the one generated by CDK.'
				},
				{
					id: 'AwsSolutions-IAM5',
					appliesTo: ['Action::s3:Abort*', 'Action::s3:DeleteObject*', 'Action::s3:GetBucket*', 'Action::s3:GetObject*', 'Action::s3:List*', 'Resource::arn:<AWS::Partition>:s3:::<bucketNameParameter>/*'],
					reason: 'the policy is required for the lambda to access the s3 bucket that contains reference datasets file.'
				},
				{
					id: 'AwsSolutions-IAM5',
					appliesTo: ['Resource::*'],
					reason: 'The resource condition in the IAM policy is generated by CDK, this only applies to xray:PutTelemetryRecords and xray:PutTraceSegments and VPC related actions.'
				},
				{
					id: 'AwsSolutions-IAM5',
					appliesTo: [
						`Resource::arn:<AWS::Partition>:lambda:${region}:${accountId}:function:<calculationsApiFunctionNameParameter>:*`,
						`Resource::arn:<AWS::Partition>:lambda:${region}:${accountId}:function:<accessManagementApiFunctionNameParameter>:*`,
						`Resource::arn:<AWS::Partition>:lambda:${region}:${accountId}:function:<impactsApiFunctionNameParameter>:*`,
						`Resource::arn:<AWS::Partition>:lambda:${region}:${accountId}:function:<pipelineApiFunctionNameParameter>:*`,
						`Resource::arn:<AWS::Partition>:lambda:${region}:${accountId}:function:<referenceDatasetsApiFunctionNameParameter>:*`
					],
					reason: 'the policy is required for the lambda to access the s3 bucket that contains reference datasets file.'
				},
				{
					id: 'AwsSolutions-IAM4',
					appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole'],
					reason: 'this policy is the one generated by CDK.'
				}
			],
			true);
	}

}
