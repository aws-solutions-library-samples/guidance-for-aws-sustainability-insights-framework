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
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { userPoolIdParameter } from '../shared/cognito.construct.js';
import { eventBusNameParameter } from '../shared/eventbus.construct.js';
import { ResourceApiBase } from '../shared/resourceApiBase.construct.js';
import { ImpactsModule } from './impacts.construct.js';
import type { Construct } from 'constructs';
import { NagSuppressions } from 'cdk-nag';
import { accessManagementApiFunctionNameParameter, impactsApiFunctionNameParameter } from '../shared/ssm.construct.js';

export type ImpactsStackProperties = StackProps & {
	tenantId: string;
	environment: string;
	enableDeleteResource?: boolean;
	permittedOutgoingTenantPaths?: string;
	externallySharedGroupIds?: string;
};

export class ImpactsApiStack extends Stack {
	constructor(scope: Construct, id: string, props?: ImpactsStackProperties) {
		super(scope, id, props);

		// validation
		this.validateMandatoryParam(props, 'tenantId');
		this.validateMandatoryParam(props, 'environment');

		const cognitoUserPoolId = StringParameter.fromStringParameterAttributes(this, 'userPoolId', {
			parameterName: userPoolIdParameter(props.tenantId, props.environment),
			simpleName: false,
		}).stringValue;
		const eventBusName = StringParameter.fromStringParameterAttributes(this, 'eventBusName', {
			parameterName: eventBusNameParameter(props.tenantId, props.environment),
			simpleName: false,
		}).stringValue;
		const accessManagementApiFunctionName = StringParameter.fromStringParameterAttributes(this, 'accessManagementApiFunctionName', {
			parameterName: accessManagementApiFunctionNameParameter(props.tenantId, props.environment),
			simpleName: false,
		}).stringValue;

		const impactsApiFunctionName = StringParameter.fromStringParameterAttributes(this, 'impactsApiFunctionName', {
			parameterName: impactsApiFunctionNameParameter(props.tenantId, props.environment),
			simpleName: false,
		}).stringValue;

		const base = new ResourceApiBase(this, 'ResourceApiBase', {
			tenantId: props.tenantId,
			environment: props.environment,
			moduleName: 'impacts',
			eventBusName,
			auth: {
				accessManagementApiFunctionName,
			},
			queue: {
				moduleSqsLambdaLocation: '../../../../typescript/packages/apps/impacts/src/lambda_messaging_service_sqs.ts',
				pnpmLockFileLocation: '../../../../common/config/rush/pnpm-lock.yaml',
			},
		});

		const module = new ImpactsModule(this, 'Impacts', {
			tenantId: props.tenantId,
			environment: props.environment,
			accessManagementApiFunctionName,
			cognitoUserPoolId,
			eventBusName,
			tableName: base.tableName,
			workerQueueArn: base.workerQueueArn,
			enableDeleteResource: props.enableDeleteResource,
			permittedOutgoingTenantPaths: props?.permittedOutgoingTenantPaths,
			externallySharedGroupIds: props?.externallySharedGroupIds,
			impactsApiFunctionName: impactsApiFunctionName
		});
		module.node.addDependency(base);

		NagSuppressions.addResourceSuppressionsByPath(this, [
				'/Impacts/LogRetentionaae0aa3c5b4d4f87b02d85b201efdd8a/ServiceRole/Resource'
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

	private validateMandatoryParam(props: ImpactsStackProperties, name: string) {
		if (props[name] === undefined) {
			throw new Error(`${name} is required`);
		}
	}
}
