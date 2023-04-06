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
import { ulid } from 'ulid';
import os from 'os';
import path from 'path';
import { parse, transform } from 'csv';
import { pipeline } from 'stream/promises';

import type { ConnectorIntegrationRequestEvent, Pipeline } from '@sif/clients';
import type { ConnectorEvents } from '../events/connector.events.js';


export class CsvService {
	public constructor(
		private readonly log: BaseLogger,
		private readonly connectorEvents: ConnectorEvents,
		private readonly newlineDelimiter: string = `\r\n`
	) {
	}

	private async convertRawInputDataToSifFormat(rawData: NodeJS.ReadableStream, _pipeline: Pipeline, options:Options): Promise<string> {
		this.log.info(`csvService> convertRawInputDataToSifFormat> in> `);

		const parser = parse({ delimiter: options.delimiter, skipRecordsWithError: options.skipParsingErrors });

		let headers: string[];
		const transformToObject = transform((row) => {
			// first iteration of the transform will set the headers of the csv
			if (!headers) {
				headers = row;
				// let's do some validation here based on the transform parameters specified and see if the headers of csv contains the transform parameters
				this.validateParameters(_pipeline, headers);
			} else {
				// if the headers don't match the row contents we will throw an error
				if(headers.length !== row.length) {
					throw new Error(`Failed to parse row: ${JSON.stringify(row)} headers=${headers.length}, row=${row.length} row values mismatch`);
				}

				const obj = {};
				headers.forEach((header, index) => {
					obj[header] = row[index];
					// we will override the value the property if its empty, if not we will leave it as is
					if (row[index] == "") {
						switch(options.handleEmptyCells) {
							// we will set the property to empty string if the value in the csv is empty string
							case 'setToEmptyString': {
								obj[header] = "";
								break;
							}
							// we will set the property to null if the value in csv is empty
							case 'setToNull': {
								obj[header] = null;
								break;
							}
						}
					}
				});
				return `${JSON.stringify(obj)}${this.newlineDelimiter}`;
			}
			return null;
		});

		const transformedDataFilePath = os.tmpdir() + path.sep + `${ulid().toLowerCase()}`;
		const writer = fs.createWriteStream(transformedDataFilePath);

		try {
			await pipeline(rawData, parser, transformToObject, writer);
		} catch (error) {
			this.log.error(`csvService> convertRawInputDataToSifFormat> error: ${error}`);
			throw new Error(`Failed to parse row: ${error.message}`);
		} finally {
			writer.close();
			// never return anything here, returning in finally means it will swallow any errors if they were caught above
		}

		this.log.info(`Connectors> SIF> events> convertInputDataToSifFormat> out`);
		return transformedDataFilePath

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
			const transformedDataFilePath = await this.convertRawInputDataToSifFormat(rawInputDataStream, pipeline, options);
			// upload the converted data to s3
			await this.uploadTransformedData(transformedInputUploadUrl, transformedDataFilePath);
			// publish a success response back
			await this.connectorEvents.publishResponse({
				executionId: executionId,
				pipelineId: pipeline.id,
				status: 'success',
				statusMessage: `successfully processed input file for pipeline: ${pipeline.id}, execution: ${executionId}`
			});

		} catch (error) {
			this.log.error(`Connectors> SIF> events> process> error: ${JSON.stringify(error)}`);

			// if anything fails, publish an error response back
			await this.connectorEvents.publishResponse({
				executionId: executionId,
				pipelineId: pipeline.id,
				status: 'error',
				statusMessage: error.message
			});
		}

		this.log.info(`csvService> processConnectorIntegrationRequest> in> out`);
	}

	private async downloadRawData(url: string): Promise<NodeJS.ReadableStream> {
		this.log.info(`csvService> downloadRawData> in> url: ${url}`);

		if(!url) {
			throw new Error(`Unable to download raw input data file: url: ${url}`);
		}

		try {
			const response = await axios({
				method: 'GET',
				url,
				responseType: 'stream'
			});
			this.log.info(`csvService> downloadRawData> out>`);
			return response.data
		} catch(e) {
			throw new Error(`Unable to download raw input data file: error${JSON.stringify(e)}`);
		}

	}

	private async uploadTransformedData(url: string, path: string): Promise<void> {
		this.log.info(`csvService> uploadTransformedData> in> url: ${url}`);

		if(!url) {
			throw new Error(`Unable to upload transformed input data file: url: ${url}`);
		}

		try {
			await axios.put(url, fs.readFileSync(path));
		} catch (e) {
			throw new Error(`Unable to upload transformed input data file: error${JSON.stringify(e)}`);
		}

		this.log.info(`csvService> uploadTransformedData> in> url: ${url}`);
	}

	private validateParameters(pipeline: Pipeline, headers: string[]) {
		this.log.info(`csvService> validateParameters> in> pipeline: ${JSON.stringify(pipeline)}, headers:${headers}`);

		const parameterKeys = pipeline?.transformer?.parameters.map((p) => p.key);

		const includesAllParams = parameterKeys.every(p => headers.includes(p));

		// throw an error if they are not equal
		if(!includesAllParams) {
			throw new Error(`csv file headers columns doesnt include all the specified in the pipeline transform parameters. transformParameterKeys: ${parameterKeys}, fileHeaders:${headers}`)
		}

		this.log.info(`csvService> validateParameters> out>`);

	}

	private initializeDefaultOptions(parameters: Record<string, string | number | boolean>): Options {
		this.log.info(`csvService> initializeDefaultOptions> in> parameters: ${parameters}`);

		// if we pass parameters which are undefined, then we need to initialize them as an empty object for the code below to populate the defaults
		if(!parameters) {
			parameters = {}
		}

		// empty options object
		const options:Options = {};

		// let's check if parameters have the delimiter specified as a property if not we will default it to a ','
		options.delimiter = parameters['delimiter']
			? parameters['delimiter'] as string
			: ','

		// check if the 'handleEmptyCells' is specified in parameters if not we default it to 'setToEmptyStrings'
		options.handleEmptyCells = parameters['handleEmptyCells']
			? parameters['handleEmptyCells'] as HandleEmptyCellTypes
			: 'setToEmptyString' as HandleEmptyCellTypes;

		// check if 'skipParsingErrors' is specified in parameters, if not we will default it to not skip parsing errors
		options.skipParsingErrors = parameters['skipParsingErrors']
			? (parameters['skipParsingErrors'] === 'true') as boolean
			: false

		this.log.info(`csvService> initializeDefaultOptions> out> options: ${options}`);

		return options;
	}

}

export interface Options {
	delimiter?: string;
	handleEmptyCells?: HandleEmptyCellTypes
	skipParsingErrors?: boolean
}

export enum HandleEmptyCellTypes {
	// we can expand this in the future to add "undefined" or "NaN" as well
	setToNull='setToNull',
	setToEmptyString='setToEmptyString'
}
