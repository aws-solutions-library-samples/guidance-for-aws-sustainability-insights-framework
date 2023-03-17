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

import type { PipelineUpdateParams, Pipeline, PipelineListType, PipelineCreateParams, Transformer, DryRunResponse } from './schemas.js';
import type { Tags } from '@sif/resource-api-base';

const tags: Tags = {
	category: 'A/B/C/1',
};

const transformer: Transformer = {
	transforms: [
		{
			index: 0,
			formula: "LOOKUP('vehicle_type', IN(:pin24))",
			outputs: [
				{
					index: 0,
					key: 'vehicle',
					label: 'Vehicle',
					description: 'some description about pin24',
					type: 'number',
				},
			],
		},
		{
			index: 1,
			formula: "#VEHCILE_EMISSIONS('vehicle_type', IN(:pin24))",
			outputs: [
				{
					index: 0,
					key: 'vehicle',
					label: 'Vehicle',
					description: 'some description about pin24',
					type: 'number',
				},
			],
		},
		{
			index: 2,
			formula: "#VEHCILE_EMISSIONS('vehicle_type', IN(:pin24))",
			outputs: [
				{
					index: 0,
					key: 'vehicle',
					label: 'Vehicle',
					description: 'some description about pin24',
					type: 'number',
				},
			],
		},
		{
			index: 3,
			formula: 'IN(:distance)',
			outputs: [
				{
					index: 0,
					key: 'vehicle',
					label: 'Vehicle',
					description: 'some description about pin24',
					type: 'number',
				},
			],
		},
	],
	parameters: [
		{
			index: 0,
			key: 'pin24',
			label: 'pin 24',
			description: 'some description about pin24',
			type: 'string',
		},
		{
			index: 0,
			key: 'distance',
			// do we need it ?
			label: 'Distance',
			description: 'distance travelled',
			type: 'number',
		},
	],
};
const id = 'ajcuhek13ks';
const name = 'sportsarena:dieselemissions:pipeline';
const state = 'enabled';
const attributes = {
	description: 'this pipeline transforms the incomming data to include calculated',
	label: 'Sports Arena Diesel Emissions Pipeline',
};
const processorOptions = {
	chunkSize: 10,
};
const createdAt = '2022-08-10T23:55:20.322Z';
const pipelinePagination: PipelineListType = {
	pipelines: [],
	pagination: {
		count: 2,
		lastEvaluatedToken: id,
	},
};
const createdBy = 'someone@example.com';
const description = 'this is a description';
const groups = ['/'];

export const pipelineFullExample: Pipeline = {
	// auto gen id ?
	attributes,
	createdAt,
	createdBy,
	description,
	groups,
	id,
	name,
	processorOptions,
	state,
	transformer,
	tags,
	updatedAt: createdAt,
	updatedBy: createdBy,
	version: 1,
};

export const pipelineNewExample: PipelineCreateParams = {
	attributes,
	description,
	name,
	processorOptions,
	transformer,
	tags,
};

export const pipelineDryRunExample = {
	...pipelineNewExample,
	dryRunOptions: {
		data: ['10,10'],
	},
};

export const pipelineUpdateExample1: PipelineUpdateParams = {
	name: 'some-other:name',
	attributes: {
		newKey: 'some new key/val pair',
		description: 'updating existing description to something new',
	},
};

export const pipelineListExample = (): PipelineListType => {
	const payload: PipelineListType = { ...pipelinePagination };

	const pipelineFull1: Pipeline = { ...pipelineFullExample };
	const pipelineFull2: Pipeline = { ...pipelineFullExample };

	payload.pipelines.push(pipelineFull1);
	payload.pipelines.push(pipelineFull2);

	return payload;
};

export const pipelineVersionListExample = () => {
	const payload = { ...pipelinePagination };

	const pipelineFull1: Pipeline = { ...pipelineFullExample };
	const pipelineFull2: Pipeline = { ...pipelineFullExample };

	pipelineFull2.version = 2;

	payload.pipelines.push(pipelineFull1);
	payload.pipelines.push(pipelineFull2);

	return payload;
};

export const dryRunExampleResponse: DryRunResponse = {
	data: ['100'],
	headers: ['sum'],
};
