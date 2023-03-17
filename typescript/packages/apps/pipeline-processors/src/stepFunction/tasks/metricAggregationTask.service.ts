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

import type { AggregationResult, AggregationTaskEvent } from './model.js';
import type { BaseLogger } from 'pino';
import dayjs, { ManipulateType, OpUnitType } from 'dayjs';
import quarterOfYear from 'dayjs/plugin/quarterOfYear.js';
import weekOfYear from 'dayjs/plugin/weekOfYear.js';
import dayOfYear from 'dayjs/plugin/dayOfYear.js';
import isBetween from 'dayjs/plugin/isBetween.js';
import { validateNotEmpty, validateDefined } from '@sif/validators';
import type { MetricClient, LambdaRequestContext } from '@sif/clients';
import type { Metric as MetricResource } from '@sif/clients';
import type { Utils } from '@sif/resource-api-base';
import type { AffectedTimeRange, GroupMetrics, TimeUnit } from '../../api/metrics/models.js';
import type { Metric } from '../../api/metrics/schemas.js';
import type { MetricsRepository } from '../../api/metrics/repository.js';
import type { AggregationTaskAuroraRepository } from './aggregationTask.aurora.repository.js';

dayjs.extend(weekOfYear);
dayjs.extend(quarterOfYear);
dayjs.extend(dayOfYear);
dayjs.extend(isBetween);

export class MetricAggregationTaskService {
	private readonly log: BaseLogger;
	private readonly metricClient: MetricClient;
	private readonly pipelineRepo: AggregationTaskAuroraRepository;
	private readonly metricsRepo: MetricsRepository;
	private readonly utils: Utils;

	public constructor(log: BaseLogger, metricClient: MetricClient, pipelineRepo: AggregationTaskAuroraRepository, metricsRepo: MetricsRepository, utils: Utils) {
		this.log = log;
		this.metricClient = metricClient;
		this.pipelineRepo = pipelineRepo;
		this.metricsRepo = metricsRepo;
		this.utils = utils;
	}

	public async process(event: AggregationTaskEvent): Promise<void> {
		this.log.info(`AggregationTask> process> event: ${JSON.stringify(event)}`);

		validateDefined(event, 'event');
		validateDefined(event.transformer?.transforms, 'event.transformer.transforms');
		validateNotEmpty(event.groupContextId, 'event.groupContextId');
		validateNotEmpty(event.pipelineId, 'event.pipelineId');
		validateNotEmpty(event.pipelineExecutionId, 'event.pipelineExecutionId');

		const { groupContextId, pipelineId, pipelineExecutionId } = event;
		const { transforms } = event.transformer;

		// track visited metrics to ensure no circular references
		const visitedMetrics: string[] = [];

		// extract metric's to be updated from the execution
		const metricNames = Array.from(new Set(transforms.flatMap((t) => t.outputs.flatMap((o) => o.metrics ?? []))));
		this.log.debug(`AggregationTask > metricNames: ${JSON.stringify(metricNames)}`);

		if (metricNames.length === 0) {
			this.log.info(`AggregationTask> process> early exit (no metrics)`);
			return;
		}

		const requestContext = this.buildLambdaRequestContext(groupContextId);

		// retrieve definitions of metric's
		const metrics: MetricResource[] = [];
		for (const name of metricNames) {
			// TODO: handle not found
			metrics.push(await this.metricClient.getByName(name, undefined, requestContext));
		}
		visitedMetrics.push(...metrics.map((k) => k.id));

		// determine affected time range of the execution
		const timeRangePipeline = await this.pipelineRepo.getAffectedTimeRange(pipelineId, pipelineExecutionId);

		// when rolling up the time units we need the day metrics for the full month(s) affected
		const timeRangeMonth: AffectedTimeRange = {
			from: dayjs(timeRangePipeline.from).startOf('month').toDate(),
			to: dayjs(timeRangePipeline.to).endOf('month').toDate(),
		};

		// the group hierarchy to process, starting from the leaf going up
		const groupHierarchy = this.utils.explodeGroupId(groupContextId).reverse();

		/**
		 * Process all metrics's affected by the pipeline execution
		 */
		for (const metric of metrics) {
			const groupMetrics = await this.rollupMetric(groupHierarchy, timeRangePipeline, timeRangeMonth, metric, 'pipeline');
			await this.metricsRepo.saveMetrics(metric.id, pipelineId, pipelineExecutionId, groupMetrics);
		}

		/**
		 * Process any metric's that are downstream of the original metric(s) being processed
		 */
		let parentMetricNames = Object.values(metrics).flatMap((k) => k.outputMetrics);
		this.log.debug(`AggregationTask> process> parentMetricNames:${JSON.stringify(parentMetricNames)}`);
		while ((parentMetricNames?.length ?? 0) > 0) {
			// retrieve definitions of parent metric's
			const parentMetrics: MetricResource[] = [];
			for (const name of parentMetricNames) {
				if (name === null || name === undefined) {
					continue;
				}
				// TODO: handle not found
				parentMetrics.push(await this.metricClient.getByName(name, undefined, requestContext));
			}

			// process all parent metrics's affected by the pipeline execution
			for (const parentMetric of parentMetrics) {
				// ensure we have not visited it yet
				if (visitedMetrics.includes(parentMetric.id)) {
					// TODO: custom error
					throw new Error(`Metric ${parentMetric.id} already referenced but discovered in Metric dependency path.`);
				}
				visitedMetrics.push(parentMetric.id);
				const groupMetrics = await this.rollupMetric(groupHierarchy, timeRangePipeline, timeRangeMonth, parentMetric, 'metric');
				await this.metricsRepo.saveMetrics(parentMetric.id, pipelineId, pipelineExecutionId, groupMetrics);
			}

			// let see if the parent metrics have any parents of their own
			parentMetricNames = Object.values(parentMetrics)
				?.filter((k) => k !== null)
				?.flatMap((k) => k.outputMetrics);
		}

		this.log.info(`AggregationTask> process> exit:`);
	}

