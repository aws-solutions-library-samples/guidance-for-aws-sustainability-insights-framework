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
import { Type, Static } from '@sinclair/typebox';

export const fromComponentKeyPaginationParam = Type.Optional(Type.String({ description: 'Factor Component Key to paginate from (exclusive).' }));
export const typeParam = Type.Optional(Type.String({ description: 'specify filter by component type i.e. pollutant, impact factor method etc.' }));

export const componentKey = Type.String({ description: 'key of the component' });
const label = Type.String({ description: 'Label for display' });
const description = Type.String({ description: 'Description' });
const value = Type.Number({ description: 'Value' });
const type = Type.String({ description: 'type of the component' });
const key = Type.String({ description: 'key of the component' });

export const componentResource = Type.Object(
	{
		key,
		value,
		type,
		label: Type.Optional(label),
		description: Type.Optional(description),
	},
	{
		$id: 'componentResource',
	}
);

export const editComponentRequestBody = Type.Object(
	{
		value: Type.Optional(value),
		type: Type.Optional(type),
		label: Type.Optional(label),
		description: Type.Optional(label),
	},
	{
		$id: 'editComponentRequestBody',
	}
);

export const newComponentRequestBody = Type.Object(
	{
		key,
		value,
		type,
		label: Type.Optional(label),
		description: Type.Optional(description),
	},
	{
		$id: 'newComponentRequestBody',
	}
);

export const componentMap = Type.Record(Type.String(), Type.Ref(componentResource), {
	$id: 'componentMap',
});

export type Component = Static<typeof componentResource>;
export type EditComponent = Static<typeof editComponentRequestBody>;
export type ComponentMap = Static<typeof componentMap>;
export type NewComponent = Static<typeof newComponentRequestBody>;
