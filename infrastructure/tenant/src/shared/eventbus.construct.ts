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

import { EventBus } from 'aws-cdk-lib/aws-events';
import { Construct } from 'constructs';
import * as ssm from 'aws-cdk-lib/aws-ssm';

export interface EventBusConstructProperties {
	tenantId: string;
	environment: string;
}

export const eventBusNameParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/shared/eventBusName`;
export const eventBusArnParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/shared/eventBusArn`;

export class Bus extends Construct {
	public readonly eventBusName: string;

	constructor(scope: Construct, id: string, props: EventBusConstructProperties) {
		super(scope, id);

		const namePrefix = `sif-${props.tenantId}-${props.environment}`;

		const bus = new EventBus(this, 'bus', {
			eventBusName: namePrefix,
		});

		this.eventBusName = bus.eventBusName;

		new ssm.StringParameter(this, 'eventBusNameParameter', {
			parameterName: eventBusNameParameter(props.tenantId, props.environment),
			stringValue: bus.eventBusName,
		});
		new ssm.StringParameter(this, 'eventBusArnParameter', {
			parameterName: eventBusArnParameter(props.tenantId, props.environment),
			stringValue: bus.eventBusArn,
		});
	}
}
