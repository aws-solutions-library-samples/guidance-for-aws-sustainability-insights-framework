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

import type { CalculatorClient, CalculatorRequest, CalculatorS3TransformResponse } from '@sif/clients';
import { validateNotEmpty, validateDefined } from '@sif/validators';
import type { PipelineProcessorsService } from '../../api/executions/service.js';
import type { CalculationChunk, CalculationTaskEvent, CalculationContext, ResultProcessorTaskEvent, S3Location, AggregationTaskEvent } from './model.js';
import type { GetSecurityContext } from '../../plugins/module.awilix.js';

export class CalculationTask {
	private readonly log: BaseLogger;
	private readonly pipelineProcessorsService: PipelineProcessorsService;
	private readonly getSecurityContext: GetSecurityContext;
	private readonly calculatorClient: CalculatorClient;

	constructor(log: BaseLogger, pipelineProcessorsService: PipelineProcessorsService, calculatorClient: CalculatorClient, getSecurityContext: GetSecurityContext) {
		this.getSecurityContext = getSecurityContext;
		this.log = log;
		this.pipelineProcessorsService = pipelineProcessorsService;
		this.calculatorClient = calculatorClient;
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
		validateNotEmpty(context.pipelineExecutionId, 'pipelineExecutionId');
		validateDefined(context.transformer?.parameters, 'transformer.parameters');
		validateDefined(context.transformer?.transforms, 'transformer.transforms');
		validateDefined(context.pipelineCreatedBy, 'pipelineCreatedBy');

		const response: CalculatorRequest = {
			groupContextId: context.groupContextId,
			pipelineId: context.pipelineId,
			executionId: context.pipelineExecutionId,
			parameters: context.transformer.parameters,
			transforms: context.transformer.transforms,
			actionType: context.actionType,
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

	public async process(event: CalculationTaskEvent): Promise<ResultProcessorTaskEvent & AggregationTaskEvent> {
		this.log.info(`CalculationTask > process > in > event: ${JSON.stringify(event)}`);

		const { context, source, chunk } = event;
		const { pipelineId, pipelineExecutionId, groupContextId, transformer } = context;

		try {
			// Extract the required parameters for Calculation Module
			const calculatorRequest = await this.assembleCalculatorRequest(chunk, source, context);

			// Perform calculation
			const r: CalculatorS3TransformResponse = (await this.calculatorClient.process(calculatorRequest)) as CalculatorS3TransformResponse;

			let response: ResultProcessorTaskEvent & AggregationTaskEvent = {
				pipelineId,
				pipelineExecutionId,
				sequence: chunk.sequence,
				output: { ...r },
				groupContextId,
				transformer,
			};
			this.log.info(`CalculationTask > process > exit: ${JSON.stringify(response)}`);
			return response;
		} catch (error) {
			this.log.error(`CalculationTask > process > error : ${JSON.stringify(error)}`);
			const securityContext = await this.getSecurityContext(pipelineExecutionId, 'contributor', groupContextId);
			await this.pipelineProcessorsService.update(securityContext, pipelineId, pipelineExecutionId, {
				status: 'failed',
				statusMessage: error.message,
			});
			throw error;
		}
	}
}
