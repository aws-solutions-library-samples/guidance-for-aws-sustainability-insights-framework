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

import { Aspects, aws_iam, Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { AccessLogFormat, AuthorizationType, CfnMethod, CognitoUserPoolsAuthorizer, Cors, EndpointType, LambdaRestApi, LogGroupLogDestination, MethodLoggingLevel } from 'aws-cdk-lib/aws-apigateway';
import { Code, Function, Runtime, Tracing } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { fileURLToPath } from 'url';
import path from 'path';
import { UserPool } from 'aws-cdk-lib/aws-cognito';
import { EventBus, Rule } from 'aws-cdk-lib/aws-events';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Queue } from 'aws-cdk-lib/aws-sqs';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { JsonPath, LogLevel, StateMachine, TaskInput } from 'aws-cdk-lib/aws-stepfunctions';
import { LambdaInvoke } from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { AnyPrincipal, Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { execSync, ExecSyncOptions } from 'child_process';
import { NagSuppressions } from 'cdk-nag';
import { getLambdaArchitecture } from '@sif/cdk-common';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ReferenceDatasetsConstructProperties {
	tenantId: string;
	environment: string;
	accessManagementApiFunctionName: string;
	cognitoUserPoolId: string;
	eventBusName: string;
	bucketName: string;
	tableName: string;
	workerQueueArn: string;
	enableDeleteResource?: boolean;
	permittedOutgoingTenantPaths: string;
	externallySharedGroupIds: string;
	referenceDatasetsApiFunctionName: string;
}

export const referenceDatasetsApiFunctionArnParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/referenceDatasets/apiFunctionArn`;
export const referenceDatasetsApiUrlParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/referenceDatasets/apiUrl`;
export const referenceDatasetsApiNameParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/referenceDatasets/apiName`;
export const referenceDatasetsBucketPrefixParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/referenceDatasets/bucketPrefix`;
export const referenceDatasetsStateMachineArnParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/referenceDatasets/stateMachineArn`;

export class ReferenceDatasetsModule extends Construct {
	constructor(scope: Construct, id: string, props: ReferenceDatasetsConstructProperties) {
		super(scope, id);

		const namePrefix = `sif-${props.tenantId}-${props.environment}`;

		const eventBus = EventBus.fromEventBusName(this, 'EventBus', props.eventBusName);
		const table = Table.fromTableAttributes(this, 'Table', {
			tableName: props.tableName,
			globalIndexes: ['siKey1-pk-index', 'siKey2-pk-index'],
		});
		const workerQueue = Queue.fromQueueArn(this, 'WorkerQueue', props.workerQueueArn);

		/**
		 * Get the S3 Bucket to store the reference data set file
		 */
		const bucket = Bucket.fromBucketName(this, 'Bucket', props.bucketName);
		const bucketPrefix = 'referenceDatasets';

		new ssm.StringParameter(this, 'referenceDatasetsBucketPrefixParameter', {
			parameterName: referenceDatasetsBucketPrefixParameter(props.tenantId, props.environment),
			stringValue: bucketPrefix,
		});

		const dataSourcesUploadRule = new Rule(this, 'DataSourcesUploadRule', {
			eventPattern: {
				source: ['aws.s3'],
				detail: {
					bucket: {
						name: [props.bucketName],
					},
					object: {
						key: [{ prefix: `${bucketPrefix}/` }],
					},
				},
			},
		});

		const stateMachineLambda = new NodejsFunction(this, 'stateMachineLambda', {
			description: `generic state machine lambda to perform state actions ${props.tenantId}`,
			entry: path.join(__dirname, '../../../../typescript/packages/apps/reference-datasets/src/lambda_state_machine.ts'),
			runtime: Runtime.NODEJS_18_X,
			tracing: Tracing.ACTIVE,
			functionName: `${namePrefix}-referenceDatasetsStateMachineLambda`,
			memorySize: 256,
			logRetention: RetentionDays.ONE_WEEK,
			environment: {
				NODE_ENV: props.environment,
				TABLE_NAME: table.tableName,
				BUCKET_NAME: bucket.bucketName,
				BUCKET_PREFIX: bucketPrefix,
				ACCESS_MANAGEMENT_FUNCTION_NAME: props.accessManagementApiFunctionName,
				EVENT_BUS_NAME: props.eventBusName,
				WORKER_QUEUE_URL: workerQueue.queueUrl,
				ENABLE_DELETE_RESOURCE: props.enableDeleteResource as unknown as string,
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
			depsLockFilePath: path.join(__dirname, '../../../../common/config/rush/pnpm-lock.yaml'),
			architecture: getLambdaArchitecture(scope),
		});

		table.grantWriteData(stateMachineLambda);
		table.grantReadData(stateMachineLambda);
		bucket.grantReadWrite(stateMachineLambda);
		eventBus.grantPutEventsTo(stateMachineLambda);
		workerQueue.grantSendMessages(stateMachineLambda);

		const execOptions: ExecSyncOptions = { stdio: ['ignore', process.stderr, 'inherit'] };
		const indexerLambdaPath = path.join(__dirname, '../../../../java/apps/referencedatasets-indexer');
		const indexerLambda = new Function(this, 'ReferenceDatasetsIndexerHandler', {
			functionName: `${namePrefix}-referenceDatasets-indexer`,
			description: `Reference Datasets Indexer Function: Tenant ${props.tenantId}`,
			runtime: Runtime.JAVA_17,
			handler: 'com.aws.sif.HandlerStream',
			memorySize: 1024,
			timeout: Duration.minutes(10),
			logRetention: RetentionDays.ONE_WEEK,
			tracing: Tracing.ACTIVE,
			environment: {
				'TENANT_ID': props.tenantId,
				'ENVIRONMENT': props.environment,
				'BUCKET_NAME': props.bucketName
			},
			code: Code.fromAsset(indexerLambdaPath, {
				bundling: {
					workingDirectory: indexerLambdaPath,
					image: Runtime.JAVA_17.bundlingImage,
					local: {
						tryBundle(outputDir: string): boolean {
							try {
								execSync(`mvn clean install`, {
									...execOptions,
									cwd: indexerLambdaPath,
								});
								/*
								 * Semgrep issue https://sg.run/l2lo
								 * Ignore reason: there is no risk of command injection in this context
								*/
								// nosemgrep
								execSync(`cp ./target/indexer.jar ${outputDir}`, {
									...execOptions,
									cwd: indexerLambdaPath,
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

		bucket.grantReadWrite(indexerLambda);

		const stateMachineLogGroup = new LogGroup(this, 'StateMachineLogGroup', { logGroupName: `/aws/stepfunctions/${namePrefix}-referenceDatasets`, removalPolicy: RemovalPolicy.DESTROY });

		const referenceDatasetsStateMachine = new StateMachine(this, 'ReferenceDatasetsStateMachine', {
			stateMachineName: `${namePrefix}-referenceDatasets`,
			tracingEnabled: true,
			logs: { destination: stateMachineLogGroup, level: LogLevel.ERROR, includeExecutionData: true },
			definition: new LambdaInvoke(this, 'indexReferenceDataset', {
				lambdaFunction: indexerLambda,
				outputPath: '$.Payload',
			}).next(
				new LambdaInvoke(this, 'updateReferenceDataset', {
					lambdaFunction: stateMachineLambda,
					payload: TaskInput.fromObject({
						payload: JsonPath.entirePayload,
						action: 'update',
					}),
				})
			),
		});

		/**
		 * Define the API Lambda
		 */
		const apiLambda = new NodejsFunction(this, 'Apilambda', {
			description: `Reference Dataset API: Tenant ${props.tenantId}`,
			functionName: props.referenceDatasetsApiFunctionName,
			entry: path.join(__dirname, '../../../../typescript/packages/apps/reference-datasets/src/lambda_apiGateway.ts'),
			runtime: Runtime.NODEJS_18_X,
			tracing: Tracing.ACTIVE,
			memorySize: 512,
			timeout: Duration.seconds(29),
			logRetention: RetentionDays.ONE_WEEK,
			environment: {
				MODULE_NAME: 'referenceDatasets',
				ACCESS_MANAGEMENT_FUNCTION_NAME: props.accessManagementApiFunctionName,
				BUCKET_NAME: bucket.bucketName,
				BUCKET_PREFIX: bucketPrefix,
				EVENT_BUS_NAME: props.eventBusName,
				NODE_ENV: props.environment,
				TABLE_NAME: props.tableName,
				WORKER_QUEUE_URL: workerQueue.queueUrl,
				ENABLE_DELETE_RESOURCE: props.enableDeleteResource as unknown as string,
				TENANT_ID: props.tenantId,
				PERMITTED_OUTGOING_TENANT_PATHS: props.permittedOutgoingTenantPaths,
				EXTERNALLY_SHARED_GROUP_IDS: props.externallySharedGroupIds,
				REFERENCE_DATASETS_STATE_MACHINE_ARN: referenceDatasetsStateMachine.stateMachineArn,
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
			depsLockFilePath: path.join(__dirname, '../../../../common/config/rush/pnpm-lock.yaml'),
			architecture: getLambdaArchitecture(scope),
		});

		apiLambda.node.addDependency(table);
		apiLambda.node.addDependency(workerQueue);

		new ssm.StringParameter(this, 'referenceDatasetsFunctionArnParameter', {
			parameterName: referenceDatasetsApiFunctionArnParameter(props.tenantId, props.environment),
			stringValue: apiLambda.functionArn,
		});

		// Grant access to bucket, eventbus and dynamodb
		table.grantWriteData(apiLambda);
		table.grantReadData(apiLambda);
		bucket.grantReadWrite(apiLambda);
		eventBus.grantPutEventsTo(apiLambda);
		workerQueue.grantSendMessages(apiLambda);

		/**
		 * Define permissions needed to invoke other tenants
		 * We will need to create a logical or for this policy
		 * To do this :
		 * 1- we will allow all invocation
		 * 2- Attach our inline policy to the lambda role
		 */

		if (props.permittedOutgoingTenantPaths) {
			// 1- Allow Policy
			const allowPolicy = {
				effects: Effect.ALLOW,
				actions: ['lambda:InvokeFunction'],
				resources: [],
			};
			const paths = props.permittedOutgoingTenantPaths.split(';');
			for (const tenantPath of paths) {
				const [tenant] = tenantPath.split(':');
				allowPolicy.resources.push(`arn:aws:lambda:*:*:function:sif-${tenant}-${props.environment}-referenceDatasetsApi:*`);
				allowPolicy.resources.push(`arn:aws:lambda:*:*:function:sif-${tenant}-${props.environment}-referenceDatasetsApi`);
			}

			const allowTenantInvocationPolicy = new aws_iam.Policy(this, `${namePrefix}-tenant-invocation-policy`, {
				policyName: `${namePrefix}-tenant-invocation-policy`,
				statements: [new aws_iam.PolicyStatement(allowPolicy)],
			});

			apiLambda.role?.attachInlinePolicy(allowTenantInvocationPolicy);

			NagSuppressions.addResourceSuppressions(allowTenantInvocationPolicy, [
				{
					id: 'AwsSolutions-IAM5',
					reason: 'This policy is required to invoke reference dataset in another tenant.'
				}]);
		}

		/**
		 * Define the API Gateway
		 */
		const logGroup = new LogGroup(this, 'ReferenceDatasetsApiLogs');

		const userPool = UserPool.fromUserPoolId(this, 'UserPool', props.cognitoUserPoolId);

		const authorizer = new CognitoUserPoolsAuthorizer(this, 'Authorizer', {
			cognitoUserPools: [userPool],
		});

		const authOptions = {
			authorizationType: AuthorizationType.COGNITO,
			authorizer: authorizer,
		};

		const apigw = new LambdaRestApi(this, 'ApiGateway', {
			restApiName: `${namePrefix}-referenceDatasets`,
			description: `ReferenceDatasetsApi: Tenant ${props.tenantId}`,
			handler: apiLambda,
			proxy: true,
			deployOptions: {
				stageName: 'prod',
				accessLogDestination: new LogGroupLogDestination(logGroup),
				accessLogFormat: AccessLogFormat.jsonWithStandardFields(),
				loggingLevel: MethodLoggingLevel.INFO,
			},
			defaultCorsPreflightOptions: {
				allowOrigins: Cors.ALL_ORIGINS,
				allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key', 'X-Amz-Security-Token', 'X-Amz-User-Agent', 'Accept-Version', 'x-groupcontextid']
			},
			endpointTypes: [EndpointType.REGIONAL],
			defaultMethodOptions: authOptions,
		});

		Aspects.of(apigw).add({
			visit(node) {
				if (node instanceof CfnMethod && node.httpMethod === 'OPTIONS') {
					node.addPropertyOverride('AuthorizationType', 'NONE');
				}
			}
		});

		apigw.node.addDependency(apiLambda);

		new ssm.StringParameter(this, 'referenceDatasetsUrlParameter', {
			parameterName: referenceDatasetsApiUrlParameter(props.tenantId, props.environment),
			stringValue: apigw.url,
		});

		new ssm.StringParameter(this, 'referenceDatasetsNameParameter', {
			parameterName: referenceDatasetsApiNameParameter(props.tenantId, props.environment),
			stringValue: apigw.restApiName,
		});

		new ssm.StringParameter(this, 'referenceDatasetsStateMachineArnParameter', {
			parameterName: referenceDatasetsStateMachineArnParameter(props.tenantId, props.environment),
			stringValue: referenceDatasetsStateMachine.stateMachineArn,
		});

		const bucketEventsLambda = new NodejsFunction(this, 'BucketEventsLambda', {
			description: `Reference Datasets Bucket Events Handler: Tenant ${props.tenantId}`,
			entry: path.join(__dirname, '../../../../typescript/packages/apps/reference-datasets/src/lambda_eventbridge.ts'),
			runtime: Runtime.NODEJS_18_X,
			tracing: Tracing.ACTIVE,
			functionName: `${namePrefix}-referenceDatasetsBucketEvents`,
			memorySize: 256,
			logRetention: RetentionDays.ONE_WEEK,
			environment: {
				NODE_ENV: props.environment,
				TABLE_NAME: table.tableName,
				ACCESS_MANAGEMENT_FUNCTION_NAME: props.accessManagementApiFunctionName,
				BUCKET_NAME: bucket.bucketName,
				BUCKET_PREFIX: bucketPrefix,
				EVENT_BUS_NAME: props.eventBusName,
				WORKER_QUEUE_URL: workerQueue.queueUrl,
				ENABLE_DELETE_RESOURCE: props.enableDeleteResource as unknown as string,
				TENANT_ID: props.tenantId,
				REFERENCE_DATASETS_STATE_MACHINE_ARN: referenceDatasetsStateMachine.stateMachineArn,
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
			depsLockFilePath: path.join(__dirname, '../../../../common/config/rush/pnpm-lock.yaml'),
			architecture: getLambdaArchitecture(scope),
		});

		// Grant access to bucket, eventbus and dynamodb
		referenceDatasetsStateMachine.grantStartExecution(bucketEventsLambda);
		referenceDatasetsStateMachine.grantStartExecution(apiLambda);
		table.grantWriteData(bucketEventsLambda);
		table.grantReadData(bucketEventsLambda);
		bucket.grantReadWrite(bucketEventsLambda);
		eventBus.grantPutEventsTo(bucketEventsLambda);
		workerQueue.grantSendMessages(bucketEventsLambda);

		const deadLetterQueue = new sqs.Queue(this, 'DeadLetterQueue');

		deadLetterQueue.addToResourcePolicy(new PolicyStatement({
			sid: 'enforce-ssl',
			effect: Effect.DENY,
			principals: [new AnyPrincipal()],
			actions: ['sqs:*'],
			resources: [deadLetterQueue.queueArn],
			conditions: {
				'Bool': {
					'aws:SecureTransport': 'false'
				}
			}
		}));

		dataSourcesUploadRule.addTarget(
			new LambdaFunction(bucketEventsLambda, {
				deadLetterQueue: deadLetterQueue,
				maxEventAge: Duration.minutes(5),
				retryAttempts: 2,
			})
		);

		const accessManagementLambda = Function.fromFunctionName(this, 'accessManagementLambda', props.accessManagementApiFunctionName);
		accessManagementLambda.grantInvoke(apiLambda);
		accessManagementLambda.grantInvoke(bucketEventsLambda);

		const accountId = Stack.of(this).account;
		const region = Stack.of(this).region;

		NagSuppressions.addResourceSuppressions([bucketEventsLambda, apiLambda, stateMachineLambda, indexerLambda],
			[
				{
					id: 'AwsSolutions-IAM4',
					appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'],
					reason: 'This policy is generated by CDK.'

				},
				{
					id: 'AwsSolutions-IAM5',
					appliesTo: [`Resource::arn:<AWS::Partition>:dynamodb:${region}:${accountId}:table/<ResourceApiBaseTable3133F8B2>/index/*`],
					reason: 'This policy is required for the lambda to access the resource api table.'

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
				}
			],
			true);

		NagSuppressions.addResourceSuppressions([apiLambda, bucketEventsLambda],
			[
				{
					id: 'AwsSolutions-IAM5',
					appliesTo: [`Resource::arn:<AWS::Partition>:lambda:${region}:${accountId}:function:<accessManagementApiFunctionNameParameter>:*`],
					reason: 'The API lambda needs to invoke access management lambda.'

				}
			],
			true);

		NagSuppressions.addResourceSuppressions([apigw],
			[
				{
					id: 'AwsSolutions-APIG2',
					reason: 'Request validation is being done by the Fastify module.'

				},
				{
					id: 'AwsSolutions-IAM4',
					appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AmazonAPIGatewayPushToCloudWatchLogs'],
					reason: 'API GW needs this policy to push logs to cloudwatch.'

				},
				{
					id: "AwsSolutions-APIG4",
					reason: 'OPTIONS has no auth.'
				},
				{
					id: "AwsSolutions-COG4",
					reason: 'OPTIONS does not use Cognito auth.'
				},
			],
			true);

		NagSuppressions.addResourceSuppressions([deadLetterQueue],
			[
				{
					id: 'AwsSolutions-SQS3',
					reason: 'This is the dead letter queue.'

				},
			],
			true);

		NagSuppressions.addResourceSuppressions([referenceDatasetsStateMachine],
			[
				{
					id: 'AwsSolutions-IAM5',
					appliesTo: [
						'Resource::<ReferenceDatasetsReferenceDatasetsIndexerHandlerA98CD045.Arn>:*',
						'Resource::<ReferenceDatasetsstateMachineLambda250495EF.Arn>:*'],
					reason: 'This policy is required to invoke lambda specified in the state machine definition'

				},
				{
					id: 'AwsSolutions-SF1',
					reason: 'We only care about logging the error for now.'

				},
				{
					id: 'AwsSolutions-IAM5',
					reason: 'This resource policy only applies to log.',
					appliesTo: ['Resource::*']

				}],
			true);
	}
}
