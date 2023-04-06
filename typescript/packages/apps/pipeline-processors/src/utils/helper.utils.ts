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
import type { AggregateType, PipelineMetadata } from '../api/activities/models';

export async function streamToString(stream: Readable): Promise<string> {
	return await new Promise((resolve, reject) => {
		const chunks: Uint8Array[] = [];
		stream.on('data', (chunk) => chunks.push(chunk));
		stream.on('error', reject);
		stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
	});
}

export const INPUT_DATA_FILENAME = 'input';

export function getPipelineInputKey(bucketPrefix: string, pipelineId: string, pipelineExecutionId: string, type: 'raw' | 'transformed' | 'archived'): string {
	return `${bucketPrefix}/${pipelineId}/executions/${pipelineExecutionId}/input/${type}`;
}

export const ERROR_DATA_FILENAME = 'errors.txt';

export function getPipelineErrorKey(bucketPrefix: string, pipelineId: string, pipelineExecutionId: string): string {
	return `${bucketPrefix}/${pipelineId}/executions/${pipelineExecutionId}/${ERROR_DATA_FILENAME}`;
}

export const AUDIT_FOLDER = 'audit/';

export function getPipelineAuditKey(bucketPrefix: string, pipelineId: string, pipelineExecutionId: string): string {
	return `${bucketPrefix}/${pipelineId}/executions/${pipelineExecutionId}/${AUDIT_FOLDER}`;
}

export function getPipelineMetadata(pipeline: Pipeline): PipelineMetadata {
	// let's get all the outputs for all transforms
	const outputTypes = [];
	let transformKeyMap = {};
	const outputKeys = [];

	// iterate over the keys in the _aggregatedOutputKeyAndTypeMap and populate the outputTypes and outputKeys arrays
	Object.keys(pipeline._aggregatedOutputKeyAndTypeMap).forEach((key) => {
		outputKeys.push(key);
		if (!outputTypes.includes(pipeline._aggregatedOutputKeyAndTypeMap[key])) outputTypes.push(pipeline._aggregatedOutputKeyAndTypeMap[key]);
	});

	let aggregate;

	//iterate over the pipeline transform outputs to populate the transformKeyMap
	pipeline.transformer.transforms.forEach((t) => {
		t.outputs.forEach((o) => {
			if (o.includeAsUnique) transformKeyMap[o.key] = o._keyMapping;
			// if the output contains an aggregate field
			if (o.aggregate) {
				if (aggregate === undefined) {
					aggregate = {
						fields: []
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
		outputKeys,
		transformKeyMap,
		aggregate
	};

	return metadata;
}

