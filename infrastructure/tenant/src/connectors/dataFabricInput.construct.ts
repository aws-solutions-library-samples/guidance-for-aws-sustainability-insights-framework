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

import { CustomResource, Duration, Stack } from 'aws-cdk-lib';
import { LayerVersion, Runtime, Tracing } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Queue } from 'aws-cdk-lib/aws-sqs';
import { EventBus, Rule } from 'aws-cdk-lib/aws-events';
import { NagSuppressions } from 'cdk-nag';
import { AnyPrincipal, Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { PIPELINE_PROCESSOR_EVENT_SOURCE } from '@sif/events';
import { getLambdaArchitecture } from '@sif/cdk-common';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface DataFabricInputConnectorConstructProperties {
	tenantId: string;
	environment: string;
	eventBusName: string;
	bucketName: string;
	bucketPrefix: string;
	dataFabricInputConnectorFunctionName: string;
	dataFabricRegion: string;
	dataFabricEventBusArn: string;
	customResourceProviderToken: string;
	connectorName: string;
	dfSustainabilityRoleArn: string;
}

export class DataFabricInputConnector extends Construct {
	constructor(scope: Construct, id: string, props: DataFabricInputConnectorConstructProperties) {
		super(scope, id);

		const eventBus = EventBus.fromEventBusName(this, 'EventBus', props.eventBusName);
		const region = Stack.of(this).region;
		/**
		 * Define the Connector Lambda
		 */
		const connectorLambda = new NodejsFunction(this, 'Lambda', {
			functionName: props.dataFabricInputConnectorFunctionName,
			description: `DataZone Input Connector: Tenant ${props.tenantId}`,
			entry: path.join(__dirname, '../../../../typescript/packages/connectors/data-fabric/src/lambda_input_eventbridge.ts'),
			runtime: Runtime.NODEJS_18_X,
			tracing: Tracing.ACTIVE,
			memorySize: 1054,
			timeout: Duration.seconds(300),
			logRetention: RetentionDays.ONE_WEEK,
			environment: {
				EVENT_BUS_NAME: props.eventBusName,
				NODE_ENV: props.environment,
				DATA_FABRIC_REGION: props.dataFabricRegion,
				DATA_FABRIC_EVENT_BUS_ARN: props.dataFabricEventBusArn,
				DF_SUSTAINABILITY_ROLE_ARN: props.dfSustainabilityRoleArn
			},
			bundling: {
				minify: true,
				format: OutputFormat.ESM,
				target: 'node18.16',
				sourceMap: false,
				sourcesContent: false,
				banner: 'import { createRequire } from \'module\';const require = createRequire(import.meta.url);import { fileURLToPath } from \'url\';import { dirname } from \'path\';const __filename = fileURLToPath(import.meta.url);const __dirname = dirname(__filename);',
				externalModules: ['aws-sdk', 'duckdb'],
			},
			layers: [LayerVersion.fromLayerVersionArn(this, 'DuckDBLayerVersion', `arn:aws:lambda:${region}:041475135427:layer:duckdb-nodejs-arm64:6`)],
			depsLockFilePath: path.join(__dirname, '../../../../common/config/rush/pnpm-lock.yaml'),
			architecture: getLambdaArchitecture(scope),
		});

		connectorLambda.addToRolePolicy(new PolicyStatement({
			effect: Effect.ALLOW,
			actions: ['sts:AssumeRole'],
			resources: [props.dfSustainabilityRoleArn]
		}));

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

		// grant the lambda functions access to the event bus
		eventBus.grantPutEventsTo(connectorLambda);

		const newConnectorRequest = {
			'description': 'this connector transforms a datazone asset into SIF compatible pipeline format',
			'requiresFileUpload': false,
			'name': props.connectorName,
			'type': 'input',
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
					'name': 'region',
					'description': 'Region where Amazon DataZone is being configured.',
				},
				{
					'name': 'assetListingId',
					'description': 'Amazon DataZone Asset Listing Identifier',
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

		const dataFabricInputConnectorRule = new Rule(this, 'DataFabricInputConnectorRule', {
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

		dataFabricInputConnectorRule.addTarget(
			new LambdaFunction(connectorLambda, {
				deadLetterQueue: deadLetterQueue,
				maxEventAge: Duration.minutes(5),
				retryAttempts: 2,
			})
		);

		const accountId = Stack.of(this).account;

		NagSuppressions.addResourceSuppressions([connectorLambda],
			[
				{
					id: 'AwsSolutions-IAM4',
					appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'],
					reason: 'This policy is the one generated by CDK.'

				},
				{
					id: 'AwsSolutions-IAM5',
					appliesTo: [
						`Resource::arn:<AWS::Partition>:lambda:${region}:${accountId}:function:<accessManagementApiFunctionNameParameter>:*`,
						`Resource::arn:<AWS::Partition>:lambda:${region}:${accountId}:function:<pipelineProcessorApiFunctionNameParameter>:*`],
					reason: 'This policy is required to invoke access management and pipeline processor'
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
