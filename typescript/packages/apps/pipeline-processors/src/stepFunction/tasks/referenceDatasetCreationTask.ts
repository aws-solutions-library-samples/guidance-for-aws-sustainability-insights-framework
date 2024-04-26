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
import type { CreateReferenceDatasetEvent, CreateReferenceDatasetOutput, S3Location } from './model.js';
import type {
	CalculatorClient,
	CalculatorInlineTransformResponse,
	CalculatorRequest,
	LambdaRequestContext,
	NewReferenceDatasetResource,
	Pipeline,
	PipelineClient,
	ReferenceDatasetClient,
	ReferenceDatasetResource,
	SecurityContext
} from '@sif/clients';
import type { GetLambdaRequestContext } from '../../plugins/module.awilix.js';
import type { PipelineProcessorsService } from '../../api/executions/service';
import axios from 'axios';
import type { S3Client } from '@aws-sdk/client-s3';
import { GetObjectCommand, SelectObjectContentCommand, SelectObjectContentCommandInput } from '@aws-sdk/client-s3';
import { toUtf8 } from '@aws-sdk/util-utf8-node';
import type { CalculatorResultUtil } from '../../utils/calculatorResult.util.js';

export class ReferenceDatasetCreationTask {
	constructor(private readonly log: BaseLogger, private getLambdaRequestContext: GetLambdaRequestContext, private readonly referenceDatasetClient: ReferenceDatasetClient, private readonly pipelineClient: PipelineClient, private readonly pipelineProcessorsService: PipelineProcessorsService, private readonly s3Client: S3Client, private readonly calculatorClient: CalculatorClient, private readonly calculatorResultUtil: CalculatorResultUtil) {
	}

	public async process(event: CreateReferenceDatasetEvent): Promise<CreateReferenceDatasetOutput> {
		this.log.info(`ReferenceDatasetCreationTask > process > event : ${JSON.stringify(event)}`);
		const { securityContext, pipelineId, executionId: executionId, source } = event;

		try {
			const requestContext = this.getLambdaRequestContext(event.securityContext);
			const pipelineExecution = await this.pipelineProcessorsService.get(securityContext, executionId);
			const pipeline = await this.pipelineClient.get(pipelineId, pipelineExecution.pipelineVersion, requestContext);
			const calculationResult = await this.runCalculationTask(securityContext, pipeline, executionId);
			// create reference dataset using metadata created from the calculation result
			const referenceDataset = await this.upsertReferenceDataset(source, calculationResult, { ...pipeline.tags, ...pipelineExecution.tags, pipelineId, executionId }, requestContext);

			return {
				securityContext: event.securityContext,
				pipelineId: event.pipelineId,
				executionId: event.executionId,
				referenceDatasetId: referenceDataset.id,
				referenceDatasetVersionId: referenceDataset.version,
				status: referenceDataset.status,
			};
		} catch (e) {
			await this.pipelineProcessorsService.update(securityContext, pipelineId, executionId, { status: 'failed', statusMessage: `Unable create reference dataset: error: ${JSON.stringify(e)}` });
			throw new Error(`Unable create reference dataset: error: ${JSON.stringify(e)}`);
		}
	}

	public assembleCreateReferenceDatasetRequest(calculationOutput: Record<string, string>, tags: Record<string, string>, fileHeaders: string[]): NewReferenceDatasetResource {
		this.log.trace(`ReferenceDatasetCreationTask > assembleCreateReferenceDatasetRequest > in > calculationOutput : ${JSON.stringify(calculationOutput)}, tags: ${JSON.stringify(tags)}, fileHeaders: ${fileHeaders}`);

		let name: string, description: string;
		for (const [key, value] of Object.entries(calculationOutput)) {
			switch (key) {
				case 'name' :
					name = value;
					break;
				case 'description' :
					description = value;
					break;
				default:
					if (key.startsWith('tag_')) {
						const tagKey = key.replace('tag_', '');
						tags[tagKey] = value;
					}
			}
		}

		const newReferenceDatasetResource: NewReferenceDatasetResource = {
			datasetSource: 's3',
			datasetHeaders: fileHeaders,
			tags,
			name,
			description
		};

		this.log.trace(`ReferenceDatasetCreationTask > assembleCreateReferenceDatasetRequest > exit > newReferenceDatasetResource : ${JSON.stringify(newReferenceDatasetResource)}`);
		return newReferenceDatasetResource;
	}

