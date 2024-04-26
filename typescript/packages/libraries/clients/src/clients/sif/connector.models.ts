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

import type { Pipeline, PipelineType } from './pipeline.models.js';
import type { Execution, Status } from './execution.models.js';
import type { S3Location } from './calculator.models';

export interface ConnectorParameter {
	name: string;
	description?: string;
	required?: boolean;
	defaultValue?: string | number | boolean;
}

export interface NewConnector {
	name: string;
	parameters?: ConnectorParameter[];
	requiresFileUpload?: boolean;
	type: ConnectorType;
}

export enum ConnectorType {
	input = 'input',
	output = 'output'
}

export type Connector = NewConnector & {
	id: string;
	createdAt: string;
	createdBy: string;
	isManaged?: boolean;
	description?: string;
	updatedBy?: string;
	updatedAt?: string;
}

export interface Connectors {
	connectors: Connector[];
}

export interface ConnectorIntegrationRequestEvent {
	executionId: string;
	pipeline: Pipeline;
	connector: {
		name: string,
		parameters: Record<string, any>;
	};
	rawInputDownloadUrl?: string;
	transformedInputUploadUrl: string;
	securityContext?: SecurityContext;
}

export interface ConnectorIntegrationResponseEvent {
	executionId: string,
	pipelineId: string,
	status: 'success' | 'error',
	statusMessage: string,
	securityContext?: SecurityContext;
	pipelineType: PipelineType;
	fileName?: string;
}

export type ConnectorSetupType = 'create' | 'delete' | 'update';

export interface ConnectorSetupRequestEvent {
	pipelineId: string,
	group: string,
	type: ConnectorSetupType,
	connector: {
		name: string,
		parameters: Record<string, any>;
	}
}

export interface ConnectorSetupResponseEvent {
	pipelineId: string,
	group: string,
	type: ConnectorSetupType,
	status: 'success' | 'error',
	statusMessage: string,
	connector: {
		name: string,
		parameters: Record<string, any>;
	}
}

export enum SecurityScope {
	superAdmin = 'superAdmin',
	admin = 'admin',
	contributor = 'contributor',
	reader = 'reader',
}

export interface GroupRoles {
	[name: string]: SecurityScope;
}

export interface SecurityContext {
	email: string;
	groupId: string;
	groupRoles: GroupRoles;
}

export interface OutputConnectorEvent {
	pipelineId: string,
	executionId: string,
	security: SecurityContext,
	taskStatus?: Status,
	taskStatusMessage?: string
}

export type PipelineOutputKey = {
	key: string,
	type: string,
	dateField?: boolean
};

export interface DataAsset {
	assetName: string;
	assetNamespace: string;
}

export type OutputConnectorAssetType = PipelineType | 'metrics';

/**
 * These information will be used by the output connector to construct data asset name and description
 */
export type PipelineMetadata = Pick<Pipeline, 'id' | 'name' | 'createdBy'>;

/**
 * These information will be used by the output connector to construct data asset name and description
 */
export type ExecutionMetadata = Pick<Execution, 'id' | 'createdBy'>;


export type ConnectorMetadata = {
	input: {
		name: string,
		parameters: Record<string, any>;
	}[]
	output: {
		name: string,
		parameters: Record<string, any>;
	}[]
};

export interface ConnectorOutputIntegrationRequestEvent {
	/**
	 * Asset can be created for all pipeline type and metrics output
	 */
	assetType: OutputConnectorAssetType,
	/**
	 * For activities, data, activities and reference datasets this will be the list of files produced by calculator
	 * For metrics, this will be file exported by the MetricExportTask
	 */
	files: S3Location[]
	fields: PipelineOutputKey[],
	/**
	 * List of DF input data assets used to produce the output
	 */
	inputDataAssets?: DataAsset[],
	/**
	 * Pipeline id and execution id will be needed when we need to relate the response back from output connector
	 */
	pipeline: PipelineMetadata,
	execution: ExecutionMetadata,
	connectors: ConnectorMetadata
}
