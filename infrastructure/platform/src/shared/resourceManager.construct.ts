import { Construct } from 'constructs';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import path from 'path';
import { Runtime, Tracing } from 'aws-cdk-lib/aws-lambda';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { getLambdaArchitecture } from '@sif/cdk-common';
import { AccessLogFormat, AuthorizationType, Cors, EndpointType, LambdaRestApi, LogGroupLogDestination, MethodLoggingLevel } from 'aws-cdk-lib/aws-apigateway';
import { fileURLToPath } from 'url';
import { NagSuppressions } from 'cdk-nag';
import type { EventBus } from 'aws-cdk-lib/aws-events';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import { Choice, Condition, DefinitionBody, LogLevel, StateMachine, TaskInput, Wait, WaitTime } from 'aws-cdk-lib/aws-stepfunctions';
import { Rule } from 'aws-cdk-lib/aws-events';
import { AnyPrincipal, Effect, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { LambdaInvoke } from 'aws-cdk-lib/aws-stepfunctions-tasks';
import type { Table } from 'aws-cdk-lib/aws-dynamodb';
import * as cdk from 'aws-cdk-lib';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { Queue } from 'aws-cdk-lib/aws-sqs';
import * as ssm from 'aws-cdk-lib/aws-ssm';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ResourceManagerProperties {
	environment: string;
	semaphoreTable: Table;
	eventBus: EventBus;
	clusterIdentifier: string;
	lockName: string;
	rdsConcurrencyLimit: number;
}

export const auroraClusterStatusParameterName = (environment: string) => `/sif/shared/${environment}/aurora-cluster/status`;

export const platformResourceManagerApiFunctionNameParameter = (environment: string) => `/sif/shared/${environment}/platformResourceManager/apiFunctionName`;

export class ResourceManager extends Construct {

	constructor(scope: Construct, id: string, props: ResourceManagerProperties) {
		super(scope, id);

		const namePrefix = `sif-${props.environment}`;

		// To start with, default to `running`
		const auroraClusterStatusParameter = new StringParameter(this, `AuroraClusterStatusParameter`, {
			parameterName: auroraClusterStatusParameterName(props.environment),
			stringValue: 'available'
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
				externalModules: ['aws-sdk']
			},
			depsLockFilePath: path.join(__dirname, '../../../../common/config/rush/pnpm-lock.yaml'),
			architecture: getLambdaArchitecture(scope)
		};


		const resourceManagerApiFunctionName = `sif-${props.environment}-resourceManagerApi`;

		const apiLambda = new NodejsFunction(this, 'Apilambda', {
			...commonLambdaConfiguration,
			functionName: resourceManagerApiFunctionName,
			description: `Platform Manager API: Tenant ${props.environment}`,
			entry: path.join(__dirname, '../../../../typescript/packages/apps/platform-resource-manager/src/lambda_apiGateway.ts'),
			memorySize: 256,
			environment: {
				NODE_ENV: props.environment,
				RESOURCE_STATUS_PARAMETER_PREFIX: `/sif/shared/${props.environment}`,
				EVENT_BUS_NAME: props.eventBus.eventBusName,
				CLUSTER_IDENTIFIER: props.clusterIdentifier
			}
		});

		new ssm.StringParameter(this, 'platformResourceManagerApiFunctionNameParameter', {
			parameterName: platformResourceManagerApiFunctionNameParameter(props.environment),
			stringValue: resourceManagerApiFunctionName
		});

		props.eventBus.grantPutEventsTo(apiLambda);
		auroraClusterStatusParameter.grantWrite(apiLambda);
		auroraClusterStatusParameter.grantRead(apiLambda);

		const accountId = cdk.Stack.of(this).account;
		const region = cdk.Stack.of(this).region;

		apiLambda.addToRolePolicy(new PolicyStatement({
			sid: 'modifycluster',
			effect: Effect.ALLOW,
			actions: ['rds:StopDBCluster'],
			resources: [`arn:aws:rds:${region}:${accountId}:cluster:${props.clusterIdentifier}`]
		}));

		apiLambda.addToRolePolicy(new PolicyStatement({
			sid: 'describecluster',
			effect: Effect.ALLOW,
			actions: [
				'rds:StartDBCluster',
				'rds:DescribeDBClusters'
			],
			resources: [`arn:aws:rds:${region}:${accountId}:cluster:*`]
		}));

		const logGroup = new LogGroup(this, 'PipelineExecutionsApiLogs');

		const apigw = new LambdaRestApi(this, 'ApiGateway', {
			restApiName: `${namePrefix}-platformManagerApi`,
			description: `PlatformManager API: Tenant ${props.environment}`,
			handler: apiLambda,
			proxy: true,
			deployOptions: {
				stageName: 'prod',
				accessLogDestination: new LogGroupLogDestination(logGroup),
				accessLogFormat: AccessLogFormat.jsonWithStandardFields(),
				loggingLevel: MethodLoggingLevel.INFO
			},
			defaultCorsPreflightOptions: {
				allowOrigins: Cors.ALL_ORIGINS,
				allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key', 'X-Amz-Security-Token', 'X-Amz-User-Agent', 'Accept-Version', 'x-groupcontextid']
			},
			endpointTypes: [EndpointType.REGIONAL],
			defaultMethodOptions: {
				authorizationType: AuthorizationType.IAM
			}
		});

		apigw.node.addDependency(apiLambda);

		const startResourceStateMachineLogGroup = new LogGroup(this, 'StartResourceLogGroup', {
			logGroupName: `/aws/vendedlogs/states/${namePrefix}-startResource`,
			removalPolicy: RemovalPolicy.DESTROY
		});

		const waitForTenantExecution = new Wait(this, 'Wait For Tenant Execution', { time: WaitTime.duration(Duration.seconds(10)) });

		const getLockCountLambda = new NodejsFunction(this, 'GetLockCountLambda', {
			...commonLambdaConfiguration,
			description: `Get Lock Count Handler: Environment ${props.environment}`,
			entry: path.join(__dirname, '../../../../typescript/packages/apps/platform-resource-manager/src/lambda_stepFunction_getLock.ts'),
			functionName: `${namePrefix}-getLockCount`,
			environment: {
				NODE_ENV: props.environment,
				LOCK_MANAGER_TABLE: props.semaphoreTable.tableName,
				LOCK_NAME: props.lockName,
				RDS_CONCURRENCY_LIMIT: props.rdsConcurrencyLimit.toString()
			}
		});

		props.semaphoreTable.grantReadData(getLockCountLambda);

		const getLockCount = new LambdaInvoke(this, 'Get Semaphore Lock Count', {
			lambdaFunction: getLockCountLambda,
			payload: TaskInput.fromObject({
				'inputs.$': '$'
			})
			, outputPath: '$.Payload'
		});

		const stopAuroraClusterLambda = new NodejsFunction(this, 'StopAuroraClusterLambda', {
			...commonLambdaConfiguration,
			description: `Stop Aurora Cluster Handler: Environment ${props.environment}`,
			entry: path.join(__dirname, '../../../../typescript/packages/apps/platform-resource-manager/src/lambda_stepFunction_stopAuroraCluster.ts'),
			functionName: `${namePrefix}-stopAuroraCluster`,
			environment: {
				NODE_ENV: props.environment,
				CLUSTER_IDENTIFIER: props.clusterIdentifier
			}
		});

		auroraClusterStatusParameter.grantWrite(stopAuroraClusterLambda);

		stopAuroraClusterLambda.addToRolePolicy(new PolicyStatement({
			sid: 'stop',
			effect: Effect.ALLOW,
			actions: [
				'rds:StopDBCluster',
				'rds:StartDBCluster'
			],
			resources: [`arn:aws:rds:${region}:${accountId}:cluster:${props.clusterIdentifier}`]
		}));

		const stopAuroraCLuster = new LambdaInvoke(this, 'Stop Aurora Cluster', {
			lambdaFunction: stopAuroraClusterLambda,
			payload: TaskInput.fromObject({
				'inputs.$': '$'
			}), outputPath: '$.Payload'
		});

		const stopResourceStateMachine = new StateMachine(this, 'StopResourceStateMachine', {
			definitionBody: DefinitionBody.fromChainable(
				getLockCount
					.next(new Choice(this, 'Wait For Tenant?')
						.when(Condition.numberEquals('$.currentLockCount', 0),
							stopAuroraCLuster)
						.when(Condition.numberGreaterThan('$.currentLockCount', 0),
							waitForTenantExecution.next(getLockCount))
					)),
			logs: { destination: startResourceStateMachineLogGroup, level: LogLevel.ERROR, includeExecutionData: true },
			stateMachineName: `${namePrefix}-stopResource`,
			tracingEnabled: true
		});

		const eventsRole = new Role(this, 'EventsRuleRole', {
			assumedBy: new ServicePrincipal('events.amazonaws.com')
		});

		// Grant the start execution permission to the Events service
		stopResourceStateMachine.grantStartExecution(eventsRole);

		new Rule(this, 'StopAuroraClusterRule', {
			eventBus: props.eventBus,
			eventPattern: {
				source: ['com.aws.sif.platformResourceManager'],
				detailType: ['SIF>com.aws.sif.platformResourceManager>stopResource'],
				detail: {
					id: ['aurora-cluster']
				}
			}, targets: [{
				bind: () => ({
					id: 'stopAuroraCluster',
					arn: stopResourceStateMachine.stateMachineArn,
					role: eventsRole
				})
			}]
		});

		const eventBridgeLambda = new NodejsFunction(this, 'EventBridgeLambda', {
			...commonLambdaConfiguration,
			description: `EventBridge Platform Resource Manager: Environment ${props.environment}`,
			entry: path.join(__dirname, '../../../../typescript/packages/apps/platform-resource-manager/src/lambda_eventBridge.ts'),
			functionName: `${namePrefix}-platformResourceManager-eventBridge`,
			environment: {
				NODE_ENV: props.environment,
				CLUSTER_IDENTIFIER: props.clusterIdentifier,
				RESOURCE_STATUS_PARAMETER_PREFIX: `/sif/shared/${props.environment}`
			}
		});

		auroraClusterStatusParameter.grantWrite(eventBridgeLambda);
		auroraClusterStatusParameter.grantRead(eventBridgeLambda);

		const rdsNotificationRule = new Rule(this, 'RdsNotificationRule', {
			eventPattern: {
				source: ['aws.rds'],
				detailType: ['RDS DB Cluster Event'],
				detail: {
					EventCategories: ['notification'],
					SourceType: ['CLUSTER'],
					SourceArn: [`arn:aws:rds:${region}:${accountId}:cluster:${props.clusterIdentifier}`]
				}
			}
		});

		const deadLetterQueue = new Queue(this, 'DeadLetterQueue');

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

		rdsNotificationRule.addTarget(
			new LambdaFunction(eventBridgeLambda, {
				deadLetterQueue: deadLetterQueue,
				maxEventAge: Duration.minutes(5),
				retryAttempts: 2
			})
		);

		NagSuppressions.addResourceSuppressions([apiLambda, stopAuroraClusterLambda, getLockCountLambda, eventBridgeLambda],
			[
				{
					id: 'AwsSolutions-IAM4',
					appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'],
					reason: 'This policy is generated by CDK.'

				},
				{
					id: 'AwsSolutions-IAM5',
					appliesTo: ['Resource::*'],
					reason: 'The resource condition in the IAM policy is generated by CDK, this only applies to xray:PutTelemetryRecords and xray:PutTraceSegments actions.'
				}
			],
			true);

		NagSuppressions.addResourceSuppressions([apiLambda],
			[
				{
					id: 'AwsSolutions-IAM5',
					appliesTo: ['Resource::arn:aws:rds:<AWS::Region>:<AWS::AccountId>:cluster:*',`Resource::arn:aws:rds:${region}:${accountId}:cluster:*`],
					reason: 'This policy is required to query the status of the cluster.'
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
					id: 'AwsSolutions-APIG4',
					reason: 'OPTIONS has no auth.'
				},
				{
					id: 'AwsSolutions-COG4',
					reason: 'OPTIONS does not use Cognito auth.'
				}
			],
			true);

		NagSuppressions.addResourceSuppressions([stopResourceStateMachine],
			[
				{
					id: 'AwsSolutions-IAM5',
					appliesTo: [
						'Resource::<ResourceManagerGetLockCountLambdaFF2AE17B.Arn>:*',
						'Resource::<ResourceManagerStopAuroraClusterLambda00694950.Arn>:*'
					],
					reason: 'this policy is required to invoke lambda specified in the state machine definition'
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

		NagSuppressions.addResourceSuppressions(
			[deadLetterQueue],
			[
				{
					id: 'AwsSolutions-SQS3',
					reason: 'This is the dead letter queue.'
				}
			],
			true
		);
	}

}
