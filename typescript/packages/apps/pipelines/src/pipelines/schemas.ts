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

/* eslint-disable @rushstack/typedef-var */
import { Static, TString, Type, TNumber } from '@sinclair/typebox';
import { activeAt, attributes, tags, state, groups, id, createdBy, createdAt, updatedBy, updatedAt, count, stringEnum, paginationToken } from '@sif/resource-api-base';

/**
 * resource specific path parameters
 */

/**
 * resource specific query string parameters
 */

export const dryRunQS = Type.Boolean({
	description: 'Performs a dry run of creating the pipeline which includes all the validation steps.',
	default: false,
});

export const verboseQS = Type.Boolean({
	description: 'returns the resource with system specific properties. NOTE: only utilized as a backend functionality.',
	default: false,
});

/**
 * resource specific resource attributes
 */
export const version: TNumber = Type.Number({
	description: 'version number of the pipeline. The pipeline version is always incremented when there is an update to the pipeline configuration itself.',
});

const description = Type.String({
	description: 'Expanded description of the pipeline.',
});

const fromPipelineVersionPagination = Type.Optional(Type.Number({ description: 'Last evaluated version.' }));

const name: TString = Type.String({ description: 'Pipeline name.' });

const attributeType = stringEnum(['string', 'number', 'boolean', 'timestamp'], 'Attribute type.');

const pipelineType = stringEnum(['impacts', 'activities', 'data'], 'The type property on the pipelines specific which type of pipeline is required. There are 3 types of pipelines data, activities & impacts. They each have a unique implementation and dont overlap with one another. Data pipeline is a simple pipeline which only transforms the data with no aggregations. The impacts pipeline can load emission factors and activities pipeline processes activities data', 'activities');

export const pipelineConnector = Type.Object({
	name: Type.String({ description: 'name of the connector' }),
	parameters: Type.Optional(Type.Record(Type.String(), Type.Any(), {
		description: 'connectors config related parameters passed down as default for the pipeline itself',
	}))
});

const connectorConfig = Type.Object({
	input: Type.Array(pipelineConnector, { description: 'specifies list of input connectors,currently only 1 connector can be specified for input' }),
	output: Type.Optional(Type.Array(pipelineConnector, { description: 'specifies list of output connectors' }))
});

const aggregateType = stringEnum(['groupBy', 'sum', 'mean', 'max', 'min', 'count'], 'Aggregate type.');

const transformer = Type.Object(
	{
		transforms: Type.Array(
			Type.Object({
				index: Type.Number({ description: 'Index (sequence) of the transforms to apply.' }),
				formula: Type.String({ description: 'Transform to apply i.e. #VEHICLE_EMISSIONS(\'vehicle_type\', IN(:pin24)).' }),
				outputs: Type.Array(
					Type.Object({
						description: Type.Optional(Type.String({ description: 'Description explaining the output.' })),
						index: Type.Number({ description: 'Index (sequence) of the transform.' }),
						key: Type.String({ description: 'Output unique key.' }),
						label: Type.Optional(Type.String({ description: 'Label of the output for UI display.' })),
						type: attributeType,
						aggregate: Type.Optional(aggregateType),
						includeAsUnique: Type.Optional(
							Type.Boolean({
								description: `If the user wants to uniquely identify individual activities based on specific output columns e.g. equipmentId being a unique key, then this property should be set to true for this output. When
								 its set to true, the activity item will be uniquely identify by (group + date + pipelineId + [uniqueKey1 ... uniqueKey5]). Couple of things to note, this can only be set at the time of the creation of a
								 new pipeline and cannot be updated for data integrity reasons. Only 5 outputs can be specified as key.
								`,
							})
						),
						_keyMapping: Type.Optional(Type.String({ description: 'Output key offset.' })),
						metrics: Type.Optional(Type.Array(Type.String({ description: 'If set, this value will be aggregated as an input to the Metric.' }))),
					}),
					{
						description: 'Outputs as an array of output objects. Note only 1 output per transform is supported today. The array allowing multiple is a placeholder for future features.',
					}
				),
			}),
			{ description: 'Transformations to apply to incoming data.' }
		),
		parameters: Type.Array(
			Type.Object(
				{
					index: Type.Number({ description: 'Index (sequence) of the input parameter.' }),
					key: Type.String({
						description: 'Key of the input used from within the transform. Should match one of the column headers of the input data.',
					}),
					label: Type.Optional(Type.String({ description: 'Label of the input parameter for UI display.' })),
					description: Type.Optional(Type.String({ description: 'Description explaining the input parameter.' })),
					type: attributeType,
				},
				{ description: 'A parameter to be used as part of transformations.' }
			),
			{
				description: 'Parameters to be used as part of transformations.',
			}
		),
	},
	{
		description: 'Transformer configuration of the pipeline.',
	}
);

