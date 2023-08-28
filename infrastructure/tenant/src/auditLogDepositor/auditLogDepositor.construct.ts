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

import { CustomResource, Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { Runtime, Tracing } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import * as glue from 'aws-cdk-lib/aws-glue';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
import path from 'path';
import { fileURLToPath } from 'url';
import { CfnStream } from 'aws-cdk-lib/aws-kinesis';
import { Effect, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { CfnDeliveryStream } from 'aws-cdk-lib/aws-kinesisfirehose';
import { getLambdaArchitecture } from '@sif/cdk-common';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface AuditLogDepositorConstructProperties {
	tenantId: string;
	environment: string;
	bucketName: string;
	auditLogsTableName: string;
	auditLogsDatabaseName: string;
	kmsKeyArn: string;
	customResourceProviderToken: string;
}

export const auditLogDepositorFunctionArnParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/auditLogDepositor/functionArn`;
export const auditLogDepositorFunctionNameParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/auditLogDepositor/functionName`;
export const auditLogDepositorDatabaseNameParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/auditLogDepositor/databaseName`;
export const auditLogDepositorTableNameParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/auditLogDepositor/tableName`;
export const auditLogDepositorDataStreamArnParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/auditLogDepositor/dataStreamArn`;
export const auditLogDepositorDataStreamNameParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/auditLogDepositor/dataStreamName`;


export class AuditLogDepositorModule extends Construct {
	public auditLogDepositorFunctionName: string;

	constructor(scope: Construct, id: string, props: AuditLogDepositorConstructProperties) {
		super(scope, id);

		const namePrefix = `sif-${props.tenantId}-${props.environment}`;
		const bucket = Bucket.fromBucketName(this, 'Bucket', props.bucketName);
		const accountId = Stack.of(this).account;
		const region = Stack.of(this).region;
		/**
		 * Define the SQS Lambda
		 */
		const sqsLambda = new NodejsFunction(this, 'SQSLambda', {
			functionName: `${namePrefix}-auditLogDepositor-sqs`,
			description: `auditLogDepositor SQS: Tenant ${props.tenantId}`,
			/*
			 * Semgrep issue https://sg.run/OPqk
			 * Ignore reason: there is no risk of path traversal in this context
			 */
			entry: path.join(__dirname, '../../../../typescript/packages/apps/audit-log-depositor/src/lambda_sqs.ts'), // nosemgrep
			runtime: Runtime.NODEJS_18_X,
			tracing: Tracing.ACTIVE,
			memorySize: 1024,
			timeout: Duration.minutes(2),
			logRetention: RetentionDays.ONE_WEEK,
			environment: {
				NODE_ENV: props.environment,
				BUCKET_NAME: props.bucketName,
				CONCURRENCY_LIMIT: '50',
			},

			bundling: {
				minify: true,
				format: OutputFormat.ESM,
				target: 'node18.16',
				sourceMap: false,
				sourcesContent: false,
				banner: "import { createRequire } from 'module';const require = createRequire(import.meta.url);import { fileURLToPath } from 'url';import { dirname } from 'path';const __filename = fileURLToPath(import.meta.url);const __dirname = dirname(__filename);",
				externalModules: ['aws-sdk'],
			},
			/*
			 * Semgrep issue https://sg.run/OPqk
			 * Ignore reason: there is no risk of path traversal in this context
			 */
			depsLockFilePath: path.join(__dirname, '../../../../common/config/rush/pnpm-lock.yaml'), // nosemgrep
			architecture: getLambdaArchitecture(scope),
		});

		NagSuppressions.addResourceSuppressions(sqsLambda, [
			{
				id: 'AwsSolutions-L1',
				reason: 'NODEJS_16_X to NODEJS_18_X upgrade not ready.',
			},
		]);

		new StringParameter(this, 'SqsFunctionNameParameter', {
			parameterName: auditLogDepositorFunctionNameParameter(props.tenantId, props.environment),
			stringValue: sqsLambda.functionName,
		});

		new StringParameter(this, 'SqsFunctionArnParameter', {
			parameterName: auditLogDepositorFunctionArnParameter(props.tenantId, props.environment),
			stringValue: sqsLambda.functionArn,
		});

/*
* Define Athena table
*/

		const columnsV0:glue.CfnTable.ColumnProperty[] = [
			{
				name: 'auditId',
				type: 'string'
			},
			{
				name: 'executionNo',
				type: 'int'
			},
			{
				name: 'inputs',
				type: 'array<struct<name:string,value:string>>'
			},
			{
				name: 'outputs',
				type: 'array<struct<index:int,name:string,formula:string,evaluated:map<string,string>,result:string,errorMessage:string,resources:struct<activities:array<map<string,string>>,calculations:array<map<string,string>>,referenceDatasets:array<map<string,string>>>>>'
			}
		]

		const columnsV1: glue.CfnTable.ColumnProperty[] = [
			{
				name: 'auditId',
				type: 'string'
			},
			{
				name: 'inputs',
				type: 'array<struct<name:string,value:string>>'
			},
			{
				name: 'outputs',
				type: 'array<struct<index:int,name:string,formula:string,evaluated:map<string,string>,result:string,errorMessage:string,resources:struct<activities:array<map<string,string>>,calculations:array<map<string,string>>,referenceDatasets:array<map<string,string>>>>>'
			}
		]

		// Create the Athena database
		const database = new glue.CfnDatabase(this, 'AthenaDatabase', {
			catalogId: accountId,
			databaseInput: {
				name: props.auditLogsDatabaseName
			}
		});

		// Create the Athena table
		const tableV0 = new glue.CfnTable(this, 'AthenaTableV0', {
			catalogId: accountId,
			databaseName: props.auditLogsDatabaseName,
			tableInput: {
				name: `${props.auditLogsTableName}-v0`,
				description: 'audit log table version 0',
				storageDescriptor: {
					columns:columnsV0,
					location: `s3://${props.bucketName}/pipelines`,
					inputFormat: 'org.apache.hadoop.mapred.TextInputFormat',
					outputFormat: 'org.apache.hadoop.hive.ql.io.IgnoreKeyTextOutputFormat',
					serdeInfo: {
						serializationLibrary: 'org.openx.data.jsonserde.JsonSerDe'
					}
				},
				tableType: 'EXTERNAL_TABLE',
				partitionKeys: [{name:'pipeline_id',type: 'string'},{name:'execution_id',type: 'string'}],
				parameters: {
					'projection.enabled': 'true',
					'projection.pipeline_id.type' : 'injected',
					'projection.execution_id.type' : 'injected',
					'storage.location.template' : 's3://'+props.bucketName+'/pipelines/${pipeline_id}/executions/${execution_id}/audit/'
				}
			}
		});


		tableV0.node.addDependency(database);

		const tableV1 = new glue.CfnTable(this, 'AthenaTableV1', {
			catalogId: accountId,
			databaseName: props.auditLogsDatabaseName,
			tableInput: {
				name: `${props.auditLogsTableName}-v1`,
				description: 'audit log table version 1',
				storageDescriptor: {
					columns:columnsV1,
					location: `s3://${props.bucketName}/pipelines`,
					inputFormat: 'org.apache.hadoop.hive.ql.io.parquet.MapredParquetInputFormat',
					outputFormat: 'org.apache.hadoop.hive.ql.io.parquet.MapredParquetOutputFormat',
					serdeInfo: {
						serializationLibrary: 'org.apache.hadoop.hive.ql.io.parquet.serde.ParquetHiveSerDe'
					}
				},
				tableType: 'EXTERNAL_TABLE',
				partitionKeys: [{ name: 'pipeline_id', type: 'string' }, { name: 'execution_id', type: 'string' }],
				parameters: {
					'projection.enabled': 'true',
					'projection.pipeline_id.type': 'injected',
					'projection.execution_id.type': 'injected',
					'storage.location.template': 's3://' + props.bucketName + '/pipelines/${pipeline_id}/executions/${execution_id}/audit/'
				}
			}
		});

		tableV1.node.addDependency(database);

		/*
		 * Create indexed partitions
		 * Currently cdk-lib does not support partition indexes so we use custom resources to create it instead
		*/

		/**
		 * CloudFormation WaitCondition resource to wait until glue index update has been performed successfully
		 */
		const TableIndexV1CustomResource = new CustomResource(this, 'CustomResourceGlueSeeder', {
			serviceToken: props.customResourceProviderToken,
			resourceType: 'Custom::GlueSeeder',
			properties: {
				uniqueToken: Date.now(),
				glueDatabaseName: props.auditLogsDatabaseName,
				glueTableName: `${props.auditLogsTableName}-v1`

			}
		});

		TableIndexV1CustomResource.node.addDependency(tableV1);


		/*
			* Define Audit Kinesis delivery stream
		*/

		const logGroup = new LogGroup(this, 'KinesisLogGroup', {
			logGroupName: `/aws/kinesisfirehose/${namePrefix}-auditLogDepositor-audits`,
			retention: RetentionDays.ONE_WEEK,
			removalPolicy: RemovalPolicy.DESTROY
		});

		const kinesisDataStream = new CfnStream(this, 'KinesisDataStream', {
			name: `${namePrefix}-audit-data-stream`,
			streamModeDetails:{
				streamMode: 'ON_DEMAND'
			},
			streamEncryption: {
				encryptionType: 'KMS',
				keyId: props.kmsKeyArn
			}
		});

		new StringParameter(this, 'DataStreamNameParameter', {
			parameterName: auditLogDepositorDataStreamNameParameter(props.tenantId, props.environment),
			stringValue: kinesisDataStream.name,
		});

		new StringParameter(this, 'DataStreamArnParameter', {
			parameterName: auditLogDepositorDataStreamArnParameter(props.tenantId, props.environment),
			stringValue: kinesisDataStream.attrArn,
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
			resources: [props.kmsKeyArn],
			conditions: {
				'StringEquals': {
					'kms:ViaService': `s3.${region}.amazonaws.com`
				},
				'StringLike': {
					'kms:EncryptionContext:aws:s3:arn': [bucket.bucketArn, `${bucket.bucketArn}/*`]
				}
			}
		}));

		deliveryStreamRole.addToPolicy(new PolicyStatement({
			sid: 'logs',
			effect: Effect.ALLOW,
			actions: ['logs:PutLogEvents'],
			resources: [`${logGroup.logGroupArn}: *`],
		}));

		deliveryStreamRole.addToPolicy(new PolicyStatement({
			sid: 'dateStream',
			effect: Effect.ALLOW,
			actions: ['kinesis:DescribeStream', 'kinesis:GetShardIterator', 'kinesis:GetRecords', 'kinesis:ListShards'],
			resources: [kinesisDataStream.attrArn],
		}));

		deliveryStreamRole.addToPolicy(new PolicyStatement({
			sid: 'kmsDecrypt',
			effect: Effect.ALLOW,
			actions: ['kms:Decrypt'],
			resources: [props.kmsKeyArn],
			conditions: {
				'StringEquals': {
					'kms:ViaService': `kinesis.${region}.amazonaws.com`
				},
				'StringLike': {
					'kms:EncryptionContext:aws:kinesis:arn': kinesisDataStream.attrArn
				}
			}
		}));

		deliveryStreamRole.addToPolicy(new PolicyStatement({
			sid: 'glueTable',
			effect: Effect.ALLOW,
			actions: ['glue:GetTable','glue:GetTableVersion','glue:GetTableVersions'],
			resources: [
				`arn:aws:glue:${region}:${accountId}:catalog`,
				`arn:aws:glue:${region}:${accountId}:database/${props.auditLogsDatabaseName}`,
				`arn:aws:glue:${region}:${accountId}:table/${props.auditLogsDatabaseName}/${props.auditLogsTableName}*`
			],
		}));

		deliveryStreamRole.addToPolicy(new PolicyStatement({
			sid: 'glueSchema',
			effect: Effect.ALLOW,
			actions: ['glue:GetSchemaByDefinition'],
			resources: [
				`arn:aws:glue:${region}:${accountId}:registry/*`,
				`arn:aws:glue:${region}:${accountId}:schema/*`
			],
		}));

		deliveryStreamRole.addToPolicy(new PolicyStatement({
			sid: 'glueSchemaVersion',
			effect: Effect.ALLOW,
			actions: ['glue:GetSchemaVersion'],
			resources: [
				'*'
			],
		}));


		var deliveryStreamName = `${namePrefix}-auditLogDepositor-delivery-stream`;

		const kinesisDeliveryStream = new CfnDeliveryStream(this, 'DeliveryStream', {
			deliveryStreamName,
			deliveryStreamType:'KinesisStreamAsSource',

			kinesisStreamSourceConfiguration: {
				kinesisStreamArn: kinesisDataStream.attrArn,
				roleArn: deliveryStreamRole.roleArn

			},

			extendedS3DestinationConfiguration: {
				cloudWatchLoggingOptions: {
					logGroupName: logGroup.logGroupName,
					logStreamName: 'auditlog',
					enabled: true
				},
				dataFormatConversionConfiguration:{
					enabled: true,
					inputFormatConfiguration: {
						deserializer:{
							hiveJsonSerDe:{
							}
						}
					},
					schemaConfiguration:{
						databaseName: props.auditLogsDatabaseName,
						roleArn: deliveryStreamRole.roleArn,
						tableName: `${props.auditLogsTableName}-v1`
					},
					outputFormatConfiguration:{
						serializer: {
							parquetSerDe:{
								compression: "SNAPPY"
							}
						}
					}
				},
				compressionFormat: 'UNCOMPRESSED',
				bucketArn: bucket.bucketArn,
				roleArn: deliveryStreamRole.roleArn,
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

		kinesisDeliveryStream.node.addDependency(deliveryStreamRole);

		NagSuppressions.addResourceSuppressions(kinesisDeliveryStream,
			[
				{
					id: 'AwsSolutions-KDF1',
					reason: 'This is delivery stream uses a data stream as source and does not support encryption.'
				}],
			true);


			NagSuppressions.addResourceSuppressions([deliveryStreamRole],
				[
					{
						id: 'AwsSolutions-IAM5',
						appliesTo: [
							'Resource::arn:<AWS::Partition>:s3:::<bucketNameParameter>/*',
							'Resource::<AuditLogDepositorKinesisLogGroup0A20B4BA.Arn>: *'
						],
						reason: 'This policy is needed for kinesis delivery stream to store data in bucket and do logging.'
					},
					{
						id: 'AwsSolutions-IAM5',
						appliesTo: [
							'Action::kinesis:Get*',
							'Action::kinesis:List*'
						],
						reason: 'This policy is needed for kinesis delivery stream to get data from kinesis data stream.'
					},
					{
						id: 'AwsSolutions-IAM5',
						appliesTo: [
							`Resource::arn:aws:glue:${region}:${accountId}:table/<AuditLogsDatabaseNameParameter>/<AuditLogsTableNameParameter>*`,
							`Resource::arn:aws:glue:${region}:${accountId}:registry/*`,
							`Resource::arn:aws:glue:${region}:${accountId}:schema/*`,
							'Resource::*'
						],
						reason: 'This policy is needed for kinesis delivery stream to access the glue table schemas in order to convert the data.'
					}
				],
				true);


		NagSuppressions.addResourceSuppressions(sqsLambda,
			[
				{
					id: 'AwsSolutions-IAM4',
					reason: 'This role only allows you to put log to the log stream.',
					appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole']
				},
				{
					id: 'AwsSolutions-IAM5',
					reason: 'This policy is needed for lambda to do CRUD on the DynamoDB table.',
					appliesTo: ['Resource::<ResourceApiBaseTable3133F8B2.Arn>/index/*']
				},
				{
					id: 'AwsSolutions-IAM5',
					reason: 'This policy is needed to invoke the access management lambda.',
					appliesTo: [`Resource::arn:<AWS::Partition>:lambda:${region}:${accountId}:function:<accessManagementApiFunctionNameParameter>:*`]
				},
				{
					id: 'AwsSolutions-IAM5',
					appliesTo: ['Resource::*'],
					reason: 'The resource condition in the IAM policy is generated by CDK, this only applies to xray:PutTelemetryRecords and xray:PutTraceSegments actions.'
				},
				{
					id: 'AwsSolutions-IAM5',
					appliesTo: ['Action::s3:Abort*', 'Action::s3:DeleteObject*', 'Action::s3:GetBucket*', 'Action::s3:GetObject*', 'Action::s3:List*', 'Resource::arn:<AWS::Partition>:s3:::<bucketNameParameter>/*'],
					reason: 'This policy is required for the lambda to access the s3 bucket that contains activity audit files.'
				}
			],
			true);
	}
}
