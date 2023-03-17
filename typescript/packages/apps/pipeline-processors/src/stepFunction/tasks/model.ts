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

import type { Handler } from 'aws-lambda/handler';
import type { Transformer, ActionType } from '@sif/clients';

export type VerificationTaskEvent = {
	source: {
		bucket: string;
		key: string;
	};
	pipelineId: string;
	pipelineExecutionId: string;
};

export type CalculationContext = {
	fileHeaders: string[];
	pipelineId: string;
	pipelineExecutionId: string;
	actionType: ActionType;
	groupContextId: string;
	transformer: Transformer;
	pipelineCreatedBy: string;
};

export type CalculationChunk = {
	startByte: number;
	endByte: number;
};

export type S3Location = {
	key: string;
	bucket: string;
};

export type S3SourceLocation = {
	key: string;
	bucket: string;
	containsHeader: boolean;
	startByte: number;
	endByte: number;
};

export type CalculationTaskEvent = {
	sequence: number;
	source: S3Location;
	chunk: CalculationChunk;
	context?: CalculationContext;
};

export type VerificationTaskOutput = {
	tasks: CalculationTaskEvent[];
};

export type ResultProcessorTaskEvent = {
	pipelineId: string;
	pipelineExecutionId: string;
	sequence: number;
	output: {
		auditLogLocation: S3Location;
		errorLocation: S3Location;
	};
};

export type AggregationTaskEvent = {
	pipelineId: string;
	pipelineExecutionId: string;
	groupContextId: string;
	transformer: Transformer;
};

export interface AggregationResult {
	date: Date;
	groupValue: number;
}

export type VerificationTaskHandler = Handler<VerificationTaskEvent, VerificationTaskOutput>;

export type CalculationTaskHandler = Handler<CalculationTaskEvent, ResultProcessorTaskEvent>;

export type ResultProcessorTaskHandler = Handler<ResultProcessorTaskEvent[], void>;

export type MetricAggregationTaskHandler = Handler<AggregationTaskEvent[], void>;
