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
import type { GroupsQueue, ProcessedTaskEvent } from './model.js';
import type { MetricAggregationJobService } from '../../api/aggregations/service';
import type { ActivitiesRepository } from '../../api/activities/repository';
import type { BaseLogger } from 'pino';
import type { NewMetricAggregationJob } from '../../api/aggregations/schemas';
import type { AggregationUtil } from '../../utils/aggregation.util';

export class SaveAggregationJobTaskService {

	constructor(private log: BaseLogger, private metricAggregationJobService: MetricAggregationJobService, private activitiesRepository: ActivitiesRepository, private metricAggregationUtil: AggregationUtil) {
	}

	public async process(event: ProcessedTaskEvent): Promise<ProcessedTaskEvent> {
		this.log.info(`SaveAggregationJobTaskService > process > event: ${JSON.stringify(event)}`);

		const { pipelineId, executionId, security } = event;

		const newTimeRange = await this.activitiesRepository.getAffectedTimeRange(pipelineId, executionId);

		this.log.trace(`SaveAggregationJobTaskService > process > newTimeRange: ${JSON.stringify(newTimeRange)}`);

		// retrieve the group leaves from the current execution
		const groupsQueue: GroupsQueue = [];
		const executionGroupLeaves = await this.metricAggregationUtil.getExecutionGroupLeaves(pipelineId, executionId);

		this.log.debug(`SaveAggregationJobTaskService > process > executionGroupLeaves: ${JSON.stringify(executionGroupLeaves)}`);

		executionGroupLeaves.forEach((egl, i) => {
			groupsQueue.push({ order: i + 1, group: egl });
		});

		const newMetricAggregationJob: NewMetricAggregationJob = {
			pipelineId,
			timeRange: {
				to: newTimeRange.to.toISOString(),
				from: newTimeRange.from.toISOString()
			}
		};

		await this.metricAggregationJobService.create(security, newMetricAggregationJob, groupsQueue);

		this.log.info(`SaveAggregationJobTaskService > process > exit`);
		return event;
	}
}
