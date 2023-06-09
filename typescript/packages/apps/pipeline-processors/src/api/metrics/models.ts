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

import type { Metric } from './schemas.js';

export type AffectedTimeRange = {
	from: Date;
	to: Date;
};

export const TimeUnits = ['day', 'week', 'month', 'quarter', 'year'];
export type TimeUnit = typeof TimeUnits[number];

export const TimeUnitAbbreviations = ['d', 'w', 'm', 'q', 'y'];
export type TimeUnitAbbreviation = typeof TimeUnitAbbreviations[number];

export const TIME_UNIT_TO_DATE_PART: Record<TimeUnitAbbreviation, TimeUnit> = {
	d: 'day',
	w: 'week',
	m: 'month',
	q: 'quarter',
	y: 'year',
};

export const DATE_PART_TO_TIME_UNIT: Record<TimeUnit, TimeUnitAbbreviation> = {
	day: 'd',
	week: 'w',
	month: 'm',
	quarter: 'q',
	year: 'y',
};

export type QueryRequest = {
	groupId: string;
	name: string;
	timeUnit?: TimeUnit;
	dateFrom?: Date;
	dateTo?: Date;
	members?: boolean;
	version?: number;

	count?: number;
	nextToken?: string;
};

export interface TimeUnitMetrics {
	day?: Metric[];
	week?: Metric[];
	month?: Metric[];
	quarter?: Metric[];
	year?: Metric[];
}

export interface GroupMetrics {
	[groupId: string]: TimeUnitMetrics;
}

export interface IMetricsRepository {
	listCollectionMetrics(metric: { id: string, name: string }, groupId: string, timeUnit: TimeUnit, timeRange: AffectedTimeRange, version: number | string): Promise<Metric[]>;

	listMembersMetrics(metric: { id: string, name: string }, groupId: string, timeUnit: TimeUnit, timeRange: AffectedTimeRange, version: number | string): Promise<Metric[]>;
}
