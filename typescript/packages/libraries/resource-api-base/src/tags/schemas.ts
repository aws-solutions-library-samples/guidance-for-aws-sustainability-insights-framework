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

import { Static, TSchema, Type } from '@sinclair/typebox';

/**
 * Path parameters
 */
export const keyParam = Type.String({ description: 'Tag key.' });

/**
 * Query string parameters
 */
export const parentValueQS = Type.Optional(Type.String({ description: 'Chosen parent value for use with hierarchical tags.' }));
export const fromValuePaginationQS = Type.Optional(Type.String({ description: 'Tag value to paginate from (exclusive).' }));

/**
 * Responses
 */

const fromTagValuePagination = Type.Optional(Type.String({ description: 'Last evaluated tag value' }));
const countPagination = Type.Optional(
	Type.Integer({
		description: 'No. of results returned when pagination requested.',
	})
);

const Nullable = <T extends TSchema>(type: T) => Type.Union([type, Type.Null()]);

export const tags = Type.Record(Type.String(), Nullable(Type.String()), {
	$id: 'tags',
	description: 'User-defined searchable tags',
});
export type Tags = Static<typeof tags>;

export const tagValuesListResource = Type.Object(
	{
		values: Type.Record(Type.String(), Type.String(), {
			description: 'Tag values and labels.',
		}),
		pagination: Type.Optional(
			Type.Object({
				count: countPagination,
				lastEvaluatedValue: fromTagValuePagination,
			})
		),
	},
	{
		description: 'List of tag values',
		$id: 'tagValuesListResource',
	}
);
export type TagValuesListResource = Static<typeof tagValuesListResource>;

export const tagHierarchyDelimiter = '/';
