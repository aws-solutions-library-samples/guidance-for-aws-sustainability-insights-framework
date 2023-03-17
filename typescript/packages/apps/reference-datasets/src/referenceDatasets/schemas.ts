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

import { Type, TString, Static } from '@sinclair/typebox';
import type { RequestPresigningArguments } from '@aws-sdk/types';
import type { PutObjectCommand, GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { tags, state, id, activeAt, createdBy, createdAt, updatedBy, updatedAt, paginationToken, groups, stringEnum } from '@sif/resource-api-base';

/**
 * Resource specific path parameters
 */

/**
 * Resource specific query string parameters
 */

/**
 * Resource specific resource attributes
 */
export const version = Type.Number({ description: 'version of the reference dataset' });
const description = Type.Optional(Type.String({ description: 'description for the reference dataset' }));
const datasetHeaders = Type.Optional(
	Type.Array(
		Type.String({
			description: `datasetHeaders form-data attribute is required attribute to pass csv file headers for validation. A thing to note
is that this attribute should be specified as form-data attribute which also has content-type specified and is set  to 'application/json'. This is not immediately known or visible.
Its recommended to check how your client can set the content-type to 'application/json' for individual form-data attributes. As an example this is how you can set the content-type
on an individual form-data attribute for a CURL reques '--form 'datasetHeaders="[\\"ZIP\\", \\"STATE\\"]";type=application/json' \\' `,
		})
	)
);
const status = stringEnum(['pendingUpload', 'inProgress', 'success', 'failed'], 'reference dataset processing status');

const datasetSource = Type.Enum(
	{
		s3: 's3',
		httpBody: 'httpBody',
	},
	{ description: 'source of reference dataset' }
);

const name: TString = Type.String({
	description: 'name of the ReferenceDataset',
});

const uploadUrl: TString = Type.String({
	description: 'signed url for uploading the reference dataset',
});

const data: TString = Type.String({ description: 'dataset file', format: 'binary' });

export const signedUrlRequest = Type.Object(
	{
		expiration: Type.Optional(Type.Number({ description: 'The number of seconds before presigned url expires, default to 5 minutes' })),
	},
	{
		$id: 'signedUrl_request',
	}
);

/**
 * Resources
 */

export const newReferenceDatasetRequestBody = Type.Object(
	{
		name,
		data: Type.Optional(data),
		datasetSource: Type.Optional(datasetSource),
		description,
		datasetHeaders,
		tags: Type.Optional(Type.Ref(tags)),
		activeAt: Type.Optional(activeAt),
	},
	{
		$id: 'newReferenceDatasetRequestBody',
	}
);

export const referenceDatasetFileContent = Type.String({
	$id: 'referenceDataset_filecontent',
});

export const referenceDatasetResource = Type.Object(
	{
		createdAt,
		createdBy,
		datasetHeaders,
		description,
		groups,
		id,
		name,
		state,
		status,
		statusMessage: Type.Optional(Type.String({ description: 'message related to the status attribute. e.g. if the status is failed, this attribute will indicate why it failed' })),
		tags: Type.Optional(Type.Ref(tags)),
		updatedAt: Type.Optional(updatedAt),
		updatedBy: Type.Optional(updatedBy),
		uploadUrl: Type.Optional(uploadUrl),
		activeAt: Type.Optional(activeAt),
		version,
	},
	{
		$id: 'referenceDatasetResource',
	}
);

export const editReferenceDatasetRequestBody = Type.Object(
	{
		description: Type.Optional(description),
		datasetSource: Type.Optional(datasetSource),
		data: Type.Optional(data),
		datasetHeaders: Type.Optional(datasetHeaders),
		state: Type.Optional(state),
		tags: Type.Optional(Type.Ref(tags)),
		activeAt: Type.Optional(activeAt),
	},
	{
		$id: 'editReferenceDatasetRequestBody',
	}
);

export const referenceDatasetVersionList = Type.Object(
	{
		referenceDatasets: Type.Array(Type.Ref(referenceDatasetResource)),
		pagination: Type.Optional(
			Type.Object({
				lastEvaluatedVersion: Type.Optional(version),
			})
		),
	},
	{ $id: 'referenceDatasetVersionList' }
);

export const referenceDatasetList = Type.Object(
	{
		referenceDatasets: Type.Array(Type.Ref(referenceDatasetResource)),
		pagination: Type.Optional(
			Type.Object({
				lastEvaluatedToken: Type.Optional(paginationToken),
			})
		),
	},
	{ $id: 'referenceDatasetList' }
);

export const signedUrlResponse = Type.Object(
	{
		url: Type.String({ description: 'requested signed url' }),
	},
	{
		$id: 'signedUrl_response',
	}
);

export type NewReferenceDataset = Static<typeof newReferenceDatasetRequestBody>;
export type ReferenceDataset = Static<typeof referenceDatasetResource>;
export type EditReferenceDataset = Static<typeof editReferenceDatasetRequestBody>;
export type ReferenceDatasetList = Static<typeof referenceDatasetList>;
export type ReferenceDatasetVersionList = Static<typeof referenceDatasetVersionList>;

export type S3Location = { key: string; bucket: string };

export type ReferenceDatasetWithS3 = ReferenceDataset & { s3Location?: S3Location; indexS3Location?: S3Location; dataS3Location?: S3Location };

export type DatasetSource = Static<typeof datasetSource>;

export type ReferenceDatasetUpdateMetadata = {
	state?: Static<typeof state>;
	status?: Status;
	statusMessage?: string;
	indexS3Location?: S3Location;
	dataS3Location?: S3Location;
	s3Location?: S3Location;
	uploadUrl?: string;
	activeAt?: string;
};

export enum StepFunctionEventAction {
	update = 'update',
}

export interface StepFunctionEvent {
	action: StepFunctionEventAction;
	payload: {
		id: string;
		status: Status;
		groupId: string;
		statusMessage: string;
		indexS3Location: {
			bucket: string;
			key: string;
		};
	};
}

export type GetSignedUrl = (client: S3Client, command: GetObjectCommand | PutObjectCommand, options?: RequestPresigningArguments) => Promise<string>;

export type SignedUrlResponse = Static<typeof signedUrlResponse>;
export type SignedUrlRequest = Static<typeof signedUrlRequest>;
export type Status = Static<typeof status>;