	/**
	 *  Exposes a private method for unit testing purposes only. Should not call directly!
	 */
	public async ___rollupMetric(groupHierarchy: string[], timeRangePipeline: AffectedTimeRange, timeRangeMonth: AffectedTimeRange, metric: MetricResource, inputType: 'pipeline' | 'metric'): Promise<GroupMetrics> {
		return await this.rollupMetric(groupHierarchy, timeRangePipeline, timeRangeMonth, metric, inputType);
	}

	private async rollupMetric(groupHierarchy: string[], timeRangePipeline: AffectedTimeRange, timeRangeMonth: AffectedTimeRange, metricResource: MetricResource, inputType: 'pipeline' | 'metric'): Promise<GroupMetrics> {
		this.log.info(
			`AggregationTask> rollupMetric> processing groupHierarchy:${JSON.stringify(groupHierarchy)}, timeRangePipeline:${JSON.stringify(timeRangePipeline)}, timeRangeMonth:${JSON.stringify(timeRangeMonth)}, metric name:${
				metricResource.name
			}, id:${metricResource.id}, inputType:${inputType}`
		);
		// cache of input metric names to ids
		const inputMetricNames: Record<string, string> = {};
		const groupMetrics: GroupMetrics = {};

		const groupHierarchyMetrics: { [key: string]: Metric[] } = {};

		// TODO: figure out how to reset time periods where entire period was deleted (setting to null) occurred
		// the affected metrics will need rolling up the entire group hierarchy, starting with the leaf
		for (let groupIndex = 0; groupIndex < groupHierarchy.length; groupIndex++) {
			const groupId = groupHierarchy[groupIndex];
			this.log.debug(`AggregationTask> rollupMetric> processing groupId:${groupId}`);

			groupMetrics[groupId] = {};

			/**
			 *  Start with initializing subGroupsValue from child group (if not leaf)
			 */

			if (!groupHierarchyMetrics[groupId]) {
				groupHierarchyMetrics[groupId] = await this.metricsRepo.listCollectionMetrics(metricResource.id, groupId, 'day', timeRangeMonth);
			}

			if (groupIndex === 0) {
				groupMetrics[groupId] = { day: [] };
			}

			if (groupIndex > 0) {
				const childGroupId = groupHierarchy[groupIndex - 1];

				const currentMetricsForChildGroup = groupHierarchyMetrics[childGroupId] ?? (await this.metricsRepo.listCollectionMetrics(metricResource.id, childGroupId, 'day', timeRangeMonth));

				groupMetrics[groupId].day = groupMetrics[childGroupId].day.map((m) => {
					const childGroupMetricForDay = currentMetricsForChildGroup.find((o) => this.isSameDate(o.date, m.date))?.groupValue ?? 0;
					const currentGroupMetricForDay = groupHierarchyMetrics[groupId].find((o) => this.isSameDate(o.date, m.date))?.subGroupsValue ?? 0;
					return {
						...m,
						subGroupsValue: currentGroupMetricForDay - childGroupMetricForDay + m.groupValue + m.subGroupsValue,
						groupValue: 0,
					};
				});
			}

			/**
			 * Append any pipeline output from this level
			 */
			if ((groupHierarchyMetrics[groupId]?.length ?? 0) > 0) {
				for (const m of groupHierarchyMetrics[groupId]) {
					const existing = groupMetrics[groupId].day.find((d) => this.isSameDate(d.date, m.date));
					if (existing) {
						existing.groupValue = m.groupValue;
					}
				}
			}

			/**
			 * Reset the value for the pipeline execution range as we will recalculate these
			 */
			groupMetrics[groupId].day?.filter((m) => this.isBetweenDate(m.date, timeRangePipeline.from, timeRangePipeline.to)).forEach((m) => (m.groupValue = 0));

			/**
			 * Interpolate missing day metrics
			 */
			this.interpolate(groupMetrics, groupId, 'day', timeRangeMonth, metricResource);

			let updatedCollectionMetrics: AggregationResult[];
			if (inputType === 'pipeline') {
				/**
				 *  As pipelines can exist at any group level, calculate the daily metrics for the month(s) affected by the pipeline execution.
				 */
				updatedCollectionMetrics = await this.pipelineRepo.aggregatePipelineOutput(groupId, metricResource.inputPipelines, timeRangeMonth);
			} else {
				/**
				 *  As metric metrics can exist at any group level, calculate the metrics based on the input metric's for the month(s) affected by the pipeline execution.
				 */
				// first retrieve all the daily metrics for the input metrics
				updatedCollectionMetrics = await this.aggregateMetrics(metricResource, inputMetricNames, groupId, timeRangeMonth);
			}

			/**
			 * Layer the updated daily metrics over the existing daily metrics.
			 */
			for (let date = timeRangeMonth.from; date <= timeRangeMonth.to; date = dayjs(date).add(1, 'day').toDate()) {
				const updated = updatedCollectionMetrics.find((d) => this.isSameDate(d.date, date));
				if (updated) {
					const existing = groupMetrics[groupId].day.find((d) => this.isSameDate(d.date, date));
					existing.groupValue = updated.groupValue ?? 0;
				}
			}

			/**
			 * Rollup metrics to the other time units.
			 */
			const rollupTo: { fromUnit: TimeUnit; toUnit: TimeUnit }[] = [
				{ fromUnit: 'day', toUnit: 'week' },
				{ fromUnit: 'day', toUnit: 'month' },
				{ fromUnit: 'month', toUnit: 'quarter' },
				{ fromUnit: 'quarter', toUnit: 'year' },
			];
			for (const { fromUnit, toUnit } of rollupTo) {
				this.log.debug(`AggregationTask> rollupMetric> fromUnit:${fromUnit}, toUnit:${toUnit}, timeRangePipeline:${JSON.stringify(timeRangePipeline)}`);
				/**
				 * Time range is extended to the time unit boundaries else a part time unit could be aggregated
				 */
				const timeRangeTimeUnit: AffectedTimeRange = {
					from: dayjs(timeRangePipeline.from)
						.startOf(toUnit as OpUnitType)
						.toDate(),
					to: dayjs(timeRangePipeline.to)
						.endOf(toUnit as OpUnitType)
						.toDate(),
				};
				this.log.debug(`AggregationTask> rollupMetric> timeRangeTimeUnit:${JSON.stringify(timeRangeTimeUnit)}`);

				/**
				 * Rolling up some of the metrics may require retrieving additional existing metrics. E.g.:
				 * - rolling up `day` to `week`, or `day` to `month` can all be done with the metrics we already have in memory.
				 * - rolling up `month` to `quarter` will require retrieving the existing monthly metrics for the months that
				 * 		were not affected by the running of the pipeline.
				 * - rolling up `quarter` to `year` will require retrieving the existing quarterly metrics for the quarters that
				 * 		were not affected by the running of the pipeline.
				 */
				const fromUnitMetrics = groupMetrics[groupId][fromUnit] as Metric[];
				if (toUnit === 'quarter' || toUnit === 'year') {
					// retrieve existing metrics for the fromUnit for the full time range appropriate for the time unit
					const existingTimeUnitCollection = await this.metricsRepo.listCollectionMetrics(metricResource.id, groupId, fromUnit, timeRangeTimeUnit);
					// overlay the revised metrics onto the existing
					existingTimeUnitCollection.forEach((e) => {
						const updatedMetric = fromUnitMetrics.find((u) => this.isSameDate(u.date, e.date));
						if (updatedMetric === undefined) {
							fromUnitMetrics.push(e);
						}
					});
					this.interpolate(groupMetrics, groupId, fromUnit, timeRangeTimeUnit, metricResource);
				}

				/**
				 * Roll up the collection metrics to the required time unit
				 */
				const metricsToRollUp = fromUnitMetrics.filter((m) => this.isBetweenDate(m.date, timeRangeTimeUnit.from, timeRangeTimeUnit.to));
				groupMetrics[groupId][toUnit] = this.rollUpBy(metricsToRollUp, toUnit);
			}
		}

		/**
		 * Filter the processed metrics so that they only contain the metrics impacted by the original pipeline time range.
		 * This can only be done after we have finished calculating the whole groupmetrics as the metrics we need to filter
		 * out were required in order to generate the parent metrics.
		 */
		Object.keys(groupMetrics).forEach((groupId) => {
			groupMetrics[groupId].day = groupMetrics[groupId].day.filter((m) => this.isBetweenDate(m.date, timeRangePipeline.from, timeRangePipeline.to));
			for (const timeUnit of ['week', 'month', 'quarter']) {
				const timeRangeTimeUnit: AffectedTimeRange = {
					from: dayjs(timeRangePipeline.from)
						.startOf(timeUnit as OpUnitType)
						.toDate(),
					to: dayjs(timeRangePipeline.to)
						.endOf(timeUnit as OpUnitType)
						.toDate(),
				};
				groupMetrics[groupId][timeUnit] = groupMetrics[groupId][timeUnit].filter((m) => this.isBetweenDate(m.date, timeRangeTimeUnit.from, timeRangeTimeUnit.to));
			}
		});

		this.log.debug(`AggregationTask> rollupMetric> exit:${JSON.stringify(groupMetrics)}`);
		return groupMetrics;
	}

