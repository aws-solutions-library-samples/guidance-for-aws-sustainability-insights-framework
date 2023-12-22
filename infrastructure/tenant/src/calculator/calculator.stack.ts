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
import { NagSuppressions } from 'cdk-nag';
import type { Construct } from 'constructs';
import {
	tenantDatabaseNameParameter,
	tenantSecretArnParameter
} from '../shared/auroraSeeder.construct.js';
import { customResourceProviderTokenParameter } from '../shared/deploymentHelper.construct.js';
import { kmsKeyArnParameter } from '../shared/kms.construct.js';
import { bucketNameParameter } from '../shared/s3.construct.js';
import {
	accessManagementApiFunctionNameParameter,
	calculationsApiFunctionNameParameter,
	calculatorFunctionNameParameter,
	impactsApiFunctionNameParameter,
	pipelinesApiFunctionNameParameter,
	referenceDatasetsApiFunctionNameParameter
} from '../shared/ssm.construct.js';
import { CalculatorModule } from './calculator.construct.js';
import { auditLogDepositorDataStreamArnParameter, auditLogDepositorDataStreamNameParameter } from '../auditLogDepositor/auditLogDepositor.construct.js';

export type CalculatorStackProperties = StackProps & {
	tenantId: string;
	environment: string;
	caCert: string;
	minScaling: number;
	maxScaling: number;
	includeCaml: boolean;
	decimalPrecision: number;
};

export const camlInferenceEndpointNameParameter = (environment: string) => `/sif/shared/${environment}/caml/inferenceEndpointName`;

export class CalculatorApiStack extends Stack {
	constructor(scope: Construct, id: string, props: CalculatorStackProperties) {
		super(scope, id, props);

		// validation
		this.validateMandatoryParam(props, 'tenantId');
		this.validateMandatoryParam(props, 'environment');

		const accessManagementApiFunctionName = StringParameter.fromStringParameterAttributes(this, 'accessManagementApiFunctionName', {
			parameterName: accessManagementApiFunctionNameParameter(props.tenantId, props.environment),
			simpleName: false,
		}).stringValue;

		const calculationsApiFunctionName = StringParameter.fromStringParameterAttributes(this, 'calculationsApiFunctionName', {
			parameterName: calculationsApiFunctionNameParameter(props.tenantId, props.environment),
			simpleName: false,
		}).stringValue;


		const bucketName = StringParameter.fromStringParameterAttributes(this, 'bucketName', {
			parameterName: bucketNameParameter(props.tenantId, props.environment),
			simpleName: false,
		}).stringValue;

		const pipelinesApiFunctionName = StringParameter.fromStringParameterAttributes(this, 'pipelineApiFunctionName', {
			parameterName: pipelinesApiFunctionNameParameter(props.tenantId, props.environment),
			simpleName: false,
		}).stringValue;

		const impactsApiFunctionName = StringParameter.fromStringParameterAttributes(this, 'impactsApiFunctionName', {
			parameterName: impactsApiFunctionNameParameter(props.tenantId, props.environment),
			simpleName: false,
		}).stringValue;

		const calculatorFunctionName = StringParameter.fromStringParameterAttributes(this, 'calculatorFunctionName', {
			parameterName: calculatorFunctionNameParameter(props.tenantId, props.environment),
			simpleName: false,
		}).stringValue;

		const referenceDatasetsApiFunctionName = StringParameter.fromStringParameterAttributes(this, 'referenceDatasetsApiFunctionName', {
			parameterName: referenceDatasetsApiFunctionNameParameter(props.tenantId, props.environment),
			simpleName: false,
		}).stringValue;

		const tenantDatabaseName = StringParameter.fromStringParameterAttributes(this, 'tenantDatabaseName', {
			parameterName: tenantDatabaseNameParameter(props.tenantId, props.environment),
			simpleName: false,
		}).stringValue;

		const tenantSecretArn = StringParameter.fromStringParameterAttributes(this, 'tenantSecretArn', {
			parameterName: tenantSecretArnParameter(props.tenantId, props.environment),
			simpleName: false,
		}).stringValue;

		const kmsKeyArn = StringParameter.fromStringParameterAttributes(this, 'kmsKeyArn', {
			parameterName: kmsKeyArnParameter(props.tenantId, props.environment),
			simpleName: false
		}).stringValue;

		const customResourceProviderToken = StringParameter.fromStringParameterAttributes(this, 'customResourceProviderToken', {
			parameterName: customResourceProviderTokenParameter(props.tenantId, props.environment),
			simpleName: false,
		}).stringValue;

		const camlInferenceEndpointName = props.includeCaml ? StringParameter.fromStringParameterAttributes(this, 'camlInferenceEndpointName', {
			parameterName: camlInferenceEndpointNameParameter(props.environment),
			simpleName: false
		}).stringValue : undefined;

		const auditDataStreamArn = StringParameter.fromStringParameterAttributes(this, 'auditDataStreamArn', {
			parameterName: auditLogDepositorDataStreamArnParameter(props.tenantId, props.environment),
			simpleName: false,
		}).stringValue;

		const auditDataStreamName = StringParameter.fromStringParameterAttributes(this, 'auditDataStreamName', {
			parameterName: auditLogDepositorDataStreamNameParameter(props.tenantId, props.environment),
			simpleName: false,
		}).stringValue;

		new CalculatorModule(this, 'Calculator', {
			tenantId: props.tenantId,
			environment: props.environment,
			minScaling: props.minScaling,
			maxScaling: props.maxScaling,
			customResourceProviderToken,
			accessManagementApiFunctionName,
			bucketName,
			tenantDatabaseName,
			pipelinesApiFunctionName,
			impactsApiFunctionName: impactsApiFunctionName,
			referenceDatasetsApiFunctionName,
			calculationsApiFunctionName,
			calculatorFunctionName,
			kmsKeyArn,
			tenantSecretArn,
			camlInferenceEndpointName,
			auditDataStreamArn,
			auditDataStreamName,
			decimalPrecision:props.decimalPrecision
		});

		NagSuppressions.addResourceSuppressionsByPath(this, [
				'/Calculator/LogRetentionaae0aa3c5b4d4f87b02d85b201efdd8a/ServiceRole/Resource'
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

	private validateMandatoryParam(props: CalculatorStackProperties, name: string) {
		if (props[name] === undefined) {
			throw new Error(`${name} is required`);
		}
	}
}
