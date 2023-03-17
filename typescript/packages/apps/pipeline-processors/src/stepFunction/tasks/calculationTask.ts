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

import type { CalculationChunk, CalculationTaskEvent, CalculationContext, ResultProcessorTaskEvent, S3Location, AggregationTaskEvent } from './model.js';
import type { BaseLogger } from 'pino';
import type { PipelineProcessorsService } from '../../api/executions/service.js';
import type { CalculatorClient, CalculatorRequest, CalculatorS3TransformResponse } from '@sif/clients';
import type { SecurityContext } from '@sif/authz';
import { validateNotEmpty, validateDefined } from '@sif/validators';

export class CalculationTask {
	private readonly log: BaseLogger;
	private readonly pipelineProcessorsService: PipelineProcessorsService;
	private readonly adminSecurityContext: SecurityContext;
	private readonly calculatorClient: CalculatorClient;

	constructor(log: BaseLogger, pipelineProcessorsService: PipelineProcessorsService, calculatorClient: CalculatorClient, adminSecurityContext: SecurityContext) {
		this.adminSecurityContext = adminSecurityContext;
		this.log = log;
		this.pipelineProcessorsService = pipelineProcessorsService;
		this.calculatorClient = calculatorClient;
	}

	private async assembleCalculatorRequest(chunk: CalculationChunk, sequence: number, source: S3Location, context: CalculationContext, pipelineCreatedBy: string): Promise<CalculatorRequest> {
		this.log.debug(`CalculationTask > assembleCalculatorRequest > in:`);

		validateDefined(chunk, 'chunk');
		validateDefined(sequence, 'sequence');
		validateDefined(source, 'source');
		validateDefined(context, 'context');
		validateNotEmpty(context.groupContextId, 'securityContextId');
		validateNotEmpty(context.pipelineId, 'pipelineId');
		validateNotEmpty(context.pipelineExecutionId, 'pipelineExecutionId');
		validateDefined(context.transformer?.parameters, 'transformer.parameters');
		validateDefined(context.transformer?.transforms, 'transformer.transforms');
		validateNotEmpty(source.bucket, 'source.bucket');
		validateNotEmpty(source.key, 'source.key');

		var response: CalculatorRequest = {
			groupContextId: context.groupContextId,
			pipelineId: context.pipelineId,
			executionId: context.pipelineExecutionId,
			parameters: context.transformer.parameters,
			transforms: context.transformer.transforms,
			csvHeader: context.transformer.parameters.map((o) => o.key).join(','),
			actionType: context.actionType,
			csvSourceDataLocation: {
				bucket: source.bucket,
				key: source.key,
				startByte: chunk.startByte,
				endByte: chunk.endByte,
				containsHeader: chunk.startByte === 0 ? true : false,
			},
			username: pipelineCreatedBy,
			chunkNo: sequence,
			// uniqueKey: [],	// TODO: need to figure out if/when and what makes sense to put here - defined in pipeline configuration?
		};

		this.log.debug(`CalculationTask > assembleCalculatorRequest > exit:${JSON.stringify(response)}`);
		return response;
	}

	public async process(event: CalculationTaskEvent): Promise<ResultProcessorTaskEvent & AggregationTaskEvent> {
		this.log.info(`CalculationTask > process > in > event: ${JSON.stringify(event)}`);

		const { context, source, chunk, sequence } = event;
		const { pipelineId, pipelineExecutionId, groupContextId, transformer, pipelineCreatedBy } = context;

		try {
			// Extract the required parameters for Calculation Module
			const calculatorRequest = await this.assembleCalculatorRequest(chunk, sequence, source, context, pipelineCreatedBy);

			// Perform calculation
			const r: CalculatorS3TransformResponse = (await this.calculatorClient.process(calculatorRequest)) as CalculatorS3TransformResponse;

			var response: ResultProcessorTaskEvent & AggregationTaskEvent = {
				pipelineId,
				pipelineExecutionId,
				sequence,
				output: { ...r },
				groupContextId,
				transformer,
			};
			this.log.info(`CalculationTask > process > exit: ${JSON.stringify(response)}`);
			return response;
		} catch (error) {
			this.log.error(`CalculationTask > process > error : ${JSON.stringify(error)}`);
			await this.pipelineProcessorsService.update(this.adminSecurityContext, pipelineId, pipelineExecutionId, {
				status: 'failed',
				statusMessage: error.message,
			});
			throw error;
		}
	}
}
