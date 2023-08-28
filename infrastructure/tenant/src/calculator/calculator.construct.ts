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

import { CustomResource, Duration, RemovalPolicy, Size, Stack, CfnWaitCondition, CfnWaitConditionHandle } from 'aws-cdk-lib';
import { ScalableTarget, ServiceNamespace } from 'aws-cdk-lib/aws-applicationautoscaling';
import { Metric } from 'aws-cdk-lib/aws-cloudwatch';
import { AttributeType, BillingMode, Table, TableEncryption } from 'aws-cdk-lib/aws-dynamodb';
import { AnyPrincipal, Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Alias, Code, Function, Runtime, Tracing } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { Asset } from 'aws-cdk-lib/aws-s3-assets';
import { Queue } from 'aws-cdk-lib/aws-sqs';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { NagSuppressions } from 'cdk-nag';
import { ExecSyncOptions, execSync } from 'child_process';
import { Construct } from 'constructs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getLambdaArchitecture } from '@sif/cdk-common';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface CalculatorConstructProperties {
	accessManagementApiFunctionName: string;
	impactsApiFunctionName: string;
	bucketName: string;
	calculationsApiFunctionName: string;
	calculatorFunctionName: string;
	environment: string;
	maxScaling: number;
	minScaling: number;
	pipelinesApiFunctionName: string;
	referenceDatasetsApiFunctionName: string;
	tenantDatabaseName: string;
	tenantSecretArn: string;
	tenantId: string;
	kmsKeyArn: string;
	customResourceProviderToken: string;
	camlInferenceEndpointName?: string;
	auditDataStreamArn: string;
	auditDataStreamName:string;
	decimalPrecision: number;
}

