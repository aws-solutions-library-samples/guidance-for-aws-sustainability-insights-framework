import * as cdk from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { EventBus, Rule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { Duration } from 'aws-cdk-lib';
import { Queue } from 'aws-cdk-lib/aws-sqs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { PIPELINE_PROCESSOR_EVENT_SOURCE } from '../src/events.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type SamplePipelineInputConnectorStackProperties = cdk.StackProps & {
	tenantId: string;
	environment: string;
};

export const eventBusNameParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/shared/eventBusName`;

export class SamplePipelineInputConnectorStack extends cdk.Stack {
	constructor(scope: Construct, id: string, props: SamplePipelineInputConnectorStackProperties) {
		super(scope, id, props);

		const eventBusName = StringParameter.fromStringParameterAttributes(this, 'eventBusName', {
			parameterName: eventBusNameParameter(props.tenantId, props.environment),
			simpleName: false,
		}).stringValue;

		const connectorName = 'sample-pipeline-input-connector';

		const eventBus = EventBus.fromEventBusName(this, 'EventBus', eventBusName);

		const connectorLambda = new NodejsFunction(this, 'SampleInputConnectorLambda', {
			functionName: 'sample-input-connector-lambda',
			description: `sample input connector`,
			runtime: Runtime.NODEJS_18_X,
			entry: path.join(__dirname, '../src/handler.ts'),
			environment: {
				EVENT_BUS_NAME: eventBusName,
			},
		});

		const deadLetterQueue = new Queue(this, 'DeadLetterQueue');

		const connectorIntegrationRequestEventRule = new Rule(this, 'SampleConnectorRule', {
			eventBus: eventBus,
			eventPattern: {
				source: [PIPELINE_PROCESSOR_EVENT_SOURCE],
				detail: {
					connector: {
						name: [connectorName],
					},
				},
			},
		});

		connectorIntegrationRequestEventRule.addTarget(
			new LambdaFunction(connectorLambda, {
				deadLetterQueue: deadLetterQueue,
				maxEventAge: Duration.minutes(5),
				retryAttempts: 2,
			})
		);

		// grant the lambda functions access to the event bus
		eventBus.grantPutEventsTo(connectorLambda);
	}
}
