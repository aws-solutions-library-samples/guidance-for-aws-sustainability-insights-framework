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
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import path from 'path';
import { LayerVersion, Runtime, Tracing } from 'aws-cdk-lib/aws-lambda';
import { CustomResource, Duration, Stack } from 'aws-cdk-lib';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { getLambdaArchitecture } from '@sif/cdk-common';
import { fileURLToPath } from 'url';
import { NagSuppressions } from 'cdk-nag';
import { EventBus, Rule } from 'aws-cdk-lib/aws-events';
import { outputConnectorRequest } from '@sif/events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { Queue } from 'aws-cdk-lib/aws-sqs';
import { AnyPrincipal, Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Bucket } from 'aws-cdk-lib/aws-s3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface DataFabricOutputConstructProperties {
	tenantId: string;
	environment: string;
	eventBusName: string;
	bucketName: string;
	connectorName: string;
	dataFabricObjectPrefix: string;
	dataFabricOutputConnectorFunctionName: string;
	customResourceProviderToken: string;
	dataFabricEventBusArn: string;
	idcEmail: string;
	idcUserId: string;
	dfSustainabilityRoleArn: string;
	dataFabricRegion: string;
}

export class DataFabricOutputConnector extends Construct {
	constructor(scope: Construct, id: string, props: DataFabricOutputConstructProperties) {
		super(scope, id);

		const region = Stack.of(this).region;
		const accountId = Stack.of(this).account;

		const eventBus = EventBus.fromEventBusName(this, 'EventBus', props.eventBusName);
		const dataFabricEventBus = EventBus.fromEventBusArn(this, 'DataFabricEventBus', props.dataFabricEventBusArn);
		const bucket = Bucket.fromBucketName(this, 'Bucket', props.bucketName);

		const connectorLambda = new NodejsFunction(this, 'Lambda', {
			functionName: props.dataFabricOutputConnectorFunctionName,
			description: `DataFabric Output Connector: Tenant ${props.tenantId}`,
			entry: path.join(__dirname, '../../../../typescript/packages/connectors/data-fabric/src/lambda_output_eventbridge.ts'),
			runtime: Runtime.NODEJS_18_X,
			tracing: Tracing.ACTIVE,
			memorySize: 1054,
			timeout: Duration.seconds(300),
			logRetention: RetentionDays.ONE_WEEK,
			environment: {
				EVENT_BUS_NAME: props.eventBusName,
				NODE_ENV: props.environment,
				BUCKET_NAME: props.bucketName,
				DATA_FABRIC_OBJECT_PREFIX: props.dataFabricObjectPrefix,
				DATA_FABRIC_EVENT_BUS_ARN: props.dataFabricEventBusArn,
				AWS_ACCOUNT_ID: accountId,
				IDENTITY_CENTER_EMAIL: props.idcEmail,
				IDENTITY_CENTER_USER_ID: props.idcUserId,
				DF_SUSTAINABILITY_ROLE_ARN: props.dfSustainabilityRoleArn,
				DATA_FABRIC_REGION: props.dataFabricRegion,
			},
			layers: [LayerVersion.fromLayerVersionArn(this, 'DuckDBLayerVersion', `arn:aws:lambda:${region}:041475135427:layer:duckdb-nodejs-arm64:6`)],
			bundling: {
				minify: true,
				format: OutputFormat.ESM,
				target: 'node18.16',
				sourceMap: false,
				sourcesContent: false,
				banner: 'import { createRequire } from \'module\';const require = createRequire(import.meta.url);import { fileURLToPath } from \'url\';import { dirname } from \'path\';const __filename = fileURLToPath(import.meta.url);const __dirname = dirname(__filename);',
				externalModules: ['aws-sdk', 'duckdb'],
			},
			depsLockFilePath: path.join(__dirname, '../../../../common/config/rush/pnpm-lock.yaml'),
			architecture: getLambdaArchitecture(scope),
		});

		connectorLambda.addToRolePolicy(new PolicyStatement({
			effect: Effect.ALLOW,
			actions: ['sts:AssumeRole'],
			resources: [props.dfSustainabilityRoleArn]
		}));

		connectorLambda.addToRolePolicy(new PolicyStatement({
			sid: 'stepfunction',
			effect: Effect.ALLOW,
			actions: [
				'states:SendTaskSuccess',
				'states:DescribeExecution'
			],
			resources: ['*']
		}));

		bucket.grantReadWrite(connectorLambda);
		dataFabricEventBus.grantPutEventsTo(connectorLambda);

		// create dead letter queue
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

		const outputConnectorIntegrationRule = new Rule(this, 'OutputConnectorIntegrationRule', {
			eventBus: eventBus,
			eventPattern: {
				detailType: [outputConnectorRequest(props.connectorName)]
			}
		});

		outputConnectorIntegrationRule.addTarget(
			new LambdaFunction(connectorLambda, {
				deadLetterQueue: deadLetterQueue,
				maxEventAge: Duration.minutes(5),
				retryAttempts: 2,
			})
		);

		const newConnectorRequest = {
			'description': 'This connector will export the activity output data into s3 bucket partition by yearweek. It will also publish an event to Data Foundation module to register it as a Data Asset.',
			'name': props.connectorName,
			'type': 'output',
			'isManaged': true,
			'parameters': [
				{
					'name': 'domainId',
					'description': 'Amazon DataZone Domain Identifier',
				},
				{
					'name': 'environmentId',
					'description': 'Amazon DataZone Environment Identifier',
				},
				{
					'name': 'projectId',
					'description': 'Amazon DataZone Project Identifier',
				},
				{
					'name': 'roleArn',
					'description': 'IAM Role that will be used by Glue Crawler and Data Brew to create profile from the output file.',
				}
			]
		};

		new CustomResource(this, 'CustomResourceConnectorSeeder', {
			serviceToken: props.customResourceProviderToken,
			resourceType: 'Custom::ConnectorSeeder',
			properties: {
				uniqueToken: Date.now(),
				connectors: [newConnectorRequest]
			}
		});

		NagSuppressions.addResourceSuppressions([connectorLambda],
			[
				{
					id: 'AwsSolutions-IAM4',
					appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'],
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
				}],
			true);

		NagSuppressions.addResourceSuppressions([connectorLambda],
			[
				{
					id: 'AwsSolutions-IAM4',
					appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'],
					reason: 'This policy is the one generated by CDK.'

				},
				{
					id: 'AwsSolutions-IAM5',
					appliesTo: ['Resource::*'],
					reason: 'The resource condition in the IAM policy is generated by CDK, this only applies to xray:PutTelemetryRecords and xray:PutTraceSegments.'
				}],
			true);

		NagSuppressions.addResourceSuppressions(
			[deadLetterQueue],
			[
				{
					id: 'AwsSolutions-SQS3',
					reason: 'This is the dead letter queue.',
				},
			],
			true
		);

	}


}
