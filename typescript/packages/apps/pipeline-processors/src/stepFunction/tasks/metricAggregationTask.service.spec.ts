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

import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone.js';
import utc from 'dayjs/plugin/utc.js';
import pino from 'pino';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import { MetricAggregationTaskService } from './metricAggregationTask.service.js';

import type { Metric } from '@sif/clients';
import type { MetricClient } from '@sif/clients';
import type { Utils } from '@sif/resource-api-base';
import type { MetricsRepository } from '../../api/metrics/repository.js';
import type { AffectedTimeRange } from '../../api/metrics/models.js';
import type { AggregationTaskAuroraRepository } from './aggregationTask.aurora.repository.js';

dayjs.extend(timezone);
dayjs.extend(utc);

const asDate = (date: string): Date => dayjs(date).tz('America/Denver').toDate();
const asToDate = (date: string): Date => dayjs(date).add(1, 'day').add(-1, 'millisecond').tz('America/Denver').toDate();

describe('MetricAggregationTaskService', () => {
	let mockedMetricClient: MockProxy<MetricClient>;
	let mockedPipelineRepo: MockProxy<AggregationTaskAuroraRepository>;
	let mockedMetricsRepo: MockProxy<MetricsRepository>;
	let mockedUtils: MockProxy<Utils>;

	let underTest: MetricAggregationTaskService;

	beforeEach(() => {
		const logger = pino(
			pino.destination({
				sync: true, // test frameworks must use pino logger in sync mode!
			})
		);
		logger.level = 'info';

		mockedMetricClient = mock<MetricClient>();
		mockedPipelineRepo = mock<AggregationTaskAuroraRepository>();
		mockedMetricsRepo = mock<MetricsRepository>();
		mockedUtils = mock<Utils>();

		underTest = new MetricAggregationTaskService(logger, mockedMetricClient, mockedPipelineRepo, mockedMetricsRepo, mockedUtils);
	});

	/**
	 * Given pipeline execution range covered 11/29/22 - 12/05/22
	 * And processing pipelines as inputs
	 * And starts processing pipeline output as follows:
	 * 		/a/b/c (from pipeline execution):
	 * 			11/29/22 - 111
	 * 			11/30/22 - 431
	 * 			12/03/22 - 211
	 * 		/a (from an existing pipeline execution):
	 * 			11/12/22 - 21
	 * 			12/25/22 - 44
	 * Then we should end up with the following aggregated metrics:
	 * 		/a/b/c
	 * 			hierarchy:		all 0
	 * 			collection:
	 * 				day:
	 * 					11/29/22 - 111
	 * 					11/30/22 - 431
	 * 					12/03/22 - 211
	 * 				week:
	 * 					49		 - 753
	 * 					50		 - 0
	 * 				month:
	 * 					11		 - 542
	 * 					12		 - 211
	 * 				quarter:
	 * 					4		 - 753
	 * 				year:
	 * 					2022:	 - 753
	 * 		/a/b
	 * 			hierarchy:		same as /a/b/c collection
	 * 			collection:		all 0
	 * 		/a
	 * 			hierarchy:		same as /a/b hierarchy
	 * 			collection:
	 * 				day:
	 * 					11/12/22 - 21
	 * 					12/25/22 - 44
	 * 				week:
	 * 					46		 - 21
	 * 					53		 - 44
	 * 				month:
	 * 					11		 - 21
	 * 					12		 - 44
	 * 				quarter:
	 * 					4		 - 65
	 * 				year:
	 * 					2022:	 - 65
	 * 		/
	 * 			hierarchy:
	 * 				day:
	 * 					11/12/22 - 21
	 * 					11/29/22 - 111
	 * 					11/30/22 - 431
	 * 					12/03/22 - 211
	 * 					12/25/22 - 44
	 * 				week:
	 * 					46		 - 21
	 * 					49		 - 753
	 * 					53		 - 44
	 * 				month:
	 * 					11		 - 563
	 * 					12		 - 255
	 * 				quarter:
	 * 					4		 - 818
	 * 				year:
	 * 					2022:	 - 818
	 * 			collection:		all 0
	 *
	 */

	it('rollupMetric - pipelines as input - happy path of first time pipeline run', async () => {
		/**
		 * INPUT
		 */

		const groupHierarchy = ['/a/b/c', '/a/b', '/a', '/'];
		const timeRangePipeline: AffectedTimeRange = {
			from: asDate('11/29/22'),
			to: asDate('12/5/22'),
		};
		const timeRangeMonth: AffectedTimeRange = {
			from: asDate('11/01/22'),
			to: asDate('12/31/22'),
		};
		const metric: Metric = {
			id: 'metric001',
			name: 'Metric',
			aggregationType: 'sum',
			state: 'enabled',
			inputPipelines: [
				{
					pipelineId: 'pipeline1',
					output: 'col1',
				},
				{
					pipelineId: 'pipeline2',
					output: 'col2s',
				},
			],
			groups: ['/a'],
			version: 1,
		};
		const inputType = 'pipeline';

		/**
		 * MOCKS
		 */
		// day metrics for /a/b/c for entire month (nothing existing to start with)
		mockedMetricsRepo.listCollectionMetrics.mockResolvedValueOnce([]);

		// mock initial aggregation of pipeline output for /a/b/c for entire month
		let commonMetricValues = {
			metricId: metric.id,
			name: metric.name,
			timeUnit: 'day',
		};
		mockedPipelineRepo.aggregatePipelineOutput.mockResolvedValueOnce([
			{
				date: asDate('11/29/22'),
				groupValue: 111,
			},
			{
				date: asDate('11/30/22'),
				groupValue: 431,
			},
			{
				date: asDate('12/03/22'),
				groupValue: 211,
			},
		]);

		// quarter metrics for /a/b/c for entire quarter (nothing existing to start with)
		mockedMetricsRepo.listCollectionMetrics.mockResolvedValueOnce([]);

		// year metrics for /a/b/c for entire year (nothing existing to start with)
		mockedMetricsRepo.listCollectionMetrics.mockResolvedValueOnce([]);

		// day metrics for /a/b for entire month (nothing existing to start with)
		mockedMetricsRepo.listCollectionMetrics.mockResolvedValueOnce([]);

		// mock nothing to aggregate for pipeline output for /a/b
		mockedPipelineRepo.aggregatePipelineOutput.mockResolvedValueOnce([]);

		// quarter metrics for /a/b for entire quarter (nothing existing to start with)
		mockedMetricsRepo.listCollectionMetrics.mockResolvedValueOnce([]);

		// year metrics for /a/b for entire year (nothing existing to start with)
		mockedMetricsRepo.listCollectionMetrics.mockResolvedValueOnce([]);

		// day metrics for /a for entire month (includes an existing pipeline's execution)
		mockedMetricsRepo.listCollectionMetrics.mockResolvedValueOnce([
			{
				...commonMetricValues,
				date: asDate('11/12/22'),
				version: 1,
				groupValue: 21,
				subGroupsValue: 0,
				day: 316,
				year: 2022,
			},
			{
				...commonMetricValues,
				date: asDate('12/25/22'),
				version: 1,
				groupValue: 44,
				subGroupsValue: 0,
				day: 359,
				year: 2022,
			},
		]);

		// mock aggregations for pipeline output for /a
		mockedPipelineRepo.aggregatePipelineOutput.mockResolvedValueOnce([
			{
				date: asDate('11/12/22'),
				groupValue: 21,
			},
			{
				date: asDate('12/25/22'),
				groupValue: 44,
			},
		]);

		// quarter metrics for /a for entire quarter
		commonMetricValues.timeUnit = 'month';
		mockedMetricsRepo.listCollectionMetrics.mockResolvedValueOnce([
			{
				...commonMetricValues,
				date: asDate('10/01/22'),
				version: 1,
				groupValue: 0,
				subGroupsValue: 0,
				month: 10,
				year: 2022,
			},
			{
				...commonMetricValues,
				date: asDate('11/01/22'),
				version: 1,
				groupValue: 21,
				subGroupsValue: 0,
				month: 11,
				year: 2022
			},
			{
				...commonMetricValues,
				date: asDate('12/01/22'),
				version: 1,
				groupValue: 44,
				subGroupsValue: 0,
				month: 12,
				year: 2022,
			},
		]);

		// year metrics for /a for entire year
		commonMetricValues.timeUnit = 'quarter';
		mockedMetricsRepo.listCollectionMetrics.mockResolvedValueOnce([
			{
				...commonMetricValues,
				date: asDate('01/01/22'),
				version: 1,
				groupValue: 0,
				subGroupsValue: 0,
				quarter: 1,
				year: 2022,
			},
			{
				...commonMetricValues,
				date: asDate('04/01/22'),
				version: 1,
				groupValue: 0,
				subGroupsValue: 0,
				quarter: 2,
				year: 2022,
			},
			{
				...commonMetricValues,
				date: asDate('07/01/22'),
				version: 1,
				groupValue: 0,
				subGroupsValue: 0,
				quarter: 3,
				year: 2022,
			},
			{
				...commonMetricValues,
				date: asDate('10/01/22'),
				version: 1,
				groupValue: 65,
				subGroupsValue: 0,
				quarter: 4,
				year: 2022,
			},
		]);

		// day metrics for / for entire month (nothing)
		mockedMetricsRepo.listCollectionMetrics.mockResolvedValueOnce([]);

		// mock aggregations for pipeline output for / (nothing)
		mockedPipelineRepo.aggregatePipelineOutput.mockResolvedValueOnce([]);

		// quarter metrics for / for entire quarter
		mockedMetricsRepo.listCollectionMetrics.mockResolvedValueOnce([
			{
				...commonMetricValues,
				date: asDate('10/01/22'),
				version: 1,
				groupValue: 0,
				subGroupsValue: 65,
				quarter: 4,
				year: 2022,
			},
		]);

		// year metrics for / for entire year
		commonMetricValues.timeUnit = 'year';
		mockedMetricsRepo.listCollectionMetrics.mockResolvedValueOnce([
			{
				...commonMetricValues,
				date: asDate('01/01/22'),
				version: 1,
				groupValue: 0,
				subGroupsValue: 65,
				year: 2022,
			},
		]);

		// let's go!
		const actual = await underTest.___rollupMetric(groupHierarchy, timeRangePipeline, timeRangeMonth, metric, inputType);

		/**
		 * RESULT VERIFICATIONS
		 */
		expect(Object.keys(actual).length).toBe(groupHierarchy.length);

		const commonExpectedMetric = {
			metricId: metric.id,
			name: metric.name,
			version: 1,
			day: undefined,
			week: undefined,
			month: undefined,
			quarter: undefined,
			year: 2022,
			groupValue: 0,
			subGroupsValue: 0,
			timeUnit: 'day',
		};

		// groupId /a/b/c - day metrics:
		expect(actual['/a/b/c'].day).toEqual([
			{
				...commonExpectedMetric,
				date: asDate('11/29/22'),
				groupValue: 111,
				day: 333,
			},
			{
				...commonExpectedMetric,
				date: asDate('11/30/22'),
				groupValue: 431,
				day: 334,
			},
			{
				...commonExpectedMetric,
				date: asDate('12/01/22'),
				day: 335,
			},
			{
				...commonExpectedMetric,
				date: asDate('12/02/22'),
				day: 336,
			},
			{
				...commonExpectedMetric,
				date: asDate('12/03/22'),
				groupValue: 211,
				day: 337,
			},
			{
				...commonExpectedMetric,
				date: asDate('12/04/22'),
				day: 338,
			},
			{
				...commonExpectedMetric,
				date: asDate('12/05/22'),
				day: 339,
			},
		]);

		// groupId /a/b/c - week metrics:
		commonExpectedMetric.timeUnit = 'week';
		expect(actual['/a/b/c'].week).toEqual([
			{
				...commonExpectedMetric,
				date: asDate('11/27/22'),
				groupValue: 753,
				week: 49,
			},
			{
				...commonExpectedMetric,
				date: asDate('12/04/22'),
				week: 50,
			},
		]);

		// groupId /a/b/c - month metrics:
		commonExpectedMetric.timeUnit = 'month';
		expect(actual['/a/b/c'].month).toEqual([
			{
				...commonExpectedMetric,
				date: asDate('11/01/22'),
				groupValue: 542,
				month: 11,
			},
			{
				...commonExpectedMetric,
				date: asDate('12/01/22'),
				groupValue: 211,
				month: 12,
			},
		]);

		// groupId /a/b/c - quarter metrics:
		commonExpectedMetric.timeUnit = 'quarter';
		expect(actual['/a/b/c'].quarter).toEqual([
			{
				...commonExpectedMetric,
				date: asDate('10/01/22'),
				groupValue: 753,
				quarter: 4,
			},
		]);

		// groupId /a/b/c - year metrics:
		commonExpectedMetric.timeUnit = 'year';
		expect(actual['/a/b/c'].year).toEqual([
			{
				...commonExpectedMetric,
				date: asDate('01/01/22'),
				groupValue: 753,
			},
		]);

		// groupId /a/b - day metrics:
		commonExpectedMetric.timeUnit = 'day';
		expect(actual['/a/b'].day).toEqual([
			{
				...commonExpectedMetric,
				date: asDate('11/29/22'),
				subGroupsValue: 111,
				day: 333,
			},
			{
				...commonExpectedMetric,
				date: asDate('11/30/22'),
				subGroupsValue: 431,
				day: 334,
			},
			{
				...commonExpectedMetric,
				date: asDate('12/01/22'),
				day: 335,
			},
			{
				...commonExpectedMetric,
				date: asDate('12/02/22'),
				day: 336,
			},
			{
				...commonExpectedMetric,
				date: asDate('12/03/22'),
				subGroupsValue: 211,
				day: 337,
			},
			{
				...commonExpectedMetric,
				date: asDate('12/04/22'),
				day: 338,
			},
			{
				...commonExpectedMetric,
				date: asDate('12/05/22'),
				day: 339,
			},
		]);

		// groupId /a/b - week metrics:
		commonExpectedMetric.timeUnit = 'week';
		expect(actual['/a/b'].week).toEqual([
			{
				...commonExpectedMetric,
				date: asDate('11/27/22'),
				subGroupsValue: 753,
				week: 49,
			},
			{
				...commonExpectedMetric,
				date: asDate('12/04/22'),
				week: 50,
			},
		]);

		// groupId /a/b - month metrics:
		commonExpectedMetric.timeUnit = 'month';
		expect(actual['/a/b'].month).toEqual([
			{
				...commonExpectedMetric,
				date: asDate('11/01/22'),
				subGroupsValue: 542,
				month: 11,
			},
			{
				...commonExpectedMetric,
				date: asDate('12/01/22'),
				subGroupsValue: 211,
				month: 12,
			},
		]);

		// groupId /a/b - quarter metrics:
		commonExpectedMetric.timeUnit = 'quarter';
		expect(actual['/a/b'].quarter).toEqual([
			{
				...commonExpectedMetric,
				date: asDate('10/01/22'),
				subGroupsValue: 753,
				quarter: 4,
			},
		]);

		// groupId /a/b - year metrics:
		commonExpectedMetric.timeUnit = 'year';
		expect(actual['/a/b'].year).toEqual([
			{
				...commonExpectedMetric,
				date: asDate('01/01/22'),
				subGroupsValue: 753,
			},
		]);

		// groupId /a - day metrics:
		commonExpectedMetric.timeUnit = 'day';
		expect(actual['/a'].day).toEqual([
			{
				...commonExpectedMetric,
				date: asDate('11/29/22'),
				subGroupsValue: 111,
				day: 333,
			},
			{
				...commonExpectedMetric,
				date: asDate('11/30/22'),
				subGroupsValue: 431,
				day: 334,
			},
			{
				...commonExpectedMetric,
				date: asDate('12/01/22'),
				day: 335,
			},
			{
				...commonExpectedMetric,
				date: asDate('12/02/22'),
				day: 336,
			},
			{
				...commonExpectedMetric,
				date: asDate('12/03/22'),
				subGroupsValue: 211,
				day: 337,
			},
			{
				...commonExpectedMetric,
				date: asDate('12/04/22'),
				day: 338,
			},
			{
				...commonExpectedMetric,
				date: asDate('12/05/22'),
				day: 339,
			},
		]);

		// groupId /a - week metrics:
		commonExpectedMetric.timeUnit = 'week';
		expect(actual['/a'].week).toEqual([
			{
				...commonExpectedMetric,
				date: asDate('11/27/22'),
				subGroupsValue: 753,
				week: 49,
			},
			{
				...commonExpectedMetric,
				date: asDate('12/04/22'),
				week: 50,
			},
		]);

		// groupId /a - month metrics:
		commonExpectedMetric.timeUnit = 'month';
		expect(actual['/a'].month).toEqual([
			{
				...commonExpectedMetric,
				date: asDate('11/01/22'),
				groupValue: 21,
				subGroupsValue: 542,
				month: 11,
			},
			{
				...commonExpectedMetric,
				date: asDate('12/01/22'),
				groupValue: 44,
				subGroupsValue: 211,
				month: 12,
			},
		]);

		// groupId /a - quarter metrics:
		commonExpectedMetric.timeUnit = 'quarter';
		expect(actual['/a'].quarter).toEqual([
			{
				...commonExpectedMetric,
				date: asDate('10/01/22'),
				groupValue: 65,
				subGroupsValue: 753,
				quarter: 4,
			},
		]);

		// groupId /a - year metrics:
		commonExpectedMetric.timeUnit = 'year';
		expect(actual['/a'].year).toEqual([
			{
				...commonExpectedMetric,
				date: asDate('01/01/22'),
				groupValue: 65,
				subGroupsValue: 753,
			},
		]);

		/**
		 * METHOD CALL VERIFICATIONS
		 */
		expect(mockedMetricsRepo.listCollectionMetrics).toBeCalledTimes(12);
		expect(mockedPipelineRepo.aggregatePipelineOutput).toBeCalledTimes(4);
		for (const groupId of groupHierarchy) {
			// retrieving day metrics for the month(s) impacted...
			expect(mockedMetricsRepo.listCollectionMetrics).toBeCalledWith(metric.id, groupId, 'day', timeRangeMonth);
			// retrieving day aggregates of pipeline output for the month(s) impacted...
			expect(mockedPipelineRepo.aggregatePipelineOutput).toBeCalledWith(groupId, metric.inputPipelines, timeRangeMonth);
			// retrieving existing month metrics for the quarter(s) impacted...
			expect(mockedMetricsRepo.listCollectionMetrics).toBeCalledWith(metric.id, groupId, 'month', {
				from: asDate('2022-10-01'),
				to: asToDate('12/31/22'),
			});
			// retrieving existing quarter metrics for the year(s) impacted...
			expect(mockedMetricsRepo.listCollectionMetrics).toBeCalledWith(metric.id, groupId, 'quarter', {
				from: asDate('01/01/22'),
				to: asToDate('12/31/22'),
			});
		}
	}, 30000);

	/**
	 * Given pipeline execution range covered 11/29/22 - 12/05/22
	 * And processing metric's as inputs
	 * And starts processing metric metrics as follows:
	 * 		/a/b/c (from previous metric metris):
	 * 			metric001-sub1:
	 * 				11/29/22 - 111
	 *			metricsub1-002:
	 * 				11/30/22 - 431
	 * 				12/03/22 - 211
	 * 		/a (from an existing metric metric):
	 * 			metric001-sub1::
	 * 				11/12/22 - 21
	 * 				12/25/22 - 44
	 * Then we should end up with the following aggregated metrics:
	 * 		/a/b/c
	 * 			hierarchy:		all 0
	 * 			collection:
	 * 				day:
	 * 					11/29/22 - 111
	 * 					11/30/22 - 431
	 * 					12/03/22 - 211
	 * 				week:
	 * 					49		 - 753
	 * 					50		 - 0
	 * 				month:
	 * 					11		 - 542
	 * 					12		 - 211
	 * 				quarter:
	 * 					4		 - 753
	 * 				year:
	 * 					2022:	 - 753
	 * 		/a/b
	 * 			hierarchy:		same as /a/b/c collection
	 * 			collection:		all 0
	 * 		/a
	 * 			hierarchy:		same as /a/b hierarchy
	 * 			collection:
	 * 				day:
	 * 					11/12/22 - 21
	 * 					12/25/22 - 44
	 * 				week:
	 * 					46		 - 21
	 * 					53		 - 44
	 * 				month:
	 * 					11		 - 21
	 * 					12		 - 44
	 * 				quarter:
	 * 					4		 - 65
	 * 				year:
	 * 					2022:	 - 65
	 * 		/
	 * 			hierarchy:
	 * 				day:
	 * 					11/12/22 - 21
	 * 					11/29/22 - 111
	 * 					11/30/22 - 431
	 * 					12/03/22 - 211
	 * 					12/25/22 - 44
	 * 				week:
	 * 					46		 - 21
	 * 					49		 - 753
	 * 					53		 - 44
	 * 				month:
	 * 					11		 - 563
	 * 					12		 - 255
	 * 				quarter:
	 * 					4		 - 818
	 * 				year:
	 * 					2022:	 - 818
	 * 			collection:		all 0
	 *
	 */

	it('rollupMetric - metrics as input - happy path', async () => {
		/**
		 * INPUT
		 */

		const groupHierarchy = ['/a/b/c', '/a/b', '/a', '/'];
		const timeRangePipeline: AffectedTimeRange = {
			from: asDate('11/29/22'),
			to: asDate('12/5/22'),
		};
		const timeRangeMonth: AffectedTimeRange = {
			from: asDate('11/01/22'),
			to: asDate('12/31/22'),
		};
		const metric: Metric = {
			id: 'metric001',
			name: 'Metric',
			aggregationType: 'sum',
			state: 'enabled',
			inputMetrics: ['Metric-sub1', 'Metric-sub2'],
			groups: ['/a'],
			version: 1,
		};
		const inputType = 'metric';

		/**
		 * MOCKS
		 */
		// day metrics for /a/b/c for entire month (nothing existing to start with)
		mockedMetricsRepo.listCollectionMetrics.mockResolvedValueOnce([]);

		// day metrics of input metrics for /a/b/c for entire month
		mockedMetricClient.getByName.mockResolvedValueOnce({
			id: 'metric001-sub1',
			name: 'Metric-sub1',
			aggregationType: 'sum',
			state: 'enabled',
			groups: ['/a'],
			version: 1,
		});
		mockedMetricClient.getByName.mockResolvedValueOnce({
			id: 'metric001-sub2',
			name: 'Metric-sub2',
			aggregationType: 'sum',
			state: 'enabled',
			groups: ['/a'],
			version: 1,
		});

		let commonMetricValues = {
			metricId: metric.id,
			name: metric.name,
			timeUnit: 'day',
		};
		mockedMetricsRepo.listCollectionMetrics.mockResolvedValueOnce([
			{
				...commonMetricValues,
				date: asDate('11/29/22'),
				version: 1,
				groupValue: 111,
				subGroupsValue: 0,
				day: 333,
				year: 2022,
			},
		]);
		mockedMetricsRepo.listCollectionMetrics.mockResolvedValueOnce([
			{
				...commonMetricValues,
				date: asDate('11/30/22'),
				version: 1,
				groupValue: 431,
				subGroupsValue: 0,
				day: 334,
				year: 2022,
			},
			{
				...commonMetricValues,
				date: asDate('12/03/22'),
				version: 1,
				groupValue: 211,
				subGroupsValue: 0,
				day: 337,
				year: 2022,
			},
		]);

		// quarter metrics for /a/b/c for entire quarter (nothing existing to start with)
		mockedMetricsRepo.listCollectionMetrics.mockResolvedValueOnce([]);

		// year metrics for /a/b/c for entire year (nothing existing to start with)
		mockedMetricsRepo.listCollectionMetrics.mockResolvedValueOnce([]);

		// day metrics for /a/b for entire month (nothing existing to start with)
		mockedMetricsRepo.listCollectionMetrics.mockResolvedValueOnce([]);

		// day metrics (for input metrics) for /a/b for entire month (nothing existing to start with)
		mockedMetricsRepo.listCollectionMetrics.mockResolvedValueOnce([]);
		mockedMetricsRepo.listCollectionMetrics.mockResolvedValueOnce([]);

		// quarter metrics for /a/b for entire quarter (nothing existing to start with)
		mockedMetricsRepo.listCollectionMetrics.mockResolvedValueOnce([]);

		// year metrics for /a/b for entire year (nothing existing to start with)
		mockedMetricsRepo.listCollectionMetrics.mockResolvedValueOnce([]);

		// day metrics for /a for entire month (nothing existing to start with)
		mockedMetricsRepo.listCollectionMetrics.mockResolvedValueOnce([
			{
				...commonMetricValues,
				date: asDate('11/12/22'),
				version: 1,
				groupValue: 21,
				subGroupsValue: 0,
				day: 316,
				year: 2022,
			},
			{
				...commonMetricValues,
				date: asDate('12/25/22'),
				version: 1,
				groupValue: 44,
				subGroupsValue: 0,
				day: 359,
				year: 2022,
			},
		]);

		// day metrics of input metrics for /a for entire month
		mockedMetricsRepo.listCollectionMetrics.mockResolvedValueOnce([
			{
				...commonMetricValues,
				date: asDate('11/12/22'),
				version: 1,
				groupValue: 21,
				subGroupsValue: 0,
				day: 316,
				year: 2022,
			},
			{
				...commonMetricValues,
				date: asDate('12/25/22'),
				version: 1,
				groupValue: 44,
				subGroupsValue: 0,
				day: 359,
				year: 2022,
			},
		]);
		mockedMetricsRepo.listCollectionMetrics.mockResolvedValueOnce([]);

		// quarter metrics for /a for entire quarter
		commonMetricValues.timeUnit = 'month';
		mockedMetricsRepo.listCollectionMetrics.mockResolvedValueOnce([
			{
				...commonMetricValues,
				date: asDate('10/01/22'),
				version: 1,
				groupValue: 0,
				subGroupsValue: 0,
				month: 10,
				year: 2022,
			},
			{
				...commonMetricValues,
				date: asDate('11/01/22'),
				version: 1,
				groupValue: 21,
				subGroupsValue: 0,
				month: 11,
				year: 2022,
			},
			{
				...commonMetricValues,
				date: asDate('12/01/22'),
				version: 1,
				groupValue: 44,
				subGroupsValue: 0,
				month: 12,
				year: 2022,
			},
		]);

		// year metrics for /a for entire year
		commonMetricValues.timeUnit = 'quarter';
		mockedMetricsRepo.listCollectionMetrics.mockResolvedValueOnce([
			{
				...commonMetricValues,
				date: asDate('01/01/22'),
				version: 1,
				groupValue: 0,
				subGroupsValue: 0,
				quarter: 1,
				year: 2022,
			},
			{
				...commonMetricValues,
				date: asDate('04/01/22'),
				version: 1,
				groupValue: 0,
				subGroupsValue: 0,
				quarter: 2,
				year: 2022,
			},
			{
				...commonMetricValues,
				date: asDate('07/01/22'),
				version: 1,
				groupValue: 0,
				subGroupsValue: 0,
				quarter: 3,
				year: 2022,
			},
			{
				...commonMetricValues,
				date: asDate('10/01/22'),
				version: 1,
				groupValue: 65,
				subGroupsValue: 0,
				quarter: 4,
				year: 2022,
			},
		]);

		// day metrics for / for entire month (nothing)
		mockedMetricsRepo.listCollectionMetrics.mockResolvedValueOnce([]);

		// day metrics for / for input metrics
		mockedMetricsRepo.listCollectionMetrics.mockResolvedValueOnce([]);
		mockedMetricsRepo.listCollectionMetrics.mockResolvedValueOnce([]);

		// quarter metrics for / for entire quarter
		mockedMetricsRepo.listCollectionMetrics.mockResolvedValueOnce([
			{
				...commonMetricValues,
				date: asDate('10/01/22'),
				version: 1,
				groupValue: 0,
				subGroupsValue: 65,
				quarter: 4,
				year: 2022,
			},
		]);

		// year metrics for / for entire year
		commonMetricValues.timeUnit = 'year';
		mockedMetricsRepo.listCollectionMetrics.mockResolvedValueOnce([
			{
				...commonMetricValues,
				date: asDate('01/01/22'),
				version: 1,
				groupValue: 0,
				subGroupsValue: 65,
				year: 2022,
			},
		]);

		// let's go!
		const actual = await underTest.___rollupMetric(groupHierarchy, timeRangePipeline, timeRangeMonth, metric, inputType);

		/**
		 * RESULT VERIFICATIONS
		 */
		expect(Object.keys(actual).length).toBe(groupHierarchy.length);

		const commonExpectedMetric = {
			version: 1,
			metricId: metric.id,
			name: metric.name,
			day: undefined,
			week: undefined,
			month: undefined,
			quarter: undefined,
			year: 2022,
			groupValue: 0,
			subGroupsValue: 0,
			timeUnit: 'day',
		};

		// groupId /a/b/c - day metrics:
		expect(actual['/a/b/c'].day).toEqual([
			{
				...commonExpectedMetric,
				date: asDate('11/29/22'),
				groupValue: 111,
				day: 333,
			},
			{
				...commonExpectedMetric,
				date: asDate('11/30/22'),
				groupValue: 431,
				day: 334,
			},
			{
				...commonExpectedMetric,
				date: asDate('12/01/22'),
				day: 335,
			},
			{
				...commonExpectedMetric,
				date: asDate('12/02/22'),
				day: 336,
			},
			{
				...commonExpectedMetric,
				date: asDate('12/03/22'),
				groupValue: 211,
				day: 337,
			},
			{
				...commonExpectedMetric,
				date: asDate('12/04/22'),
				day: 338,
			},
			{
				...commonExpectedMetric,
				date: asDate('12/05/22'),
				day: 339,
			},
		]);

		// groupId /a/b/c - week metrics:
		commonExpectedMetric.timeUnit = 'week';
		expect(actual['/a/b/c'].week).toEqual([
			{
				...commonExpectedMetric,
				date: asDate('11/27/22'),
				groupValue: 753,
				week: 49,
			},
			{
				...commonExpectedMetric,
				date: asDate('12/04/22'),
				week: 50,
			},
		]);

		// groupId /a/b/c - month metrics:
		commonExpectedMetric.timeUnit = 'month';
		expect(actual['/a/b/c'].month).toEqual([
			{
				...commonExpectedMetric,
				date: asDate('11/01/22'),
				groupValue: 542,
				month: 11,
			},
			{
				...commonExpectedMetric,
				date: asDate('12/01/22'),
				groupValue: 211,
				month: 12,
			},
		]);

		// groupId /a/b/c - quarter metrics:
		commonExpectedMetric.timeUnit = 'quarter';
		expect(actual['/a/b/c'].quarter).toEqual([
			{
				...commonExpectedMetric,
				date: asDate('10/01/22'),
				groupValue: 753,
				quarter: 4,
			},
		]);

		// groupId /a/b/c - year metrics:
		commonExpectedMetric.timeUnit = 'year';
		expect(actual['/a/b/c'].year).toEqual([
			{
				...commonExpectedMetric,
				date: asDate('01/01/22'),
				groupValue: 753,
			},
		]);

		// groupId /a/b - day metrics:
		commonExpectedMetric.timeUnit = 'day';
		expect(actual['/a/b'].day).toEqual([
			{
				...commonExpectedMetric,
				date: asDate('11/29/22'),
				subGroupsValue: 111,
				day: 333,
			},
			{
				...commonExpectedMetric,
				date: asDate('11/30/22'),
				subGroupsValue: 431,
				day: 334,
			},
			{
				...commonExpectedMetric,
				date: asDate('12/01/22'),
				day: 335,
			},
			{
				...commonExpectedMetric,
				date: asDate('12/02/22'),
				day: 336,
			},
			{
				...commonExpectedMetric,
				date: asDate('12/03/22'),
				subGroupsValue: 211,
				day: 337,
			},
			{
				...commonExpectedMetric,
				date: asDate('12/04/22'),
				day: 338,
			},
			{
				...commonExpectedMetric,
				date: asDate('12/05/22'),
				day: 339,
			},
		]);

		// groupId /a/b - week metrics:
		commonExpectedMetric.timeUnit = 'week';
		expect(actual['/a/b'].week).toEqual([
			{
				...commonExpectedMetric,
				date: asDate('11/27/22'),
				subGroupsValue: 753,
				week: 49,
			},
			{
				...commonExpectedMetric,
				date: asDate('12/04/22'),
				week: 50,
			},
		]);

		// groupId /a/b - month metrics:
		commonExpectedMetric.timeUnit = 'month';
		expect(actual['/a/b'].month).toEqual([
			{
				...commonExpectedMetric,
				date: asDate('11/01/22'),
				subGroupsValue: 542,
				month: 11,
			},
			{
				...commonExpectedMetric,
				date: asDate('12/01/22'),
				subGroupsValue: 211,
				month: 12,
			},
		]);

		// groupId /a/b - quarter metrics:
		commonExpectedMetric.timeUnit = 'quarter';
		expect(actual['/a/b'].quarter).toEqual([
			{
				...commonExpectedMetric,
				date: asDate('10/01/22'),
				subGroupsValue: 753,
				quarter: 4,
			},
		]);

		// groupId /a/b - year metrics:
		commonExpectedMetric.timeUnit = 'year';
		expect(actual['/a/b'].year).toEqual([
			{
				...commonExpectedMetric,
				date: asDate('01/01/22'),
				subGroupsValue: 753,
			},
		]);

		// groupId /a - day metrics:
		commonExpectedMetric.timeUnit = 'day';
		expect(actual['/a'].day).toEqual([
			{
				...commonExpectedMetric,
				date: asDate('11/29/22'),
				subGroupsValue: 111,
				day: 333,
			},
			{
				...commonExpectedMetric,
				date: asDate('11/30/22'),
				subGroupsValue: 431,
				day: 334,
			},
			{
				...commonExpectedMetric,
				date: asDate('12/01/22'),
				day: 335,
			},
			{
				...commonExpectedMetric,
				date: asDate('12/02/22'),
				day: 336,
			},
			{
				...commonExpectedMetric,
				date: asDate('12/03/22'),
				subGroupsValue: 211,
				day: 337,
			},
			{
				...commonExpectedMetric,
				date: asDate('12/04/22'),
				day: 338,
			},
			{
				...commonExpectedMetric,
				date: asDate('12/05/22'),
				day: 339,
			},
		]);

		// groupId /a - week metrics:
		commonExpectedMetric.timeUnit = 'week';
		expect(actual['/a'].week).toEqual([
			{
				...commonExpectedMetric,
				date: asDate('11/27/22'),
				subGroupsValue: 753,
				week: 49,
			},
			{
				...commonExpectedMetric,
				date: asDate('12/04/22'),
				week: 50,
			},
		]);

		// groupId /a - month metrics:
		commonExpectedMetric.timeUnit = 'month';
		expect(actual['/a'].month).toEqual([
			{
				...commonExpectedMetric,
				date: asDate('11/01/22'),
				groupValue: 21,
				subGroupsValue: 542,
				month: 11,
			},
			{
				...commonExpectedMetric,
				date: asDate('12/01/22'),
				groupValue: 44,
				subGroupsValue: 211,
				month: 12,
			},
		]);

		// groupId /a - quarter metrics:
		commonExpectedMetric.timeUnit = 'quarter';
		expect(actual['/a'].quarter).toEqual([
			{
				...commonExpectedMetric,
				date: asDate('10/01/22'),
				groupValue: 65,
				subGroupsValue: 753,
				quarter: 4,
			},
		]);

		// groupId /a - year metrics:
		commonExpectedMetric.timeUnit = 'year';
		expect(actual['/a'].year).toEqual([
			{
				...commonExpectedMetric,
				date: asDate('01/01/22'),
				groupValue: 65,
				subGroupsValue: 753,
			},
		]);

		/**
		 * METHOD CALL VERIFICATIONS
		 */
		expect(mockedMetricsRepo.listCollectionMetrics).toBeCalledTimes(20);
		expect(mockedPipelineRepo.aggregatePipelineOutput).toBeCalledTimes(0);
		expect(mockedMetricClient.getByName).toBeCalledTimes(2);
		for (const groupId of groupHierarchy) {
			// retrieving day metrics for the month(s) impacted...
			expect(mockedMetricsRepo.listCollectionMetrics).toBeCalledWith(metric.id, groupId, 'day', timeRangeMonth);
			// retrieving day aggregates of input metrics for the month(s) impacted...
			expect(mockedMetricsRepo.listCollectionMetrics).toBeCalledWith('metric001-sub1', groupId, 'day', timeRangeMonth);
			expect(mockedMetricsRepo.listCollectionMetrics).toBeCalledWith('metric001-sub2', groupId, 'day', timeRangeMonth);

			// retrieving existing month metrics for the quarter(s) impacted...
			expect(mockedMetricsRepo.listCollectionMetrics).toBeCalledWith(metric.id, groupId, 'month', {
				from: asDate('2022-10-01'),
				to: asToDate('12/31/22'),
			});
			// retrieving existing quarter metrics for the year(s) impacted...
			expect(mockedMetricsRepo.listCollectionMetrics).toBeCalledWith(metric.id, groupId, 'quarter', {
				from: asDate('01/01/22'),
				to: asToDate('12/31/22'),
			});
		}
	}, 30000);
});
