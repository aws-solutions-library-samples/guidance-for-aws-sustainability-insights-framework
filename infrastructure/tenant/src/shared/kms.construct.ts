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
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Key } from 'aws-cdk-lib/aws-kms';

export interface KmsConstructProperties {
	tenantId: string;
	environment: string;
}

export const kmsKeyArnParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/shared/kmsKeyArn`;

export class Kms extends Construct {
	constructor(scope: Construct, id: string, props: KmsConstructProperties) {
		super(scope, id);
		const kmsKey = new Key(this, 'TenantKmsKey', {
			enableKeyRotation: true
		});

		new ssm.StringParameter(this, 'TenantKmsKeyArnParameter', {
			parameterName: kmsKeyArnParameter(props.tenantId, props.environment),
			stringValue: kmsKey.keyArn
		});
	}
}
