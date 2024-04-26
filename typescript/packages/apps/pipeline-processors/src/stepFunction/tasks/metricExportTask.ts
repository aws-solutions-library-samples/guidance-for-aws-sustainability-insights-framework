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


import type { MetricExportTaskEvent } from './model.js';
import type { BaseLogger } from 'pino';
import type { MetricsRepositoryV2 } from '../../api/metrics/repositoryV2.js';
import type { Utils } from '@sif/resource-api-base';
import type { ConnectorUtility } from '../../utils/connectorUtility.js';
import type { PipelineClient } from '@sif/clients';
import type { PipelineProcessorsService } from '../../api/executions/service.js';
import type { GetLambdaRequestContext } from '../../plugins/module.awilix.js';

export class MetricExportTask {

	public constructor(private readonly log: BaseLogger,
					   private readonly metricsRepositoryV2: MetricsRepositoryV2,
					   private readonly utils: Utils,
					   private readonly bucketName: string,
					   private readonly connectorUtility: ConnectorUtility,
					   private readonly pipelineClient: PipelineClient,
					   private readonly pipelineProcessorsService: PipelineProcessorsService,
					   private readonly getLambdaRequestContext: GetLambdaRequestContext) {
	}

	public async process(event: MetricExportTaskEvent) {
		this.log.info(`metricExportTask> process> in> event: ${JSON.stringify(event)}`);


		const pipeline = await this.pipelineClient.get(event.pipelineId, undefined, this.getLambdaRequestContext(event.security));

		/**
		 * Early exit on one of these conditions
		 * 1. If there is no output connector configured
		 * 2. If there is no metric queue
		 * 3. If there is no group queue
		 */
		if ((event.metricQueue ?? []).length === 0 || (event.groupsQueue ?? []).length === 0 || !pipeline.connectorConfig?.output) return;

		let exportObjectKey: string, execution = undefined;

		if (event.executionId) {
			execution = await this.pipelineProcessorsService.get(event.security, event.executionId);
			exportObjectKey = `metrics/pipeline=${event.pipelineId}/execution=${event.executionId}/result.csv`;
		} else if (event.id) {
			exportObjectKey = `metrics/pipeline=${event.pipelineId}/metricJobId=${event.id}/result.csv`;
		}

		const groupsSet: Set<string> = new Set();

		for (const g of event.groupsQueue) {
			const groupHierarchy = this.utils.explodeGroupId(g.group);
			for (const gh of groupHierarchy) {
				groupsSet.add(gh);
			}
		}

		await this.metricsRepositoryV2.exportMetricsFromMultipleGroups(
		  {
			  metricNames: event.metricQueue.map(o => o.metric),
			  groupIds: Array.from(groupsSet),
			  timeUnit: 'day',
			  timeRange: event.timeRange
		  },
		  {
			  bucket: this.bucketName,
			  key: exportObjectKey
		  });

		await this.connectorUtility.publishConnectorOutputIntegrationEvent(event.security, pipeline, execution, [exportObjectKey], 'metrics');

		this.log.info(`metricExportTask> process> out>`);
	}
}
