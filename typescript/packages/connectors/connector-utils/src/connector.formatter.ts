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

import * as fs from 'fs';
import os from 'os';
import path from 'path';
import { parse, transform } from 'csv';
import { pipeline } from 'stream/promises';
import { ulid } from 'ulid';
import type { Parameter } from '@sif/clients';

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

const newlineDelimiter = '\r\n';

export function validateParameters(parameters: Parameter[], headers: string[]) {
	const parameterKeys = parameters.map((p) => p.label ?? p.key);
	const includesAllParams = parameterKeys.every(p => headers.includes(p));
	// throw an error if they are not equal
	if (!includesAllParams) {
		throw new Error(`csv file headers columns doesnt include all the specified in the pipeline transform parameters. transformParameterKeys: ${parameterKeys}, fileHeaders:${headers}`);
	}
}

export async function saveCsvReadableStream(rawData: NodeJS.ReadableStream): Promise<string> {
	const transformedDataFilePath = os.tmpdir() + path.sep + `${ulid().toLowerCase()}`;
	const writer = fs.createWriteStream(transformedDataFilePath);

	try {
		await pipeline(rawData, writer);
	} catch (error) {
		throw new Error(`Failed to parse row: ${error.message}`);
	} finally {
		writer.close();
		// never return anything here, returning in finally means it will swallow any errors if they were caught above
	}
	return transformedDataFilePath;
}

export async function convertCsvReadableStreamToSifFormat(rawData: NodeJS.ReadableStream, parameters: Parameter[], options: Options): Promise<string> {
	const parser = parse({ delimiter: options.delimiter, skipRecordsWithError: options.skipParsingErrors });
	const labelToKeyMap = parameters.reduce((a, b) => {
		/**
		 * Provide mapping from label to key if specified, if label is not specified we will use the key.
		 */
		a[b.label ?? b.key] = b.key;
		return a;
	}, {});

	let headers: string[];
	const transformToObject = transform((row) => {
		// first iteration of the transform will set the headers of the csv
		if (!headers) {
			headers = row.map(r => r.trim());
			// let's do some validation here based on the transform parameters specified and see if the headers of csv contains the transform parameters
			validateParameters(parameters, headers);
		} else {
			// if the headers don't match the row contents we will throw an error
			if (headers.length !== row.length) {
				throw new Error(`Failed to parse row: ${JSON.stringify(row)} headers=${headers.length}, row=${row.length} row values mismatch`);
			}

			const obj = {};
			headers.forEach((header, index) => {
				/**
				 * Map the file header to SIF format key and only include column that are included in the parameters
				 */
				const key = labelToKeyMap[header];
				if (key) {
					obj[key] = row[index];
					// we will override the value the property if its empty, if not we will leave it as is
					if (row[index] == '') {
						switch (options.handleEmptyCells) {
							// we will set the property to empty string if the value in the csv is empty string
							case 'setToEmptyString': {
								obj[key] = '';
								break;
							}
							// we will set the property to null if the value in csv is empty
							case 'setToNull': {
								obj[key] = null;
								break;
							}
						}
					}
				}
			});
			return `${JSON.stringify(obj)}${newlineDelimiter}`;
		}
		return null;
	});

	const transformedDataFilePath = os.tmpdir() + path.sep + `${ulid().toLowerCase()}`;
	const writer = fs.createWriteStream(transformedDataFilePath);

	try {
		await pipeline(rawData, parser, transformToObject, writer);
	} catch (error) {
		throw new Error(`Failed to parse row: ${error.message}`);
	} finally {
		writer.close();
		// never return anything here, returning in finally means it will swallow any errors if they were caught above
	}
	return transformedDataFilePath;
}
