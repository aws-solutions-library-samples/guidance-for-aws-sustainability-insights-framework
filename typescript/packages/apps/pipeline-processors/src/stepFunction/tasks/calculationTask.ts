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
import { validateDefined, validateNotEmpty } from '@sif/validators';
import type { PipelineProcessorsService } from '../../api/executions/service.js';
import type { CalculationChunk, CalculationContext, CalculationTaskEvent, InsertActivityBulkEvent, InsertActivityBulkResult, S3Location } from './model.js';
import type { SQSClient } from '@aws-sdk/client-sqs';
import { SendMessageCommand } from '@aws-sdk/client-sqs';
import { ulid } from 'ulid';
import type { SFNClient } from '@aws-sdk/client-sfn';
import { SendTaskSuccessCommand } from '@aws-sdk/client-sfn';

export class CalculationTask {

	constructor(private log: BaseLogger,
				private pipelineProcessorsService: PipelineProcessorsService,
				private calculatorClient: CalculatorClient,
				private sqsClient: SQSClient,
				private activityInsertQueueUrl: string,
				private sfnClient: SFNClient) {
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
		validateNotEmpty(context.pipelineId, 'pipelineId');
		validateNotEmpty(context.executionId, 'executionId');
		validateDefined(context.transformer?.parameters, 'transformer.parameters');
		validateDefined(context.transformer?.transforms, 'transformer.transforms');
		validateDefined(context.pipelineCreatedBy, 'pipelineCreatedBy');
		validateDefined(context.security, 'security');

		const response: CalculatorRequest = {
			groupContextId: context.security.groupId,
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
				endByte: chunk.range[1]
			},
			username: context.pipelineCreatedBy,
			chunkNo: chunk.sequence
		};

		this.log.debug(`CalculationTask > assembleCalculatorRequest > exit:${JSON.stringify(response)}`);
		return response;
	}

	public async process(event: CalculationTaskEvent): Promise<InsertActivityBulkEvent> {
		this.log.info(`CalculationTask > process > in > event: ${JSON.stringify(event)}`);

		const { context, source, chunk, taskToken } = event;
		const { pipelineId, executionId: executionId } = context;
		const securityContext = context.security;
		const { sequence } = chunk;
		try {
			// Extract the required parameters for Calculation Module
			const calculatorRequest = await this.assembleCalculatorRequest(chunk, source, context);

			// Perform calculation
			const calculatorTransformResponse: CalculatorS3TransformResponse = (await this.calculatorClient.process(calculatorRequest)) as CalculatorS3TransformResponse;

			const result: InsertActivityBulkEvent = {
				context: {
					...context
				},
				stateMachine: {
					taskToken
				},
				calculatorTransformResponse: {
					...calculatorTransformResponse,
					sequence
				}
			};

			if (calculatorTransformResponse?.noActivitiesProcessed !== undefined && !calculatorTransformResponse.noActivitiesProcessed) {
				await this.sqsClient.send(new SendMessageCommand({ MessageBody: JSON.stringify(result), QueueUrl: this.activityInsertQueueUrl, MessageGroupId: executionId, MessageDeduplicationId: ulid().toLowerCase() }));
			} else {
				this.log.error(`CalculationTask > process > insertActivityBulkEvent error: ${JSON.stringify(calculatorTransformResponse)}`);
				const failedInsertActivityBulkResult: InsertActivityBulkResult = {
					context: sequence === 0 ? context : undefined,
					calculatorTransformResponse: {
						...calculatorTransformResponse,
						sequence
					},
					sqlExecutionResult: {
						status: 'failed'
					}
				};
				// Make sure we signal back to state machine so this does not get blocked
				await this.sfnClient.send(new SendTaskSuccessCommand({ output: JSON.stringify(failedInsertActivityBulkResult), taskToken }));
			}

			this.log.info(`CalculationTask > process > exit > ${JSON.stringify(calculatorTransformResponse)}`);
			return result;

		} catch (error) {
			this.log.error(`CalculationTask > process > error : ${JSON.stringify(error)}`);
			await this.pipelineProcessorsService.update(securityContext, pipelineId, executionId, {
				status: 'failed',
				statusMessage: error.message
			});
			throw error;
		}
	}
}
