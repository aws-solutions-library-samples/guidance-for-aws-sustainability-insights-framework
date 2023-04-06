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
import { PipelineProcessors } from './pipelineProcessors.construct.js';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { userPoolIdParameter } from '../shared/cognito.construct.js';
import { eventBusNameParameter } from '../shared/eventbus.construct.js';
import { bucketNameParameter } from '../shared/s3.construct.js';
import { rdsProxyWriterEndpointParameter, rdsProxySecurityGroupParameter, vpcIdParameter, rdsProxyArnParameter } from '../shared/sharedTenant.stack.js';
import {
	activityBooleanValueTableParameter,
	activityDateTimeValueTableParameter,
	activityNumberValueTableParameter,
	activityStringValueTableParameter,
	activityTableParameter,
	tenantDatabaseNameParameter,
	tenantDatabaseUsernameParameter
} from '../shared/auroraSeeder.construct.js';
import { NagSuppressions } from 'cdk-nag';
import { accessManagementApiFunctionNameParameter, calculatorFunctionNameParameter, pipelineProcessorApiFunctionNameParameter, pipelinesApiFunctionNameParameter } from '../shared/ssm.construct.js';
import { kmsKeyArnParameter } from '../shared/kms.construct.js';

export type PipelineProcessorsStackProperties = StackProps & {
	tenantId: string;
	environment: string;
	caCert: string;
	downloadAuditFileParallelLimit: number;
	csvConnectorName: string;
};

export class PipelineProcessorsApiStack extends Stack {
	constructor(scope: Construct, id: string, props?: PipelineProcessorsStackProperties) {
		super(scope, id, props);

		const accessManagementApiFunctionName = StringParameter.fromStringParameterAttributes(this, 'accessManagementApiFunctionName', {
			parameterName: accessManagementApiFunctionNameParameter(props.tenantId, props.environment),
			simpleName: false
		}).stringValue;

		const calculatorFunctionName = StringParameter.fromStringParameterAttributes(this, 'calculatorFunctionName', {
			parameterName: calculatorFunctionNameParameter(props.tenantId, props.environment),
			simpleName: false,
		}).stringValue;

		const kmsKeyArn = StringParameter.fromStringParameterAttributes(this, 'kmsKeyArn', {
			parameterName: kmsKeyArnParameter(props.tenantId, props.environment),
			simpleName: false
		}).stringValue;

		const cognitoUserPoolId = StringParameter.fromStringParameterAttributes(this, 'userPoolId', {
			parameterName: userPoolIdParameter(props.tenantId, props.environment),
			simpleName: false,
		}).stringValue;

		const rdsProxyEndpoint = StringParameter.fromStringParameterAttributes(this, 'rdsProxyEndpoint', {
			parameterName: rdsProxyWriterEndpointParameter(props.environment),
			simpleName: false,
		}).stringValue;

		const eventBusName = StringParameter.fromStringParameterAttributes(this, 'eventBusName', {
			parameterName: eventBusNameParameter(props.tenantId, props.environment),
			simpleName: false,
		}).stringValue;

		const bucketName = StringParameter.fromStringParameterAttributes(this, 'bucketName', {
			parameterName: bucketNameParameter(props.tenantId, props.environment),
			simpleName: false,
		}).stringValue;

		const pipelineApiFunctionName = StringParameter.fromStringParameterAttributes(this, 'pipelineApiFunctionName', {
			parameterName: pipelinesApiFunctionNameParameter(props.tenantId, props.environment),
			simpleName: false,
		}).stringValue;

		const vpcId = StringParameter.fromStringParameterAttributes(this, 'vpcId', {
			parameterName: vpcIdParameter(props.environment),
			simpleName: false,
		}).stringValue;

		const rdsProxySecurityGroupId = StringParameter.fromStringParameterAttributes(this, 'rdsProxySecurityGroupId', {
			parameterName: rdsProxySecurityGroupParameter(props.environment),
			simpleName: false,
		}).stringValue;

		const tenantDatabaseUsername = StringParameter.fromStringParameterAttributes(this, 'tenantDatabaseUsername', {
			parameterName: tenantDatabaseUsernameParameter(props.tenantId, props.environment),
			simpleName: false,
		}).stringValue;

		const tenantDatabaseName = StringParameter.fromStringParameterAttributes(this, 'tenantDatabaseName', {
			parameterName: tenantDatabaseNameParameter(props.tenantId, props.environment),
			simpleName: false,
		}).stringValue;

		const rdsProxyArn = StringParameter.fromStringParameterAttributes(this, 'rdsProxyArn', {
			parameterName: rdsProxyArnParameter(props.environment),
			simpleName: false,
		}).stringValue;

		const activityTableName = StringParameter.fromStringParameterAttributes(this, 'activityTableName', {
			parameterName: activityTableParameter(props.tenantId, props.environment),
			simpleName: false,
		}).stringValue;

		const activityNumberValueTableName = StringParameter.fromStringParameterAttributes(this, 'activityNumberValueTableName', {
			parameterName: activityNumberValueTableParameter(props.tenantId, props.environment),
			simpleName: false,
		}).stringValue;

		const activityBooleanValueTableName = StringParameter.fromStringParameterAttributes(this, 'activityBooleanValueTableName', {
			parameterName: activityBooleanValueTableParameter(props.tenantId, props.environment),
			simpleName: false,
		}).stringValue;

		const activityStringValueTableName = StringParameter.fromStringParameterAttributes(this, 'activityStringValueTableName', {
			parameterName: activityStringValueTableParameter(props.tenantId, props.environment),
			simpleName: false,
		}).stringValue;

		const activityDateTimeValueTableName = StringParameter.fromStringParameterAttributes(this, 'activityDateTimeValueTableName', {
			parameterName: activityDateTimeValueTableParameter(props.tenantId, props.environment),
			simpleName: false,
		}).stringValue;

		const pipelineProcessorApiFunctionName = StringParameter.fromStringParameterAttributes(this, 'FunctionName', {
			parameterName: pipelineProcessorApiFunctionNameParameter(props.tenantId, props.environment),
			simpleName: false,
		}).stringValue;


		new PipelineProcessors(this, 'PipelineProcessors', {
			...props,
			accessManagementApiFunctionName,
			pipelineApiFunctionName,
			pipelineProcessorApiFunctionName,
			cognitoUserPoolId,
			eventBusName,
			bucketName,
			rdsProxyEndpoint,
			rdsProxySecurityGroupId,
			tenantDatabaseUsername,
			vpcId,
			tenantDatabaseName,
			rdsProxyArn,
			activityTableName,
			activityNumberValueTableName,
			activityBooleanValueTableName,
			activityDateTimeValueTableName,
			activityStringValueTableName,
			caCert: props.caCert,
			kmsKeyArn,
			calculatorFunctionName,
			downloadAuditFileParallelLimit: props.downloadAuditFileParallelLimit,
			csvConnectorName: props.csvConnectorName

		});

		NagSuppressions.addResourceSuppressionsByPath(this, [
				'/PipelineProcessors/LogRetentionaae0aa3c5b4d4f87b02d85b201efdd8a/ServiceRole/Resource'
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
}
