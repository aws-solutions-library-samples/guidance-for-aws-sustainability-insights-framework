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

import { Duration, Stack } from 'aws-cdk-lib';
import { Runtime, Tracing } from 'aws-cdk-lib/aws-lambda';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { Queue } from 'aws-cdk-lib/aws-sqs';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import * as glue from 'aws-cdk-lib/aws-glue';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface AuditLogDepositorConstructProperties {
	tenantId: string;
	environment: string;
	auditQueueArn: string;
	bucketName: string;
	auditLogsTableName: string;
	auditLogsDatabaseName: string;
}

export const auditLogDepositorFunctionArnParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/auditLogDepositor/functionArn`;
export const auditLogDepositorFunctionNameParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/auditLogDepositor/functionName`;
export const auditLogDepositorDatabaseNameParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/auditLogDepositor/databaseName`;
export const auditLogDepositorTableNameParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/auditLogDepositor/tableName`;

export class AuditLogDepositorModule extends Construct {
	public auditLogDepositorFunctionName: string;

	constructor(scope: Construct, id: string, props: AuditLogDepositorConstructProperties) {
		super(scope, id);

		const namePrefix = `sif-${props.tenantId}-${props.environment}`;
		const auditQueue = Queue.fromQueueArn(this, 'AuditQueue', props.auditQueueArn);
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
			runtime: Runtime.NODEJS_16_X,
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
				target: 'node16.15',
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
		});
		sqsLambda.node.addDependency(auditQueue);
		bucket.grantReadWrite(sqsLambda);

		NagSuppressions.addResourceSuppressions(sqsLambda, [
			{
				id: 'AwsSolutions-L1',
				reason: 'NODEJS_16_X to NODEJS_18_X upgrade not ready.',
			},
		]);

		sqsLambda.addEventSource(new SqsEventSource(auditQueue, {
			batchSize: 1,
			maxConcurrency: 5,
			enabled: true,
		}));

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

		const columns:glue.CfnTable.ColumnProperty[] = [
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

		// Create the Athena database
		const database = new glue.CfnDatabase(this, 'AthenaDatabase', {
			catalogId: accountId,
			databaseInput: {
				name: props.auditLogsDatabaseName
			}
		});

		// Create the Athena table
		const table = new glue.CfnTable(this, 'AthenaTable', {
			catalogId: accountId,
			databaseName: props.auditLogsDatabaseName,
			tableInput: {
				name: props.auditLogsTableName,
				description: 'audit log table',
				storageDescriptor: {
					columns,
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
					'storage.location.template' : 's3://'+props.bucketName+'/pipelines/${pipeline_id}/executions/${execution_id}/'
				}
			}
		});


		table.node.addDependency(database);


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
				},
				{
					id: 'AwsSolutions-L1',
					reason: 'NODEJS_16_X to NODEJS_18_X upgrade not ready.',
				}
			],
			true);
	}
}
