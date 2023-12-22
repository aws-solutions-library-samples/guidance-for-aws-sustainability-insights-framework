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
import { S3Client, PutObjectCommand, PutObjectCommandInput } from '@aws-sdk/client-s3';
import {
	type ExecutionClient,
	type Execution,
	type PipelineProcessorExecutionMode,
	type PipelineProcessorActionType,
	type LambdaRequestContext,
	type ConnectorIntegrationResponseEvent,
	SecurityScope,
	ConnectorConfig,
	NewExecution
} from '@sif/clients';
import type { TransformService } from './transform.service.js';
import type { ConnectorEvents } from '@sif/connector-utils/dist/connector.events.js';
import { ulid } from 'ulid';
import dayjs from 'dayjs';

const cache = new NodeCache({ stdTTL: 300, checkperiod: 300 });
import NodeCache from 'node-cache';

export interface KinesisFirehoseRecord {
	recordId: string,
	data: string
}

export class KinesisService {

	private readonly requestContext: LambdaRequestContext;

	public constructor(
		private readonly log: BaseLogger,
		private readonly bucket: string,
		private readonly bucketPrefix: string,
		private readonly s3Client: S3Client,
		private readonly executionClient: ExecutionClient,
		private readonly transformService: TransformService,
		private readonly connectorConfig: ConnectorConfig,
		private readonly pipelineId: string,
		private readonly groupId: string,
		private readonly connectorEvents: ConnectorEvents
	) {
		this.requestContext = {
			authorizer: {
				claims: {
					email: '',
					'cognito:groups': `${this.groupId}|||contributor`,
					groupContextId: this.groupId,
				},
			},
		};
	}

	private async createExecution(executionTag: string): Promise<Execution> {
		this.log.info(`kinesisService> createExecution> in`);
		const newExecution: NewExecution = {
			mode: 'job' as PipelineProcessorExecutionMode,
			actionType: 'create' as PipelineProcessorActionType,
			tags: { 'kinesis-connector': this.connectorConfig.name, 'daily-tag': executionTag },
			expiration: 300,
			connectorOverrides: {
				[this.connectorConfig.name]: this.connectorConfig
			}
		};
		const execution = await this.executionClient.create(this.pipelineId, newExecution, this.requestContext);
		this.log.info(`kinesisService> createExecution> exit`);
		return execution;
	}

	private async getExecution(executionTag: string): Promise<Execution | undefined> {
		this.log.info(`kinesisService> getExecution> in`);
		const executions = await this.executionClient.list(this.pipelineId, this.requestContext, { tags: { key: 'daily-tag', value: executionTag } });
		this.log.info(`kinesisService> getExecution> exit`);
		const execution = (Object.keys(executions).length === 0) ? undefined : executions.executions[0];
		this.log.info(`kinesisService> getExecution> exit> execution: ${execution}`);
		return execution;
	}

	private async uploadRecords(data: string, executionId: string): Promise<string> {
		this.log.info(`kinesisService> uploadTransformedRecords > in>  executionId: ${executionId}`);
		const objName = `transformed-${ulid()}`;
		const params: PutObjectCommandInput = {
			Bucket: this.bucket,
			Key: `${this.bucketPrefix}/${this.pipelineId}/executions/${executionId}/input/${objName}`,
			Body: data,
		};
		await this.s3Client.send(new PutObjectCommand(params));
		this.log.info(`kinesisService> uploadTransformedRecords > exit`);
		return objName;
	};

	private async getPipelineExecutionForToday(): Promise<Execution> {
		this.log.info(`kinesisService> getPipelineExecutionForToday > in:`);
		const startOfDayUnix = dayjs().startOf('day').unix();
		const cacheKey = `execution_${startOfDayUnix}`;
		const executionTag = `${this.pipelineId}_${startOfDayUnix}`;
		if (!cache.has(cacheKey)) {
			// Check if an execution already exists for the pipeline
			let dailyExecution = await this.getExecution(executionTag);
			if (!dailyExecution) {
				dailyExecution = await this.createExecution(executionTag);
			}
			cache.set(cacheKey, dailyExecution);
		}
		this.log.info(`kinesisService> getPipelineExecutionForToday > exit:`);
		return cache.get(cacheKey);
	}

	private async transformRecords(records: KinesisFirehoseRecord[], executionId): Promise<[string, any[]]> {
		const kinesisTransformedRecords = [];
		const newlineDelimiter = `\r\n`;
		let jsonLinesRecords: string = '';

		for (const record of records) {
			try {
				// transform record payload
				const jsonRecord = this.transformService.transformRecord(record);
				// Add additional metadata for pipelineId & executionId to the payload this info will be used by the kinesis firehose dynamic partitioning
				jsonRecord['pipelineId'] = this.pipelineId;
				jsonRecord['executionId'] = executionId;

				jsonLinesRecords += JSON.stringify(jsonRecord) + newlineDelimiter;
				kinesisTransformedRecords.push({
					recordId: record.recordId,
					result: 'Ok',
					data: Buffer.from(JSON.stringify(jsonRecord), 'utf-8').toString('base64'),
				});
			} catch (error) {
				this.log.error(`kinesisService> process> error> ${(error as Error).message}`);
				kinesisTransformedRecords.push({
					recordId: record.recordId,
					result: 'ProcessingFailed',
					data: record.data
				});
			}
		}
		return [jsonLinesRecords, kinesisTransformedRecords];
	}

	public async process(event: { records: KinesisFirehoseRecord[] }): Promise<any> {
		this.log.info(`kinesisService> process> in> `);

		if (!event.records || event.records.length < 1) return [];

		const { id: executionId } = await this.getPipelineExecutionForToday();
		const [jsonLinesRecords, kinesisTransformedRecords] = await this.transformRecords(event.records, executionId);

		// only trigger the pipeline execution if there are 1 or more successfully processed record.
		if (kinesisTransformedRecords.filter(o => o.result === 'Ok').length > 0) {
			const transformedFileName = await this.uploadRecords(jsonLinesRecords, executionId);
			const params: ConnectorIntegrationResponseEvent = {
				executionId: executionId,
				pipelineId: this.pipelineId,
				status: 'success',
				pipelineType: 'activities',
				statusMessage: '',
				fileName: transformedFileName,
				securityContext: {
					email: 'sif.kinesis.connector',
					groupId: this.groupId,
					groupRoles: { [`${this.groupId}`]: SecurityScope.contributor }
				}
			};
			await this.connectorEvents.publishResponse(params);
		}

		this.log.info(`kinesisService> process> exit`);
		return { records: kinesisTransformedRecords };
	}
}
