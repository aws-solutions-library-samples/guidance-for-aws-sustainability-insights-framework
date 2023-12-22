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
import type { Transformer, ActionType, PipelineType, CalculatorS3TransformResponse, SecurityContext } from '@sif/clients';
import type { ActivityRequest, Output } from '../../api/activities/models';
import type { AffectedTimeRange, MetricsDownloadPayload } from '../../api/metrics/models';
import type { HistoryEvent } from '@aws-sdk/client-sfn';

export interface S3Location {
	key: string;
	bucket: string;
};

export interface VerificationTaskEvent {
	source: S3Location;
	pipelineId: string;
	executionId: string;
	pipelineType: PipelineType;
	securityContext: SecurityContext;
};

export interface VerificationTaskOutput {
	chunks: CalculationChunk[];
	source: S3Location;
	context?: CalculationContext;
};

export type DownloadType = 'activity' | 'metric';

export interface ActivityDownloadEvent {
	id: string,
	type: DownloadType,
	metricRequest?: MetricsDownloadPayload,
	activityRequest?: ActivityRequest
};

export interface ActivityDownloadInitiateTaskEvent {
	executionArn: string,
	payload: {
		id: string,
		type: DownloadType,
		metricRequest?: MetricsDownloadPayload,
		activityRequest?: ActivityRequest
	}
};

export type DownloadState = 'in_progress' | 'failed' | 'success';

export interface ActivityDownloadTaskResponse {
	id: string,
	type: DownloadType,
	state: DownloadState,
	executionArn?: string,
	metricRequest?: MetricsDownloadPayload,
	activityRequest?: ActivityRequest
};

export interface CalculationContext {
	pipelineId: string;
	executionId: string;
	pipelineType: PipelineType;
	actionType: ActionType;
	triggerMetricAggregations: boolean;
	transformer: Transformer;
	pipelineCreatedBy: string;
	security: SecurityContext;
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
	context: CalculationContext;
	taskToken?: string;
};

export type CalculatorS3TransformResponseWithSequence = CalculatorS3TransformResponse & { sequence: number };

export type InsertActivityBulkEvent = {
	context: CalculationContext,
	// this is the payload response from calculator
	calculatorTransformResponse?: CalculatorS3TransformResponseWithSequence,
	// use this token to signal back to StepFunction to resume operation
	stateMachine?: {
		taskToken: string
	}
}

export type SqlExecutionResultStatus = 'success' | 'failed';

export type InsertActivityBulkResult = {
	context?: CalculationContext,
	calculatorTransformResponse: CalculatorS3TransformResponseWithSequence,
	sqlExecutionResult: {
		status: SqlExecutionResultStatus
	}
}

export type InsertActivityBulkResultWithExecutionDetails = {
	inputs: InsertActivityBulkResult[],
	executionArn: string,
	executionStartTime: string;
}


export type MetricQueue = {
	order: number,
	metric: string
}[]
export type GroupsQueue = {
	order: number,
	group: string
}[]

export type ImpactCreationTaskEvent = {
	pipelineId: string,
	executionId: string,
	sequenceList: number[],
	security: SecurityContext;
	errorLocationList: S3Location[];
	pipelineType: string
}

export type Status = 'FAILED' | 'SUCCEEDED' | 'IN_PROGRESS';

export interface ProcessedTaskEvent {
	// from calculation context
	pipelineId: string;
	pipelineType: PipelineType;
	executionId: string;
	security: SecurityContext;
	// filled when checking the status from SQL insert
	status?: Status;
	// extracted from transform
	triggerMetricAggregations?: boolean;
	outputs?: Output[];
	requiresAggregation?: boolean;
	metricQueue: MetricQueue;
	// filled from calculator response
	sequenceList: number[],
	errorLocationList: S3Location[];
	// will be filled when aggregating metric
	timeRange?: AffectedTimeRange;
	groupsQueue?: GroupsQueue;
	nextMetric?: number;
	nextGroup?: number;
}

export type ProcessedTaskEventWithExecutionDetails =
	{
		input: ProcessedTaskEvent,
		executionArn?: string,
		executionStartTime?: string;
	}

export type MetricAggregationTaskEvent = Pick<ProcessedTaskEvent, 'security' | 'status' | 'timeRange' | 'pipelineId' | 'metricQueue' | 'groupsQueue' | 'nextMetric' | 'nextGroup'> & {
	metricAggregationJobId?: string,
	executionId?: string
}

export interface AggregationResult {
	date: Date;
	groupValue: number;
}

export interface StepFunctionEvent extends HistoryEvent {
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

export type CalculationTaskHandler = Handler<CalculationTaskEvent, InsertActivityBulkEvent>;

export type SqlResultProcessorTaskHandler = Handler<InsertActivityBulkResult[], ProcessedTaskEvent>;

export type InsertLatestValuesTaskHandler = Handler<ProcessedTaskEvent, ProcessedTaskEvent>;

export type RawResultProcessorTaskHandler = Handler<InsertActivityBulkResultWithExecutionDetails, ImpactCreationTaskEvent>;

export type ResultProcessorTaskHandler = Handler<ProcessedTaskEventWithExecutionDetails, void>;

export type SaveAggregationJobTaskHandler = Handler<ProcessedTaskEvent, ProcessedTaskEvent>;

export type MetricAggregationTaskHandler = Handler<MetricAggregationTaskEvent, MetricAggregationTaskEvent>;

export type PipelineAggregationTaskHandler = Handler<ProcessedTaskEvent, ProcessedTaskEvent>;

export type ImpactCreationTaskHandler = Handler<ImpactCreationTaskEvent, void>;

export type ActivityDownloadInitiateTaskHandler = Handler<ActivityDownloadInitiateTaskEvent, ActivityDownloadTaskResponse>;

export type ActivityDownloadStartTaskHandler = Handler<ActivityDownloadTaskResponse, ActivityDownloadTaskResponse>;

export type ActivityDownloadVerifyTaskHandler = Handler<ActivityDownloadTaskResponse, ActivityDownloadTaskResponse>;

