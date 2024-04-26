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
import type { ConnectorEvents } from '@sif/connector-utils/';
import type { ConnectorIntegrationRequestEvent } from '@sif/clients';
import { convertCsvReadableStreamToSifFormat, HandleEmptyCellTypes, saveCsvReadableStream } from '@sif/connector-utils';
import axios from 'axios';
import fs from 'fs';
import type { GlueAssetDetail, GlueImportService } from './import/glueImportService';
import type { RedshiftAssetDetail, RedshiftImportService } from './import/redshiftImportService';
import type { Asset, DataFabricHelper } from '../plugins/dataFabricHelper';

export interface Options {
	delimiter?: string;
	handleEmptyCells?: HandleEmptyCellTypes;
	skipParsingErrors?: boolean;
}


export class ImportService {
	public constructor(
		private readonly log: BaseLogger,
		private readonly connectorEvents: ConnectorEvents,
		private readonly dataFabricRegion: string,
		private readonly glueImportService: GlueImportService,
		private readonly redshiftImportService: RedshiftImportService,
		private readonly dataFabricHelper: DataFabricHelper
	) {
	}

	public async processConnectorIntegrationRequest(event: ConnectorIntegrationRequestEvent) {
		this.log.info(`dataZoneService> processConnectorIntegrationRequest> in> event: ${JSON.stringify(event)}`);

		const { transformedInputUploadUrl, pipeline, connector, executionId } = event;
		const { domainId, environmentId, assetListingId }: Asset = connector.parameters as Asset;

		const [assetType, assetDetail] = await this.dataFabricHelper.getAssetMetadata(assetListingId, domainId);

		const credentials = await this.dataFabricHelper.getEnvironmentCredentials({
			domainIdentifier: domainId,
			environmentIdentifier: environmentId,
			region: this.dataFabricRegion
		});

		let fileStream: NodeJS.ReadableStream;

		switch (assetType) {
			case 'Glue':
				fileStream = await this.glueImportService.query(credentials, assetDetail as GlueAssetDetail, { environmentId, domainId });
				break;
			case 'Redshift':
				fileStream = await this.redshiftImportService.query(credentials, assetDetail as RedshiftAssetDetail, { domainId, environmentId, assetListingId });
				break;
			default:
				throw new Error(`Asset with type ${assetType} is not supported by the connector`);
		}

		// Convert to SIF format
		const options = this.initializeDefaultOptions(connector.parameters);
		// if there is no transformation specified the we don't need to convert to SIF format.
		let transformedDataFilePath: string;
		if (pipeline.transformer.parameters.length === 0) {
			transformedDataFilePath = await saveCsvReadableStream(fileStream);
		} else {
			transformedDataFilePath = await convertCsvReadableStreamToSifFormat(fileStream, pipeline.transformer.parameters, options);
		}

		// upload the converted data to s3
		await this.uploadTransformedData(transformedInputUploadUrl, transformedDataFilePath);
		// publish a success response back
		await this.connectorEvents.publishResponse({
			executionId: executionId,
			pipelineId: pipeline.id,
			status: 'success',
			statusMessage: `successfully querying Amazon DataZone for pipeline: ${pipeline.id}, execution: ${executionId}`,
			pipelineType: pipeline.type
		});
	}


	private async uploadTransformedData(url: string, path: string): Promise<void> {
		this.log.info(`dataZoneService> uploadTransformedData> in> url: ${url}`);

		if (!url) {
			throw new Error(`Unable to upload transformed input data file: url: ${url}`);
		}

		try {
			await axios.put(url, fs.readFileSync(path));
		} catch (e) {
			throw new Error(`Unable to upload transformed input data file: error${JSON.stringify(e)}`);
		}

		this.log.info(`dataZoneService> uploadTransformedData> in> url: ${url}`);
	}

	private initializeDefaultOptions(parameters: Record<string, string | number | boolean>): Options {
		this.log.info(`dataZoneService> initializeDefaultOptions> in> parameters: ${parameters}`);

		// if we pass parameters which are undefined, then we need to initialize them as an empty object for the code below to populate the defaults
		if (!parameters) {
			parameters = {};
		}

		// empty options object
		const options: Options = {};

		// let's check if parameters have the delimiter specified as a property if not we will default it to a ','
		options.delimiter = parameters['delimiter']
			? parameters['delimiter'] as string
			: ',';

		// check if the 'handleEmptyCells' is specified in parameters if not we default it to 'setToEmptyStrings'
		options.handleEmptyCells = parameters['handleEmptyCells']
			? parameters['handleEmptyCells'] as HandleEmptyCellTypes
			: 'setToEmptyString' as HandleEmptyCellTypes;

		// check if 'skipParsingErrors' is specified in parameters, if not we will default it to not skip parsing errors
		options.skipParsingErrors = parameters['skipParsingErrors']
			? (parameters['skipParsingErrors'] === 'true') as boolean
			: false;

		this.log.info(`dataZoneService> initializeDefaultOptions> out> options: ${options}`);

		return options;
	}
}
