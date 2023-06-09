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

import { S3Client, GetObjectCommand, ListObjectsCommand, DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import type { FastifyBaseLogger } from 'fastify';
import type { GetSignedUrl, GetLambdaRequestContext } from '../plugins/module.awilix.js';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { AthenaClient, StartQueryExecutionCommand, GetQueryExecutionCommand } from '@aws-sdk/client-athena';
import type { Pipeline, PipelineClient, SecurityContext } from '@sif/clients';
import { validateNotEmpty } from '@sif/validators';
export class AuditExportUtil {

	private readonly log: FastifyBaseLogger;
	private readonly s3Client: S3Client;
	private readonly getSignedUrl: GetSignedUrl;
	private readonly bucketName: string;
	private readonly bucketPrefix: string;
	private readonly sqs: SQSClient;
	private readonly athena: AthenaClient
	private readonly sqsQueueUrl: string;
	private readonly pipelineClient: PipelineClient;
	private readonly getLambdaRequestContext: GetLambdaRequestContext;
	private readonly athenaDatabaseName: string;
	private readonly athenaAuditLogsTableName: string;

	public constructor(
		log: FastifyBaseLogger,
		s3Client: S3Client,
		getSignedUrl: GetSignedUrl,
		bucketName: string,
		bucketPrefix: string,
		sqs: SQSClient,
		athena: AthenaClient,
		sqsQueueUrl: string,
		pipelineClient: PipelineClient,
		getLambdaRequestContext: GetLambdaRequestContext,
		athenaDatabaseName: string,
		athenaAuditLogsTableName: string,
	) {
		this.log = log;
		this.s3Client = s3Client;
		this.getSignedUrl = getSignedUrl;
		this.bucketName = bucketName;
		this.bucketPrefix = bucketPrefix;
		this.sqs = sqs;
		this.athena = athena;
		this.sqsQueueUrl = sqsQueueUrl;
		this.pipelineClient = pipelineClient;
		this.getLambdaRequestContext = getLambdaRequestContext;
		this.athenaDatabaseName = athenaDatabaseName;
		this.athenaAuditLogsTableName = athenaAuditLogsTableName;
	}

	public async getAuditExportFileKey(pipelineId: string, executionId: string): Promise<string> {
		this.log.info(`ExportUtility> getExportArchive> pipelineId: ${pipelineId}, executionId: ${executionId}`);

		validateNotEmpty(pipelineId, 'pipelineId');
		validateNotEmpty(executionId, 'executionId');

		try {
			const listObjectsCommand = new ListObjectsCommand({
				Bucket: this.bucketName,
				Prefix: `${this.bucketPrefix}/${pipelineId}/executions/${executionId}/audits/export/`,
			});

			const result = await this.s3Client.send(listObjectsCommand);
			const file = result.Contents?.filter(c => c.Key.endsWith('.csv'))[0];
			return file?.Key
		} catch (e) {
			return undefined
		}

	}

	public async lockFileExists(pipelineId:string, executionId: string): Promise<boolean> {
		this.log.info(`ExportUtility> getLockFile> pipelineId:${pipelineId}, executionId:${executionId}`);

		validateNotEmpty(pipelineId, 'pipelineId');
		validateNotEmpty(executionId, 'executionId');

		const listObjectsCommand = new ListObjectsCommand({
			Bucket: this.bucketName,
			Prefix: `${this.bucketPrefix}/${pipelineId}/executions/${executionId}/audits/export/`,
		});

		try {
			const result = await this.s3Client.send(listObjectsCommand);
			return result.Contents?.filter(c => c.Key.endsWith('lock')).length > 0;
		} catch (error) {
			return false
		}

	}

	public async createLockFile(pipelineId:string, executionId: string): Promise<void> {
		this.log.info(`ExportUtility> createLockFile> pipelineId:${pipelineId}, executionId:${executionId}`);

		const command = new PutObjectCommand({
			Bucket: this.bucketName,
			Key: `${this.bucketPrefix}/${pipelineId}/executions/${executionId}/audits/export/lock`,
		});

		await this.s3Client.send(command);

		this.log.info(`ExportUtility> createLockFile> out:`)
	}

	public async deleteLockFile(pipelineId:string, executionId: string): Promise<void> {
		this.log.info(`ExportUtility> deleteLockFile> pipelineId:${pipelineId}, executionId:${executionId}`);

		const command = new DeleteObjectCommand({
			Bucket: this.bucketName,
			Key: `${this.bucketPrefix}/${pipelineId}/executions/${executionId}/audits/export/lock`,
		});

		await this.s3Client.send(command);

		this.log.info(`ExportUtility> deleteLockFile> out:`)
	}

	public async generateExportUrl (key:String) {
		this.log.info(`ExportUtility> generateExportUrl> key: ${key}`);

		validateNotEmpty(key, 'url');

		const params: GetObjectCommand = new GetObjectCommand({
			Bucket: this.bucketName,
			Key: `${key}`,
		});

		const url =  await this.getSignedUrl(this.s3Client, params);

		this.log.info(`ExportUtility> generateExportUrl> out:`);
		return url
	}

	public async publishAuditGenerationRequest(securityContext: SecurityContext, pipelineId: string, executionId: string) {
		this.log.info(`ExportUtility> publishAuditGenerationRequest> pipelineId:${pipelineId}, executionId:${executionId}`);

		validateNotEmpty(pipelineId, 'pipelineId');
		validateNotEmpty(executionId, 'executionId');
		validateNotEmpty(securityContext, 'securityContext');

		await this.createLockFile(pipelineId, executionId);

		const command = new SendMessageCommand({
			QueueUrl: this.sqsQueueUrl,
			MessageBody: JSON.stringify({ pipelineId, executionId, securityContext }),
			MessageAttributes: {
				messageType: {
					DataType: 'String',
					StringValue: `AuditArchiveExport:create`
				}
			}
		})

		await this.sqs.send(command);

		this.log.info(`ExportUtility> publishAuditGenerationRequest> out:`);
	}

	public async processAuditExportRequest(params: {pipelineId: string, executionId: string, securityContext: SecurityContext}) {
		this.log.info(`ExportUtility> processAuditExportRequest> params:${params}`);

		validateNotEmpty(params, 'params');
		validateNotEmpty(params.pipelineId, 'params.pipelineId');
		validateNotEmpty(params.executionId, 'params.executionId');
		validateNotEmpty(params.securityContext, 'params.securityContext');

		const pipeline = await this.pipelineClient.get(params.pipelineId, undefined, this.getLambdaRequestContext(params.securityContext));

		// create the query itself, below is a sample of the query which needs to be dynamically created based on the pipeline input/outputs etc
		const query = this.createAthenaQuery(pipeline, params.executionId)

		try {
			const startQueryExecutionCommand = new StartQueryExecutionCommand({
				QueryString: query,
				QueryExecutionContext: {
					Catalog: 'AwsDataCatalog',
					Database: this.athenaDatabaseName
				},
				ResultConfiguration: {
					OutputLocation: `s3://${this.bucketName}/${this.bucketPrefix}/${params.pipelineId}/executions/${params.executionId}/audits/export/`,
				}
			});

			const queryExecution = await this.athena.send(startQueryExecutionCommand);
			const queryExecutionId = queryExecution.QueryExecutionId;

			// Wait for the query to complete
			let queryStatus = 'QUEUED';
			while (queryStatus === 'QUEUED' || queryStatus === 'RUNNING') {
				const getQueryExecutionCommand = new GetQueryExecutionCommand({ QueryExecutionId: queryExecutionId });
				const queryExecutionResult = await this.athena.send(getQueryExecutionCommand);
				this.log.debug(`ExportUtility> processAuditExportRequest: queryResult: ${JSON.stringify(queryExecutionResult)}`)
				queryStatus = queryExecutionResult.QueryExecution.Status.State;
			}

			await this.deleteLockFile(params.pipelineId, params.executionId);

		} catch (e) {
			console.log(e)
			throw new Error(`ExportUtility> processAuditExportRequest> Failed: ${e.message}`)
		}

		this.log.info(`ExportUtility> processAuditExportRequest> out`)
	}

	private createAthenaQuery(pipeline:Pipeline, executionId) {

		const pipelineOutputKeys = pipeline.transformer.transforms
			.flatMap(transform => transform.outputs)
			.map(output => output.key);

		return  `
WITH inputs AS (
	SELECT auditId, ${pipeline.transformer.parameters.map((param) => {
			return `ikv['${param.key}'] AS in_${param.key}`
		}).join(', ')}
	FROM (
		SELECT  auditId, map_agg(input.name, input.value) ikv
		FROM    "${this.athenaAuditLogsTableName}" CROSS JOIN UNNEST(inputs) AS t(input)
		WHERE   pipeline_id = '${pipeline.id}'
		AND     execution_id = '${executionId}'
		AND     input.name <> '___row_identifier___'
		GROUP BY auditId
	)
), outputs AS (
	SELECT auditId,
		${pipelineOutputKeys.map((key) => {
			return `okv_formulas['${key}'] AS out_${key}_formula, okv_results['${key}'] AS out_${key}_results, okv_impacts['${key}'] AS out_${key}_impacts, okv_calculations['${key}'] AS out_${key}_calculations, okv_referenceDatasets['${key}'] AS out_${key}_referenceDatasets`
		}).join(',\n')}
	FROM (
		SELECT  auditId,
			map_agg(output.name, output.formula) AS okv_formulas,
			map_agg(output.name, output.result) AS okv_results,
			map_agg(output.name, output.resources.activities) AS okv_impacts,
			map_agg(output.name, output.resources.calculations) AS okv_calculations,
			map_agg(output.name, output.resources.referenceDatasets) AS okv_referenceDatasets
		FROM    "${this.athenaAuditLogsTableName}" CROSS JOIN UNNEST(outputs) AS t(output)
		WHERE   pipeline_id = '${pipeline.id}'
		AND     execution_id = '${executionId}'
		GROUP BY auditId
	)
)
SELECT inputs.auditId,
${pipeline.transformer.parameters.map((param) => {
	return `in_${param.key}`
}).join(', ')},
${pipelineOutputKeys.map((key) => {
	return `out_${key}_formula, out_${key}_results,out_${key}_impacts,out_${key}_calculations,out_${key}_referenceDatasets`
}).join(',\n')}
FROM inputs LEFT JOIN outputs ON inputs.auditId = outputs.auditId`

	}

}