	private async runCalculationTask(securityContext: SecurityContext, pipeline: Pipeline, executionId: string): Promise<Record<string, string>> {
		this.log.debug(`ReferenceDatasetCreationTask > runCalculationTask > in > securityContext: ${securityContext}, pipeline: ${pipeline}, executionId: ${executionId}`);
		const calculatorRequest: CalculatorRequest = {
			pipelineId: pipeline.id,
			executionId,
			groupContextId: securityContext.groupId,
			username: securityContext.email,
			actionType: 'create',
			dryRun: false,
			sourceData: [JSON.stringify({})],
			parameters: pipeline.transformer.parameters,
			transforms: pipeline.transformer.transforms,
			pipelineType: pipeline.type
		};

		const calculatorResponse = await this.calculatorClient.process(calculatorRequest) as CalculatorInlineTransformResponse;
		await this.calculatorResultUtil.storeInlineTransformResponse(pipeline.id, executionId, pipeline.transformer.transforms, calculatorResponse);
		const executionOutputs = this.calculatorResultUtil.assembleInlineExecutionOutputs(calculatorResponse, pipeline.transformer.transforms);
		const singleOutput = executionOutputs.outputs.pop();

		this.log.debug(`ReferenceDatasetCreationTask > runCalculationTask > in > singleOutput: ${singleOutput}`);
		return singleOutput;
	}

	private async upsertReferenceDataset(referenceDatasetS3Source: S3Location, calculationOutput: Record<string, string>, tags: Record<string, string>, requestContext: LambdaRequestContext): Promise<ReferenceDatasetResource> {
		this.log.debug(`ReferenceDatasetCreationTask > upsertReferenceDataset > in > referenceDatasetS3Source: ${referenceDatasetS3Source}, calculationOutput: ${calculationOutput}, tags: ${tags},  requestContext: ${requestContext}`);

		const fileHeaders = await this.getFileHeaders(referenceDatasetS3Source.bucket, referenceDatasetS3Source.key);

		// Assemble reference dataset request using the transform function
		const newReferenceDatasetRequest = this.assembleCreateReferenceDatasetRequest(calculationOutput, tags, fileHeaders);

		const existingReferenceDataset = await this.referenceDatasetClient.getByAlias(newReferenceDatasetRequest.name, requestContext);

		let referenceDataset: ReferenceDatasetResource;

		if (existingReferenceDataset) {
			referenceDataset = await this.referenceDatasetClient.update(existingReferenceDataset.id, newReferenceDatasetRequest, requestContext);
		} else {
			referenceDataset = await this.referenceDatasetClient.create(newReferenceDatasetRequest, requestContext);
		}

		const data = await this.s3Client.send(new GetObjectCommand({ Bucket: referenceDatasetS3Source.bucket, Key: referenceDatasetS3Source.key }));
		await axios.put(referenceDataset.uploadUrl, await data.Body.transformToString());

		this.log.debug(`ReferenceDatasetCreationTask > upsertReferenceDataset > exit > referenceDataset: ${referenceDataset}`);
		return referenceDataset;
	}

	private async getFileHeaders(bucket: string, key: string): Promise<string[] | undefined> {
		this.log.info(`ReferenceDatasetCreationTask > getFileHeaders > in > bucket: ${bucket}, key: ${key}`);
		const s3Params: SelectObjectContentCommandInput = {
			Bucket: bucket,
			Key: key,
			ExpressionType: 'SQL',
			Expression: 'SELECT * FROM s3object s LIMIT 1',
			InputSerialization: {
				CSV: {
					FileHeaderInfo: 'NONE',
					FieldDelimiter: ',',
					AllowQuotedRecordDelimiter: true,
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

		this.log.info(`ReferenceDatasetCreationTask > getFileHeaders > exit > headers: ${JSON.stringify(headers)}`);
		return headers;
	}
}
