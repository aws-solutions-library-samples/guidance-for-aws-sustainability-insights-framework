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

import { Static, TNumber, TString, Type } from '@sinclair/typebox';
import { id, stringEnum } from '@sif/resource-api-base';

export const executionArn: TString = Type.String({ description: 'Step Function execution arn.' });

export const executionId: TString = Type.String({ description: 'Identifier of a execution of the pipeline.' });

export const pipelineId: TString = Type.String({ description: 'Identifier of the pipeline configuration.' });

export const pipelineVersion: TNumber = Type.Number({ description: 'The version of the pipeline when the execution is created.' });

export const fromExecutionIdPaginationParam: TString = Type.Optional(Type.String({ description: 'Pipeline execution ID to paginate from (exclusive).' }));

export const countPaginationParam = Type.Optional(Type.Integer({ description: 'Count of results to return.' }));

const createdAt: TString = Type.String({
	description: 'Date/time created.',
	format: 'date-time',
});
const updatedAt: TString = Type.String({
	description: 'Date/time updated.',
	format: 'date-time',
});

const status = stringEnum(['waiting', 'in_progress', 'success', 'failed'], 'Status of the pipeline execution.');

const createdBy: TString = Type.String({
	description: 'Email of the user who created the pipeline.',
});
const updatedBy: TString = Type.String({
	description: 'Email of the user who updated the pipeline.',
});
const statusMessage: TString = Type.String({
	description: 'Execution status details message, in case there is meaningful message which needs to be reported, this property will be present with the message details.',
});

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


export const pipelineExecutionFull = Type.Object(
	{
		id,
		pipelineId,
		pipelineVersion,
		updatedAt: Type.Optional(updatedAt),
		updatedBy: Type.Optional(updatedBy),
		actionType,
		createdAt,
		createdBy,
		status,
		groupContextId: Type.String({ description: 'pipeline execution security context' }),
		executionArn: Type.Optional(executionArn),
		statusMessage: Type.Optional(statusMessage),
	},
	{ $id: 'pipelineExecution_full' }
);

export const pipelineExecutionList = Type.Object(
	{
		executions: Type.Array(Type.Ref(pipelineExecutionFull)),
		pagination: Type.Optional(
			Type.Object({
				lastEvaluated: Type.Optional(
					Type.Object({
						executionId: fromExecutionIdPaginationParam,
					})
				),
			})
		),
	},
	{ $id: 'pipelineExecution_list' }
);

export const signedUrlRequest = Type.Object(
	{
		// should this be optional ?
		expiration: Type.Optional(Type.Number({ description: 'The number of seconds before presigned url expires, default to 5 minutes' })),
	},
	{
		$id: 'signedUrl_request',
	}
);

export const signedUrlUploadInputRequest = Type.Object(
	{
		// should this be optional ?
		expiration: Type.Optional(Type.Number({ description: 'The number of seconds before presigned url expires, default to 5 minutes' })),
		actionType
	},
	{
		$id: 'signedUrlUploadInput_request',
	}
);

export const uploadSignedUrlResponse = Type.Object(
	{
		id,
		url: Type.String({ description: 'requested signed url' }),
		pipelineId,
	},
	{
		$id: 'upload_signedUrl_response',
	}
);

export const signedUrlResponse = Type.Object(
	{
		url: Type.String({ description: 'requested signed url' }),
	},
	{
		$id: 'signedUrl_response',
	}
);

export const signedUrlListResponse = Type.Object({
		urls: Type.Array(Type.String({ description: 'requested signed url' }), { description: 'list of audit files signed url' })
	},
	{
		$id: 'signedUrlList_response',
	});

export type PipelineExecution = Static<typeof pipelineExecutionFull>;
export type PipelineExecutionList = Static<typeof pipelineExecutionList>;
export type SignedUrlRequest = Static<typeof signedUrlRequest>;
export type SignedUrlUploadInputRequest = Static<typeof signedUrlUploadInputRequest>;
export type SignedUrlResponse = Static<typeof signedUrlResponse>;
export type SignedUrlListResponse = Static<typeof signedUrlListResponse>;
export type UploadSignedUrlResponse = Static<typeof uploadSignedUrlResponse>;
export type Status = Static<typeof status>;
export type ActionType = Static<typeof actionType>

export type PipelineExecutionWithMetadata = PipelineExecution & { ttl: number; groupContextId: string };

export type PipelineExecutionUpdate = {
	executionArn?: string;
	updatedAt?: string;
	statusMessage?: string;
	status: Status;
};

export type PipelineExecutionListPaginationKey = {
	id: string;
};
