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
import { EventBus, Rule } from 'aws-cdk-lib/aws-events';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import path from 'path';
import { Runtime, Tracing } from 'aws-cdk-lib/aws-lambda';
import { CustomResource, Duration, RemovalPolicy } from 'aws-cdk-lib';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { PIPELINE_PROCESSOR_EVENT_SOURCE } from '@sif/events';
import { Queue } from 'aws-cdk-lib/aws-sqs';
import { AnyPrincipal, Effect, Policy, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { AttributeType, BillingMode, Table, TableEncryption } from 'aws-cdk-lib/aws-dynamodb';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { fileURLToPath } from 'url';
import { NagSuppressions } from 'cdk-nag';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


export interface CleanRoomsConnectorConstructProperties {
	tenantId: string;
	environment: string;
	eventBusName: string;
	bucketName: string;
	bucketPrefix: string;
	customResourceProviderToken: string;
	connectorName: string;
}

export class CleanRoomsConnector extends Construct {
	constructor(scope: Construct, id: string, props: CleanRoomsConnectorConstructProperties) {
		super(scope, id);

		const eventBus = EventBus.fromEventBusName(this, 'EventBus', props.eventBusName);

		const namePrefix = `sif-${props.tenantId}-${props.environment}`;

		const connectorPrefix = `${namePrefix}-connectors`;

		const bucket = Bucket.fromBucketName(this, 'Bucket', props.bucketName);

		const table = new Table(this, 'Table', {
			tableName: `${namePrefix}-cleanRoomsConnector`,
			partitionKey: {
				name: 'pk',
				type: AttributeType.STRING,
			},
			billingMode: BillingMode.PAY_PER_REQUEST,
			encryption: TableEncryption.AWS_MANAGED,
			pointInTimeRecovery: true,
			removalPolicy: RemovalPolicy.DESTROY,
		});

		/**
		 * Define the Query Executor Lambda
		 */
		const queryExecutorLambda = new NodejsFunction(this, 'QueryExecutorLambda', {
			functionName: `${connectorPrefix}-cleanRooms-queryExecutor`,
			description: `CleanRooms Connector Query Executor: Tenant ${props.tenantId}`,
			entry: path.join(__dirname, '../../../../typescript/packages/connectors/clean-rooms/src/lambda_query_executor_eventbridge.ts'),
			runtime: Runtime.NODEJS_16_X,
			tracing: Tracing.ACTIVE,
			memorySize: 256,
			timeout: Duration.minutes(1),
			logRetention: RetentionDays.ONE_WEEK,
			environment: {
				EVENT_BUS_NAME: props.eventBusName,
				NODE_ENV: props.environment,
				BUCKET_NAME: props.bucketName,
				BUCKET_PREFIX: props.bucketPrefix,
				TABLE_NAME: table.tableName
			},
			bundling: {
				minify: true,
				format: OutputFormat.ESM,
				target: 'node16.15',
				sourceMap: false,
				sourcesContent: false,
				banner: 'import { createRequire } from \'module\';const require = createRequire(import.meta.url);import { fileURLToPath } from \'url\';import { dirname } from \'path\';const __filename = fileURLToPath(import.meta.url);const __dirname = dirname(__filename);',
				externalModules: ['aws-sdk'],
			},
			depsLockFilePath: path.join(__dirname, '../../../../common/config/rush/pnpm-lock.yaml'),
		});

		const cleanRoomsPolicy = new Policy(this, 'clean-rooms-policy', {
			statements: [
				new PolicyStatement({
					actions: [
						'cleanrooms:StartProtectedQuery',
						'cleanrooms:GetSchema'
					],
					resources: ['*']
				})]
		});

		queryExecutorLambda.role?.attachInlinePolicy(
			cleanRoomsPolicy
		);

		eventBus.grantPutEventsTo(queryExecutorLambda);
		bucket.grantReadWrite(queryExecutorLambda);
		table.grantReadWriteData(queryExecutorLambda);

		// create dead letter queue
		const queryExecutorDlq = new Queue(this, 'QueryExecutorDlq');

		queryExecutorDlq.addToResourcePolicy(new PolicyStatement({
			sid: 'enforce-ssl',
			effect: Effect.DENY,
			principals: [new AnyPrincipal()],
			actions: ['sqs:*'],
			resources: [queryExecutorDlq.queueArn],
			conditions: {
				'Bool': {
					'aws:SecureTransport': 'false'
				}
			}
		}));

		const cleanRoomsConnectorRule = new Rule(this, 'CleanRoomsConnectorRule', {
			eventBus: eventBus,
			eventPattern: {
				source: [PIPELINE_PROCESSOR_EVENT_SOURCE],
				detail: {
					connector: {
						name: [props.connectorName],
					},
				},
			},
		});

		cleanRoomsConnectorRule.addTarget(
			new LambdaFunction(queryExecutorLambda, {
				deadLetterQueue: queryExecutorDlq,
				maxEventAge: Duration.minutes(5),
				retryAttempts: 2,
			})
		);

		/**
		 * Define the Result Processor Lambda
		 */
		const resultProcessorLambda = new NodejsFunction(this, 'ResultProcessorLambda', {
			functionName: `${connectorPrefix}-cleanRooms-resultProcessor`,
			description: `CleanRooms Connector Result Processor: Tenant ${props.tenantId}`,
			entry: path.join(__dirname, '../../../../typescript/packages/connectors/clean-rooms/src/lambda_result_processor_eventbridge.ts'),
			runtime: Runtime.NODEJS_16_X,
			tracing: Tracing.ACTIVE,
			memorySize: 256,
			timeout: Duration.minutes(5),
			logRetention: RetentionDays.ONE_WEEK,
			environment: {
				EVENT_BUS_NAME: props.eventBusName,
				NODE_ENV: props.environment,
				BUCKET_NAME: props.bucketName,
				BUCKET_PREFIX: props.bucketPrefix,
				TABLE_NAME: table.tableName
			},
			bundling: {
				minify: true,
				format: OutputFormat.ESM,
				target: 'node16.15',
				sourceMap: false,
				sourcesContent: false,
				banner: 'import { createRequire } from \'module\';const require = createRequire(import.meta.url);import { fileURLToPath } from \'url\';import { dirname } from \'path\';const __filename = fileURLToPath(import.meta.url);const __dirname = dirname(__filename);',
				externalModules: ['aws-sdk'],
			},
			depsLockFilePath: path.join(__dirname, '../../../../common/config/rush/pnpm-lock.yaml'),
		});

		eventBus.grantPutEventsTo(resultProcessorLambda);
		table.grantReadWriteData(resultProcessorLambda);
		bucket.grantRead(resultProcessorLambda);

		// create dead letter queue
		const resultProcessorDlq = new Queue(this, 'ResultProcessorDlq');

		resultProcessorDlq.addToResourcePolicy(new PolicyStatement({
			sid: 'enforce-ssl',
			effect: Effect.DENY,
			principals: [new AnyPrincipal()],
			actions: ['sqs:*'],
			resources: [resultProcessorDlq.queueArn],
			conditions: {
				'Bool': {
					'aws:SecureTransport': 'false'
				}
			}
		}));

		const cleanRoomsResultRule = new Rule(this, 'CleanRoomsResultRule', {
			eventPattern: {
				source: ['aws.s3'],
				detail: {
					bucket: {
						name: [props.bucketName],
					},
					object: {
						key: [{ prefix: `${props.bucketPrefix}/` }],
					},
				},
			},
		});

		cleanRoomsResultRule.addTarget(
			new LambdaFunction(resultProcessorLambda, {
				deadLetterQueue: resultProcessorDlq,
				maxEventAge: Duration.minutes(5),
				retryAttempts: 2,
			})
		);

		const newConnectorRequest = {
			'description': 'this connector queries AWS CleanRooms and convert it as a file upload into SIF compatible pipeline format',
			'name': props.connectorName,
			'type': 'input',
			'isManaged': true,
			'parameters': [
				{
					'name': 'query',
					'description': 'the query string to be run in AWS CleanRooms, prefix the variable to be replaced by the parameters field with #.'
				}, {
					'name': 'parameters',
					'description': 'the parameters (as an object) that will used to replaced a placeholder parameter in the query.',
				},
				{
					'name': 'membershipId',
					'description': 'membership for a specific AWS CleanRooms collaboration to run the query on.',
				}]
		};

		new CustomResource(this, 'CustomResourceConnectorSeeder', {
			serviceToken: props.customResourceProviderToken,
			resourceType: 'Custom::ConnectorSeeder',
			properties: {
				uniqueToken: Date.now(),
				connectors: [newConnectorRequest]
			}
		});

		NagSuppressions.addResourceSuppressions(cleanRoomsPolicy,
			[
				{
					id: 'AwsSolutions-IAM5',
					appliesTo: ['Resource::*'],
					reason: 'StartProtectedQuery does not support resource-level permissions.'
				}],
			true);

		NagSuppressions.addResourceSuppressions([resultProcessorLambda, queryExecutorLambda],
			[
				{
					id: 'AwsSolutions-IAM4',
					appliesTo: [
						'Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'],
					reason: 'This policy is the one generated by CDK.'

				},
				{
					id: 'AwsSolutions-IAM5',
					appliesTo: ['Action::s3:Abort*', 'Action::s3:DeleteObject*', 'Action::s3:GetBucket*', 'Action::s3:GetObject*', 'Action::s3:List*', 'Resource::arn:<AWS::Partition>:s3:::<bucketNameParameter>/*'],
					reason: 'This policy is required for the lambda to access the s3 bucket that contains reference datasets file.'
				},
				{
					id: 'AwsSolutions-IAM5',
					appliesTo: ['Resource::*'],
					reason: 'The resource condition in the IAM policy is generated by CDK, this only applies to xray:PutTelemetryRecords and xray:PutTraceSegments.'
				},
				{
					id: 'AwsSolutions-L1',
					reason: 'NODEJS_16_X to NODEJS_18_X upgrade not ready.',
				}
			],
			true);

		NagSuppressions.addResourceSuppressions([resultProcessorDlq, queryExecutorDlq],
			[
				{
					id: 'AwsSolutions-SQS3',
					reason: 'This is the DLQ queue.'
				}],
			true);
	}
}
