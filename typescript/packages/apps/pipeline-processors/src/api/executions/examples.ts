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

import type { PipelineExecution, PipelineExecutionList, PipelineExecutionRequest, SignedUrlListResponse, SignedUrlResponse, SignedUrlRequest } from './schemas.js';

const id = 'ajcuhek13ks';

const pipelineId = '7777777';

const createdAt = '2022-08-10T23:55:20.322Z';

const createdBy = 'someone@somewhere.com';

export const signedUrlRequestExample: SignedUrlRequest = {
	expiration: 2000
};

export const executionRequestExample: PipelineExecutionRequest = {
	expiration: 2000,
	mode: 'job',
	actionType: 'create',
	connectorOverrides: {
		'sif-csv-input-converter': {
			parameters: {
				key1: 'val1',
				key2: 'val2'
			}
		}
	}
};

export const signedUrlResponseExample: SignedUrlResponse = {
	url: 's3-signed-url...',
};

export const signedUrlListResponseExample: SignedUrlListResponse = {
	urls: ['s3-signed-url...'],
};

export const pipelineExecutionFullSuccess: PipelineExecution = {
	id,
	pipelineId,
	createdAt,
	updatedAt: createdAt,
	createdBy: '',
	updatedBy: createdBy,
	status: 'in_progress',
	pipelineVersion: 1,
	actionType: 'create',
	groupContextId: '/'
};

export const pipelineExecutionFullFail: PipelineExecution = {
	id,
	pipelineId,
	createdAt,
	updatedAt: createdAt,
	status: 'failed',
	createdBy,
	updatedBy: createdBy,
	pipelineVersion: 1,
	statusMessage: 'some validation error related to input file',
	actionType: 'create',
	groupContextId: '/'
};

export const pipelineExecutionListExample = () => {
	let list: PipelineExecutionList = {
		executions: [],
		pagination: {
			lastEvaluated: {
				executionId: id,
			},
		},
	};

	list.executions.push(pipelineExecutionFullSuccess);
	list.executions.push(pipelineExecutionFullFail);

	return list;
};
