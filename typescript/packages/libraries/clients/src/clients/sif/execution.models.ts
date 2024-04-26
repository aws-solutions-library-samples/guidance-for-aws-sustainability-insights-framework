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

import type { ConnectorConfig } from './pipeline.models.js';
import { Static, Type } from '@sinclair/typebox';

const actionType = Type.Enum(
	{
		create: 'create',
		delete: 'delete',
	},
	{
		description: 'Type of operation to perform in this pipeline execution.',
		default: 'create'
	}
);

const executionMode = Type.Enum(
	{
		inline: 'inline',
		job: 'job',
	},
	{
		description: 'Pipeline execution mode, inline will run the calculation synchronously.',
		default: 'job'
	}
);

const status = Type.Enum({
	waiting: 'waiting',
	in_progress: 'in_progress',
	calculating_metrics: 'calculating_metrics',
	success: 'success',
	failed: 'failed'
}, { description: 'Status of the pipeline execution.' });

export type Status = Static<typeof status>;


export type PipelineProcessorActionType = Static<typeof actionType>;

export type PipelineProcessorExecutionMode = Static<typeof executionMode>;

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
	createdAt: string;
	createdBy: string;
	executionArn?: string;
	id: string;
	inputUploadUrl?: string;
	pipelineId: string;
	pipelineVersion: number;
	auditVersion?: number;
	connectorOverrides?: Record<string, { parameters: Record<string, any> }>;
	status: Status;
	statusMessage?: string;
	triggerMetricAggregations?: boolean;
	groupContextId: string;
	updatedAt?: string;
	updatedBy?: string;
	inlineExecutionOutputs?: any;
	tags?: Record<string, string>;
}

export interface ExecutionList {
	executions: Execution[];
}




