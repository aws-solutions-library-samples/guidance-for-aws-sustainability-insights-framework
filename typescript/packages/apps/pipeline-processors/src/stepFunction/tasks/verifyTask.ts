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
import type { PipelineProcessorsService } from '../../api/executions/service';
import type { VerificationTaskEvent, VerificationTaskOutput, S3Location, CalculationChunk } from './model.js';
import type { PipelineClient } from '@sif/clients';
import { HeadObjectCommand, HeadObjectCommandInput, S3Client } from '@aws-sdk/client-s3';
import type { Pipeline } from '@sif/clients';
import type { ActionType } from '@sif/clients';
import type { GetLambdaRequestContext, GetSecurityContext } from '../../plugins/module.awilix.js';

export class VerifyTask {
	private readonly log: BaseLogger;
	private readonly chunkSize: number;
	private readonly s3Client: S3Client;
	private readonly pipelineClient: PipelineClient;
	private readonly pipelineProcessorsService: PipelineProcessorsService;
	private readonly getSecurityContext: GetSecurityContext;
	private readonly getLambdaRequestContext: GetLambdaRequestContext;

	constructor(log: BaseLogger, pipelineClient: PipelineClient, pipelineProcessorsService: PipelineProcessorsService, s3Client: S3Client, getSecurityContext: GetSecurityContext, chunkSize: number, getLambdaRequestContext: GetLambdaRequestContext) {
		this.chunkSize = chunkSize;
		this.s3Client = s3Client;
		this.pipelineClient = pipelineClient;
		this.log = log;
		this.pipelineProcessorsService = pipelineProcessorsService;
		this.getSecurityContext = getSecurityContext;
		this.getLambdaRequestContext = getLambdaRequestContext;
	}

	private async createCalculationChunks(inputFileLocation: S3Location, chunkSize: number): Promise<CalculationChunk[]> {
		const params: HeadObjectCommandInput = {
			Bucket: inputFileLocation.bucket,
			Key: inputFileLocation.key,
		};

		const response = await this.s3Client.send(new HeadObjectCommand(params));
		let objectSize = response.ContentLength;

		const chunks: CalculationChunk[] = [];

		let startCounter = 0;
		while (objectSize > 0) {
			let range;
			if (objectSize <= chunkSize) {
				range = [ startCounter, response.ContentLength ];
			} else {
				const endCounter = startCounter + chunkSize;
				range = [ startCounter, endCounter ];
				startCounter = endCounter + 1;
			}
			chunks.push({
				range: range
			});
			objectSize -= chunkSize;
		}
		return chunks;
	}

	public async process(event: VerificationTaskEvent): Promise<VerificationTaskOutput> {
		this.log.info(`VerifyTask > process > event : ${JSON.stringify(event)}`);

		const { pipelineId, executionId: executionId, source } = event;

		const securityContext = await this.getSecurityContext(executionId);

		const { groupContextId, pipelineVersion, actionType } = await this.pipelineProcessorsService.get(securityContext, pipelineId, executionId);

		let pipelineConfiguration: Pipeline;

		try {
			pipelineConfiguration = await this.pipelineClient.get(pipelineId, pipelineVersion, this.getLambdaRequestContext(securityContext));
		} catch (error) {
			const errorMessage = `Pipeline configuration '${pipelineId}' not found.`;
			await this.pipelineProcessorsService.update(securityContext, pipelineId, executionId, {
				status: 'failed',
				statusMessage: errorMessage,
			});
			throw error;
		}

		const chunkSize = (pipelineConfiguration.processorOptions?.chunkSize ?? this.chunkSize) * 1000000;

		const chunks = await this.createCalculationChunks(source, chunkSize);

		const output = {
			source,
			chunks,
			context: {
				pipelineId,
				executionId,
				groupContextId,
				actionType: actionType as ActionType,
				transformer: pipelineConfiguration.transformer,
				pipelineCreatedBy: pipelineConfiguration.createdBy,
			}
		};

		this.log.info(`VerifyTask > process > exit:`);
		return output;
	}

}
