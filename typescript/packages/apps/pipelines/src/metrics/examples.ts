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

import type { AggregationType, EditMetric, Metric, MetricsList, MetricVersionsList, NewMetric } from './schemas.js';
import type { Attributes, Tags, State } from '@sif/resource-api-base';

const id: string = 'ajcuhek13ks';
const name: string = 'ghg:scope1:stationary_combustion:co2';
const summary: string = 'GHG Scope 1 (Stationary Combustion) - CO2';
const description: string = 'GHG Scope 1 (Stationary Combustion) - CO2 Metric';
const aggregationType: AggregationType = 'sum';
const tags: Tags = {
	dataSource: 'GHG',
	scope: '1',
	category: 'Stationary Combustion',
	subCategory: 'CO2',
};
const state: State = 'enabled';
const attributes: Attributes = {
	label: 'Sports Arena Diesel Emissions Metric',
};
const timestamp: string = '2022-08-10T23:55:20.322Z';

const metricPagination: MetricsList = {
	metrics: [],
	pagination: {
		count: 2,
		lastEvaluatedToken: id,
	},
};
const email: string = 'someone@somewhere.com';
const groups: string[] = ['/usa/co'];

export const metricFullExample: Metric = {
	id,
	name,
	summary,
	description,
	aggregationType,
	tags,
	state,
	attributes,
	groups,
	version: 1,
	createdAt: email,
	createdBy: timestamp,
	updatedBy: email,
	updatedAt: timestamp,
};

export const metricCreateExample: NewMetric = {
	name,
	summary,
	description,
	aggregationType,
	tags,
	attributes,
};

export const metricUpdateExample: EditMetric = {
	summary,
	description,
	aggregationType,
	tags,
	state,
	attributes,
};

export const metricListExample = (): MetricsList => {
	const payload: MetricsList = { ...metricPagination };

	payload.metrics.push(metricFullExample);
	payload.metrics.push({ ...metricFullExample, name: 'ghg:scope1:stationary_combustion:ch4' });

	return payload;
};

export const metricVersionListExample = (): MetricVersionsList => {
	const payload = { ...metricPagination };

	payload.metrics.push(metricFullExample);
	payload.metrics.push({ ...metricFullExample, version: 2 });

	return payload;
};
