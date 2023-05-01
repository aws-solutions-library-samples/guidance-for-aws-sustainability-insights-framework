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

export type AttributeType = 'string' | 'number' | 'boolean' | 'timestamp';

export interface Transform {
	index: number;
	formula: string;
	outputs: TransformOutput[];
}

export interface TransformOutput {
	index: number;
	key: string;
	type: AttributeType;
	metrics?: string[];
	aggregate?: string;
	includeAsUnique?: boolean;
	_keyMapping?: string;
}

export interface Parameter {
	label?: string;
	key: string;
	type: AttributeType;
}

export interface Transformer {
	transforms: Transform[];
	parameters: Parameter[];
}

export interface Pipeline {
	id: string;
	createdAt: Date;
	updatedAt: Date;
	connectorConfig?: PipelineConnectorConfig
	transformer: Transformer;
	version: number;
	createdBy: string;
	processorOptions?: {
		chunkSize?: number;
	};
	_aggregatedOutputKeyAndTypeMap: Record<string, string>;
}

export interface PipelineVersionList {
	pipelines: Pipeline[];
}

export interface PipelineConnectorConfig {
	input: ConnectorConfig[];
	output?: ConnectorConfig[];
}

export interface ConnectorConfig {
	name: string;
	parameters?: Record<string, string>;
}

