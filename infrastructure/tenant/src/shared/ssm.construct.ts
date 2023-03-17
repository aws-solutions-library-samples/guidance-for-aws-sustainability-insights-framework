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
import { StringParameter } from 'aws-cdk-lib/aws-ssm';

export interface SSMConstructProperties {
	tenantId: string;
	environment: string;
}

export const impactsApiFunctionNameParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/impacts/apiFunctionName`;
export const referenceDatasetsApiFunctionNameParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/referenceDatasets/apiFunctionName`;
export const pipelinesApiFunctionNameParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/pipelines/apiFunctionName`;
export const calculationsApiFunctionNameParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/calculations/apiFunctionName`;
export const accessManagementApiFunctionNameParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/accessManagement/apiFunctionName`;
export const calculatorFunctionNameParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/calculator/functionName`;

export class SSM extends Construct {
	constructor(scope: Construct, id: string, props: SSMConstructProperties) {
		super(scope, id);

		const namePrefix = `sif-${props.tenantId}-${props.environment}`;

		new StringParameter(this, 'accessManagementApiFunctionNameParameter', {
			parameterName: accessManagementApiFunctionNameParameter(props.tenantId, props.environment),
			stringValue: `${namePrefix}-accessManagementApi`,
		});

		new StringParameter(this, 'calculatorFunctionNameParameter', {
			parameterName: calculatorFunctionNameParameter(props.tenantId, props.environment),
			stringValue: `${namePrefix}-calculator`,
		});

		new ssm.StringParameter(this, 'impactsApiFunctionNameParameter', {
			parameterName: impactsApiFunctionNameParameter(props.tenantId, props.environment),
			stringValue: `${namePrefix}-impactsApi`,
		});

		new ssm.StringParameter(this, 'referenceDatasetsFunctionNameParameter', {
			parameterName: referenceDatasetsApiFunctionNameParameter(props.tenantId, props.environment),
			stringValue: `${namePrefix}-referenceDatasetsApi`,
		});

		new ssm.StringParameter(this, 'pipelineFunctionNameParameter', {
			parameterName: pipelinesApiFunctionNameParameter(props.tenantId, props.environment),
			stringValue: `${namePrefix}-pipelinesApi`,
		});

		new ssm.StringParameter(this, 'calculationsApiFunctionNameParameter', {
			parameterName: calculationsApiFunctionNameParameter(props.tenantId, props.environment),
			stringValue: `${namePrefix}-calculationsApi`,
		});

	}
}
