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

import { Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { AttributeType, BillingMode, ProjectionType, Table, TableEncryption } from 'aws-cdk-lib/aws-dynamodb';
import { EventBus } from 'aws-cdk-lib/aws-events';
import { Function, Runtime, Tracing } from 'aws-cdk-lib/aws-lambda';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Queue } from 'aws-cdk-lib/aws-sqs';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import path from 'path';
import { fileURLToPath } from 'url';
import { NagSuppressions } from 'cdk-nag';
import { AnyPrincipal, Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { getLambdaArchitecture } from '@sif/cdk-common';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ResourceApiBaseConstructProperties {
	tenantId: string;
	environment: string;
	moduleName: string;

	eventBusName: string;

	auth?: {
		accessManagementApiFunctionName: string;
	};

	queue?: {
		moduleSqsLambdaLocation: string;
		pnpmLockFileLocation: string;
	};

	table?: {
		create: boolean;
	};
}

export const tableNameParameter = (tenantId: string, environment: string, module: string) => `/sif/${tenantId}/${environment}/${module}/tableName`;
export const tableArnParameter = (tenantId: string, environment: string, module: string) => `/sif/${tenantId}/${environment}/${module}/tableArn`;
export const workerQueueArnParameter = (tenantId: string, environment: string, module: string) => `/sif/${tenantId}/${environment}/${module}/workerQueueArn`;
export const workerQueueNameParameter = (tenantId: string, environment: string, module: string) => `/sif/${tenantId}/${environment}/${module}/workerQueueName`;
export const workerQueueUrlParameter = (tenantId: string, environment: string, module: string) => `/sif/${tenantId}/${environment}/${module}/workerQueueUrl`;
export const sqsFunctionNameParameter = (tenantId: string, environment: string, module: string) => `/sif/${tenantId}/${environment}/${module}/sqsFunctionName`;
export const sqsFunctionArnParameter = (tenantId: string, environment: string, module: string) => `/sif/${tenantId}/${environment}/${module}/sqsFunctionArn`;

export class ResourceApiBase extends Construct {
	public readonly tableName: string;
	public readonly workerQueueArn: string;

	constructor(scope: Construct, id: string, props: ResourceApiBaseConstructProperties) {
		super(scope, id);

		const namePrefix = `sif-${props.tenantId}-${props.environment}`;
		const eventBus = EventBus.fromEventBusName(this, 'EventBus', props.eventBusName);

		/**
		 * Define the DynamoDB table
		 */
		const hasTable = props.table?.create ?? true;
		let table: Table;
		if (hasTable) {
			table = new Table(this, 'Table', {
				tableName: `${namePrefix}-${props.moduleName}`,
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

			// define GSI1
			table.addGlobalSecondaryIndex({
				indexName: 'siKey1-pk-index',
				partitionKey: {
					name: 'siKey1',
					type: AttributeType.STRING,
				},
				sortKey: {
					name: 'pk',
					type: AttributeType.STRING,
				},
				projectionType: ProjectionType.ALL,
			});

			// define GSI2
			table.addGlobalSecondaryIndex({
				indexName: 'siKey2-pk-index',
				partitionKey: {
					name: 'siKey2',
					type: AttributeType.STRING,
				},
				sortKey: {
					name: 'pk',
					type: AttributeType.STRING,
				},
				projectionType: ProjectionType.ALL,
			});

			// define GSI3
			table.addGlobalSecondaryIndex({
				indexName: 'siKey3-siSort3-index',
				partitionKey: {
					name: 'siKey3',
					type: AttributeType.STRING,
				},
				sortKey: {
					name: 'siSort3',
					type: AttributeType.STRING,
				},
				projectionType: ProjectionType.ALL,
			});

			this.tableName = table.tableName;

			new StringParameter(this, `TableNameParameter`, {
				parameterName: tableNameParameter(props.tenantId, props.environment, props.moduleName),
				stringValue: table.tableName,
			});

			new StringParameter(this, `TableArnParameter`, {
				parameterName: tableArnParameter(props.tenantId, props.environment, props.moduleName),
				stringValue: table.tableArn,
			});
		}

		if (props.queue !== undefined) {
			/**
			 * Define the SQS worker queue
			 */
			const dlqQueue = new Queue(this, 'DlqQueue', {
				queueName: `${namePrefix}-${props.moduleName}-dlq`,
			});

			dlqQueue.addToResourcePolicy(new PolicyStatement({
				sid: 'enforce-ssl',
				effect: Effect.DENY,
				principals: [new AnyPrincipal()],
				actions: ['sqs:*'],
				resources: [dlqQueue.queueArn],
				conditions: {
					'Bool': {
						'aws:SecureTransport': 'false'
					}
				}
			}));

			NagSuppressions.addResourceSuppressions(dlqQueue,
				[
					{
						id: 'AwsSolutions-SQS3',
						reason: 'This is the DLQ queue.'
					}],
				true);


			const workerQueue = new Queue(this, 'WorkerQueue', {
				queueName: `${namePrefix}-${props.moduleName}-worker`,
				deadLetterQueue: {
					maxReceiveCount: 10,
					queue: dlqQueue,
				},
				visibilityTimeout: Duration.minutes(5),
			});

			workerQueue.addToResourcePolicy(new PolicyStatement({
				sid: 'enforce-ssl',
				effect: Effect.DENY,
				principals: [new AnyPrincipal()],
				actions: ['sqs:*'],
				resources: [workerQueue.queueArn],
				conditions: {
					'Bool': {
						'aws:SecureTransport': 'false'
					}
				}
			}));

			new StringParameter(this, `WorkerQueueArnParameter`, {
				parameterName: workerQueueArnParameter(props.tenantId, props.environment, props.moduleName),
				stringValue: workerQueue.queueArn,
			});
			new StringParameter(this, `WorkerQueueNameParameter`, {
				parameterName: workerQueueNameParameter(props.tenantId, props.environment, props.moduleName),
				stringValue: workerQueue.queueName,
			});
			new StringParameter(this, `WorkerQueueUrlParameter`, {
				parameterName: workerQueueUrlParameter(props.tenantId, props.environment, props.moduleName),
				stringValue: workerQueue.queueUrl,
			});

			this.workerQueueArn = workerQueue.queueArn;

			/**
			 * Define the SQS Lambda
			 */

			const sqsLambda = new NodejsFunction(this, 'SQSLambda', {
				functionName: `${namePrefix}-${props.moduleName}-sqs`,
				description: `${props.moduleName} SQS: Tenant ${props.tenantId}`,
				/*
				 * Semgrep issue https://sg.run/OPqk
				 * Ignore reason: there is no risk of path traversal in this context
				*/
				entry: path.join(__dirname, props.queue.moduleSqsLambdaLocation), // nosemgrep
				runtime: Runtime.NODEJS_18_X,
				tracing: Tracing.ACTIVE,
				memorySize: 512,
				timeout: Duration.minutes(5),
				logRetention: RetentionDays.ONE_WEEK,
				environment: {
					NODE_ENV: props.environment,
					EVENT_BUS_NAME: props.eventBusName,
					TABLE_NAME: hasTable ? table.tableName : undefined,
					WORKER_QUEUE_URL: workerQueue.queueUrl,
					ACCESS_MANAGEMENT_FUNCTION_NAME: props.auth?.accessManagementApiFunctionName,
				},

				bundling: {
					minify: true,
					format: OutputFormat.ESM,
					target: 'node18.16',
					sourceMap: false,
					sourcesContent: false,
					banner: 'import { createRequire } from \'module\';const require = createRequire(import.meta.url);import { fileURLToPath } from \'url\';import { dirname } from \'path\';const __filename = fileURLToPath(import.meta.url);const __dirname = dirname(__filename);',
					externalModules: ['aws-sdk'],
				},
				/*
				 * Semgrep issue https://sg.run/OPqk
				 * Ignore reason: there is no risk of path traversal in this context
				*/
				depsLockFilePath: path.join(__dirname, props.queue.pnpmLockFileLocation), // nosemgrep
				architecture: getLambdaArchitecture(scope),
			});

			sqsLambda.node.addDependency(workerQueue);

			const eventSource = new SqsEventSource(workerQueue);
			sqsLambda.addEventSource(eventSource);

			new StringParameter(this, 'SqsFunctionNameParameter', {
				parameterName: sqsFunctionNameParameter(props.tenantId, props.environment, props.moduleName),
				stringValue: sqsLambda.functionName,
			});

			new StringParameter(this, 'SqsFunctionArnParameter', {
				parameterName: sqsFunctionArnParameter(props.tenantId, props.environment, props.moduleName),
				stringValue: sqsLambda.functionArn,
			});

			// sqs lambda permissions
			if (hasTable) {
				table.grantWriteData(sqsLambda);
				table.grantReadData(sqsLambda);
			}
			eventBus.grantPutEventsTo(sqsLambda);
			workerQueue.grantSendMessages(sqsLambda);
			workerQueue.grantConsumeMessages(sqsLambda);

			if (props.auth !== undefined) {
				const accessManagementLambda = Function.fromFunctionName(this, 'AccessManagementLambda', props.auth.accessManagementApiFunctionName);
				accessManagementLambda.grantInvoke(sqsLambda);
			}

			const accountId = Stack.of(this).account;
			const region = Stack.of(this).region;

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

					}
				],
				true);
		}
	}
}
