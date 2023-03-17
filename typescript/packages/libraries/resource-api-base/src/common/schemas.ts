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
import { Static, Type } from '@sinclair/typebox';
import { stringEnum } from './types.js';

/**
 * Common path parameters
 */

/**
 * Common query string parameters
 */

export const includeParentGroupsQS = Type.Optional(Type.Boolean({ description: 'Include all parent groups result.', default: false }));
export const includeChildGroupsQS = Type.Optional(Type.Boolean({ description: 'Include all children groups result.', default: false }));
export const aliasQS = Type.Optional(Type.String({ description: 'Filters by `name` based on the group access of the caller.' }));
export const versionAsAtQS = Type.Optional(Type.String({ description: 'Filters by `asAt` or `createdAt` determine the latest resource version as that time.' }));
export const countPaginationQS = Type.Optional(Type.Integer({ description: 'Count of results to return.' }));
export const fromIdPaginationQS = Type.Optional(Type.String({ description: 'Id to paginate from (exclusive).' }));
export const fromTokenPaginationQS = Type.Optional(Type.String({ description: 'Token used to paginate from (exclusive).' }));
export const fromVersionPaginationQS = Type.Optional(Type.Integer({ description: 'Version to paginate from (exclusive).' }));
export const nextTokenPaginationQS = Type.Optional(Type.String({ description: 'Pagination token.' }));
export const tagFilterQS = Type.Optional(Type.Array(Type.String({ description: 'Tag key and value in the format of `key:value`.' }), { description: 'Tag keys and values to filter by.' }));

/**
 * Common resource parameters
 */
export const paginationToken = Type.String({ description: 'Token used to paginate to the next page of search result.' });
export const id = Type.String({ description: 'Unique id.' });
export const groupId = Type.String({ description: 'Group id.' });

export const groups = Type.Array(Type.String({ description: 'The group ID as managed by the Access Management module.' }), {
	description: 'Groups that have access to the calculation.',
});

export const state = stringEnum(
	['enabled', 'frozen', 'disabled'],
	'State of the resource. `enabled` allows use of this version of the resource within transforms. `disabled` allows this version of the resource to be used within existing transforms but not allowed to be used as part of new transforms. `frozen` prevents any version of the resource from use within any transforms including pre-existing.'
);
export type State = Static<typeof state>;

export const activeAt = Type.String({
	description: 'Date/time resource is active',
	format: 'date-time',
});

export const createdBy = Type.String({ description: 'ID of owner.' });
export const createdAt = Type.String({
	description: 'Date/time created',
	format: 'date-time',
});
export const updatedBy = Type.String({ description: 'Last ID of user who made a change.' });
export const updatedAt = Type.String({
	description: 'Date/time updated',
	format: 'date-time',
});
export const count = Type.Optional(
	Type.Integer({
		description: 'No. of results returned when pagination requested.',
	})
);
export const nextToken = Type.Optional(
	Type.String({
		description: 'Pagination token',
	})
);

export const attributes = Type.Optional(
	Type.Record(Type.String(), Type.Any(), {
		description: 'any non-searchable or filterable key:val attributes to specify metadata such as label, description etc.',
	})
);
export type Attributes = Static<typeof attributes>;

/**
 * Common headers
 */
export const commonHeaders = Type.Object({
	'accept-version': Type.String({ description: 'API version' }),
	accept: Type.String({ description: 'Accepted Content Type' }),
});

/**
 * Common responses
 */
export const notFoundResponse = Type.Object(
	{
		message: Type.String(),
	},
	{ $id: 'notFoundResponse', description: 'Not found.' }
);

export const updatedResponse = Type.Object({}, { $id: 'updatedResponse', description: 'Updated successfully.' });

export const deletedResponse = Type.Object({}, { $id: 'deletedResponse', description: 'Deleted successfully.' });

export const badRequestResponse = Type.Object(
	{
		message: Type.String(),
	},
	{ $id: 'badRequestResponse', description: 'Bad request.' }
);


export const notImplementedResponse = Type.Object(
	{
		message: Type.String(),
	},
	{ $id: 'notImplementedResponse', description: 'Not implemented.' }
);

export const forbiddenResponse = Type.Object(
	{
		message: Type.String(),
	},
	{ $id: 'forbiddenResponse', description: 'Forbidden.' }
);

export const conflictResponse = Type.Object(
	{
		message: Type.String(),
		syntaxErrors: Type.Optional(
			Type.Object({
				charPositionInLine: Type.Integer(),
				line: Type.Integer(),
				msg: Type.String(),
			})
		),
	},
	{ $id: 'conflictResponse', description: 'Conflict.' }
);

export const noBodyResponse = Type.Object({}, { $id: 'noBodyResponse', description: 'Success.' });

export const configuration = Type.Object(
	{
		preferredGroup: Type.Optional(
			Type.String({
				description: 'If there are multiple resources with the same, select the one from the group specified in this parameter',
			})
		),
		referenceDatasets: Type.Optional(
			Type.Object({
				alwaysUseLatest: Type.Optional(
					Type.Boolean({
						description: 'True if if you want to use latest version of reference dataset regardless of status, false if you want to fallback to previous version',
					})
				),
			})
		),
		pipelineProcessor: Type.Optional(
			Type.Object({
				chunkSize: Type.Optional(
					Type.Number({
						description: 'The size in MB to split the input file to allow parallel processing of the task. The size has to be larger than 1 MB and smaller than 5MB.',
						minimum: 1,
						maximum: 5,
					})
				),
			})
		),
	},
	{
		$id: 'configuration',
	}
);

export const configurationSource = Type.Record(Type.String({ description: 'id of the group' }), configuration, {
	description: 'application configuration specified on the group',
	$id: 'configurationSource',
});
