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
import type { CalculatorClient, CalculatorRequest, CalculatorS3TransformResponse, MetricClient } from '@sif/clients';
import { validateDefined, validateNotEmpty } from '@sif/validators';
import type { PipelineProcessorsService } from '../../api/executions/service.js';
import type { GetLambdaRequestContext, GetSecurityContext } from '../../plugins/module.awilix.js';
import type { CalculationChunk, CalculationContext, CalculationTaskEvent, CalculationTaskResult, S3Location } from './model.js';

export class CalculationTask {

	constructor(private log: BaseLogger,
				private pipelineProcessorsService: PipelineProcessorsService,
				private calculatorClient: CalculatorClient,
				private getSecurityContext: GetSecurityContext,
				private getLambdaRequestContext: GetLambdaRequestContext,
				private metricClient: MetricClient) {
	}

	private async assembleCalculatorRequest(chunk: CalculationChunk, source: S3Location, context: CalculationContext): Promise<CalculatorRequest> {
		this.log.debug(`CalculationTask > assembleCalculatorRequest > in:`);

		validateDefined(chunk, 'chunk');
		validateDefined(chunk.sequence, 'sequence');
		validateDefined(chunk.range, 'range');

		validateDefined(source, 'source');
		validateNotEmpty(source.bucket, 'source.bucket');
		validateNotEmpty(source.key, 'source.key');

		validateDefined(context, 'context');
		validateNotEmpty(context.groupContextId, 'securityContextId');
		validateNotEmpty(context.pipelineId, 'pipelineId');
		validateNotEmpty(context.executionId, 'executionId');
		validateDefined(context.transformer?.parameters, 'transformer.parameters');
		validateDefined(context.transformer?.transforms, 'transformer.transforms');
		validateDefined(context.pipelineCreatedBy, 'pipelineCreatedBy');

		const response: CalculatorRequest = {
			groupContextId: context.groupContextId,
			pipelineId: context.pipelineId,
			executionId: context.executionId,
			parameters: context.transformer.parameters,
			transforms: context.transformer.transforms,
			actionType: context.actionType,
			pipelineType: context.pipelineType,
			sourceDataLocation: {
				bucket: source.bucket,
				key: source.key,
				startByte: chunk.range[0],
				endByte: chunk.range[1],
			},
			username: context.pipelineCreatedBy,
			chunkNo: chunk.sequence,
		};

		this.log.debug(`CalculationTask > assembleCalculatorRequest > exit:${JSON.stringify(response)}`);
		return response;
	}

	public async process(event: CalculationTaskEvent): Promise<CalculationTaskResult> {
		this.log.info(`CalculationTask > process > in > event: ${JSON.stringify(event)}`);

		const { context, source, chunk } = event;
		const { pipelineId, executionId: executionId, groupContextId, transformer, pipelineType } = context;
		const securityContext = await this.getSecurityContext(executionId, 'contributor', groupContextId);
		const result: CalculationTaskResult = { sequence: chunk.sequence };
		if (result.sequence === 0) {

			const metrics = Array.from(new Set(transformer.transforms.flatMap((t) => t.outputs.flatMap((o) => o.metrics ?? []))));
			const metricQueue = await this.metricClient.sortMetricsByDependencyOrder(metrics, this.getLambdaRequestContext(securityContext));

			const outputs = transformer.transforms.flatMap((t) =>
				t.outputs.filter(o => !o.includeAsUnique && t.index > 0)        // needs values only (no keys, and no timestamp)
					.map((o) => ({ name: o.key, type: o.type })));
			const requiresAggregation = transformer.transforms.some((o) => o.outputs.some((o) => o.aggregate));
			Object.assign(result, {
				metricQueue,
				groupContextId,
				pipelineId,
				executionId,
				outputs,
				requiresAggregation,
				pipelineType
			});
		}

		try {
			// Extract the required parameters for Calculation Module
			const calculatorRequest = await this.assembleCalculatorRequest(chunk, source, context);

			// Perform calculation
			const r: CalculatorS3TransformResponse = (await this.calculatorClient.process(calculatorRequest)) as CalculatorS3TransformResponse;

			if (result.sequence === 0) {
				Object.assign(result, { errorLocation: r.errorLocation });
			}
		} catch (error) {
			this.log.error(`CalculationTask > process > error : ${JSON.stringify(error)}`);
			await this.pipelineProcessorsService.update(securityContext, pipelineId, executionId, {
				status: 'failed',
				statusMessage: error.message,
			});
			throw error;
		}

		this.log.info(`CalculationTask > process > exit: ${JSON.stringify(result)}`);
		return result;
	}
}
