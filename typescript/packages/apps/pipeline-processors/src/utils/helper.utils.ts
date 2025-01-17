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

import type { Readable } from 'stream';
import type { Pipeline } from '@sif/clients';
import type { Aggregate, AggregateType, PipelineMetadata } from '../api/activities/models.js';
import dayjs from 'dayjs';

export async function streamToString(stream: Readable): Promise<string> {
	return await new Promise((resolve, reject) => {
		const chunks: Uint8Array[] = [];
		stream.on('data', (chunk) => chunks.push(chunk));
		stream.on('error', reject);
		stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
	});
}

export const INPUT_DATA_FILENAME = 'input';

export function getQueriesDownloadStatusKey(bucketPrefix: string, queryId: string): string {
	return `${bucketPrefix}/${queryId}/status.json`;
}

export function getQueriesDownloadFileKey(bucketPrefix: string, queryId: string): string {
	return `${bucketPrefix}/${queryId}/result.csv`;
}

export function getPipelineExecutionCalculatorOutputMetadata(bucketPrefix: string, pipelineId: string, executionId: string): string {
	return `${bucketPrefix}/${pipelineId}/executions/${executionId}/calculatorOutputMetadata.json`;
}

export function getPipelineInputKey(bucketPrefix: string, pipelineId: string, executionId: string, type: string): string {
	return `${bucketPrefix}/${pipelineId}/executions/${executionId}/input/${type}`;
}

export function getPipelineOutputKey(bucketPrefix: string, pipelineId: string, executionId: string): string {
	return `${bucketPrefix}/${pipelineId}/executions/${executionId}/output/result.csv`;
}

export function getPipelineImpactCreationOutputKey(bucketPrefix: string, pipelineId: string, executionId: string): string {
	return `${bucketPrefix}/${pipelineId}/executions/${executionId}/output/pendingTask.csv`;
}

export function getTaskExecutionResultKey(bucketPrefix: string, pipelineId: string, executionId: string, sequence: number): string {
	return `${bucketPrefix}/${pipelineId}/executions/${executionId}/output/${sequence}.csv`;
}

export const ERROR_DATA_FILENAME = 'errors.txt';

export function getPipelineErrorKey(bucketPrefix: string, pipelineId: string, executionId: string): string {
	return `${bucketPrefix}/${pipelineId}/executions/${executionId}/${ERROR_DATA_FILENAME}`;
}

export const AUDIT_FOLDER = 'audit/';

export function getPipelineAuditKey(bucketPrefix: string, pipelineId: string, executionId: string): string {
	return `${bucketPrefix}/${pipelineId}/executions/${executionId}/${AUDIT_FOLDER}`;
}

export function getPipelineMetadata(pipeline: Pipeline): PipelineMetadata {
	// let's get all the outputs for all transforms
	const outputTypes = [];
	let transformKeyMap = {};

	const outputKeysAndTypes: Record<string, string> = Object.assign({}, pipeline._aggregatedOutputKeyAndTypeMap);

	// iterate over the keys in the _aggregatedOutputKeyAndTypeMap and populate the outputTypes and outputKeys arrays
	Object.keys(pipeline._aggregatedOutputKeyAndTypeMap).forEach((key) => {
		if (!outputTypes.includes(pipeline._aggregatedOutputKeyAndTypeMap[key])) outputTypes.push(pipeline._aggregatedOutputKeyAndTypeMap[key]);
	});

	let aggregate: {
		fields: Aggregate[],
		timestampField: string
	};

	//iterate over the pipeline transform outputs to populate the transformKeyMap
	pipeline.transformer.transforms.forEach((t) => {
		t.outputs.forEach((o) => {
			if (o.includeAsUnique) transformKeyMap[o.key] = o._keyMapping;
			// if the output contains an aggregate field
			if (o.aggregate) {
				if (aggregate === undefined) {
					aggregate = {
						fields: [],
						timestampField: undefined
					};
				}
				// collate all the keys that has aggregate field defined
				aggregate.fields.push({ key: o.key, aggregate: o.aggregate as AggregateType, type: o.type });
				// mark which key that is used as timestamp, this key will be used as the date on the aggregated activity
				if (o.type === 'timestamp') {
					aggregate.timestampField = o.key;
				}
			}
		});
	});

	const metadata: PipelineMetadata = {
		outputTypes,
		outputKeysAndTypes,
		transformKeyMap,
		aggregate,
		updatedAt: pipeline.updatedAt ?? pipeline.createdAt
	};

	return metadata;
}

export const validateDates = (date: string, dateTo: string, dateFrom: string) => {
	let isValid = true;

	if (date) isValid = dayjs(date).isValid();
	if (dateFrom) isValid = dayjs(dateFrom).isValid();
	if (dateTo) isValid = dayjs(dateTo).isValid();

	if (!isValid) {
		throw new Error('Invalid Date specified double check if the date/time is in ISO8601 local time');
	}
};

export const expandAttributes = (attrString: string) => {
	const expandedAttributes: Record<string, string> = {};
	if ((attrString?.length ?? 0) > 0) {
		attrString.split(',').forEach((a) => {
			const kv = a.split(':');
			const k = decodeURIComponent(kv[0] as string);
			const v = decodeURIComponent(kv[1] as string);
			expandedAttributes[k] = v;
		});
	}
	return expandedAttributes;
};

export const HOUR_IN_SECONDS = 60 * 60;
