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
import { AttributeType, BillingMode, Table, TableEncryption } from 'aws-cdk-lib/aws-dynamodb';
import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import path from 'path';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime, Tracing } from 'aws-cdk-lib/aws-lambda';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { AnyPrincipal, Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Queue } from 'aws-cdk-lib/aws-sqs';
import { NagSuppressions } from 'cdk-nag';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { fileURLToPath } from 'url';
import { EventBus, Rule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import * as ssm from 'aws-cdk-lib/aws-ssm';

export interface SemaphoreConstructProperties {
	environment: string;
	lockName: string;
	rdsConcurrencyLimit: number;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const eventBusNameParameter = (environment: string) => `/sif/shared/${environment}/semaphore/eventBusName`;
export const acquireLockSqsQueueArnParameter = (environment: string) => `/sif/shared/${environment}/semaphore/acquireLockSqsQueueArn`;
export const releaseLockSqsQueueArnParameter = (environment: string) => `/sif/shared/${environment}/semaphore/releaseLockSqsQueueArn`;

export class Semaphore extends Construct {
	public tableName: string;

	constructor(scope: Construct, id: string, props?: SemaphoreConstructProperties) {
		super(scope, id);

		const namePrefix = `sif-${props.environment}`;

		const semaphoreEventBus = new EventBus(this, 'semaphoreEventBus', {
			eventBusName: namePrefix,
		});

		new ssm.StringParameter(this, 'eventBusNameParameter', {
			parameterName: eventBusNameParameter(props.environment),
			stringValue: semaphoreEventBus.eventBusName,
		});

		const semaphoreTable = new Table(this, 'Table', {
			tableName: `${namePrefix}-semaphore`,
			partitionKey: {
				name: 'pk',
				type: AttributeType.STRING,
			},
			billingMode: BillingMode.PAY_PER_REQUEST,
			encryption: TableEncryption.AWS_MANAGED,
			pointInTimeRecovery: true,
			removalPolicy: RemovalPolicy.DESTROY,
		});

		this.tableName = semaphoreTable.tableName;

		/**
		 * Queue for releasing lock operation and its DLQ
		 */
		const releaseLockDlqQueue = new Queue(this, 'ReleaseLockDlqQueue', {
			queueName: `${namePrefix}-release-lock-dlq.fifo`,
			fifo: true
		});

		const commonLambdaConfiguration = {
			runtime: Runtime.NODEJS_18_X,
			tracing: Tracing.ACTIVE,
			logRetention: RetentionDays.ONE_WEEK,
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
			depsLockFilePath: path.join(__dirname, '../../../../common/config/rush/pnpm-lock.yaml'), // nosemgrep
		};

		releaseLockDlqQueue.addToResourcePolicy(new PolicyStatement({
			sid: 'enforce-ssl',
			effect: Effect.DENY,
			principals: [new AnyPrincipal()],
			actions: ['sqs:*'],
			resources: [releaseLockDlqQueue.queueArn],
			conditions: {
				'Bool': {
					'aws:SecureTransport': 'false'
				}
			}
		}));


		const releaseLockQueue = new Queue(this, 'ReleaseLockQueue', {
			queueName: `${namePrefix}-release-lock.fifo`,
			deadLetterQueue: {
				maxReceiveCount: 3,
				queue: releaseLockDlqQueue,
			},
			fifo: true,
			visibilityTimeout: Duration.seconds(20),
		});

		releaseLockQueue.addToResourcePolicy(new PolicyStatement({
			sid: 'enforce-ssl',
			effect: Effect.DENY,
			principals: [new AnyPrincipal()],
			actions: ['sqs:*'],
			resources: [releaseLockQueue.queueArn],
			conditions: {
				'Bool': {
					'aws:SecureTransport': 'false'
				}
			}
		}));

		new StringParameter(this, `ReleaseLockSqsQueueArnParameter`, {
			parameterName: releaseLockSqsQueueArnParameter(props.environment),
			stringValue: releaseLockQueue.queueArn,
		});


		/**
		 * Queue for acquiring lock operation and its DLQ
		 */
		const acquireLockDlqQueue = new Queue(this, 'AcquireLockDlqQueue', {
			queueName: `${namePrefix}-acquire-lock-dlq.fifo`,
			fifo: true
		});

		acquireLockDlqQueue.addToResourcePolicy(new PolicyStatement({
			sid: 'enforce-ssl',
			effect: Effect.DENY,
			principals: [new AnyPrincipal()],
			actions: ['sqs:*'],
			resources: [acquireLockDlqQueue.queueArn],
			conditions: {
				'Bool': {
					'aws:SecureTransport': 'false'
				}
			}
		}));

		const acquireLockQueue = new Queue(this, 'AcquireLockQueue', {
			queueName: `${namePrefix}-acquire-lock.fifo`,
			fifo: true,
			deadLetterQueue: {
				maxReceiveCount: 5,
				queue: acquireLockDlqQueue,
			},
			visibilityTimeout: Duration.seconds(20),
		});

		acquireLockQueue.addToResourcePolicy(new PolicyStatement({
			sid: 'enforce-ssl',
			effect: Effect.DENY,
			principals: [new AnyPrincipal()],
			actions: ['sqs:*'],
			resources: [acquireLockQueue.queueArn],
			conditions: {
				'Bool': {
					'aws:SecureTransport': 'false'
				}
			}
		}));

		new StringParameter(this, `AcquireLockSqsQueueArnParameter`, {
			parameterName: acquireLockSqsQueueArnParameter(props.environment),
			stringValue: acquireLockQueue.queueArn,
		});

		/**
		 * Queue Garbage Collector and its event source subscription
		 */
		const lockGarbageCollectorLambda = new NodejsFunction(this, 'LockGarbageCollector', {
			...commonLambdaConfiguration,
			functionName: `${namePrefix}-lockGarbageCollector-eventBridge`,
			description: `Lock Garbage Collector: Environment ${props.environment}`,
			/*
			 * Semgrep issue https://sg.run/OPqk
			 * Ignore reason: there is no risk of path traversal in this context
			 */
			entry: path.join(__dirname, '../../../../typescript/packages/apps/concurrency-manager/src/lambda_garbageCollector_eventbridge.ts'), // nosemgrep
			memorySize: 128,
			timeout: Duration.minutes(1),
			environment: {
				NODE_ENV: props.environment,
				LOCK_MANAGER_TABLE: semaphoreTable.tableName,
				LOCK_NAME: props.lockName,
				RELEASE_LOCK_QUEUE_URL: releaseLockQueue.queueUrl,
				RDS_CONCURRENCY_LIMIT: props.rdsConcurrencyLimit.toString(),
				ENVIRONMENT_EVENT_BUS: semaphoreEventBus.eventBusName
			}
		});

		semaphoreEventBus.grantPutEventsTo(lockGarbageCollectorLambda);
		semaphoreTable.grantReadWriteData(lockGarbageCollectorLambda);
		releaseLockQueue.grantSendMessages(lockGarbageCollectorLambda);

		const stepFunctionLifecycleRule = new Rule(this, 'StepFunctionLifecycleRule', {
			eventPattern: {
				source: ['aws.states'],
				detail: {
					'status': ['ABORTED', 'TIMED_OUT', 'FAILED'],
					'stateMachineArn': [{ suffix: 'activityPipeline' }]
				},
			},
		});

		const lockGarbageCollectorDlqQueue = new Queue(this, 'LockGarbageCollectorDlqQueue');
		lockGarbageCollectorDlqQueue.addToResourcePolicy(new PolicyStatement({
			sid: 'enforce-ssl',
			effect: Effect.DENY,
			principals: [new AnyPrincipal()],
			actions: ['sqs:*'],
			resources: [lockGarbageCollectorDlqQueue.queueArn],
			conditions: {
				'Bool': {
					'aws:SecureTransport': 'false'
				}
			}
		}));

		stepFunctionLifecycleRule.addTarget(
			new LambdaFunction(lockGarbageCollectorLambda, {
				deadLetterQueue: lockGarbageCollectorDlqQueue,
				maxEventAge: Duration.minutes(5),
				retryAttempts: 2,
			})
		);

		/**
		 * Queue Manager  and its event source subscription
		 */
		const queueManagerLambda = new NodejsFunction(this, 'QueueManager', {
			...commonLambdaConfiguration,
			functionName: `${namePrefix}-queueManager-eventBridge`,
			description: `Queue Manager: Environment ${props.environment}`,
			/*
			 * Semgrep issue https://sg.run/OPqk
			 * Ignore reason: there is no risk of path traversal in this context
			 */
			entry: path.join(__dirname, '../../../../typescript/packages/apps/concurrency-manager/src/lambda_queueManager_eventbridge.ts'), // nosemgrep
			memorySize: 128,
			timeout: Duration.minutes(5),
			environment: {
				NODE_ENV: props.environment,
				LOCK_MANAGER_TABLE: semaphoreTable.tableName,
				LOCK_NAME: props.lockName,
				RDS_CONCURRENCY_LIMIT: props.rdsConcurrencyLimit.toString(),
				RELEASE_LOCK_QUEUE_URL: releaseLockQueue.queueUrl,
				ACQUIRE_LOCK_QUEUE_URL: acquireLockQueue.queueUrl,
			}
		});

		semaphoreTable.grantReadWriteData(queueManagerLambda);
		acquireLockQueue.grantPurge(queueManagerLambda);
		acquireLockQueue.grantConsumeMessages(queueManagerLambda);
		releaseLockQueue.grantPurge(queueManagerLambda);
		releaseLockQueue.grantConsumeMessages(queueManagerLambda);
		queueManagerLambda.addToRolePolicy(new PolicyStatement({
			sid: 'stepfunction',
			effect: Effect.ALLOW,
			actions: [
				'states:SendTaskSuccess',
				'states:DescribeExecution'
			],
			resources: ['*'],
		}));

		const pipelineProcessorsLockRule = new Rule(this, 'PipelineProcessorsLockRule', {
			eventBus: semaphoreEventBus,
			eventPattern: {
				source: ['com.aws.sif.pipelineProcessors', 'com.aws.sif.queueGarbageCollector'],
				detailType: [
					'SIF>com.aws.sif.pipelineProcessors>semaphoreLock'
				]
			},
		});

		const queueManagerDlqQueue = new Queue(this, 'QueueManagerDlqQueue');

		queueManagerDlqQueue.addToResourcePolicy(new PolicyStatement({
			sid: 'enforce-ssl',
			effect: Effect.DENY,
			principals: [new AnyPrincipal()],
			actions: ['sqs:*'],
			resources: [queueManagerDlqQueue.queueArn],
			conditions: {
				'Bool': {
					'aws:SecureTransport': 'false'
				}
			}
		}));

		pipelineProcessorsLockRule.addTarget(
			new LambdaFunction(queueManagerLambda, {
				deadLetterQueue: queueManagerDlqQueue,
				maxEventAge: Duration.minutes(5),
				retryAttempts: 2,
			})
		);

		NagSuppressions.addResourceSuppressions([lockGarbageCollectorDlqQueue, acquireLockDlqQueue, releaseLockDlqQueue, queueManagerDlqQueue],
			[
				{
					id: 'AwsSolutions-SQS3',
					reason: 'This is the dead letter queue.'

				},
			],
			true);

		NagSuppressions.addResourceSuppressions([lockGarbageCollectorLambda, queueManagerLambda],
			[
				{
					id: 'AwsSolutions-IAM4',
					appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'],
					reason: 'This policy is the one generated by CDK.'

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
