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

import dayjs, { OpUnitType } from 'dayjs';
import dayOfYear from 'dayjs/plugin/dayOfYear.js';
import isBetween from 'dayjs/plugin/isBetween.js';
import quarterOfYear from 'dayjs/plugin/quarterOfYear.js';
import weekOfYear from 'dayjs/plugin/weekOfYear.js';
import type { BaseLogger } from 'pino';
import type { ProcessedTaskEvent } from './model.js';
import { validateDefined, validateNotEmpty } from '@sif/validators';

import type { LambdaRequestContext, MetricClient, Metric as MetricResource } from '@sif/clients';
import type { Utils } from '@sif/resource-api-base';
import { AffectedTimeRange, TIME_UNIT_TO_DATE_PART, TimeUnitAbbreviation } from '../../api/metrics/models.js';
import type { AggregationTaskAuroraRepository } from './aggregationTask.aurora.repository.js';
import type { MetricAggregationRepository } from './metricAggregationRepository.js';

dayjs.extend(weekOfYear);
dayjs.extend(quarterOfYear);
dayjs.extend(dayOfYear);
dayjs.extend(isBetween);

export class MetricAggregationTaskServiceV2 {
	private readonly log: BaseLogger;
	private readonly metricClient: MetricClient;
	private readonly aggregationTaskRepo: AggregationTaskAuroraRepository;
	private readonly metricAggregationRepo: MetricAggregationRepository;
	private readonly utils: Utils;

	public constructor(log: BaseLogger, metricClient: MetricClient, aggregationTaskRepo: AggregationTaskAuroraRepository, utils: Utils, metricAggregationRepo: MetricAggregationRepository) {
		this.log = log;
		this.metricClient = metricClient;
		this.aggregationTaskRepo = aggregationTaskRepo;
		this.utils = utils;
		this.metricAggregationRepo = metricAggregationRepo;
	}

	public async process(event: ProcessedTaskEvent): Promise<ProcessedTaskEvent> {
		this.log.info(`MetricAggregationTaskServiceV2> process> event: ${JSON.stringify(event)}`);

		validateDefined(event, 'event');
		validateDefined(event.metricQueue, 'event.metricQueue');
		validateNotEmpty(event.groupContextId, 'event.groupContextId');
		validateNotEmpty(event.pipelineId, 'event.pipelineId');
		validateNotEmpty(event.executionId, 'event.executionId');

		const { groupContextId, pipelineId, executionId, metricQueue } = event;

		if (metricQueue.length === 0) {
			this.log.info(`AggregationTask> process> early exit (no metrics)`);
			return {
				...event,
				status: 'SUCCEEDED',
			};
		}

		const timeRange = event.timeRange ?? (await this.aggregationTaskRepo.getAffectedTimeRange(pipelineId, executionId));

		// the group hierarchy to process, starting from the leaf going up
		const groupHierarchy = this.utils.explodeGroupId(groupContextId).reverse();

		// sort the metric to process in order of priority or hierarchy then get the first one
		const [metricToProcess, ...restOfQueue] = metricQueue.sort((a, b) => a.order - b.order);

		const requestContext = this.buildLambdaRequestContext(groupContextId);

		this.log.trace(`MetricAggregationTaskServiceV2> process> aggregating metric ${metricToProcess.metric}`);

		const metric = await this.metricClient.getByName(metricToProcess.metric, undefined, requestContext);

		await this.rollupMetric(groupHierarchy, timeRange, metric, pipelineId, executionId);

		this.log.info(`MetricAggregationTaskServiceV2> process> exit:`);

		return {
			...event,
			timeRange,
			status: restOfQueue.length > 0 ? 'IN_PROGRESS' : 'SUCCEEDED',
			metricQueue: restOfQueue
		};
	}

	/**
	 *  Exposes a private method for unit testing purposes only. Should not call directly!
	 */
	public async ___rollupMetric(groupHierarchy: string[], timeRangePipeline: AffectedTimeRange, metric: MetricResource, triggeringPipelineId: string, triggeringExecutionId: string): Promise<void> {
		await this.rollupMetric(groupHierarchy, timeRangePipeline, metric, triggeringPipelineId, triggeringExecutionId);
	}

	private async rollupMetric(groupHierarchy: string[], timeRange: AffectedTimeRange, metric: MetricResource, triggeringPipelineId: string, triggeringExecutionId: string): Promise<void> {
		this.log.info(`AggregationTask> rollupMetric> processing groupHierarchy:${JSON.stringify(groupHierarchy)}, timeRange:${JSON.stringify(timeRange)}, metric name:${metric.name}, id:${metric.id}`);

		// TODO: figure out how to reset time periods where entire period was deleted (setting to null) occurred
		// the affected metrics will need rolling up the entire group hierarchy, starting with the leaf
		for (let groupIndex = 0; groupIndex < groupHierarchy.length; groupIndex++) {
			const groupId = groupHierarchy[groupIndex];
			this.log.debug(`AggregationTask> rollupMetric> processing groupId:${groupId}`);

			/**
			 *  Aggregate the daily metrics from both raw activities (input pipelines) and input metrics (daily metrics)
			 */
			await this.metricAggregationRepo.aggregateRawToDayMetric(metric.name, groupId, metric.inputMetrics, metric.inputPipelines, triggeringPipelineId, triggeringExecutionId, timeRange.from, timeRange.to);

			/**
			 * Rollup metrics to the other time units.
			 */
			const rollupTo: { fromUnit: TimeUnitAbbreviation; toUnit: TimeUnitAbbreviation }[] = [
				{ fromUnit: 'd', toUnit: 'w' },
				{ fromUnit: 'd', toUnit: 'm' },
				{ fromUnit: 'm', toUnit: 'q' },
				{ fromUnit: 'q', toUnit: 'y' },
			];
			for (const { fromUnit, toUnit } of rollupTo) {
				this.log.debug(`AggregationTask> rollupMetric> fromUnit:${fromUnit}, toUnit:${toUnit}, aggregated:${JSON.stringify(timeRange)}`);

				const fromDatePart = TIME_UNIT_TO_DATE_PART[fromUnit];
				const toDatePart = TIME_UNIT_TO_DATE_PART[toUnit];
				/**
				 * Time range is extended to the time unit boundaries else a part time unit could be aggregated
				 */
				const timeRangeTimeUnit: AffectedTimeRange = {
					from: dayjs(timeRange.from)
						.startOf(toDatePart as OpUnitType)
						.toDate(),
					to: dayjs(timeRange.to)
						.endOf(fromDatePart as OpUnitType)
						.toDate(),
				};
				this.log.debug(`AggregationTask> rollupMetric> timeRangeTimeUnit:${JSON.stringify(timeRangeTimeUnit)}`);

				/**
				 * Roll up the metrics to the required time unit
				 */
				await this.metricAggregationRepo.aggregateMetrics(metric.name, groupId, metric.inputMetrics, fromUnit, toUnit, triggeringPipelineId, triggeringExecutionId, timeRangeTimeUnit.from, timeRangeTimeUnit.to);
			}
		}

		this.log.debug(`AggregationTask> rollupMetric> exit:`);
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
