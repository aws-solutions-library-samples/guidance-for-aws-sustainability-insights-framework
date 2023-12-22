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

export type ActivityReference = {
	activityId: string;
	pipelineId: string;
	executionId: string;
	auditId: string;
	auditVersion?: number,
	date: Date;
	createdAt: Date;
}

export type QueryRequest = {
	groupId: string;
	pipelineId?: string;
	executionId?: string;
	dateFrom?: Date;
	dateTo?: Date;
	date?: Date;
	attributes?: Record<string, string>;
	maxRows?: number;
	nextToken?: number;
	showHistory?: boolean;
	showAggregate?: boolean;
	uniqueKeyAttributes?: Record<string, string>;
	unlimited?:boolean;
	download?:{
		queryId:string;
		bucket:string;
		bucketPrefix:string;
	}

};

export type DownloadQueryRequest = Omit<QueryRequest, 'nextToken' | 'maxRows'>

export type QueryResponse = {
	nextToken?: number;
	data: Record<string, string>[];
};

export type AggregateType = 'sum' | 'mean' | 'min' | 'max' | 'groupBy' | 'count'

export type Aggregate = {
	key: string;
	aggregate: AggregateType;
	type: string;
}

export type PipelineMetadata = {
	/* creation/update of the pipeline */
	updatedAt: Date;
	/* copy of pipeline._aggregatedOutputKeyAndTypeMap */
	outputKeysAndTypes: Record<string, string>;
	/* the unique types used as part of the transform definition */
	outputTypes: string[];
	/*  map of transform (include as unique) output to key* activity field */
	transformKeyMap: Record<string, string>;
	/* summary of aggregation config  */
	aggregate?: {
		fields: Aggregate[],
		timestampField: string
	}
};

export interface Output {
	name: string;
	type: string;
}

export type DownloadType = 'activity'| 'metric';

export interface ActivityRequest {
	queryRequest: QueryRequest;
	pipelineMetadata: PipelineMetadata;
}

export type ActivitiesDownloadState = 'in_progress' | 'failed' | 'success';

export type ActivitiesDownloadStatus = {
	state: ActivitiesDownloadState,
	errorMessage?: string
}
