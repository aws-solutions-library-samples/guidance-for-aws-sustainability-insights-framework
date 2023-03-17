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

import type {
	EditReferenceDataset,
	ReferenceDataset,
	ReferenceDatasetList,
	NewReferenceDataset,
	ReferenceDatasetVersionList,
	SignedUrlRequest,
} from './schemas.js';

export const referenceDatasetFileContentExample: string = 'Header1,Header2\nRow1Column1,Row1Column2\nRow2Column1,Row2Column2';

export const referenceDatasetNewExample: NewReferenceDataset = {
	name: 'newdatasets',
	description: 'this dataset contains unit mappings',
	datasetHeaders: ['Type', 'Multiplier'],
	data: `Type,Multiplier\ntype1,test1\ntype2,test2`,
	datasetSource: 'httpBody',
	tags: {
		division: 'purchasing',
		type: 'material/metal/steel',
	},
};

export const referenceDatasetNewS3Example: NewReferenceDataset = {
	name: 'newdatasetsfroms3',
	description: 'this dataset contains unit mappings',
	datasetHeaders: ['Type', 'Multiplier'],
	datasetSource: 's3',
	tags: {
		division: 'purchasing',
		type: 'material/metal/steel',
	},
};

export const signedUrlRequestExample: SignedUrlRequest = {
	expiration: 2000,
};

// eslint-disable-next-line @rushstack/typedef-var
const referenceDatasetId = '9ed8d000-2913-11ed-8b63-5d7e10640611';

export const referenceDatasetFullExample: ReferenceDataset = {
	id: referenceDatasetId,
	name: 'units',
	description: 'this dataset contains unit mappings',
	datasetHeaders: ['Type', 'Multiplier'],
	createdAt: '2022-08-10T23:55:20.322Z',
	createdBy: 'someone@somewhere.com',
	groups: ['/usa/northwest'],
	version: 1,
	state: 'enabled',
	status: 'success',
	tags: {
		division: 'purchasing',
		type: 'material/metal/steel',
	},
};

export const referenceDatasetFullUpdatedExample: ReferenceDataset = {
	id: referenceDatasetId,
	name: 'units',
	description: 'this dataset contains unit mappings',
	datasetHeaders: ['Type', 'Multiplier'],
	createdAt: '2022-08-10T23:55:20.322Z',
	createdBy: 'someone@somewhere.com',
	updatedBy: 'someone@example.com',
	updatedAt: '2022-08-31T14:19:56.337Z',
	groups: ['/usa/northwest'],
	version: 2,
	state: 'enabled',
	status: 'success',
	tags: {
		division: 'purchasing',
		type: 'material/metal/steel',
	},
};

export const referenceDatasetEditExample: EditReferenceDataset = {
	description: 'this dataset contains unit mappings',
	datasetHeaders: ['Type', 'Multiplier'],
	tags: {
		division: 'purchasing',
		type: 'material/metal/steel',
	},
};

export const referenceDatasetEditDeleteTagExample: EditReferenceDataset = {
	description: 'this dataset contains unit mappings',
	datasetHeaders: ['Type', 'Multiplier'],
	tags: {
		division: null,
	},
};

export const referenceDatasetVersionsListExample: ReferenceDatasetVersionList = {
	pagination: {
		lastEvaluatedVersion: 2,
	},
	referenceDatasets: [
		{
			id: 'defa5ad0-2938-11ed-b188-3789cc690104',
			createdAt: '2022-08-31T14:26:15.421Z',
			createdBy: 'someone@example.com',
			name: 'dataset one',
			groups: ['/usa/northwest'],
			version: 1,
			datasetHeaders: ['Type', 'Units'],
			tags: {
				division: 'purchasing',
				type: 'material/metal/steel',
			},
			state: 'frozen',
			status: 'success',
		},
		{
			id: 'fd06ba10-2937-11ed-ae7b-0579fa02d3cb',
			createdAt: '2022-08-31T14:26:15.421Z',
			createdBy: 'someone@example.com',
			updatedBy: 'someone@example.com',
			updatedAt: '2022-08-31T14:19:56.337Z',
			name: 'dataset one',
			groups: ['/usa/northwest'],
			version: 2,
			datasetHeaders: ['Type', 'Measurement'],
			tags: {
				division: 'purchasing',
				type: 'material/metal/steel',
			},
			state: 'enabled',
			status: 'success',
		},
	],
};

export const referenceDatasetListExample: ReferenceDatasetList = {
	pagination: {
		lastEvaluatedToken: 'fd06ba10-2937-11ed-ae7b-0579fa02d3cb',
	},
	referenceDatasets: [
		{
			id: 'defa5ad0-2938-11ed-b188-3789cc690104',
			createdAt: '2022-08-31T14:26:15.421Z',
			createdBy: 'someone@example.com',
			name: 'dataset one',
			groups: ['/usa/northwest'],
			version: 1,
			datasetHeaders: ['Type', 'Units'],
			tags: {
				division: 'purchasing',
				type: 'material/metal/steel',
			},
			state: 'enabled',
			status: 'success',
		},
		{
			id: 'fd06ba10-2937-11ed-ae7b-0579fa02d3cb',
			createdAt: '2022-08-31T14:19:56.337Z',
			createdBy: 'someone@example.com',
			updatedBy: 'someone@example.com',
			updatedAt: '2022-08-31T14:19:56.337Z',
			name: 'data set two',
			groups: ['/usa/northwest'],
			version: 2,
			datasetHeaders: ['Type', 'Units'],
			tags: {
				division: 'purchasing',
				type: 'material/metal/steel',
			},
			state: 'enabled',
			status: 'success',
		},
	],
};

export const signedUrlResponseExample = {
	url: 'https://signed.url.response/data.object',
};
