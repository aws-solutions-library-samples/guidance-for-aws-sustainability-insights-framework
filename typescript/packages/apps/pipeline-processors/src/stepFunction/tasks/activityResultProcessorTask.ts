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

import type { S3Client } from '@aws-sdk/client-s3';
import { CopyObjectCommand } from '@aws-sdk/client-s3';
import { DescribeExecutionCommand, SFNClient } from '@aws-sdk/client-sfn';
import type { BaseLogger } from 'pino';
import type { ProcessedTaskEvent, ProcessedTaskEventWithExecutionDetails, VerificationTaskEvent } from './model.js';
import { validateNotEmpty } from '@sif/validators';
import type { PipelineClient } from '@sif/clients';
import type { GetLambdaRequestContext } from '../../plugins/module.awilix.js';
import { SecurityScope } from '@sif/authz';
import type { CalculatorResultUtil } from '../../utils/calculatorResult.util.js';
import type { PipelineExecution, Status } from '../../api/executions/schemas.js';
import type { PipelineProcessorsRepository } from '../../api/executions/repository.js';
import type { EventPublisher } from '@sif/events';
import type { ConnectorUtility } from '../../utils/connectorUtility.js';
import type { CloudWatchMetricService } from '../services/cloudWatchMetric.service.js';
import type { ResourceTagsService } from '../services/resourceTags.service.js';

export class ActivityResultProcessorTask {
	constructor(private readonly log: BaseLogger,
				private readonly s3Client: S3Client,
				private readonly sfnClient: SFNClient,
				private readonly cloudWatchService: CloudWatchMetricService,
				private readonly pipelineClient: PipelineClient,
				private readonly getLambdaRequestContext: GetLambdaRequestContext,
				private readonly calculatorResultUtil: CalculatorResultUtil,
				private readonly pipelineProcessorsRepository: PipelineProcessorsRepository,
				private readonly eventPublisher: EventPublisher,
				private readonly resourceTagsService: ResourceTagsService,
				private readonly connectorUtility: ConnectorUtility) {
	}

	public async process(event: ProcessedTaskEventWithExecutionDetails): Promise<void> {
		this.log.info(`ActivityResultProcessorTask > process > event: ${JSON.stringify(event)}`);

		validateNotEmpty(event, 'event');
		validateNotEmpty(event.input?.executionId, 'executionId');
		validateNotEmpty(event.input?.pipelineId, 'pipelineId');

		const { executionId, pipelineId } = event.input;

		const lambdaRequestContext = this.getLambdaRequestContext({
			...event.input.security,
			groupId: event.input.security.groupId,
			groupRoles: { [event.input.security.groupId]: SecurityScope.reader }
		});
		const pipeline = await this.pipelineClient.get(pipelineId, undefined, lambdaRequestContext);

		const outputConnectorEnabled = pipeline.connectorConfig?.output !== undefined;

		const [existingExecution, updatedExecution] = await this.getUpdateExecutionPayload(event.input, outputConnectorEnabled);

		const taskFutures = [];
		if (event.executionArn && event.executionStartTime) {
			if (updatedExecution.status === 'failed') {
				taskFutures.push(this.archiveExecutionInputData(event.executionArn));
			}
			taskFutures.push(this.cloudWatchService.publish(pipeline, event.executionArn, executionId));
		}

		taskFutures.push(this.pipelineProcessorsRepository.create(updatedExecution));
		taskFutures.push(this.eventPublisher.publishTenantEvent<PipelineExecution>({
			resourceType: 'pipelineExecution',
			eventType: 'updated',
			id: existingExecution.id,
			new: updatedExecution,
			old: existingExecution
		}));

		await Promise.all(taskFutures);

		if (pipeline.connectorConfig?.output) {
			const calculatorOutputLocations = await this.calculatorResultUtil.getCalculatorOutputLocations(pipeline.id, executionId);
			await this.connectorUtility.publishConnectorOutputIntegrationEvent(event.input.security, pipeline, updatedExecution, calculatorOutputLocations, pipeline.type);
		}

		this.log.info(`ActivityResultProcessorTask > process > exit >`);
	}

	private async getUpdateExecutionPayload(params: Pick<ProcessedTaskEvent, 'pipelineId' | 'referenceDatasets' | 'activities' | 'executionId' | 'errorLocationList' | 'security' | 'status'>, outputConnectorEnabled: boolean): Promise<[PipelineExecution, PipelineExecution]> {
		this.log.trace(`ActivityResultProcessorTask > getUpdateExecutionPayload > in > params: ${params}, outputConnectorEnabled: ${outputConnectorEnabled}`);

		const {
			pipelineId,
			executionId,
			errorLocationList,
			status,
			security,
			referenceDatasets,
			activities
		} = params;

		await this.calculatorResultUtil.concatenateS3Error(pipelineId, executionId, errorLocationList);

		let taskStatus: Status = outputConnectorEnabled ? 'in_progress' : 'success';
		const errors = [];

		if (errorLocationList.length > 0) {
			errors.push('error when performing calculation, review the pipeline execution error log for further info');
			taskStatus = 'failed';
		}

		if (status === 'FAILED') {
			errors.push('error when inserting activities to database');
			taskStatus = 'failed';
		}

		// update the pipeline execution status
		const execution = await this.pipelineProcessorsRepository.get(executionId);

		const dependentResourcesTags = await this.resourceTagsService.assembleDependentResourcesTags({ referenceDatasets, activities, pipelineExecution: execution });

		const updatedExecution: PipelineExecution = {
			...execution,
			status: taskStatus, statusMessage: errors.length === 0 ? undefined : errors.join('\n'),
			updatedBy: security?.email,
			updatedAt: new Date(Date.now()).toISOString(),
			tags: {
				...execution.tags,
				...dependentResourcesTags
			}
		};

		this.log.trace(`ActivityResultProcessorTask > getUpdateExecutionPayload > exit >`);

		return [execution, updatedExecution];
	}

	private async archiveExecutionInputData(executionArn: string): Promise<void> {
		this.log.trace(`ActivityResultProcessorTask > archiveExecutionInputData > in > executionArn: ${executionArn}`);
		const stateMachineExecution = await this.sfnClient.send(new DescribeExecutionCommand({ executionArn }));
		const stateMachineInput = JSON.parse(stateMachineExecution.input) as VerificationTaskEvent;
		if (stateMachineInput.source) {
			const { key, bucket } = stateMachineInput.source;
			await this.s3Client.send(new CopyObjectCommand({ Bucket: bucket, CopySource: `${bucket}/${key}`, Key: key.replace('/input/', '/deliveryFailures/postTransformed/') }));
		}
		this.log.trace(`ActivityResultProcessorTask > archiveExecutionInputData > in > exit:`);
	}


}
