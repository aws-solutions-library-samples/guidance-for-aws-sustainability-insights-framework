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
import type { CreateReferenceDatasetOutput } from './model.js';
import type { PipelineClient, ReferenceDatasetClient } from '@sif/clients';
import type { GetLambdaRequestContext } from '../../plugins/module.awilix.js';
import type { PipelineProcessorsService } from '../../api/executions/service';
import { validateDefined, validateNotEmpty } from '@sif/validators';
import type { ConnectorUtility } from '../../utils/connectorUtility.js';
import { getPipelineOutputKey } from '../../utils/helper.utils.js';

export class ReferenceDatasetVerificationTask {
	constructor(private readonly log: BaseLogger,
				private getLambdaRequestContext: GetLambdaRequestContext,
				private readonly referenceDatasetClient: ReferenceDatasetClient,
				private readonly pipelineProcessorsService: PipelineProcessorsService,
				private readonly pipelineClient: PipelineClient,
				private readonly connectorUtility: ConnectorUtility,
				private readonly dataPrefix: string) {
	}

	public async process(event: CreateReferenceDatasetOutput): Promise<CreateReferenceDatasetOutput> {
		this.log.info(`ReferenceDatasetVerificationTask > process > event : ${JSON.stringify(event)}`);

		validateDefined(event, 'event');

		const { referenceDatasetId, referenceDatasetVersionId, status, securityContext, pipelineId, executionId } = event;

		validateNotEmpty(referenceDatasetId, 'referenceDatasetId');
		validateNotEmpty(referenceDatasetVersionId, 'referenceDatasetVersionId');
		validateNotEmpty(securityContext, 'securityContext');
		validateNotEmpty(pipelineId, 'pipelineId');
		validateNotEmpty(executionId, 'executionId');
		validateNotEmpty(status, 'status');

		const lambdaRequestContext = this.getLambdaRequestContext(securityContext);

		const referenceDataset = await this.referenceDatasetClient.get(referenceDatasetId, referenceDatasetVersionId, lambdaRequestContext, undefined);

		const pipeline = await this.pipelineClient.get(pipelineId, undefined, lambdaRequestContext);
		const execution = await this.pipelineProcessorsService.get(securityContext, executionId);

		let executionStatus = execution.status;
		let executionStatusMessage: string;

		switch (referenceDataset.status) {
			case 'success':
				executionStatus = 'success';
				break;
			case 'failed':
				executionStatusMessage = `failed when creating reference dataset: ${referenceDataset.statusMessage}`;
				executionStatus = 'failed';
				break;
		}

		const outputConnectorEnabled = pipeline.connectorConfig?.output !== undefined;

		if (outputConnectorEnabled && executionStatus === 'success') {
			executionStatus = 'in_progress';
			await this.connectorUtility.publishConnectorOutputIntegrationEvent(securityContext, pipeline, execution, [getPipelineOutputKey(this.dataPrefix, pipelineId, executionId)], pipeline.type);
		}

		await this.pipelineProcessorsService.update(securityContext, pipelineId, executionId,
		  {
			  status: executionStatus,
			  statusMessage: executionStatusMessage
		  });

		const output = {
			...event,
			status: referenceDataset.status,
			referenceDatasetVersionId: referenceDataset.version
		};

		this.log.info(`ReferenceDatasetVerificationTask > process > exit >  output : ${output}`);
		return output;
	}
}
