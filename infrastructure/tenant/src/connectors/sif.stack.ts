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

import { Stack, StackProps } from 'aws-cdk-lib';
import { SifConnector } from './sif.construct.js';
import type { Construct } from 'constructs';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { eventBusNameParameter } from '../shared/eventbus.construct.js';
import { NagSuppressions } from 'cdk-nag';
import { sifConnectorFunctionNameParameter, pipelineProcessorApiFunctionNameParameter, accessManagementApiFunctionNameParameter } from '../shared/ssm.construct.js';
import { customResourceProviderTokenParameter } from '../shared/deploymentHelper.construct.js';

export type SifConnectorStackProperties = StackProps & {
	tenantId: string;
	environment: string;
	connectorName: string;
};

export class SifConnectorStack extends Stack {
	constructor(scope: Construct, id: string, props: SifConnectorStackProperties) {
		super(scope, id, props);

		// validation
		this.validateMandatoryParam(props, 'tenantId');
		this.validateMandatoryParam(props, 'environment');

		const eventBusName = StringParameter.fromStringParameterAttributes(this, 'eventBusName', {
			parameterName: eventBusNameParameter(props.tenantId, props.environment),
			simpleName: false,
		}).stringValue;


		const sifConnectorFunctionName = StringParameter.fromStringParameterAttributes(this, 'connectorFunctionName', {
			parameterName: sifConnectorFunctionNameParameter(props.tenantId, props.environment),
			simpleName: false,
		}).stringValue;

		const pipelineProcessorApiFunctionName = StringParameter.fromStringParameterAttributes(this, 'pipelineProcessorApiFunctionName', {
			parameterName: pipelineProcessorApiFunctionNameParameter(props.tenantId, props.environment),
			simpleName: false,
		}).stringValue;

		const accessManagementApiFunctionName = StringParameter.fromStringParameterAttributes(this, 'accessManagementApiFunctionName', {
			parameterName: accessManagementApiFunctionNameParameter(props.tenantId, props.environment),
			simpleName: false,
		}).stringValue;

		const customResourceProviderToken = StringParameter.fromStringParameterAttributes(this, 'customResourceProviderToken', {
			parameterName: customResourceProviderTokenParameter(props.tenantId, props.environment),
			simpleName: false,
		}).stringValue;

		new SifConnector(this, 'SifConnector', {
			tenantId: props.tenantId,
			environment: props.environment,
			eventBusName,
			accessManagementApiFunctionName,
			pipelineProcessorApiFunctionName,
			sifConnectorFunctionName,
			customResourceProviderToken,
			connectorName: props.connectorName
		});

		NagSuppressions.addResourceSuppressionsByPath(this, [
				'/sifConnector/LogRetentionaae0aa3c5b4d4f87b02d85b201efdd8a/ServiceRole/Resource'
			],
			[
				{
					id: 'AwsSolutions-IAM4',
					appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'],
					reason: 'This policy attached to the role is generated by CDK.'

				},
				{
					id: 'AwsSolutions-IAM5',
					appliesTo: ['Resource::*'],
					reason: 'The resource condition in the IAM policy is generated by CDK, this only applies to logs:DeleteRetentionPolicy and logs:PutRetentionPolicy actions.'

				}],
			true);
	}

	private validateMandatoryParam(props: SifConnectorStackProperties, name: string) {
		if (props[name] === undefined) {
			throw new Error(`${name} is required`);
		}
	}
}
