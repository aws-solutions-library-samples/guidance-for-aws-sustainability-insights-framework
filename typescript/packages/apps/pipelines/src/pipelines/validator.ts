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
import type { PipelineCreateParams, PipelineUpdateParams } from './schemas';
import type { TransformerValidator } from '@sif/validators';

export class PipelineValidator {
	public constructor(
		private readonly log:BaseLogger,
		private readonly transformValidator: TransformerValidator
	) {}

	public validatePipeline(pipeline: PipelineCreateParams & PipelineUpdateParams): void {
		this.log.debug(`PipelineValidator > validate> in > pipeline: ${JSON.stringify(pipeline)}`);

		switch(pipeline.type) {
			case 'referenceDatasets':
				this.transformValidator.validateReferenceDatasetsPipelineTransformer(pipeline.transformer);
				break;
			case 'activities':
				this.transformValidator.validateActivitiesPipelineTransformer(pipeline.transformer);
				break;
			case 'data':
				this.transformValidator.validateDataPipelineTransformer(pipeline.transformer)
				break;
			case 'impacts':
				this.transformValidator.validateImpactPipelineTransformer(pipeline.transformer)
				break;
		}
	}
}