	private isSameDate(a: Date, b: Date): boolean {
		return dayjs(a).isSame(dayjs(b), 'day');
	}

	private isBetweenDate(date: Date, from: string | Date, to: string | Date): boolean {
		return dayjs(date).isBetween(from, to, 'day', '[]');
	}

	/**
	 *  Exposes a private method for unit testing purposes only. Should not call directly!
	 */
	public ___rollUpBy(metrics: Metric[], timeUnit: string): Metric[] {
		return this.rollUpBy(metrics, timeUnit);
	}

	private rollUpBy(metrics: Metric[], timeUnit: string): Metric[] {
		this.log.info(`AggregationTask> process> rollUpBy in: timeUnit:${timeUnit}`);
		this.log.debug(`AggregationTask> process> rollUpBy in: metrics:${JSON.stringify(metrics)}`);
		const reduced = metrics.reduce((rolledUpMetrics: Metric[], current: Metric) => {
			const currentDjs = dayjs(current.date);
			const rolledUpMetric: Metric = {
				date: currentDjs.startOf(timeUnit as OpUnitType).toDate(),
				metricId: current.metricId,
				name: current.name,
				timeUnit,
				year: currentDjs.year(),
				groupValue: current.groupValue,
				subGroupsValue: current.subGroupsValue,
				version: 0,
			};
			const existing = rolledUpMetrics.find((m) => this.isSameDate(m.date, rolledUpMetric.date));
			if (existing) {
				existing.groupValue += rolledUpMetric.groupValue;
				existing.subGroupsValue += rolledUpMetric.subGroupsValue;
			} else {
				rolledUpMetric.day = timeUnit === 'day' ? currentDjs.dayOfYear() : undefined;
				rolledUpMetric.week = timeUnit === 'week' ? currentDjs.week() : undefined;
				rolledUpMetric.month = timeUnit === 'month' ? currentDjs.month() + 1 : undefined;
				rolledUpMetric.quarter = timeUnit === 'quarter' ? currentDjs.quarter() : undefined;
				rolledUpMetrics.push(rolledUpMetric);
			}
			return rolledUpMetrics;
		}, []);
		reduced.forEach((m) => (m.version = (m.version as number) + 1));
		this.log.debug(`AggregationTask> process> rollUpBy exit:${JSON.stringify(reduced)}`);
		return reduced;
	}

