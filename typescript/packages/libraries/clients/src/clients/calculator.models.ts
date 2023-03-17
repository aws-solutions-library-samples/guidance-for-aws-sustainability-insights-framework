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

import type { Parameter, Transform } from './pipeline.models.js';

export class CalculatorDryRunError extends Error {
	public constructor(message: string) {
		super(message);
		this.name = 'CalculatorDryRunError';
	}
}

export interface S3Location {
	bucket: string;
	key: string;
}

export interface S3SourceLocation extends S3Location {
	containsHeader: boolean;
	startByte: number;
	endByte: number;
}

export type ActionType = 'create' | 'delete'

export interface CalculatorRequest {
	groupContextId: string;
	pipelineId: string;
	executionId: string;
	username: string;
	parameters: Parameter[];
	transforms: Transform[];
	actionType: ActionType;
	csvHeader: string;

	/**
	 * the combination of field names that represent the unique columns of a row. Used
	 * for uploading audit reports. If no uniqueness is available then audit reports for
	 * the same uniqueKey reference will be uploaded together as the same s3 key. If no
	 * value is provided then the first column is assumed to be the key.
	 */
	uniqueKey?: string[];

	/**
	 * optional - only required if chunking from S3
	 */
	chunkNo?: number;

	/**
	 * required only for s3 processing
	 */
	csvSourceDataLocation?: S3SourceLocation;

	/**
	 * required only for inline processing
	 */
	csvSourceData?: string[];

	/**
	 * when in dry run mode, no audit should be published
	 */
	dryRun?: boolean;
}

export interface CalculatorBaseTransformResponse {
	auditLogLocation: S3Location;
}

export interface CalculatorInlineTransformResponse extends CalculatorBaseTransformResponse {
	headers: string[];
	data: string[];
	errors?: string[];
}

export const isCalculatorInlineTransformResponse = (obj: unknown): obj is CalculatorInlineTransformResponse => {
	return (obj as CalculatorInlineTransformResponse).headers !== undefined;
};

export interface CalculatorS3TransformResponse extends CalculatorBaseTransformResponse {
	errorLocation: S3Location;
}

export const isCalculatorS3TransformResponse = (obj: unknown): obj is CalculatorS3TransformResponse => {
	return (obj as CalculatorS3TransformResponse).errorLocation !== undefined;
};
