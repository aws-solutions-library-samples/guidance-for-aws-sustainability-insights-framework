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


import type { ConnectorMetadata, DataAsset, PipelineMetadata, PipelineOutputKey, S3Location } from '@sif/clients';
import os from 'os';
import path from 'path';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import fs from 'fs';
import { pipeline } from 'stream/promises';
import DuckDB from 'duckdb';
import type { Logger } from 'pino';
import { ulid } from 'ulid';
import type { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import { PutEventsCommand } from '@aws-sdk/client-eventbridge';
import type { DataFabricHelper } from '../../plugins/dataFabricHelper';

/**
 * This event will be published to the hub
 */

interface CreateDataAssetEvent {
	idcUserId: string,
	idcEmail: string,
	catalog: Catalog;
	workflow: Workflow;
}

interface Workflow {
	name: string;
	roleArn: string;
	dataset: Dataset;
	externalInputs?: DataAsset[];
}

interface Dataset {
	name: string;
	format: string;
	connection: Connection;
}

interface Connection {
	dataLake: DataLake;
}

interface DataLake {
	s3: S3;
}

interface S3 {
	path: string;
	region: string;
}

interface Catalog {
	domainId: string;
	environmentId: string;
	projectId: string;
	assetName: string;
	accountId: string;
	autoPublish: boolean;
	revision?: string;
}

/**
 * The metadata required to register data sources in Amazon DataZone
 */
export interface AssetMetadata {
	name: string,
	description: string,
	owner?: string
}

export abstract class BaseService {

	protected readonly abstract outputType: string;
	protected readonly abstract assetType: 'metric' | 'activity';
	protected readonly abstract accountId: string;
	protected readonly abstract region: string;
	private readonly connection: DuckDB.Connection;
	private readonly duckDB: DuckDB.Database;

	protected constructor(protected log: Logger,
						  protected readonly sifDataBucket: string,
						  protected readonly dataFabricObjectPrefix: string,
						  protected readonly s3Client: S3Client,
						  protected readonly eventBridgeClient: EventBridgeClient,
						  protected readonly dataFabricEventBusArn: string,
						  protected readonly idcEmail: string,
						  protected readonly idcUserId: string,
						  protected readonly dataFabricHelper: DataFabricHelper) {

		this.duckDB = new DuckDB.Database(':memory:', { allow_unsigned_extensions: 'true' });
		this.connection = this.duckDB.connect();
	}

	public async exportFiles(pipeline: PipelineMetadata,
							 fields: PipelineOutputKey[],
							 s3Locations: S3Location[],
							 inputDataAssets: DataAsset[],
							 connectorMetadata: ConnectorMetadata) {

		this.log.trace(`BaseExportService > init > in> pipeline : ${JSON.stringify(pipeline)}, calculatorOutputFiles: ${s3Locations}`);
		await this.query(`SET home_directory='/tmp';
								INSTALL httpfs; LOAD httpfs;
								SET enable_http_metadata_cache=true;
								SET enable_object_cache=true;`
			, false);
		/**
		 * We need to perform transformation from the calculator output file for activities pipeline output
		 */
		const tableName = `tmp_${ulid().toLowerCase()}`;
		const partitionKeys = await this.importFromS3ToTable(tableName, s3Locations);
		const [bucket, keyPrefix] = await this.exportFromTableToS3(tableName, pipeline.id, fields, partitionKeys);
		const { domainId, environmentId, roleArn, projectId } = connectorMetadata.output[0].parameters;

		const assetMetadata = this.generateAssetMetadata(pipeline);

		let datasetName = `${assetMetadata.name}_input`;
		switch (connectorMetadata.input[0].name) {
			case 'sif-dataFabric-pipeline-input-connector':
				if (this.assetType === 'metric') {
					// if we're exporting metric to data fabric, use the pipeline name source
					datasetName = pipeline?.name ?? datasetName;
				} else {
					// if we're exporting activity, and we're using data fabric connector then query the asset from datazone to retrieve the asset name
					const connectorParameter = connectorMetadata.input?.[0]?.parameters;
					if (connectorParameter.hasOwnProperty('assetListingId') && connectorParameter.hasOwnProperty('domainId')) {
						const [_, assetDetail] = await this.dataFabricHelper.getAssetMetadata(connectorParameter['assetListingId'], connectorParameter['domainId']);
						datasetName = assetDetail.df_profile_form?.lineage_asset_name ?? datasetName;
					}
				}
				break;
			case 'sif-cleanRooms-pipeline-input-connector':
				// if we're using cleanrooms connector, for now we're appending _cleanrooms to indicate the asset comes from cleanrooms
				datasetName = `${assetMetadata.name}_cleanrooms`;
				break;
			case 'sif-csv-pipeline-input-connector':
				// if we're using csv connector, just append _csv prefix to indicate the asset comes from csv
				datasetName = `${assetMetadata.name}_csv`;
				break;
		}

		/**
		 * Workflow name cannot contain space because it will be used to name crawler
		 */
		const workflowName = `sif-${assetMetadata.name.replaceAll(/\s+/g, '_')}-import-workflow`;

		const createDataAssetEvent: CreateDataAssetEvent = {
			idcUserId: this.idcUserId,
			idcEmail: this.idcEmail,
			catalog: {
				domainId,
				environmentId,
				assetName: assetMetadata.name,
				projectId,
				accountId: this.accountId,
				autoPublish: true
			},
			workflow: {
				externalInputs: inputDataAssets,
				name: workflowName,
				roleArn: roleArn,
				dataset: {
					name: datasetName,
					format: this.outputType,
					connection: {
						dataLake: {
							s3: {
								path: `s3://${bucket}/${keyPrefix}`,
								/**
								 * SIF outputs the pipeline execution results to the bucket on the same region.
								 */
								region: this.region
							}
						}
					}
				}
			}
		};

		const startJobCommand = {
			EventBusName: this.dataFabricEventBusArn,
			Source: 'com.aws.df.spoke.dataAsset',
			DetailType: 'DF>com.aws.df.spoke.dataAsset>create>request',
			Detail: JSON.stringify(createDataAssetEvent)
		};

		await this.eventBridgeClient.send(new PutEventsCommand({
			Entries: [startJobCommand]
		}));

		this.log.trace(`BaseExportService > init > exit> startJobCommand: ${startJobCommand}`);
	}

	protected abstract exportFromTableToS3(table: string, pipelineId: string, fields: PipelineOutputKey[], partitionKeys: any[]): Promise<[string, string]> ;

	protected abstract importFromS3ToTable(table: string, files: S3Location[]): Promise<any[]> ;

	protected abstract generateAssetMetadata(pipeline: PipelineMetadata): AssetMetadata ;

	protected async downloadFile(bucket: string, fileKey: string): Promise<string> {
		this.log.trace(`BaseExportService > downloadFile >  bucket: ${bucket},  fileKey: ${fileKey}`);
		const downloadParams = {
			Bucket: bucket,
			Key: fileKey
		};

		const downloadPath = os.tmpdir() + path.sep + `${fileKey.split('/').pop()}`;
		try {
			const data = await this.s3Client.send(new GetObjectCommand(downloadParams));
			const writeStream = fs.createWriteStream(downloadPath);
			await pipeline(data.Body as NodeJS.ReadableStream, writeStream);
			this.log.trace('BaseExportService > downloadFile >  File downloaded:', fileKey);
		} catch (err) {
			this.log.trace('BaseExportService > downloadFile >  error:', err);
		}

		this.log.trace(`BaseExportService > downloadFile >  exit> downloadPath: ${downloadPath}`);
		return downloadPath;
	}

	protected filterQuery(query: string | undefined, isRemoteQuery: boolean = true): string {
		if (query && isRemoteQuery && query.toLowerCase().indexOf('duckdb_settings') > -1) {
			return `select 'Function is disabled' as error`;
		} else if (query && isRemoteQuery && query.trim().toLowerCase().startsWith('install')) {
			return `select 'Extension installation disabled' as error`;
		}
		if (query && isRemoteQuery && query.trim().toLowerCase().startsWith('load')) {
			return `select 'Extension loading is disabled' as error`;
		}
		if (query && isRemoteQuery && query.toLowerCase().indexOf('set') > -1) {
			return `select 'Using SET is disabled' as error`;
		}
		if (query && isRemoteQuery && query.toLowerCase().indexOf('pragma') > -1) {
			return `select 'Using PRAGMA is disabled' as error`;
		} else {
			return query || '';
		}
	};

	protected async query(query: string, isRemoteQuery: boolean = true) {
		return new Promise((resolve, reject) => {
			this.connection.all(this.filterQuery(query, isRemoteQuery), (err, res) => {
				if (err) reject(err);
				resolve(res);
			});
		});
	}


}