	/**
	 *  Exposes a private method for unit testing purposes only. Should not call directly!
	 */
	public ___interpolate(groupMetrics: GroupMetrics, groupId: string, unit: TimeUnit, timeRange: AffectedTimeRange, metricResource: MetricResource): void {
		return this.interpolate(groupMetrics, groupId, unit, timeRange, metricResource);
	}

	private interpolate(groupMetrics: GroupMetrics, groupId: string, unit: TimeUnit, timeRange: AffectedTimeRange, metricResource: MetricResource): void {
		this.log.info(`AggregationTask> interpolate> in: groupId:${groupId}, unit:${unit}, timeRange:${JSON.stringify(timeRange)}`);
		this.log.debug(`AggregationTask> interpolate> in: groupMetrics:${JSON.stringify(groupMetrics)}`);

		if (groupMetrics[groupId][unit] === undefined) {
			groupMetrics[groupId][unit] = [];
		}
		// start by sorting
		const metrics = groupMetrics[groupId][unit];
		// then analyze the time range and add missing metric objects
		const toAdd: Metric[] = [];
		for (
			let date = timeRange.from;
			date <= timeRange.to;
			date = dayjs(date)
				.add(1, unit as ManipulateType)
				.toDate()
		) {
			if (metrics.find((m) => this.isSameDate(m.date, date)) === undefined) {
				const djs = dayjs(date);
				const metric: Metric = {
					date,
					metricId: metricResource.id,
					name: metricResource.name,
					version: 1,
					timeUnit: unit,
					groupValue: 0,
					subGroupsValue: 0,
					year: djs.year(),
				};
				metric.day = unit === 'day' ? djs.dayOfYear() : undefined;
				metric.week = unit === 'week' ? djs.week() : undefined;
				metric.month = unit === 'month' ? djs.month() + 1 : undefined;
				metric.quarter = unit === 'quarter' ? djs.quarter() : undefined;
				toAdd.push(metric);
			}
		}
		this.log.debug(`AggregationTask> interpolate> added: ${JSON.stringify(toAdd)}`);
		metrics.push(...toAdd);
		this.log.info(`AggregationTask> interpolate> exit:`);
	}

