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
import type { Transformer, ActionType, PipelineType } from '@sif/clients';
import type { Output } from '../../api/activities/models';
import type { AffectedTimeRange } from '../../api/metrics/models';
import type { HistoryEvent } from '@aws-sdk/client-sfn';

export interface VerificationTaskEvent {
	source: {
		bucket: string;
		key: string;
	};
	pipelineId: string;
	executionId: string;
	pipelineType: PipelineType;
};

export interface VerificationTaskOutput {
	chunks: CalculationChunk[];
	source: S3Location;
	context?: CalculationContext;
};

export interface CalculationContext {
	pipelineId: string;
	executionId: string;
	actionType: ActionType;
	pipelineType: PipelineType;
	groupContextId: string;
	transformer: Transformer;
	pipelineCreatedBy: string;
};

export interface S3Location {
	key: string;
	bucket: string;
};

export interface S3SourceLocation {
	key: string;
	bucket: string;
	containsHeader: boolean;
	startByte: number;
	endByte: number;
};

export interface CalculationChunk {
	/**
	 * sequence
	 */
	sequence?: number;
	/**
	 * range
	 */
	range: [number, number];
}

export interface CalculationTaskEvent {
	chunk: CalculationChunk;
	source: S3Location;
	context?: CalculationContext;
};

export interface CalculationTaskResult {
	pipelineId?: string;
	executionId?: string;
	errorLocation?: S3Location;
	requiresAggregation?: boolean;
	metricQueue?: MetricQueue;
	pipelineType?: string;
	sequence: number;
};


export type MetricQueue = { order: number, metric: string }[]
export type GroupsQueue = { order: number, group: string }[]

export type Status = 'FAILED' | 'SUCCEEDED' | 'IN_PROGRESS';

export interface ProcessedTaskEventWithExecutionDetails {
	executionStartTime: string;
	executionArn: string;
	inputs: ProcessedTaskEvent[];
}

export interface ProcessedTaskEvent {
	groupContextId?: string;
	pipelineId?: string;
	pipelineType: PipelineType;
	executionId?: string;
	outputs?: Output[];
	requiresAggregation?: boolean;
	status?: Status;
	metricQueue: MetricQueue;
	sequence: number;
	errorLocation?: S3Location;
	timeRange?: AffectedTimeRange;
	groupsQueue?: GroupsQueue;
	nextMetric?: number;
	nextGroup?: number;
}

export interface AggregationResult {
	date: Date;
	groupValue: number;
}

export interface InsertActivityResult {
	pipelineId: string;
	executionId: string;
	sqlExecutionResult: 'success' | 'failed',
	errorMessage?: string;
	activityKey?: string;
	activityValuesKey?: string;
}

export interface InsertActivityBulkEvent {
	pipelineId: string;
	executionId: string;
	sequence: number;
	activityValuesKey: string;
};

export interface StepFunctionEvent extends HistoryEvent{
	name?: string;
}

export interface Dimension {
    Name: string | undefined;
    Value: string | undefined;
}

export interface StatisticSet {
    SampleCount: number | undefined;
    Sum: number | undefined;
    Minimum: number | undefined;
    Maximum: number | undefined;
}
export interface Metric {
    MetricName: string | undefined;
    Dimensions?: Dimension[];
    Timestamp?: Date;
    Value?: number;
    StatisticValues?: StatisticSet;
    Values?: number[];
    Counts?: number[];
    Unit?: string;
    StorageResolution?: number;
}

export type VerificationTaskHandler = Handler<VerificationTaskEvent, VerificationTaskOutput>;

export type CalculationTaskHandler = Handler<CalculationTaskEvent, CalculationTaskResult>;

export type SqlResultProcessorTaskHandler = Handler<ProcessedTaskEventWithExecutionDetails, ProcessedTaskEvent[]>;

export type RawResultProcessorTaskHandler = Handler<ProcessedTaskEventWithExecutionDetails, ProcessedTaskEventWithExecutionDetails>;

export type ResultProcessorTaskHandler = Handler<ProcessedTaskEventWithExecutionDetails, void>;

export type MetricAggregationTaskHandler = Handler<ProcessedTaskEvent[], ProcessedTaskEvent[]>;

export type PipelineAggregationTaskHandler = Handler<ProcessedTaskEvent[], ProcessedTaskEvent>;

export type ImpactCreationTaskHandler = Handler<ProcessedTaskEvent[], void>;

export type InsertActivityBulkTaskHandler = Handler<InsertActivityBulkEvent[], InsertActivityBulkEvent>;

export type InsertActivityBulkCompletionTaskHandler = Handler<ProcessedTaskEvent[], ProcessedTaskEvent>;
