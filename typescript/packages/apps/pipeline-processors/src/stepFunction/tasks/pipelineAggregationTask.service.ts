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

import type { LambdaRequestContext, PipelineClient } from '@sif/clients';
import { validateDefined, validateNotEmpty } from '@sif/validators';
import type { BaseLogger } from 'pino';
import type { PipelineMetadata } from '../../api/activities/models.js';
import type { ActivitiesRepository } from '../../api/activities/repository.js';
import type { PipelineProcessorsRepository } from '../../api/executions/repository.js';
import { getPipelineMetadata } from '../../utils/helper.utils.js';
import type { ProcessedTaskEvent } from './model.js';
import type { AggregationUtil } from '../../utils/aggregation.util.js';

export class PipelineAggregationTaskService {
	private readonly log: BaseLogger;
	private readonly activitiesRepository: ActivitiesRepository;
	private readonly pipelineClient: PipelineClient;
	private readonly pipelineProcessorRepository: PipelineProcessorsRepository;
	private readonly aggregationUtil: AggregationUtil;

	public constructor(log: BaseLogger, activitiesRepository: ActivitiesRepository, pipelineProcessorRepository: PipelineProcessorsRepository, pipelineClient: PipelineClient, aggregationUtil: AggregationUtil) {
		this.log = log;
		this.activitiesRepository = activitiesRepository;
		this.pipelineClient = pipelineClient;
		this.pipelineProcessorRepository = pipelineProcessorRepository;
		this.aggregationUtil = aggregationUtil;
	}

	public async process(event: ProcessedTaskEvent): Promise<void> {
		this.log.info(`PipelineAggregationTaskService> process> event: ${JSON.stringify(event)}`);

		validateDefined(event, 'event');
		validateNotEmpty(event.security, 'event.security');
		validateNotEmpty(event.pipelineId, 'event.pipelineId');
		validateNotEmpty(event.executionId, 'event.executionId');
		validateNotEmpty(event.requiresAggregation, 'event.requiresAggregation');

		const { security, pipelineId, executionId, requiresAggregation } = event;

		if (requiresAggregation) {
			this.log.info(`PipelineAggregationTaskService> process> pipeline ${pipelineId} has aggregation specified`);

			const execution = await this.pipelineProcessorRepository.get(executionId);
			const requestContext: LambdaRequestContext = {
				authorizer: {
					claims: {
						email: '',
						'cognito:groups': `${security.groupId}|||reader`,
						groupContextId: security.groupId
					}
				}
			};

			const pipeline = await this.pipelineClient.get(pipelineId, execution.pipelineVersion, requestContext);
			const metadata = getPipelineMetadata(pipeline);

			const executionGroups = await this.aggregationUtil.getExecutionGroups(pipelineId, executionId);
			this.log.debug(`PipelineAggregationTaskService> process> executionGroups: ${JSON.stringify(executionGroups)}`);

			// run pipeline aggregation for all groups affected by the pipeline execution (possibly many if pipeline used ASSIGN_TO_GROUP, otherwise 1)
			for await (const group of executionGroups) {
				for await (const [activities, fromOffset] of this.getActivitiesAggregatedBySqlFunctions(pipelineId, executionId, group, metadata)) {
					this.log.info(`PipelineAggregationTaskService> process> fromOffset: ${fromOffset}`);
					await this.activitiesRepository.createAggregatedActivities(activities, pipelineId, executionId, group, pipeline._aggregatedOutputKeyAndTypeMap, metadata);
				}
			}
		}
		this.log.info(`PipelineAggregationTaskService> process> exit:`);
	}

	public async* getActivitiesAggregatedBySqlFunctions(pipelineId: string, executionId: string, groupContextId: string, pipelineMetadata: PipelineMetadata) {
		this.log.debug(`PipelineAggregationTaskService> getActivitiesAggregatedBySqlFunctions> in> pipeline ${pipelineId}, executionId: ${executionId}, groupContextId: ${groupContextId}, pipelineMetadata: ${pipelineMetadata}`);

		const { from: dateFrom, to: dateTo } = await this.activitiesRepository.getAffectedTimeRange(pipelineId, executionId);

		let moreRowsToProcess = true,
			fromOffset = 0;

		while (moreRowsToProcess) {
			const { data, nextToken } = await this.activitiesRepository.aggregateRaw(
				{
					dateFrom,
					dateTo,
					pipelineId,
					groupId: groupContextId,
					nextToken: fromOffset,
					maxRows: 1000
				},
				pipelineMetadata
			);

			if (data.length > 0) {
				// set the offset for the next query
				fromOffset = nextToken;
				// if nextToken is undefined, that means no more data to process
				moreRowsToProcess = !!nextToken;
				yield [data, fromOffset] as const;
			} else {
				// no more rows to process
				moreRowsToProcess = false;
			}
		}

		this.log.debug(`PipelineAggregationTaskService> getActivitiesAggregatedBySqlFunctions> out>`);
	}
}
