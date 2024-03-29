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

import type { ConnectorConfig } from './pipeline.models';

export type PipelineProcessorActionType = 'create' | 'delete';
export type PipelineProcessorExecutionMode = 'inline' | 'job';


export interface NewExecution {
	inlineExecutionOptions?: string;
	mode: PipelineProcessorExecutionMode;
	actionType: PipelineProcessorActionType;
	tags?: Record<string, string>;
	expiration: number;
	connectorOverrides?: {
		[key: string]: ConnectorConfig
	};
}

export interface Execution {
	actionType: PipelineProcessorActionType;
	createdAt: Date;
	createdBy: string;
	executionArn?: string;
	id: string;
	inputUploadUrl?: string;
	pipelineId: string;
	pipelineVersion: number;
	auditVersion?: number;
	connectorOverrides?: Record<string, string>;
	status: string;
	statusMessage: string;
	triggerMetricAggregations?: boolean;
	groupContextId: string;
	updatedAt?: Date;
	updatedBy?: string;
	inlineExecutionOutputs?: any;
	tags?: Record<string, string>;
}

export interface ExecutionList {
	executions: Execution[];
}




