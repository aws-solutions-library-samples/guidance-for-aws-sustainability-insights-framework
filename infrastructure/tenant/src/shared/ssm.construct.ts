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
export const pipelineProcessorApiFunctionNameParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/pipeline-processor/apiFunctionNameV2`;
export const auditLogDepositorApiFunctionNameParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/auditLogDepositor/apiFunctionName`;
export const auditLogDepositorDatabaseNameParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/auditLogDepositor/databaseName`;
export const auditLogDepositorTableNameParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/auditLogDepositor/tableName`;

// Connector parameters
export const sifConnectorFunctionNameParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/connectors/sif/functionName`;
export const csvConnectorFunctionNameParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/connectors/csv/functionName`;
export const dataFabricInputConnectorFunctionNameParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/connectors/dataFabricInput/functionName`;

export const dataFabricOutputConnectorFunctionNameParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/connectors/dataFabricOutput/functionName`;

export class SSM extends Construct {
	public pipelineApiFunctionNameParameter: ssm.StringParameter;
	public auditLogDepositorDatabaseNameParameter: ssm.StringParameter;
	public auditLogDepositorTableNameParameter: ssm.StringParameter;

	constructor(scope: Construct, id: string, props: SSMConstructProperties) {
		super(scope, id);

		const namePrefix = `sif-${props.tenantId}-${props.environment}`;
		const connectorPrefix = `sif-${props.tenantId}-${props.environment}-connectors`;

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

		this.pipelineApiFunctionNameParameter = new ssm.StringParameter(this, 'pipelineFunctionNameParameter', {
			parameterName: pipelinesApiFunctionNameParameter(props.tenantId, props.environment),
			stringValue: `${namePrefix}-pipelinesApi`,
		});

		new ssm.StringParameter(this, 'calculationsApiFunctionNameParameter', {
			parameterName: calculationsApiFunctionNameParameter(props.tenantId, props.environment),
			stringValue: `${namePrefix}-calculationsApi`,
		});

		new ssm.StringParameter(this, 'pipelineProcessorFunctionNameParameter', {
			parameterName: pipelineProcessorApiFunctionNameParameter(props.tenantId, props.environment),
			stringValue: `${namePrefix}-pipelineProcessorsApi`,
		});

		new ssm.StringParameter(this, 'sifConnectorApiFunctionNameParameter', {
			parameterName: sifConnectorFunctionNameParameter(props.tenantId, props.environment),
			stringValue: `${connectorPrefix}-sif`,
		});

		new ssm.StringParameter(this, 'csvConnectorApiFunctionNameParameter', {
			parameterName: csvConnectorFunctionNameParameter(props.tenantId, props.environment),
			stringValue: `${connectorPrefix}-csv`,
		});

		new ssm.StringParameter(this, 'dataZoneInputConnectorFunctionNameParameter', {
			parameterName: dataFabricInputConnectorFunctionNameParameter(props.tenantId, props.environment),
			stringValue: `${connectorPrefix}-dataFabric-input`,
		});

		new ssm.StringParameter(this, 'dataZoneOutputConnectorFunctionNameParameter', {
			parameterName: dataFabricOutputConnectorFunctionNameParameter(props.tenantId, props.environment),
			stringValue: `${connectorPrefix}-dataFabric-output`,
		});

		new ssm.StringParameter(this, 'auditLogDepositorApiFunctionNameParameter', {
			parameterName: auditLogDepositorApiFunctionNameParameter(props.tenantId, props.environment),
			stringValue: `${namePrefix}-auditLogDepositorApi`,
		});

		this.auditLogDepositorDatabaseNameParameter = new ssm.StringParameter(this, 'auditLogDepositorDatabaseNameParameter', {
			parameterName: auditLogDepositorDatabaseNameParameter(props.tenantId, props.environment),
			stringValue: `${namePrefix}-audit-log-depositor`,
		});

		this.auditLogDepositorTableNameParameter = new ssm.StringParameter(this, 'auditLogDepositorTableNameParameter', {
			parameterName: auditLogDepositorTableNameParameter(props.tenantId, props.environment),
			stringValue: `audit-logs`,
		});

	}
}
