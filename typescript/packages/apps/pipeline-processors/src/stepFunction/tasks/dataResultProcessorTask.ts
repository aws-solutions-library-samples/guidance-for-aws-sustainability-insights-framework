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


import type { S3Location } from './model.js';
import type { BaseLogger } from 'pino';
import { validateDefined, validateNotEmpty } from '@sif/validators';
import type { CalculatorResultUtil } from '../../utils/calculatorResult.util.js';
import type { SecurityContext } from '@sif/authz';

export class DataResultProcessorTask {
	constructor(private log: BaseLogger, private calculatorUtil: CalculatorResultUtil) {
	}

	public async process(event: {
		security: SecurityContext,
		pipelineId: string,
		executionId: string,
		errorLocationList: S3Location[],
		sequenceList: number[],
		pipelineType: string,
	}): Promise<void> {

		this.log.debug(`DataResultProcessorTask > process > event: ${JSON.stringify(event)}`);
		validateNotEmpty(event, 'event');
		validateDefined(event.errorLocationList, 'event.errorLocationList');
		validateDefined(event.sequenceList, 'event.sequenceList');

		const { pipelineId, executionId, sequenceList } = event;

		validateNotEmpty(executionId, 'executionId');
		validateNotEmpty(pipelineId, 'pipelineId');

		await this.calculatorUtil.concatenateS3Error(pipelineId, executionId, event.errorLocationList);
		await this.calculatorUtil.concatenateS3Result(pipelineId, executionId, sequenceList);
	}
}
