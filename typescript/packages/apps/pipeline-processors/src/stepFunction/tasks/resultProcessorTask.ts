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
import type { ProcessedTaskEvent } from './model.js';
import { validateNotEmpty } from '@sif/validators';

export class ResultProcessorTask {

	constructor(protected log: BaseLogger, protected s3Client: S3Client, protected dataBucket: string, protected dataPrefix: string) {
	}

	private async storeCalculationOutput(combinedOutput: string, pipelineId: string, executionId: string, key: string): Promise<void> {
		this.log.trace(`ResultProcessorTask > storeCalculationOutput > in > pipelineId: ${pipelineId}, executionId: ${executionId}, key: ${key}`);

		const params: PutObjectCommandInput = {
			Bucket: this.dataBucket,
			Key: key,
			Body: combinedOutput,
		};
		await this.s3Client.send(new PutObjectCommand(params));
		this.log.trace(`ResultProcessorTask > storeCalculationOutput > exit:`);
	}

	protected async getContentFromFile(bucket: string, key: string): Promise<string> {
		const getObjectParams: GetObjectCommandInput = {
			Key: key,
			Bucket: bucket,
		};
		const response = await this.s3Client.send(new GetObjectCommand(getObjectParams));
		return await sdkStreamMixin(response.Body).transformToString();
	}

	protected async concatenateS3Error(pipelineId: string, executionId: string, errorS3LocationList: { bucket: string, key: string }[]): Promise<void> {
		this.log.trace(`ResultProcessorTask > concatenateS3Error > pipelineId: ${JSON.stringify(pipelineId)}, executionId: ${executionId}, errorS3LocationList: ${errorS3LocationList}`);
		const concatenatedErrors = [];
		for (const errorS3Location of errorS3LocationList) {
			concatenatedErrors.push(await this.getContentFromFile(errorS3Location.bucket, errorS3Location.key));
		}
		if (concatenatedErrors.length > 0) {
			const concatenatedErrorMessage = concatenatedErrors.join('\r\n');
			await this.storeCalculationOutput(concatenatedErrorMessage, pipelineId, executionId, getPipelineErrorKey(this.dataPrefix, pipelineId, executionId));
		}
		this.log.trace(`ResultProcessorTask > concatenateS3Error > exit >`);
	}

	public async process(event: ProcessedTaskEvent[]): Promise<[string, string]> {
		this.log.info(`ResultProcessorTask > process > event: ${JSON.stringify(event)}`);
		validateNotEmpty(event, 'event');
		validateNotEmpty(event[0].executionId, 'executionId');
		validateNotEmpty(event[0].pipelineId, 'pipelineId');

		// first result is where common and overall metadata is stored
		const { executionId, pipelineId, status } = event[0];
		const errorS3LocationList = event.filter(o => o.errorLocation).map(o => o.errorLocation);
		await this.concatenateS3Error(pipelineId, executionId, errorS3LocationList);

		const taskStatus = (status === 'FAILED' || errorS3LocationList.length > 0) ? 'failed' : 'success';
		const taskStatusMessage = taskStatus == 'failed' ? 'error when performing calculation' : undefined;
		const taskResult: [string, string] = [taskStatus, taskStatusMessage];

		this.log.info(`ResultProcessorTask > process > exit > result: ${taskResult}`);
		return taskResult;
	}
}
