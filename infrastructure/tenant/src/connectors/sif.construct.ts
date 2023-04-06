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
import { Runtime, Tracing } from 'aws-cdk-lib/aws-lambda';
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


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface SifConnectorConstructProperties {
	tenantId: string;
	environment: string;
	eventBusName: string;
	accessManagementApiFunctionName: string;
	pipelineProcessorApiFunctionName: string;
	sifConnectorFunctionName: string;
	customResourceProviderToken: string;
	connectorName: string;
}

export class SifConnector extends Construct {
	constructor(scope: Construct, id: string, props: SifConnectorConstructProperties) {
		super(scope, id);

		const eventBus = EventBus.fromEventBusName(this, 'EventBus', props.eventBusName);

		const pipelineProcessorApiLambda = NodejsFunction.fromFunctionName(this, 'PipelineProcessorApiLambda', props.pipelineProcessorApiFunctionName);

		/**
		 * Define the Connector Lambda
		 */
		const connectorLambda = new NodejsFunction(this, 'Lambda', {
			functionName: props.sifConnectorFunctionName,
			description: `SIF Connector: Tenant ${props.tenantId}`,
			entry: path.join(__dirname, '../../../../typescript/packages/connectors/sif/src/lambda_eventbridge.ts'),
			runtime: Runtime.NODEJS_16_X,
			tracing: Tracing.ACTIVE,
			memorySize: 512,
			timeout: Duration.seconds(300),
			logRetention: RetentionDays.ONE_WEEK,
			environment: {
				EVENT_BUS_NAME: props.eventBusName,
				NODE_ENV: props.environment,
				PIPELINE_PROCESSOR_FUNCTION_NAME: props.pipelineProcessorApiFunctionName,
				ACCESS_MANAGEMENT_FUNCTION_NAME: props.accessManagementApiFunctionName
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

		// grant the lambda function access to pipeline processor lambda
		pipelineProcessorApiLambda.grantInvoke(connectorLambda);

		// grant the lambda functions access to the event bus
		eventBus.grantPutEventsTo(connectorLambda);

		const newConnectorRequest = {
			'description': 'this connector is an input integration connector to configure pipelines in a cascade.',
			'requiresFileUpload': true,
			'name': props.connectorName,
			'type': 'input',
			'isManaged': true
		};

		new CustomResource(this, 'CustomResourceConnectorSeeder', {
			serviceToken: props.customResourceProviderToken,
			resourceType: 'Custom::ConnectorSeeder',
			properties: {
				uniqueToken: Date.now(),
				connectors: [newConnectorRequest]
			}
		});

		const sifConnectorRule = new Rule(this, 'Rule', {
			eventPattern: {
				source: [PIPELINE_PROCESSOR_EVENT_SOURCE],
				detail: {
					connector: {
						name: [props.connectorName]
					}
				}
			},
		});

		sifConnectorRule.addTarget(
			new LambdaFunction(connectorLambda, {
				deadLetterQueue: deadLetterQueue,
				maxEventAge: Duration.minutes(5),
				retryAttempts: 2,
			})
		);

		const accountId = Stack.of(this).account;
		const region = Stack.of(this).region;

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
