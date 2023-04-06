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

import { Static, TNumber, Type } from '@sinclair/typebox';
import { createdBy } from '@sif/resource-api-base';

// Types copied from Pipeline Module
const transformsOutput = Type.Object({
	index: Type.Number({ description: 'index of the the output column' }),
	key: Type.String({ description: 'key of the output' }),
	type: Type.String({ description: 'type of the output i.e. string | boolean | number etc' }),
});

export const version: TNumber = Type.Number({
	description: 'version number of the pipeline. The pipeline version is always incremented when there is an update to the pipeline configuration itself.',
});

const transformer = Type.Object(
	{
		transforms: Type.Array(
			Type.Object({
				index: Type.Number({ description: 'index of the column from the input data file' }),
				formula: Type.String({ description: 'transform which needs to be applied on the column i.e. #VEHCILE_EMISSIONS(\'vehicle_type\', IN(:pin24))' }),
				outputs: Type.Array(transformsOutput, { description: 'outputs as an array of output objects' }),
			}),
			{ description: 'transformers array consists of individual transform object' }
		),
		parameters: Type.Array(
			Type.Object(
				{
					label: Type.String({ description: 'label of the input parameter for UI display' }),
					key: Type.String({ description: 'key of the input parameters which will be used in the transform' }),
					type: Type.String({ description: 'type of the input parameter i.e. string | boolean | number etc' }),
				},
				{ description: 'the paramters object which acts as a placeholder for the inputs to the formula in the transform' }
			),
			{
				description: 'the parameters configurations required within transforms and specified in the formula',
			}
		),
	},
	{
		description: 'transformer configuration of the pipeline, this is where the transforms for input data are specified',
	}
);

const processorOptions = Type.Object({
	chunkSize: Type.Optional(Type.Number({ description: 'number of files processed in each iteration' })),
});

export const id = Type.String({ description: 'Unique id.' });

const pipeline = Type.Object(
	{
		id,
		transformer,
		version,
		processorOptions: Type.Optional(processorOptions),
		createdBy,
	},
	{ $id: 'pipeline_full' }
);

export type Pipeline = Static<typeof pipeline>;
export type Transformer = Static<typeof transformer>;

export type S3Location = {
	bucket: string;
	key: string;
};

export type S3SourceLocation = {
	bucket: string;
	key: string;
	containsHeader: boolean;
	startByte: number;
	endByte: number;
};

export type CalculatorRequest = {
	groupContextId: string;
	pipelineId: string;
	executionId: string;
	sourceDataLocation: S3SourceLocation;
	chunkNo: number;
	uniqueKey?: string[];
	username: string;
} & Transformer;

export type CalculatorResponse = {
	sourceDataLocation: S3SourceLocation;
	csvOutputDataLocation: S3Location;
	errorLocation: S3Location;
};