const processorOptions = Type.Object({
	triggerMetricAggregations: Type.Optional(Type.Boolean({ description: 'If set to true, metrics aggregation will be triggered after inserting activity data' })),
	chunkSize: Type.Optional(
		Type.Number({
			description: 'The size in MB to split the input file to allow parallel processing of the task. The size has to be larger than 1 MB and smaller than 5MB.',
			minimum: 1,
			maximum: 5,
		}),
	),
});

const dryRunOptions = Type.Object({
	data: Type.Array(Type.Record(Type.String(), Type.String(), {
		description: 'An object with key values representing the parameters and its expected values.'
	})),
});

export const dryRunResponse = Type.Object(
	{
		headers: Type.Array(
			Type.String({
				description: 'output csv file headers based on specified output for calculation',
			}),
			{
				description: 'list of csv output headers',
			}
		),
		data: Type.Array(
			Type.String({
				description: 'output data items based on dry run options data specified',
			}),
			{
				description: 'list of csv data items',
			}
		),
		errors: Type.Optional(
			Type.Array(
				Type.String({
					description: 'error message',
				}),
				{
					description: 'list of errors',
				}
			)
		),
	},
	{
		$id: 'dryRunResponse',
	}
);

/**
 * resources
 */
export const newPipelineRequestBody = Type.Object(
	{
		activeAt: Type.Optional(activeAt),
		attributes: Type.Optional(attributes),
		description: Type.Optional(description),
		dryRunOptions: Type.Optional(dryRunOptions),
		name,
		connectorConfig: Type.Optional(connectorConfig),
		processorOptions: Type.Optional(processorOptions),
		type: pipelineType,
		transformer,
		tags: Type.Optional(tags),
	},
	{ $id: 'newPipelineRequestBody' }
);

export const editPipelineRequestBody = Type.Object(
	{
		activeAt: Type.Optional(activeAt),
		attributes: Type.Optional(attributes),
		description: Type.Optional(description),
		dryRunOptions: Type.Optional(dryRunOptions),
		name: Type.Optional(name),
		connectorConfig: Type.Optional(connectorConfig),
		processorOptions: Type.Optional(processorOptions),
		transformer: Type.Optional(transformer),
		state: Type.Optional(state),
		tags: Type.Optional(tags),
	},
	{ $id: 'editPipelineRequestBody' }
);

export const pipelineResource = Type.Object(
	{
		_aggregatedOutputKeyAndTypeMap: Type.Optional(Type.Record(Type.String(), Type.String())),
		activeAt: Type.Optional(activeAt),
		attributes: Type.Optional(attributes),
		dryRunOptions: Type.Optional(dryRunOptions),
		createdAt,
		createdBy,
		description: Type.Optional(description),
		groups,
		id,
		name,
		processorOptions: Type.Optional(processorOptions),
		connectorConfig: Type.Optional(connectorConfig),
		type: pipelineType,
		state,
		tags: Type.Optional(tags),
		transformer,
		updatedAt: Type.Optional(updatedAt),
		updatedBy: Type.Optional(updatedBy),
		version,
	},
	{ $id: 'pipelineResource' }
);

export const pipelineResponse = Type.Union([pipelineResource, dryRunResponse], {
	$id: 'pipelineResponse',
});

export const pipelineList = Type.Object(
	{
		pipelines: Type.Array(pipelineResource),
		pagination: Type.Optional(
			Type.Object({
				count: Type.Optional(count),
				lastEvaluatedToken: Type.Optional(paginationToken),
			})
		),
	},
	{ $id: 'pipelineList' }
);

export const pipelineVersionList = Type.Object(
	{
		pipelines: Type.Array(pipelineResource),
		pagination: Type.Optional(
			Type.Object({
				lastEvaluatedVersion: fromPipelineVersionPagination,
			})
		),
	},
	{ $id: 'pipelineVersionList' }
);

export type PipelineVersionListType = Static<typeof pipelineVersionList>;
export type PipelineListType = Static<typeof pipelineList>;
export type PipelineCreateParams = Static<typeof newPipelineRequestBody>;
export type Pipeline = Static<typeof pipelineResource>;
export type PipelineUpdateParams = Static<typeof editPipelineRequestBody>;
export type Transformer = Static<typeof transformer>;
export type DryRunResponse = Static<typeof dryRunResponse>;
export type Groups = Static<typeof groups>;
export type PipelineConnectors = Static<typeof connectorConfig>;
export type PipelineType = Static<typeof pipelineType>;
