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
