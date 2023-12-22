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
import type { Construct } from 'constructs';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { eventBusNameParameter } from '../shared/eventbus.construct.js';
import { CleanRoomsConnector } from './cleanRooms.construct.js';
import { customResourceProviderTokenParameter } from '../shared/deploymentHelper.construct.js';
import { bucketNameParameter } from '../shared/s3.construct.js';
import { NagSuppressions } from 'cdk-nag';

export type CleanRoomsConnectorStackProperties = StackProps & {
	tenantId: string;
	environment: string;
	connectorName: string;
};

export class CleanRoomsConnectorStack extends Stack {
	constructor(scope: Construct, id: string, props: CleanRoomsConnectorStackProperties) {
		super(scope, id, props);

		// validation
		this.validateMandatoryParam(props, 'tenantId');
		this.validateMandatoryParam(props, 'environment');
		this.validateMandatoryParam(props, 'connectorName');

		const eventBusName = StringParameter.fromStringParameterAttributes(this, 'eventBusName', {
			parameterName: eventBusNameParameter(props.tenantId, props.environment),
			simpleName: false,
		}).stringValue;

		const bucketName = StringParameter.fromStringParameterAttributes(this, 'bucketName', {
			parameterName: bucketNameParameter(props.tenantId, props.environment),
			simpleName: false,
		}).stringValue;

		const customResourceProviderToken = StringParameter.fromStringParameterAttributes(this, 'customResourceProviderToken', {
			parameterName: customResourceProviderTokenParameter(props.tenantId, props.environment),
			simpleName: false,
		}).stringValue;

		const bucketPrefix = 'cleanRooms';

		new CleanRoomsConnector(this, 'CleanRoomsConnector', {
			bucketName,
			bucketPrefix,
			eventBusName,
			customResourceProviderToken,
			connectorName: props.connectorName,
			environment: props.environment,
			tenantId: props.tenantId,
		});

		NagSuppressions.addResourceSuppressionsByPath(this, '/cleanRoomsConnector/LogRetentionaae0aa3c5b4d4f87b02d85b201efdd8a/ServiceRole/Resource'
			,
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

	private validateMandatoryParam(props: CleanRoomsConnectorStackProperties, name: string) {
		if (props[name] === undefined) {
			throw new Error(`${name} is required`);
		}
	}
}
