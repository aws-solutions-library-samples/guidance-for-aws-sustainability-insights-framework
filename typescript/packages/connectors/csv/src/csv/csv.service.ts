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
import axios from 'axios';
import * as fs from 'fs';
import type { ConnectorIntegrationRequestEvent } from '@sif/clients';
import { convertCsvReadableStreamToSifFormat, ConnectorEvents } from '@sif/connector-utils';

export class CsvService {
	public constructor(
		private readonly log: BaseLogger,
		private readonly connectorEvents: ConnectorEvents
	) {
	}

	public async processConnectorIntegrationRequest(event: ConnectorIntegrationRequestEvent) {
		this.log.info(`csvService> processConnectorIntegrationRequest> in> event: ${JSON.stringify(event)}`);
		const { rawInputDownloadUrl, transformedInputUploadUrl, pipeline, executionId, connector } = event;
		try {
			// initialize the default options based on the compiled parameters passed through
			const options = this.initializeDefaultOptions(connector.parameters);
			// download the raw input data
			const rawInputDataStream = await this.downloadRawData(rawInputDownloadUrl);
			// perform the csv to sif data format conversion
			const transformedDataFilePath = await convertCsvReadableStreamToSifFormat(rawInputDataStream, pipeline.transformer.parameters, options);
			// upload the converted data to s3
			await this.uploadTransformedData(transformedInputUploadUrl, transformedDataFilePath);
			// publish a success response back
			await this.connectorEvents.publishResponse({
				executionId: executionId,
				pipelineId: pipeline.id,
				status: 'success',
				statusMessage: `successfully processed input file for pipeline: ${pipeline.id}, execution: ${executionId}`,
				pipelineType: pipeline.type
			});

		} catch (error) {
			this.log.error(`Connectors> SIF> events> process> error: ${JSON.stringify(error)}`);

			// if anything fails, publish an error response back
			await this.connectorEvents.publishResponse({
				executionId: executionId,
				pipelineId: pipeline.id,
				status: 'error',
				statusMessage: error.message,
				pipelineType: pipeline.type
			});
		}

		this.log.info(`csvService> processConnectorIntegrationRequest> in> out`);
	}

	private async downloadRawData(url: string): Promise<NodeJS.ReadableStream> {
		this.log.info(`csvService> downloadRawData> in> url: ${url}`);

		if (!url) {
			throw new Error(`Unable to download raw input data file: url: ${url}`);
		}

		try {
			const response = await axios({
				method: 'GET',
				url,
				responseType: 'stream'
			});
			this.log.info(`csvService> downloadRawData> out>`);
			return response.data;
		} catch (e) {
			throw new Error(`Unable to download raw input data file: error${JSON.stringify(e)}`);
		}

	}

	private async uploadTransformedData(url: string, path: string): Promise<void> {
		this.log.info(`csvService> uploadTransformedData> in> url: ${url}`);

		if (!url) {
			throw new Error(`Unable to upload transformed input data file: url: ${url}`);
		}

		try {
			await axios.put(url, fs.readFileSync(path));
		} catch (e) {
			throw new Error(`Unable to upload transformed input data file: error${JSON.stringify(e)}`);
		}

		this.log.info(`csvService> uploadTransformedData> in> url: ${url}`);
	}

	private initializeDefaultOptions(parameters: Record<string, string | number | boolean>): Options {
		this.log.info(`csvService> initializeDefaultOptions> in> parameters: ${parameters}`);

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

		this.log.info(`csvService> initializeDefaultOptions> out> options: ${options}`);

		return options;
	}

}

export interface Options {
	delimiter?: string;
	handleEmptyCells?: HandleEmptyCellTypes;
	skipParsingErrors?: boolean;
}

export enum HandleEmptyCellTypes {
	// we can expand this in the future to add "undefined" or "NaN" as well
	setToNull = 'setToNull',
	setToEmptyString = 'setToEmptyString'
}
