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

export class NotFoundError extends Error {
	public constructor(message: string) {
		super(message);
		this.name = 'NotFoundError';
	}
}

export enum PkType {
	Lock = 'l',
	Queue = 'q'
}

export interface ExecutionLock {
	name: string;
	at: string;
	tenantId: string;
	taskName: string;
	metadata: {
		pipelineId: string;
		executionId: string
	};
}

export interface Lock {
	currentLockCount: number;
	executionLocks: ExecutionLock[];
}

export interface Queue {
	name: string;
	enabled: boolean;
	eventSourceMappingId: string;
}

enum CriticalDatabaseTask {
	InsertActivityValues = 'InsertActivityValues',
	InsertActivityLatestValues = 'InsertActivityLatestValues',
	AggregateMetrics = 'AggregateMetrics',
	AggregatePipelineOutput = 'AggregatePipelineOutput',
	ActivityDownload = 'ActivityDownload'
}

export type StateMachineInput = {
	pipelineId: string;
	executionId: string;
}

export interface LockEvent {
	tenantId: string;
	executionName: string;
	taskName: string;
}

export const SemaphoreLockEventName = 'SIF>com.aws.sif.pipelineProcessors>semaphoreLock';

// This is the execution property of StepFunction context object https://docs.aws.amazon.com/step-functions/latest/dg/input-output-contextobject.html
export type StateMachineExecution = {
	Id: string;
	Name: string;
	// To handle both job and inline state machine
	Input: StateMachineInput | StateMachineInput[];
}

export type ReleaseLockMessage = {
	tenantId: string;
	executionName: string;
	taskName: string;
}

export type AcquireLockMessage = {
	token: string;
	tenantId: string;
	taskName: CriticalDatabaseTask;
	execution: StateMachineExecution;
}

export interface StateChangeEventDetail {
	'name': string,
	'status': 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'TIMED_OUT' | 'ABORTED'
}
