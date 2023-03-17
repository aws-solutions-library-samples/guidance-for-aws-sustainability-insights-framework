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

import { GetObjectCommand, GetObjectCommandInput, PutObjectCommand, PutObjectCommandInput, S3Client } from '@aws-sdk/client-s3';
import { sdkStreamMixin } from '@aws-sdk/util-stream-node';

import { getPipelineErrorKey } from '../../utils/helper.utils.js';

import type { BaseLogger } from 'pino';
import type { PipelineProcessorsService } from '../../api/executions/service.js';
import type { SecurityContext } from '@sif/authz';
import type { ResultProcessorTaskEvent } from './model.js';

export class ResultProcessorTask {
	private readonly log: BaseLogger;
	private readonly s3Client: S3Client;
	private readonly pipelineProcessorsService: PipelineProcessorsService;
	private readonly dataBucket: string;
	private readonly dataPrefix: string;
	private readonly adminSecurityContext: SecurityContext;

	constructor(log: BaseLogger, adminSecurityContext: SecurityContext, pipelineProcessorsService: PipelineProcessorsService, s3Client: S3Client, dataBucket: string, dataPrefix: string) {
		this.s3Client = s3Client;
		this.log = log;
		this.pipelineProcessorsService = pipelineProcessorsService;
		this.dataBucket = dataBucket;
		this.dataPrefix = dataPrefix;
		this.adminSecurityContext = adminSecurityContext;
	}

	private async storeCalculationOutput(combinedOutput: string, pipelineId: string, pipelineExecutionId: string, key: string): Promise<void> {
		this.log.info(`ResultProcessorTask > storeCalculationOutput > in > pipelineId: ${pipelineId}, pipelineExecutionId: ${pipelineExecutionId}, key: ${key}`);

		const params: PutObjectCommandInput = {
			Bucket: this.dataBucket,
			Key: key,
			Body: combinedOutput,
		};
		await this.s3Client.send(new PutObjectCommand(params));
		this.log.info(`ResultProcessorTask > storeCalculationOutput > exit:`);
	}

	private async getContentFromFile(bucket: string, key: string): Promise<string> {
		const getObjectParams: GetObjectCommandInput = {
			Key: key,
			Bucket: bucket,
		};
		const response = await this.s3Client.send(new GetObjectCommand(getObjectParams));
		return await sdkStreamMixin(response.Body).transformToString();
	}

	public async process(event: ResultProcessorTaskEvent[]): Promise<void> {
		this.log.info(`ResultProcessorTask > process > event: ${JSON.stringify(event)}`);

		// Ensure that the calculation result will be saved the same order as the input file
		const sortedResult = event.sort((a, b) => {
			return a.sequence - b.sequence;
		});

		let concatenatedErrors = '';
		for (const { output } of sortedResult) {
			if (output.errorLocation) {
				concatenatedErrors += await this.getContentFromFile(output.errorLocation.bucket, output.errorLocation.key);
				concatenatedErrors += '\r\n'; // error message files from Calculation Engine do not have newline
			}
		}

		const { pipelineExecutionId, pipelineId } = sortedResult[0];

		if (concatenatedErrors.length > 0) {
			// If errors, store the errors to s3, and mark failed
			await this.storeCalculationOutput(concatenatedErrors, pipelineId, pipelineExecutionId, getPipelineErrorKey(this.dataPrefix, pipelineId, pipelineExecutionId));
			await this.pipelineProcessorsService.update(this.adminSecurityContext, pipelineId, pipelineExecutionId, { status: 'failed' });
		} else {
			// Mark the pipeline as succeeded
			await this.pipelineProcessorsService.update(this.adminSecurityContext, pipelineId, pipelineExecutionId, { status: 'success' });
		}

		this.log.info(`ResultProcessorTask > process > exit:`);
	}
}