export const calculatorFunctionArnParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/calculator/functionArn`;
export const calculatorAuditSqsQueueUrlParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/calculator/auditSqsQueueUrl`;
export const calculatorAuditSqsQueueNameParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/calculator/auditSqsQueueName`;
export const calculatorAuditSqsQueueArnParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/calculator/auditSqsQueueArn`;
export const calculatorActivityInsertQueueArnParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/calculator/activityInsertQueueArn`;
export const calculatorActivityInsertQueueUrlParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/calculator/activityInsertQueueUrl`;
export const calculatorActivityInsertQueueNameParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/calculator/activityInsertQueueName`;

export class CalculatorModule extends Construct {
	constructor(scope: Construct, id: string, props: CalculatorConstructProperties) {
		super(scope, id);

		const namePrefix = `sif-${props.tenantId}-${props.environment}`;

		const execOptions: ExecSyncOptions = { stdio: ['ignore', process.stderr, 'inherit'] };

		const bucket = Bucket.fromBucketName(this, 'Bucket', props.bucketName);
		const calculationsLambda = NodejsFunction.fromFunctionName(this, 'CalculationsLambda', props.calculationsApiFunctionName);
		const pipelineLambda = NodejsFunction.fromFunctionName(this, 'PipelineLambda', props.pipelinesApiFunctionName);
		const impactsLambda = NodejsFunction.fromFunctionName(this, 'ImpactsLambda', props.impactsApiFunctionName);
		const accessManagementLambda = NodejsFunction.fromFunctionName(this, 'AccessManagementLambda', props.accessManagementApiFunctionName);
		const referenceDatasetsLambda = NodejsFunction.fromFunctionName(this, 'ReferenceDatasetsLambda', props.referenceDatasetsApiFunctionName);

		const accountId = Stack.of(this).account;
		const region = Stack.of(this).region;

		const sqlAsset = new Asset(this, 'SqlAsset', {
			path: path.join(__dirname, 'assets'),
		});

		/**
		 * CloudFormation WaitCondition resource to wait until database migration has been performed successfully
		 */
		const dataHash = Date.now().toString();
		const cfnWaitConditionHandle = new CfnWaitConditionHandle(this, 'CfnWaitConditionHandle'.concat(dataHash));

		const databaseSeederCustomResource = new CustomResource(this, 'CustomResourceDatabaseSeeder', {
			serviceToken: props.customResourceProviderToken,
			resourceType: 'Custom::DatabaseSeeder',
			properties: {
				uniqueToken: Date.now(),
				callbackUrl: cfnWaitConditionHandle.ref,
				assetBucket: sqlAsset.s3BucketName,
				assetPath: sqlAsset.s3ObjectKey,
				tenantSecretArn: props.tenantSecretArn,
				tenantDatabaseName: props.tenantDatabaseName
			}
		});

		// Note: AWS::CloudFormation::WaitCondition resource type does not support updates.
		new CfnWaitCondition(this, 'WC'.concat(dataHash), {
			count: 1,
			timeout: '1800',
			handle: cfnWaitConditionHandle.ref
		}).node.addDependency(databaseSeederCustomResource);

		/**
		 * Define the Audit SQS queue (and its dlq)
		 */
		const auditDlqQueue = new Queue(this, 'AuditDlqQueue', {
			queueName: `${namePrefix}-calculator-audits-dlq`,
		});

		auditDlqQueue.addToResourcePolicy(new PolicyStatement({
			sid: 'enforce-ssl',
			effect: Effect.DENY,
			principals: [new AnyPrincipal()],
			actions: ['sqs:*'],
			resources: [auditDlqQueue.queueArn],
			conditions: {
				'Bool': {
					'aws:SecureTransport': 'false'
				}
			}
		}));

		NagSuppressions.addResourceSuppressions(auditDlqQueue,
			[
				{
					id: 'AwsSolutions-SQS3',
					reason: 'This is the DLQ queue.'
				}],
			true);


		const auditQueue = new Queue(this, 'AuditQueue', {
			queueName: `${namePrefix}-calculator-audits`,
			deadLetterQueue: {
				maxReceiveCount: 3,
				queue: auditDlqQueue,
			},
			visibilityTimeout: Duration.seconds(130),
		});

		auditQueue.addToResourcePolicy(new PolicyStatement({
			sid: 'enforce-ssl',
			effect: Effect.DENY,
			principals: [new AnyPrincipal()],
			actions: ['sqs:*'],
			resources: [auditQueue.queueArn],
			conditions: {
				'Bool': {
					'aws:SecureTransport': 'false'
				}
			}
		}));

		new StringParameter(this, `AuditSqsQueueArnParameter`, {
			parameterName: calculatorAuditSqsQueueArnParameter(props.tenantId, props.environment),
			stringValue: auditQueue.queueArn,
		});
		new StringParameter(this, `AuditSqsQueueNameParameter`, {
			parameterName: calculatorAuditSqsQueueNameParameter(props.tenantId, props.environment),
			stringValue: auditQueue.queueName,
		});
		new StringParameter(this, `AuditSqsQueueUrlParameter`, {
			parameterName: calculatorAuditSqsQueueUrlParameter(props.tenantId, props.environment),
			stringValue: auditQueue.queueUrl,
		});



		/*
			* Activity Insert Queue
		*/

		const activityInsertDlq = new Queue(this, 'ActivityInsertDeadLetterQueue', {
			queueName: `${namePrefix}-calculator-activityInsert-dlq.fifo`,
			fifo: true
		});

		activityInsertDlq.addToResourcePolicy(new PolicyStatement({
			sid: 'enforce-ssl',
			effect: Effect.DENY,
			principals: [new AnyPrincipal()],
			actions: ['sqs:*'],
			resources: [activityInsertDlq.queueArn],
			conditions: {
				'Bool': {
					'aws:SecureTransport': 'false'
				}
			}
		}));

		NagSuppressions.addResourceSuppressions(activityInsertDlq,
			[
				{
					id: 'AwsSolutions-SQS3',
					reason: 'This is the DLQ queue.'
				}],
			true);

		const activityInsertQueue = new Queue(this,
			'activityInsertQueue',
			{
				queueName: `${namePrefix}-calculator-activityInsert.fifo`,
				fifo: true,
				visibilityTimeout: Duration.minutes(5),
				deadLetterQueue: {
					queue: activityInsertDlq,
					maxReceiveCount: 10
				}
			});

		activityInsertQueue.addToResourcePolicy(new PolicyStatement({
			sid: 'enforce-ssl',
			effect: Effect.DENY,
			principals: [new AnyPrincipal()],
			actions: ['sqs:*'],
			resources: [activityInsertQueue.queueArn],
			conditions: {
				'Bool': {
					'aws:SecureTransport': 'false'
				}
			}
		}));

		new StringParameter(this, `ActivityInsertQueueArn`, {
			parameterName: calculatorActivityInsertQueueArnParameter(props.tenantId, props.environment),
			stringValue: activityInsertQueue.queueArn,
		});
		new StringParameter(this, `ActivityInsertQueueNameParameter`, {
			parameterName: calculatorActivityInsertQueueNameParameter(props.tenantId, props.environment),
			stringValue: activityInsertQueue.queueName,
		});
		new StringParameter(this, `ActivityInsertQueueUrlParameter`, {
			parameterName: calculatorActivityInsertQueueUrlParameter(props.tenantId, props.environment),
			stringValue: activityInsertQueue.queueUrl,
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

		const calculatorPath = path.join(__dirname, '../../../../java/apps/calculator');

		const calculatorLambda = new Function(this, 'CalculatorHandler', {
			functionName: props.calculatorFunctionName,
			description: `Calculator Function: Tenant ${props.tenantId} `,
			runtime: Runtime.JAVA_17,
			handler: 'com.aws.sif.HandlerStream',
			memorySize: 1769,	// 1 vcpu
			timeout: Duration.minutes(10),
			logRetention: RetentionDays.ONE_WEEK,
			ephemeralStorageSize: Size.gibibytes(5),
			tracing: Tracing.ACTIVE,
			environment: {
				'TENANT_ID': props.tenantId,
				'ENVIRONMENT': props.environment,
				'BUCKET_NAME': props.bucketName,
				'CALCULATIONS_FUNCTION_NAME': props.calculationsApiFunctionName,
				'REFERENCEDATASETS_FUNCTION_NAME': props.referenceDatasetsApiFunctionName,
				'IMPACTS_FUNCTION_NAME': props.impactsApiFunctionName,
				'ACCESS_MANAGEMENT_FUNCTION_NAME': props.accessManagementApiFunctionName,
				'RESOURCE_MAPPING_TABLE_NAME': resourceMappingTable.tableName,
				'ACTIVITY_QUEUE_URL': activityInsertQueue.queueUrl,
				'AUDIT_QUEUE_URL': auditQueue.queueUrl,
				'AUDIT_DATA_STREAM_NAME':props.auditDataStreamName,
				'CAML_INFERENCE_ENDPOINT_NAME': props.camlInferenceEndpointName,
				'CALCULATOR_DECIMAL_PRECISION': props.decimalPrecision.toString()
			},
			code: Code.fromAsset(calculatorPath, {
				bundling: {
					workingDirectory: calculatorPath,
					image: Runtime.JAVA_17.bundlingImage,
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
			architecture: getLambdaArchitecture(scope),
		});
		calculatorLambda.node.addDependency(auditQueue);
		calculatorLambda.node.addDependency(activityInsertQueue);

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
		auditQueue.grantSendMessages(calculatorLambda);
		activityInsertQueue.grantSendMessages(calculatorLambda);

		calculatorLambda.addToRolePolicy(new PolicyStatement({
			sid: 'dateStream',
			effect: Effect.ALLOW,
			actions: ['kinesis:DescribeStream', 'kinesis:Get*', 'kinesis:List*', 'kinesis:PutRecord','kinesis:PutRecords'],
			resources: [props.auditDataStreamArn],
		}));

		calculatorLambda.addToRolePolicy(new PolicyStatement({
			sid: 'kms',
			effect: Effect.ALLOW,
			actions: ['kms:GenerateDataKey',
				'kms:Decrypt'],
			resources: [props.kmsKeyArn]
		}));

		calculatorLambda.addToRolePolicy(new PolicyStatement({
			sid: 'vpc',
			effect: Effect.ALLOW,
			actions: [
				'logs:CreateLogGroup',
				'logs:CreateLogStream',
				'logs:PutLogEvents'
			],
			resources: ['*']
		}));

		if (props.camlInferenceEndpointName) {
			calculatorLambda.addToRolePolicy(new PolicyStatement({
				sid: 'sagemakerruntime',
				effect: Effect.ALLOW,
				actions: [
					'sagemaker:InvokeEndpoint',
				],
				resources: [`arn:aws:sagemaker:${region}:${accountId}:endpoint/${props.camlInferenceEndpointName}`]
			}));
		}

		const alias = new Alias(this, 'CalculatorHandlerAlias', {
			aliasName: 'live',
			provisionedConcurrentExecutions: props.minScaling,
			version: calculatorLambda.currentVersion
		});

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
				},
				{
					id: 'AwsSolutions-IAM5',
					appliesTo: [
						'Action::kinesis:Get*',
						'Action::kinesis:List*'
					],
					reason: 'This policy is needed for kinesis delivery stream to get data from kinesis data stream.'
				}
			],
			true);
	}

}
