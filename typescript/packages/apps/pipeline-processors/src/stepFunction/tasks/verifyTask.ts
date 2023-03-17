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
import type { CalculationTaskEvent, VerificationTaskEvent, VerificationTaskOutput, S3Location } from './model';
import type { PipelineClient, LambdaRequestContext } from '@sif/clients';
import type { SecurityContext } from '@sif/authz';
import { HeadObjectCommand, HeadObjectCommandInput, S3Client, SelectObjectContentCommand, SelectObjectContentCommandInput } from '@aws-sdk/client-s3';
import type { Pipeline } from '@sif/clients';
import { toUtf8 } from '@aws-sdk/util-utf8-node';
import type { ActionType } from '@sif/clients';

export class VerifyTask {
	private readonly log: BaseLogger;
	private readonly chunkSize: number;
	private readonly s3Client: S3Client;
	private readonly pipelineClient: PipelineClient;
	private readonly pipelineProcessorsService: PipelineProcessorsService;
	private readonly adminSecurityContext;

	constructor(log: BaseLogger, pipelineClient: PipelineClient, pipelineProcessorsService: PipelineProcessorsService, s3Client: S3Client, adminSecurityContext: SecurityContext, chunkSize: number) {
		this.chunkSize = chunkSize;
		this.s3Client = s3Client;
		this.pipelineClient = pipelineClient;
		this.log = log;
		this.pipelineProcessorsService = pipelineProcessorsService;
		this.adminSecurityContext = adminSecurityContext;
	}

	private async createCalculationTaskBatches(inputFileLocation: S3Location, chunkSize: number): Promise<CalculationTaskEvent[]> {
		const params: HeadObjectCommandInput = {
			Bucket: inputFileLocation.bucket,
			Key: inputFileLocation.key,
		};

		const response = await this.s3Client.send(new HeadObjectCommand(params));
		let objectSize = response.ContentLength;

		const tasks: CalculationTaskEvent[] = [];

		let startCounter = 0;
		let sequence = 0;
		while (objectSize > 0) {
			let chunk;
			if (objectSize <= chunkSize) {
				chunk = { startByte: startCounter, endByte: response.ContentLength };
			} else {
				const endCounter = startCounter + chunkSize;
				chunk = { startByte: startCounter, endByte: endCounter };
				startCounter = endCounter + 1;
			}
			tasks.push({
				sequence,
				source: inputFileLocation,
				chunk,
			});
			sequence++;
			objectSize -= chunkSize;
		}
		return tasks;
	}

	private async getFileHeaders(bucket: string, key: string): Promise<string[] | undefined> {
		this.log.info(`VerifyTask > getFileHeaders > in > bucket: ${bucket}, key: ${key}`);

		const s3Params: SelectObjectContentCommandInput = {
			Bucket: bucket,
			Key: key,
			ExpressionType: 'SQL',
			Expression: 'SELECT * FROM s3object s LIMIT 1',
			InputSerialization: {
				CSV: {
					FileHeaderInfo: 'NONE',
					FieldDelimiter: ',',
				},
				CompressionType: 'NONE',
			},
			OutputSerialization: {
				CSV: {
					FieldDelimiter: ',',
				},
			},
		};
		const result = await this.s3Client.send(new SelectObjectContentCommand(s3Params));
		let headers;
		if (result.Payload) {
			for await (const event of result.Payload) {
				if (event.Records?.Payload) {
					headers = toUtf8(event.Records.Payload).split(`\r\n`)[0]?.split(',');
				}
			}
		}

		this.log.info(`VerifyTask > getFileHeaders > exit > headers: ${JSON.stringify(headers)}`);
		return headers;
	}

	public async process(event: VerificationTaskEvent): Promise<VerificationTaskOutput> {
		this.log.info(`VerifyTask > process > event : ${JSON.stringify(event)}`);

		const { pipelineId, pipelineExecutionId, source } = event;

		const { groupContextId, pipelineVersion, actionType } = await this.pipelineProcessorsService.get(this.adminSecurityContext, pipelineId, pipelineExecutionId);

		/*
			Pipeline API lambda is wrapped around Fastify Auth check which requires context,
			also the pipeline is created under a particular security context, we need to pass
			in the right security context id
		*/
		const requestContext: LambdaRequestContext = {
			authorizer: {
				claims: {
					email: '',
					'cognito:groups': `${groupContextId}|||reader`,
					groupContextId: groupContextId,
				},
			},
		};

		let pipelineConfiguration: Pipeline;

		try {
			pipelineConfiguration = await this.pipelineClient.get(pipelineId, pipelineVersion, requestContext);
		} catch (error) {
			const errorMessage = `Pipeline configuration '${pipelineId}' not found.`;
			await this.pipelineProcessorsService.update(this.adminSecurityContext, pipelineId, pipelineExecutionId, {
				status: 'failed',
				statusMessage: errorMessage,
			});
			throw error;
		}

		const configurationHeaders = pipelineConfiguration.transformer?.parameters?.map((o) => o.key);

		const fileHeaders = await this.getFileHeaders(source.bucket, source.key);

		if (!fileHeaders || !configurationHeaders.every((h) => fileHeaders.includes(h))) {
			const errorMessage = `file header is invalid, expected : ${configurationHeaders}, actual: ${fileHeaders}`;
			await this.pipelineProcessorsService.update(this.adminSecurityContext, pipelineId, pipelineExecutionId, {
				status: 'failed',
				statusMessage: errorMessage,
			});
			throw new Error(errorMessage);
		}


		const chunkSize = (pipelineConfiguration.processorOptions?.chunkSize ?? this.chunkSize) * 1000000;

		const tasks = await this.createCalculationTaskBatches(source, chunkSize);

		const output = {
			tasks: tasks.map((t) => {
				return {
					...t,
					context: {
						fileHeaders,
						pipelineId,
						pipelineExecutionId,
						groupContextId,
						actionType: actionType as ActionType,
						transformer: pipelineConfiguration.transformer,
						pipelineCreatedBy: pipelineConfiguration.createdBy,
					},
				};
			}),
		};

		this.log.info(`VerifyTask > process > exit`);
		return output;
	}

}
