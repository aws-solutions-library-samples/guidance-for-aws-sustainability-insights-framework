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
import { id } from '@sif/resource-api-base';

export const executionArn: TString = Type.String({ description: 'Step Function execution arn.' });

export const executionId: TString = Type.String({ description: 'Identifier of a execution of the pipeline.' });

export const pipelineId: TString = Type.String({ description: 'Identifier of the pipeline configuration.' });

export const pipelineVersion: TNumber = Type.Number({ description: 'The version of the pipeline when the execution is created.' });

export const auditVersion: TNumber = Type.Number({ description: 'The version of the audit when the execution is created.' });

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

const status = Type.Enum({
	waiting: 'waiting',
	in_progress: 'in_progress',
	calculating_metrics: 'calculating_metrics',
	success: 'success',
	failed: 'failed'
}, { description: 'Status of the pipeline execution.' });

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
const connectorOverrides = Type.Optional(Type.Record(Type.String(), Type.Object({
	parameters: Type.Record(Type.String(), Type.Any(), {
		description: 'any key:val attributes to pass config parameters through the input connector.',
	})
}), {
	description: 'any overrides for the connectors which are configured on for the pipeline',
}));

const inlineExecutionOutputs = Type.Object({
	errors: Type.Optional(Type.Array(Type.String(), {
		description: 'List of error when processing the input rows.'
	})),
	outputs: Type.Optional(Type.Array(Type.Record(Type.String(), Type.String(), {
		description: 'An object with key values representing the outputs and its expected values.'
	}))),
});

export const pipelineExecutionFull = Type.Object(
	{
		actionType,
		createdAt,
		createdBy,
		// TODO: figure out what this is for ? and why its needed to track here
		executionArn: Type.Optional(executionArn),
		id,
		inputUploadUrl: Type.Optional(Type.String({ description: 'this property depends on if the execution requires a file uploaded for the execution. By default it generates a signed url for files which are in SIF format.' })),
		pipelineId,
		pipelineVersion,
		auditVersion: Type.Optional(auditVersion),
		connectorOverrides,
		status,
		statusMessage: Type.Optional(statusMessage),
		groupContextId: Type.String({ description: 'security context id of the creator of this execution' }),
		// TODO: need to rethink ttl on the executions, if a ttl is added, then it should be removed if the status has changed,
		// ttl: Type.Optional(Type.Number({ description: 'expiration of execution if it stays in waiting state for 5 minutes (default) or specified expiresIn timeout' })),
		updatedAt: Type.Optional(updatedAt),
		updatedBy: Type.Optional(updatedBy),
		inlineExecutionOutputs: Type.Optional(inlineExecutionOutputs)
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
		actionType,
		expiration: Type.Optional(Type.Number({ description: 'The number of seconds before presigned url expires, default to 5 minutes' }))
	},
	{
		$id: 'signedUrlUploadInput_request',
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

export const auditExportResponse = Type.Object(
	{
		state: Type.Enum(
			{
				success: 'success',
				inProgress: 'inProgress',
				error: 'error'
			},
			{
				description: 'Autdit export generation status',
			},

		),
		url: Type.Optional(Type.String({ description: 'requested signed url' })),
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

const inlineExecutionOptions = Type.Object({
	inputs: Type.Array(Type.Record(Type.String(), Type.String(), {
			description: 'An object with key values representing the inputs and its expected values.',
		}),
		{
			maxItems: Number.isInteger(parseInt(process.env['INLINE_PROCESSING_ROWS_LIMIT'])) ? parseInt(process.env['INLINE_PROCESSING_ROWS_LIMIT']) : 10
		}),
});

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

export const pipelineExecutionRequest = Type.Object({
	inlineExecutionOptions: Type.Optional(inlineExecutionOptions),
	mode: executionMode,
	actionType,
	expiration: Type.Number({ description: 'The number of seconds before file upload url expires in, default to 5 minutes', default: 300 }),
	connectorOverrides
}, {
	$id: 'pipelineExecution_request'
});

export type InlineExecutionOutputs = Static<typeof inlineExecutionOutputs>;
export type PipelineExecution = Static<typeof pipelineExecutionFull>;
export type PipelineExecutionRequest = Static<typeof pipelineExecutionRequest>;
export type PipelineExecutionList = Static<typeof pipelineExecutionList>;
export type SignedUrlRequest = Static<typeof signedUrlRequest>;
export type SignedUrlResponse = Static<typeof signedUrlResponse>;
export type SignedUrlListResponse = Static<typeof signedUrlListResponse>;
export type Status = Static<typeof status>;

export type PipelineExecutionUpdateParams = {
	executionArn?: string;
	updatedAt?: string;
	statusMessage?: string;
	status?: Status;
};

export type PipelineExecutionListPaginationKey = {
	id: string;
};
