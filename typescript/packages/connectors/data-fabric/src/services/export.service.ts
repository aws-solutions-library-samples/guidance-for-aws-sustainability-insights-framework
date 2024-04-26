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

import type { S3Client } from '@aws-sdk/client-s3';
import { CopyObjectCommand } from '@aws-sdk/client-s3';
import type { Logger } from 'pino';
import type { ConnectorOutputIntegrationRequestEvent, S3Location } from '@sif/clients';
import pLimit from 'p-limit';
import type { ActivityExportService } from './export/activityExportService.js';
import type { MetricExportService } from './export/metricExportService.js';

export class ExportService {
	constructor(private log: Logger,
				private readonly sifDataBucket: string,
				private readonly dataZoneObjectPrefix: string,
				private readonly s3Client: S3Client,
				private readonly taskParallelLimit: number,
				private readonly activityExportService: ActivityExportService,
				private readonly metricExportService: MetricExportService
	) {

	}

	public async process(event: ConnectorOutputIntegrationRequestEvent) {
		this.log.info(`ExportService> process> in> event: ${JSON.stringify(event)}`);

		const { files, fields, pipeline, assetType, inputDataAssets, connectors } = event;

		switch (assetType) {
			case 'data':
			case 'impacts':
			case 'referenceDatasets':
				await this.exportFiles(pipeline.id, files);
				break;
			case 'activities':
				await this.activityExportService.exportFiles(pipeline, fields, files, inputDataAssets, connectors);
				break;
			case 'metrics':
				await this.metricExportService.exportFiles(pipeline, fields, files, inputDataAssets, connectors);
				break;
			default:
				throw new Error(`Asset type ${assetType} is not supported.`);
		}

		this.log.info(`ExportService> process> exit>`);
	}

	private async exportFiles(pipelineId: string, s3Locations: S3Location[]) {
		this.log.trace(`ExportService> exportFiles> in> pipelineId: ${pipelineId}, s3Locations: ${s3Locations}`);

		const limit = pLimit(this.taskParallelLimit);
		/**
		 * For data pipeline, we can just copy the output file into the datazone bucket
		 */
		const copyTaskFutures = [];
		for (const s3Location of s3Locations) {
			const fileName = s3Location.key.split('/').pop();
			copyTaskFutures.push(
				limit(() => this.s3Client.send(new CopyObjectCommand({
					CopySource: `${s3Location.bucket}/${s3Location.key}`,
					Bucket: this.sifDataBucket,
					Key: `${this.dataZoneObjectPrefix}/pipeline=${pipelineId}/${fileName}`
				}))));
		}
		await Promise.all(copyTaskFutures);

		this.log.trace(`ExportService> exportFiles> exit>`);
	}
}
