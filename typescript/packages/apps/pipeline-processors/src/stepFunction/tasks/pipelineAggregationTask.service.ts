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

import type { BaseLogger } from 'pino';
import type { ActivitiesRepository } from '../../api/activities/repository.js';
import type { AggregationTaskEvent } from './model.js';
import type { LambdaRequestContext, PipelineClient } from '@sif/clients';
import type { PipelineMetadata } from '../../api/activities/models.js';
import type { PipelineProcessorsRepository } from '../../api/executions/repository.js';
import { getPipelineMetadata } from '../../utils/helper.utils.js';
import { validateDefined, validateNotEmpty } from '@sif/validators';

export class PipelineAggregationTaskService {
	private readonly log: BaseLogger;
	private readonly activitiesRepository: ActivitiesRepository;
	private readonly pipelineClient: PipelineClient;
	private readonly pipelineProcessorRepository: PipelineProcessorsRepository;

	public constructor(log: BaseLogger, activitiesRepository: ActivitiesRepository, pipelineProcessorRepository: PipelineProcessorsRepository, pipelineClient: PipelineClient) {
		this.log = log;
		this.activitiesRepository = activitiesRepository;
		this.pipelineClient = pipelineClient;
		this.pipelineProcessorRepository = pipelineProcessorRepository;
	}

	public async process(event: AggregationTaskEvent): Promise<void> {
		this.log.info(`PipelineAggregationTaskService> process> event: ${JSON.stringify(event)}`);

		validateDefined(event, 'event');
		validateDefined(event.transformer?.transforms, 'event.transformer.transforms');
		validateNotEmpty(event.groupContextId, 'event.groupContextId');
		validateNotEmpty(event.pipelineId, 'event.pipelineId');
		validateNotEmpty(event.pipelineExecutionId, 'event.pipelineExecutionId');

		const { pipelineId, pipelineExecutionId: executionId, groupContextId, transformer } = event;

		const needAggregation = transformer.transforms.find(o => o.outputs.find(o => o.aggregate));

		if (needAggregation) {
			this.log.info(`PipelineAggregationTaskService> process> pipeline ${pipelineId} has aggregation specified`);

			const execution = await this.pipelineProcessorRepository.get(pipelineId, executionId);
			const requestContext: LambdaRequestContext = {
				authorizer: {
					claims: {
						email: '',
						'cognito:groups': `${groupContextId}|||reader`,
						groupContextId: groupContextId,
					},
				},
			};

			const pipeline = await this.pipelineClient.get(pipelineId, execution.pipelineVersion, requestContext);
			const metadata = getPipelineMetadata(pipeline);

			for await (const [activities, fromOffset] of this.getActivitiesAggregatedBySqlFunctions(pipelineId, executionId, groupContextId, metadata)) {
				this.log.info(`PipelineAggregationTaskService> process> fromOffset: ${fromOffset}`);
				await this.activitiesRepository.createAggregatedActivities(activities, pipelineId, executionId, groupContextId, pipeline._aggregatedOutputKeyAndTypeMap, metadata);
			}
		}
		this.log.info(`PipelineAggregationTaskService> process> exit:`);
	}

	public async* getActivitiesAggregatedBySqlFunctions(pipelineId: string, executionId: string, groupContextId: string, pipelineMetadata: PipelineMetadata) {
		this.log.debug(`PipelineAggregationTaskService> getActivitiesAggregatedBySqlFunctions> in> pipeline ${pipelineId}, executionId: ${executionId}, groupContextId: ${groupContextId}, pipelineMetadata: ${pipelineMetadata}`);

		const { from: dateFrom, to: dateTo } = await this.activitiesRepository.getAffectedTimeRange(pipelineId, executionId);

		let moreRowsToProcess = true, fromOffset = 0;

		while (moreRowsToProcess) {
			const { data, nextToken } = await this.activitiesRepository.get({
				dateFrom,
				dateTo,
				pipelineId,
				groupId: groupContextId,
				nextToken: fromOffset,
				maxRows: 1000
			}, pipelineMetadata, true);

			if (data.length > 0) {
				// set the offset for the next query
				fromOffset = nextToken;
				yield [data, fromOffset] as const;
			} else {
				// no more rows to process
				moreRowsToProcess = false;
			}
		}

		this.log.debug(`PipelineAggregationTaskService> getActivitiesAggregatedBySqlFunctions> out>`);
	}
}
