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
import { attributes } from '@sif/resource-api-base';
import { componentMap } from '../components/schemas.js';

export const impactName = Type.String({ description: 'name of the impact' });
export const fromImpactNamePaginationParam = Type.Optional(Type.String({ description: 'Impact Name to paginate from (exclusive).' }));

export const newImpactRequestBody = Type.Object(
	{
		name: impactName,
		attributes: Type.Optional(attributes),
		components: Type.Optional(componentMap),
	},
	{
		$id: 'newImpactRequestBody',
	}
);

export const impactResource = Type.Object(
	{
		name: impactName,
		attributes: Type.Optional(attributes),
		components: Type.Optional(componentMap),
	},
	{
		$id: 'impactResource',
	}
);

export const editImpactRequestBody = Type.Object(
	{
		attributes: Type.Optional(attributes),
		components: Type.Optional(componentMap),
	},
	{
		$id: 'editImpactRequestBody',
	}
);

export const impactMap = Type.Record(Type.String(), Type.Ref(impactResource), {
	$id: 'impactMap',
});

export type Impact = Static<typeof impactResource>;
export type ImpactMap = Static<typeof impactMap>;
export type NewImpact = Static<typeof newImpactRequestBody>;
export type EditImpact = Static<typeof editImpactRequestBody>;
