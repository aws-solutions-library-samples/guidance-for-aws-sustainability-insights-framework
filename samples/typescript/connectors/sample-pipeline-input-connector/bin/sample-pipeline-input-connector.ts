#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { SamplePipelineInputConnectorStack } from '../lib/sample-pipeline-input-connector-stack.js';

const app = new cdk.App();
const tenantId = getOrThrow('tenantId');
const environment = getOrThrow('environment');

export function getOrThrow(name: string): string {
	const attribute = app.node.tryGetContext(name) as string;
	if (attribute === undefined) {
		throw new Error(`'${name}' is required`);
	}
	return attribute;
}

new SamplePipelineInputConnectorStack(app, 'SamplePipelineInputConnectorStack', {
	stackName: `sif-${tenantId}-${environment}-sample-input-connector`,
	tenantId,
	environment
	/* If you don't specify 'env', this stack will be environment-agnostic.
	 * Account/Region-dependent features and context lookups will not work,
	 * but a single synthesized template can be deployed anywhere. */

	/* Uncomment the next line to specialize this stack for the AWS Account
	 * and Region that are implied by the current CLI configuration. */
	// env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },

	/* Uncomment the next line if you know exactly what Account and Region you
	 * want to deploy the stack to. */
	// env: { account: '123456789012', region: 'us-east-1' },

	/* For more information, see https://docs.aws.amazon.com/cdk/latest/guide/environments.html */
});
