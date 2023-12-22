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
import type { GetLambdaRequestContext } from '../../plugins/module.awilix.js';
import type { CalculationContext, CalculatorS3TransformResponseWithSequence, InsertActivityBulkResult, ProcessedTaskEvent, Status } from './model.js';
import type { MetricClient } from '@sif/clients';
import type { ActivitiesRepository } from '../../api/activities/repository';
import type { Client } from 'pg';
import type { PipelineProcessorsRepository } from '../../api/executions/repository';
import type { EventPublisher } from '@sif/events';

export class SqlResultProcessorTask {
	constructor(private readonly log: BaseLogger, private readonly pipelineProcessorsRepository: PipelineProcessorsRepository,
				private readonly metricClient: MetricClient, private readonly getLambdaRequestContext: GetLambdaRequestContext, private readonly activitiesRepository: ActivitiesRepository, private readonly eventPublisher: EventPublisher) {
	}

	private async assemble(context: CalculationContext, status: Status, calculatorTransformResponseList: CalculatorS3TransformResponseWithSequence[]): Promise<ProcessedTaskEvent> {
		this.log.trace(`SqlResultProcessorTask > assembler > context: ${JSON.stringify(context)}, status: ${status}, calculatorTransformResponseList:${calculatorTransformResponseList}`);

		const { security, transformer } = context;

		const metrics = Array.from(new Set(transformer.transforms.flatMap((t) => t.outputs.flatMap((o) => o.metrics ?? []))));

		const metricQueue = await this.metricClient.sortMetricsByDependencyOrder(metrics, this.getLambdaRequestContext(security));
		const outputs = transformer.transforms.flatMap((t) =>
			t.outputs.filter(o => !o.includeAsUnique && t.index > 0)        // needs values only (no keys, and no timestamp)
				.map((o) => ({ name: o.key, type: o.type })));
		const requiresAggregation = transformer.transforms.some((o) => o.outputs.some((o) => o.aggregate));

		const sequenceList = calculatorTransformResponseList.map(o => o.sequence);
		const errorLocationList = calculatorTransformResponseList.filter(o => o.errorLocation !== undefined).map(o => o.errorLocation);

		const response = {
			...context,
			// needed when concatenating the result
			errorLocationList,
			sequenceList,
			// needed when performing metric aggregation
			metricQueue,
			outputs,
			requiresAggregation,
			status
		};

		this.log.trace(`SqlResultProcessorTask > assembler > response: ${JSON.stringify(response)}`);
		return response;
	}

	private async cleanup(sequenceList: { executionId: string, sequence: number }[]) {
		this.log.debug(`sqlResultProcessor> cleanup> sequenceList: ${JSON.stringify(sequenceList)}`);
		let sharedDbConnection: Client;
		try {
			sharedDbConnection = await this.activitiesRepository.getConnection();
			// Confirm #temp tables matches #chunks
			const count = await this.activitiesRepository.getCountTempTables(sequenceList[0].executionId, sharedDbConnection);
			this.log.debug(`sqlResultProcessor> cleanup> Number of tables: ${count}`);
			// cleanup S3 files
			await this.activitiesRepository.cleanupTempTables(sequenceList, sharedDbConnection, true);
		} catch (Exception) {
			this.log.error(`sqlResultProcessor> cleanup> error: ${JSON.stringify(Exception)}`);
		} finally {
			// close the db connection if established
			if (sharedDbConnection !== undefined) {
				await sharedDbConnection.end();
			}
		}
		this.log.debug(`sqlResultProcessor> cleanup> exit>`);
	}

	public async process(event: InsertActivityBulkResult[]): Promise<ProcessedTaskEvent> {
		this.log.debug(`SqlResultProcessorTask > process > event: ${JSON.stringify(event)}`);

		const sortedResults = event.sort((a, b) => {
			return a.calculatorTransformResponse.sequence - b.calculatorTransformResponse.sequence;
		});

		const firstResult = sortedResults[0];

		const { executionId, security } = firstResult.context;

		const status: Status = event.some((o: InsertActivityBulkResult) => o.calculatorTransformResponse.noActivitiesProcessed === true) ? 'FAILED' : event.some((o: InsertActivityBulkResult) => o.sqlExecutionResult?.status === 'failed') ? 'FAILED' : 'SUCCEEDED';

		// if finished and success, transition the status
		if (status === 'SUCCEEDED') {
			this.log.debug(`sqlResultProcessor > handler > transitioning status to SUCCEEDED`);
			const execution = await this.pipelineProcessorsRepository.get(executionId);
			await this.pipelineProcessorsRepository.create({
				...execution,
				status: 'calculating_metrics',
				updatedBy: security.email,
				updatedAt: new Date(Date.now()).toISOString()
			});

			// publish the updated event
			await this.eventPublisher.publishTenantEvent({
				resourceType: 'pipelineExecution',
				eventType: 'updated',
				id: executionId
			});
		}

		const processedTaskEvent = await this.assemble(firstResult.context, status, sortedResults.map(o => o.calculatorTransformResponse));

		await this.cleanup(event.map(e => {
			return { sequence: e.calculatorTransformResponse.sequence, executionId };
		}));

		this.log.debug(`sqlResultProcessor > handler > exit> ${JSON.stringify(processedTaskEvent)}`);
		return processedTaskEvent;
	}

}
