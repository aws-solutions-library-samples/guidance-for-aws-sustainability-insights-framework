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


export type ActivityQS ={
	pipelineId?: string,
	executionId?: string,
	groupId: string,
	dateFrom?: string,
	dateTo?: string,
	date?: string,
	attributes?: string,
	showHistory?: string,
	uniqueKeyAttributes?: string,
	fromToken?:string,
	count?:string
};

export interface ActivityResource {
 [name:string] : string|number|boolean|null
}

export interface ActivitiesList {
	activities: [ActivityResource],
	pagination?: {
		lastEvaluatedToken?: number
	}
}
