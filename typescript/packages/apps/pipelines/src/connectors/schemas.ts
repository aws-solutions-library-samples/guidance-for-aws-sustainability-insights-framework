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
import { Static, TString, Type } from '@sinclair/typebox';
import { groups, id, createdBy, createdAt, updatedBy, updatedAt, count, paginationToken, tags } from '@sif/resource-api-base';

const description = Type.String({
	description: 'Expanded description of the connector.',
});
const name: TString = Type.String({ description: 'Connector name.' });
export const parameters = Type.Optional(
	Type.Array(
		Type.Object({
			name: Type.String({ description: 'name or key of the parameter, should be unique' }),
			description: Type.Optional(Type.String({ description: 'relevant description related to the specified parameter' })),
			defaultValue: Type.Optional(Type.String({ description: 'default value for the parameter' })),
			required: Type.Optional(Type.Boolean({ description: 'specify true/false if this parameter is added to this list then at the time of pipeline execution this list will be evaluated against the parameters compiled together from the connector, pipeline and execution.' }))
		}, {
			description: 'connector configuration object which specifies any configuration related key/val pairs passed down though the connector integration request'
		}), { description: 'list of connector configuration parameter objects' }
	))
export const connectorType = Type.Enum({
	input: 'input',
	output: 'output',
}, {
	description: 'type of the connector, this specified if the connector should be used as an input of a pipeline or an output'
});

const requiresFileUpload = Type.Optional(Type.Boolean({
	description: 'this specifies if the connector requires a file to be uploaded through the execution, if this is specified as true, then a signed url will be generated to the execution request',
	default: false
}));

export const connectorCreateParams = Type.Object({
	description: Type.Optional(description),
	name,
	parameters: Type.Optional(parameters),
	requiresFileUpload,
	tags: Type.Optional(tags),
	isManaged: Type.Optional(Type.Boolean({ description: 'this marks the connector if its managed via SIF or not', default: false })),
	type: connectorType
}, {
	$id: 'connectorCreateParams'
});

export const connectorUpdateParams = Type.Object({
	description: Type.Optional(description),
	name: Type.Optional(name),
	parameters: Type.Optional(parameters),
	requiresFileUpload,
	tags: Type.Optional(tags),
	type: Type.Optional(connectorType)
}, {
	$id: 'connectorUpdateParams'
});

export const connector = Type.Object({
	createdAt,
	createdBy,
	description: Type.Optional(description),
	groups,
	id,
	isManaged: Type.Optional(Type.Boolean({ description: 'this marks the connector if its managed via SIF or not' })),
	name,
	parameters: Type.Optional(parameters),
	requiresFileUpload,
	tags: Type.Optional(tags),
	type: connectorType,
	updatedAt,
	updatedBy: Type.Optional(updatedBy),
}, {
	$id: 'connector'
});

export const connectorList = Type.Object({
		connectors: Type.Array(connector),
		pagination: Type.Optional(
			Type.Object({
				count: Type.Optional(count),
				lastEvaluatedToken: Type.Optional(paginationToken)
			})
		)
	},
	{ $id: 'connectorList' }
);

export type Connector = Static<typeof connector>;
export type ConnectorList = Static<typeof connectorList>;
export type ConnectorCreateParams = Static<typeof connectorCreateParams>;
export type ConnectorUpdateParams = Static<typeof connectorUpdateParams>;
export type ConnectorType = Static<typeof connectorType>;
