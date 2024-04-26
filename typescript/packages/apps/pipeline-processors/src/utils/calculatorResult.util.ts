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


import { CopyObjectCommand, GetObjectCommand, GetObjectCommandInput, PutObjectCommand, PutObjectCommandInput, S3Client } from '@aws-sdk/client-s3';
import { sdkStreamMixin } from '@aws-sdk/util-stream-node';
import os from 'os';
import fs, { ReadStream } from 'fs';
import type { BaseLogger } from 'pino';
import type { CalculatorInlineTransformResponse, S3Location, Transform } from '@sif/clients';
import { getPipelineErrorKey, getPipelineExecutionCalculatorOutputMetadata, getPipelineImpactCreationOutputKey, getPipelineOutputKey, getTaskExecutionResultKey } from './helper.utils.js';
import type { InlineExecutionOutputs } from '../api/executions/schemas.js';
import dayjs from 'dayjs';

export class CalculatorResultUtil {

	public constructor(private log: BaseLogger, private s3Client: S3Client, private dataBucket: string, private dataPrefix: string) {
	}

	public async getCalculatorOutputLocations(pipelineId: string, executionId: string): Promise<string[]> {
		this.log.debug(`CalculatorUtil > getCalculatorOutputLocations > pipelineId: ${pipelineId}, executionId: ${executionId}`);
		const response = await this.s3Client.send(new GetObjectCommand({
			Key: getPipelineExecutionCalculatorOutputMetadata(this.dataPrefix, pipelineId, executionId),
			Bucket: this.dataBucket,
		}));
		const outputResultKeys = JSON.parse(await sdkStreamMixin(response.Body).transformToString());
		this.log.debug(`CalculatorUtil > getCalculatorOutputLocations > exit> outputResultKeys: ${outputResultKeys}`);
		return outputResultKeys;
	}

	public async storeCalculatorOutputLocations(pipelineId: string, executionId: string, outputResultKeys: string[]) {
		this.log.debug(`CalculatorUtil > storeCalculatorOutputLocations > pipelineId: ${pipelineId}, executionId: ${executionId}, outputResultKeys: ${outputResultKeys}`);

		// store raw output metadata
		await this.s3Client.send(new PutObjectCommand({
			Key: getPipelineExecutionCalculatorOutputMetadata(this.dataPrefix, pipelineId, executionId),
			Bucket: this.dataBucket,
			Body: JSON.stringify(outputResultKeys)
		}));

		this.log.debug(`CalculatorUtil > storeCalculatorOutputLocations > exit>`);
	}

	public async storeInlineTransformResponse(pipelineId: string, executionId: string, transformList: Transform[], inlineTransformResponse: CalculatorInlineTransformResponse): Promise<[S3Location, S3Location]> {
		this.log.debug(`CalculatorUtil > storeInlineTransformResponse > pipelineId: ${pipelineId}, executionId: ${executionId}, transformList: ${transformList}, inlineTransformResponse: ${JSON.stringify(inlineTransformResponse)}`);
		// create map to get the type of output given the key
		const outputTypeMapping: { [key: string]: string } = transformList.reduce((prev, curr) => {
			prev[curr.outputs[0].key] = curr.outputs[0].type;
			return prev;
		}, {});

		const successLocation: S3Location = { bucket: this.dataBucket, key: getPipelineOutputKey(this.dataPrefix, pipelineId, executionId) };
		const successResponse = [inlineTransformResponse.headers.join(','), ...inlineTransformResponse.data
			// for string output insert double quote at the beginning and end of value
			// so value that contains comma is treated as single value
			.map(o => Object.entries(JSON.parse(o)).map(([key, value]) => {
				return outputTypeMapping[key] === 'string' ? `"${value}"` : value;
			}).join(','))]
			.join('\n')
			.concat(`\n`);
		await this.storeCalculationOutput(successResponse, successLocation.key);

		let errorLocation: S3Location;
		if (inlineTransformResponse.errors.length > 0) {
			errorLocation = { bucket: this.dataBucket, key: getPipelineErrorKey(this.dataPrefix, pipelineId, executionId) };
			const errorResponse = inlineTransformResponse.errors.join('\r\n');
			await this.storeCalculationOutput(errorResponse, errorLocation.key);
		}
		this.log.debug(`CalculatorUtil > storeInlineTransformResponse > exit > successLocation: ${successLocation}, errorLocation: ${errorLocation}`);
		return [successLocation, errorLocation];
	};