	private async aggregateMetrics(metric: MetricResource, inputMetricNames: Record<string, string>, groupId: string, timeRangeMonth: AffectedTimeRange): Promise<Metric[]> {
		this.log.info(`AggregationTask> aggregateMetrics> in: metricId:${metric.id}, inputMetricNames:${JSON.stringify(inputMetricNames)}, groupId:${groupId}, timeRangeMonth:${JSON.stringify(timeRangeMonth)}`);

		const inputMetrics: Metric[] = [];
		for (const name of metric.inputMetrics) {
			if (inputMetricNames[name] === undefined) {
				// TODO: handle not found
				const metric = await this.metricClient.getByName(name, undefined, this.buildLambdaRequestContext(groupId));
				// eslint-disable-next-line require-atomic-updates
				inputMetricNames[name] = metric?.id;
			}
			inputMetrics.push(...(await this.metricsRepo.listCollectionMetrics(inputMetricNames[name], groupId, 'day', timeRangeMonth)));
		}
		// then aggregate them into the metric we're dealing with so we have a starting point for the rest of the roll-ups
		const aggregated = inputMetrics.reduce((aggregatedMetrics: Metric[], current: Metric) => {
			const existing = aggregatedMetrics.find((m) => this.isSameDate(m.date, current.date));

			if (existing) {
				existing.groupValue += current.groupValue;
				existing.subGroupsValue += current.subGroupsValue;
			} else {
				aggregatedMetrics.push(current);
			}
			return aggregatedMetrics;
		}, []);

		this.log.info(`AggregationTask> aggregateMetrics> exit:`);
		this.log.debug(`AggregationTask> aggregateMetrics> exit: aggregated:${JSON.stringify(aggregated)}`);
		return aggregated;
	}

	private buildLambdaRequestContext(groupId: string): LambdaRequestContext {
		return {
			authorizer: {
				claims: {
					email: '',
					'cognito:groups': `${groupId}|||reader`,
					groupContextId: groupId,
				},
			},
		};
	}
}
