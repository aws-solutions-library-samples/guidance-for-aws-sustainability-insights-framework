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
import { getPipelineErrorKey, getPipelineOutputKey, getTaskExecutionResultKey } from './helper.utils';
import os from 'os';
import fs from 'fs';
import type { BaseLogger } from 'pino';

export class CalculatorResultUtil {

	public constructor(private log: BaseLogger, private s3Client: S3Client, private dataBucket: string, private dataPrefix: string) {
	}

	public async concatenateS3Result(pipelineId: string, executionId: string, sequenceList: number[]): Promise<void> {
		this.log.debug(`CalculatorUtil > concatenateS3Result > pipelineId: ${pipelineId}, executionId: ${executionId}, sequenceList: ${sequenceList}`);
		const concatenatedFilePath = `${os.tmpdir()}/result.csv`;
		const out = fs.createWriteStream(concatenatedFilePath);
		for (const sequence of sequenceList) {
			const result = await this.s3Client.send(new GetObjectCommand({ Bucket: this.dataBucket, Key: getTaskExecutionResultKey(this.dataPrefix, pipelineId, executionId, sequence) }));
			out.write(await sdkStreamMixin(result.Body).transformToByteArray());
		}
		await this.s3Client.send(new PutObjectCommand({ Bucket: this.dataBucket, Key: getPipelineOutputKey(this.dataPrefix, pipelineId, executionId), Body: fs.createReadStream(concatenatedFilePath) }));
		this.log.debug(`CalculatorUtil > concatenateS3Result > exit:`);
		return;
	}

	private async storeCalculationOutput(combinedOutput: string, pipelineId: string, executionId: string, key: string): Promise<void> {
		this.log.trace(`CalculatorUtil > storeCalculationOutput > in > pipelineId: ${pipelineId}, executionId: ${executionId}, key: ${key}`);

		const params: PutObjectCommandInput = {
			Bucket: this.dataBucket,
			Key: key,
			Body: combinedOutput,
		};
		await this.s3Client.send(new PutObjectCommand(params));
		this.log.trace(`CalculatorUtil > storeCalculationOutput > exit:`);
	}

	protected async getContentFromFile(bucket: string, key: string): Promise<string> {
		const getObjectParams: GetObjectCommandInput = {
			Key: key,
			Bucket: bucket,
		};
		const response = await this.s3Client.send(new GetObjectCommand(getObjectParams));
		return await sdkStreamMixin(response.Body).transformToString();
	}

	public async concatenateS3Error(pipelineId: string, executionId: string, errorS3LocationList: { bucket: string, key: string }[]): Promise<void> {
		this.log.trace(`CalculatorUtil > concatenateS3Error > pipelineId: ${JSON.stringify(pipelineId)}, executionId: ${executionId}, errorS3LocationList: ${errorS3LocationList}`);
		const concatenatedErrors = [];
		for (const errorS3Location of errorS3LocationList) {
			concatenatedErrors.push(await this.getContentFromFile(errorS3Location.bucket, errorS3Location.key));
		}
		if (concatenatedErrors.length > 0) {
			const concatenatedErrorMessage = concatenatedErrors.join('\r\n');
			await this.storeCalculationOutput(concatenatedErrorMessage, pipelineId, executionId, getPipelineErrorKey(this.dataPrefix, pipelineId, executionId));
		}
		this.log.trace(`CalculatorUtil > concatenateS3Error > exit >`);
	}
}
