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

export interface CalculationParameter {
	index: number;
	key: string;
	type: string;
}
export type CalculationParameters = CalculationParameter[] | undefined;

export interface CalculationOutput {
	name: string;
}
export type CalculationOutputs = CalculationOutput[] | undefined;

export interface Transformer {
	parameters?: TransformerParameter[];
	transforms?: Transform[];
}

export interface Transform {
	index: number;
	formula?: string;
	outputs?: Output[];
}

export interface TransformerParameter {
	description?: string;
	index: number;
	key: string;
	label?: string;
	type: string;
}

interface Output {
	description?: string;
	index: number;
	key: string;
	label?: string;
	type: 'string' | 'number' | 'boolean' | 'timestamp';
	includeAsUnique?: boolean;
	metric?: string;
	aggregate?: 'max' | 'min' | 'mean' | 'sum' | 'groupBy' | 'count';
}

export enum EntityType {
	transformer = 'transformer',
	calculation = 'calculation',
}