	public assembleInlineExecutionOutputs(response: CalculatorInlineTransformResponse, transforms: Transform[]): InlineExecutionOutputs {
		this.log.trace(`CalculatorUtil> assembleInlineExecutionOutputs> response: ${JSON.stringify(response)}, transforms: ${JSON.stringify(transforms)}`);

		// we need to figure which output field is timestamp, so we can format it as ISO string
		const timestampFields = transforms
			.filter(o => o?.outputs?.[0].type === 'timestamp' && o?.outputs?.[0].key !== undefined)
			.map(o => o.outputs[0].key);

		const outputs = {
			errors: response.errors.length === 0 ? undefined : response.errors,
			outputs: response.data.length === 0 ? undefined : response.data
				// data is array of JSON string
				.map(d => JSON.parse(d))
				// properly format the timestamp field to ISO string
				.map(d => {
					for (const key in d) {
						if (timestampFields.includes(key) && dayjs.utc(d[key]).isValid()) {
							d[key] = dayjs.utc(d[key]).toISOString();
						}
					}
					return d;
				})
		};

		this.log.trace(`CalculatorUtil> assembleInlineExecutionOutputs> outputs: ${JSON.stringify(outputs)}`);
		return outputs;
	}


	public async concatenateS3Result(pipelineId: string, executionId: string, sequenceList: number[]): Promise<string | undefined> {
		this.log.debug(`CalculatorUtil > concatenateS3Result > pipelineId: ${pipelineId}, executionId: ${executionId}, sequenceList: ${sequenceList}`);

		// when executed from inlineExecutionService the sequenceList will be empty
		if (!sequenceList || sequenceList.length < 1) return undefined;

		const concatenatedFilePath = `${os.tmpdir()}/result.csv`;
		const out = fs.createWriteStream(concatenatedFilePath);
		for (const sequence of sequenceList) {
			const result = await this.s3Client.send(new GetObjectCommand({ Bucket: this.dataBucket, Key: getTaskExecutionResultKey(this.dataPrefix, pipelineId, executionId, sequence) }));
			out.write(await sdkStreamMixin(result.Body).transformToByteArray());
		}
		const outputLocation = getPipelineOutputKey(this.dataPrefix, pipelineId, executionId);
		await this.storeCalculationOutput(fs.createReadStream(concatenatedFilePath), outputLocation);

		await this.s3Client.send(new CopyObjectCommand({ Bucket: this.dataBucket, CopySource: `${this.dataBucket}/${outputLocation}`, Key: getPipelineImpactCreationOutputKey(this.dataPrefix, pipelineId, executionId) }));

		this.log.debug(`CalculatorUtil > concatenateS3Result > exit:`);
		return outputLocation;
	}

	public async concatenateS3Error(pipelineId: string, executionId: string, errorS3LocationList: { bucket: string, key: string }[]): Promise<string | undefined> {
		this.log.trace(`CalculatorUtil > concatenateS3Error > pipelineId: ${JSON.stringify(pipelineId)}, executionId: ${executionId}, errorS3LocationList: ${errorS3LocationList}`);
		const concatenatedErrors = [];
		for (const errorS3Location of errorS3LocationList) {
			concatenatedErrors.push(await this.getContentFromFile(errorS3Location.bucket, errorS3Location.key));
		}
		if (concatenatedErrors.length > 0) {
			const concatenatedErrorMessage = concatenatedErrors.join('\r\n');
			const errorLocation = getPipelineErrorKey(this.dataPrefix, pipelineId, executionId);
			await this.storeCalculationOutput(concatenatedErrorMessage, errorLocation);
			return errorLocation;
		}
		this.log.trace(`CalculatorUtil > concatenateS3Error > exit >`);
		return undefined;
	}

	private async getContentFromFile(bucket: string, key: string): Promise<string> {
		this.log.trace(`CalculatorUtil > getContentFromFile > bucket: ${bucket}, key: ${key}`);
		const getObjectParams: GetObjectCommandInput = {
			Key: key,
			Bucket: bucket,
		};
		const response = await this.s3Client.send(new GetObjectCommand(getObjectParams));
		this.log.trace(`CalculatorUtil > concatenateS3Error > exit`);
		return await sdkStreamMixin(response.Body).transformToString();
	}

	private async storeCalculationOutput(combinedOutput: string | ReadStream, key: string): Promise<void> {
		this.log.trace(`CalculatorUtil > storeCalculationOutput > in > key: ${key}`);

		const params: PutObjectCommandInput = {
			Bucket: this.dataBucket,
			Key: key,
			Body: combinedOutput,
		};
		await this.s3Client.send(new PutObjectCommand(params));
		this.log.trace(`CalculatorUtil > storeCalculationOutput > exit:`);
	}
}
