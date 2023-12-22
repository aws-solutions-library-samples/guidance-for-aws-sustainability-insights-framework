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
import { KinesisConnector } from './kinesis.construct.js';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { bucketNameParameter } from '../shared/s3.construct.js';
import { customResourceProviderTokenParameter } from '../shared/deploymentHelper.construct.js';

export type KinesisConnectorStackProperties = StackProps & {
	tenantId: string;
	environment: string;
	connectorName: string;
};

export class KinesisConnectorStack extends Stack {
	constructor(scope: Construct, id: string, props: KinesisConnectorStackProperties) {
		super(scope, id, props);

		// validation
		this.validateMandatoryParam(props, 'tenantId');
		this.validateMandatoryParam(props, 'environment');
		this.validateMandatoryParam(props, 'connectorName');

		const bucketName = StringParameter.fromStringParameterAttributes(this, 'bucketName', {
			parameterName: bucketNameParameter(props.tenantId, props.environment),
			simpleName: false,
		}).stringValue;

		const customResourceProviderToken = StringParameter.fromStringParameterAttributes(this, 'customResourceProviderToken', {
			parameterName: customResourceProviderTokenParameter(props.tenantId, props.environment),
			simpleName: false,
		}).stringValue;

		new KinesisConnector(this, 'KinesisConnector', {
			environment: props.environment,
			tenantId: props.tenantId,
			bucketName: bucketName,
			connectorName: props.connectorName,
			customResourceProviderToken
		});

	}

	private validateMandatoryParam(props: KinesisConnectorStackProperties, name: string) {
		if (props[name] === undefined) {
			throw new Error(`${name} is required`);
		}
	}
}
