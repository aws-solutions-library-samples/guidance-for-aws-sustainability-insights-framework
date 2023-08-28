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


import type { ProcessedTaskEventWithExecutionDetails } from './model';
import type { BaseLogger } from 'pino';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type {  SFNClient } from '@aws-sdk/client-sfn';
import type { CloudWatchClient} from '@aws-sdk/client-cloudwatch';
import * as fs from 'fs';
import { sdkStreamMixin } from '@aws-sdk/util-stream-node';
import * as os from 'os';
import { getPipelineOutputKey, getTaskExecutionResultKey } from '../../utils/helper.utils.js';
import { ResultProcessorTask } from './resultProcessorTask.js';
import { validateNotEmpty } from '@sif/validators';
import type { PipelineClient } from '@sif/clients/dist';
import type { GetLambdaRequestContext, GetSecurityContext } from '../../plugins/module.awilix.js';
import type { PipelineProcessorsService } from '../../api/executions/service.js';

export class RawResultProcessorTask extends ResultProcessorTask {
	constructor(log: BaseLogger, s3Client: S3Client, sfnClient:SFNClient, cloudWatchClient:CloudWatchClient, pipelineClient:PipelineClient, pipelineBucket: string, pipelinePrefix: string, getSecurityContext:GetSecurityContext, getLambdaRequestContext:GetLambdaRequestContext, pipelineProcessorsService:PipelineProcessorsService) {
		super(log, s3Client, sfnClient, cloudWatchClient, pipelineClient, pipelineBucket, pipelinePrefix, getSecurityContext, getLambdaRequestContext,  pipelineProcessorsService);
	}

	private async concatenateS3Result(pipelineId: string, executionId: string, sequenceList: number[]): Promise<void> {
		this.log.debug(`RawResultProcessorTask > concatenateS3Result > pipelineId: ${pipelineId}, executionId: ${executionId}, sequenceList: ${sequenceList}`);
		const concatenatedFilePath = `${os.tmpdir()}/result.csv`;
		const out = fs.createWriteStream(concatenatedFilePath);
		for (const sequence of sequenceList) {
			const result = await this.s3Client.send(new GetObjectCommand({ Bucket: this.dataBucket, Key: getTaskExecutionResultKey(this.dataPrefix, pipelineId, executionId, sequence) }));
			out.write(await sdkStreamMixin(result.Body).transformToByteArray());
		}
		await this.s3Client.send(new PutObjectCommand({ Bucket: this.dataBucket, Key: getPipelineOutputKey(this.dataPrefix, pipelineId, executionId), Body: fs.createReadStream(concatenatedFilePath) }));
		this.log.debug(`RawResultProcessorTask > concatenateS3Result > exit:`);
		return;
	}

	public override async process(event: ProcessedTaskEventWithExecutionDetails): Promise<[string, string | undefined]> {
		this.log.debug(`RawResultProcessorTask > process > event: ${JSON.stringify(event)}`);
		validateNotEmpty(event, 'event');
		validateNotEmpty(event.inputs, 'inputs');

		const inputs = event.inputs;

		const sortedEvents = inputs.sort((a, b) => {
			return a.sequence - b.sequence;
		});
		const { pipelineId, executionId, pipelineType } = sortedEvents[0];

		validateNotEmpty(executionId, 'executionId');
		validateNotEmpty(pipelineId, 'pipelineId');
		validateNotEmpty(pipelineType, 'pipelineType');

		const errorS3LocationList = inputs.filter(o => o.errorLocation).map(o => o.errorLocation);
		const sequenceList = sortedEvents.map(o => o.sequence);

		await this.concatenateS3Error(pipelineId, executionId, errorS3LocationList);
		await this.concatenateS3Result(pipelineId, executionId, sequenceList);

		const taskStatus = errorS3LocationList.length < 1 ? (pipelineType === 'data' ? 'success' : 'in_progress') : 'failed';
		const taskStatusMessage = taskStatus == 'failed' ? 'error when performing calculation' : undefined;

		const result: [string, string] = [taskStatus, taskStatusMessage];
		this.log.debug(`RawResultProcessorTask > process > exit > result : ${result}`);
		return result;
	}
}
