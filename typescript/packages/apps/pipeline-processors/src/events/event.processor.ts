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
import type { S3ObjectCreatedNotificationEventDetail } from 'aws-lambda';
import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import { CopyObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { SecurityScope } from '@sif/authz';
import { validateNotEmpty } from '@sif/validators';
import type { ConnectorIntegrationResponseEvent } from '@sif/clients';
import type { ConnectorUtility } from '../utils/connectorUtility.js';
import type { PipelineProcessorsService } from '../api/executions/service.js';
import { FileError } from '../common/errors.js';
import { getPipelineInputKey } from '../utils/helper.utils.js';
import type { GetLambdaRequestContext, GetSecurityContext } from '../plugins/module.awilix.js';
import type { PipelineClient } from '@sif/clients';

export class EventProcessor {
	private readonly log: BaseLogger;
	private readonly sfnClient: SFNClient;
	private readonly pipelineProcessorsService: PipelineProcessorsService;
	private readonly getSecurityContext: GetSecurityContext;
	private readonly stateMachineArn: string;
	private readonly connectorUtility: ConnectorUtility;
	private readonly s3Client: S3Client;
	private readonly bucketName: string;
	private readonly bucketPrefix: string;
	private readonly pipelineClient: PipelineClient;
	private readonly getLambdaRequestContext: GetLambdaRequestContext;

	constructor(
		log: BaseLogger,
		sfnClient: SFNClient,
		pipelineProcessorsService: PipelineProcessorsService,
		getSecurityContext: GetSecurityContext,
		connectorUtility: ConnectorUtility,
		s3Client: S3Client,
		stateMachineArn: string,
		bucketName: string,
		bucketPrefix: string,
		pipelineClient: PipelineClient,
		getLambdaRequestContext: GetLambdaRequestContext
	) {
		this.getSecurityContext = getSecurityContext;
		this.log = log;
		this.sfnClient = sfnClient;
		this.pipelineProcessorsService = pipelineProcessorsService;
		this.stateMachineArn = stateMachineArn;
		this.connectorUtility = connectorUtility;
		this.s3Client = s3Client;
		this.bucketName = bucketName;
		this.bucketPrefix = bucketPrefix;
		this.pipelineClient = pipelineClient;
		this.getLambdaRequestContext = getLambdaRequestContext;
	}

	private getPipelineAndExecutionIdFromKey(path: string): [string, string] {
		const keyMinusPrefix = path.replace(`${this.bucketPrefix}/`, '');
		const [pipelineId, _executionPath, executionId, _file] = keyMinusPrefix.split('/');
		return [pipelineId, executionId];
	}

	public async processConnectorIntegrationRequestEvent(event: S3ObjectCreatedNotificationEventDetail): Promise<void> {
		this.log.info(`EventProcessor > integrateConnector > event: ${JSON.stringify(event)}`);

		validateNotEmpty(event, 'event');
		validateNotEmpty(event.bucket, 'bucket');
		validateNotEmpty(event.bucket.name, 'bucketName');
		validateNotEmpty(event.object, 'eventObject');
		validateNotEmpty(event.object.key, 'eventObjectKey');

		// first we parse out the pipelineId and executionId from a S3 key path.
		const [pipelineId, executionId] = this.getPipelineAndExecutionIdFromKey(event.object.key);

		validateNotEmpty(pipelineId, 'pipelineId');
		validateNotEmpty(executionId, 'executionId');

		const securityContext = await this.getSecurityContext(executionId);

		// then, we get the pipeline and execution, we need the pipeline object, execution object and the connector object (execution and connectors happens a further down) to publish the event integration event
		// this will throw an error if the execution is not found
		const execution = await this.pipelineProcessorsService.get(securityContext, pipelineId, executionId);

		//  we check the status of the execution, if it was anything other than 'waiting' we are going to simply ignore this, and log this as en error
		if (execution.status !== 'waiting') {
			// let's log the error,
			const error = new FileError(`a new file: ${event.object.key.split('/').pop()} is uploaded using signed url for pipeline: ${pipelineId}, executionId: ${executionId} with status ${execution.status}`);

			this.log.error(`EventProcessor > integrateConnector > error:${error}`);

			// update the error message on the execution to inform the user that an action has taken place which constituted an error
			await this.pipelineProcessorsService.update(securityContext, pipelineId, executionId, {
				statusMessage: `error: ${error}`
			});
			// can bail out at this point, no need to further process the event
			return;
		}

		// there are several async calls that happen in the code chunk below. The try catch should catch any error and then update the execution with the appropriate error message
		try {

			// there is a possibility the user could re-use the sign url and upload a different file. The check above will short-circuit the event processing, but we still have no way to
			// prevent the original file being altered upon reusing the signed-url. So, to handle this scenario, we archive the original file and use that for processing and prevent the user modifying the original file
			const source = {
				bucket: event.bucket.name,
				key: getPipelineInputKey(this.bucketPrefix, pipelineId, executionId, 'raw')
			};
			const destination = {
				bucket: event.bucket.name,
				key: getPipelineInputKey(this.bucketPrefix, pipelineId, executionId, 'archived')
			};
			// copy the original file to archived
			await this.copyFile(source, destination);

			// we need to get the pipeline as well before we can send the message down to the connector.
			// you ask why we couldn't do this in the connectorUtility ? Well, we could, but this utility is being used in some places where a pipeline check needs to happen before
			// hence, we require the pipeline object to be passed to reduce the number of same queries being made in different parts of the code.

			const pipeline = await this.pipelineClient.get(pipelineId, undefined, this.getLambdaRequestContext({
				// the security context passed in is overridden to be 'reader' for this API call
				...securityContext,
				groupId: execution.groupContextId,
				groupRoles: { [execution.groupContextId]: SecurityScope.reader }
			}));

			// we also need to resolve the connector for the pipeline. Why we also do call this function externally rather than internally from the connector ?
			// same answer, to reduce the number of API calls you can rely on this connector output to execute the logic conditionally or so.
			const connector = await this.connectorUtility.resolveConnectorFromPipeline(securityContext, pipeline);

			// finally, we have all the stuff we need to publish the connector integration event.
			await this.connectorUtility.publishConnectorIntegrationEvent(pipeline, execution, connector);
		} catch (e) {
			await this.pipelineProcessorsService.update(securityContext, pipelineId, executionId, {
				status: 'failed',
				statusMessage: e.message,
			});
		}
	}

	public async processConnectorIntegrationResponseEvent(event: ConnectorIntegrationResponseEvent): Promise<void> {
		this.log.info(`EventProcessor > process > event: ${JSON.stringify(event)}`);

		const securityContext = await this.getSecurityContext(event.executionId);

		try {
			validateNotEmpty(event, 'event');
			validateNotEmpty(event.status, 'eventStatus');
			validateNotEmpty(event.pipelineId, 'eventPipelineId');
			validateNotEmpty(event.executionId, 'eventExecutionId');


			// if the connector response contains an error state, then we need to update the execution as failed
			if (event.status === 'error') {
				// if the status of the event is error then we throw that error, this will get caught by the try/catch and execution will be updated as a failure with its error status message
				throw new Error(event.statusMessage);
			}
			// Trigger State Machine
			const command = await this.sfnClient.send(
				new StartExecutionCommand({
					stateMachineArn: this.stateMachineArn,
					input: JSON.stringify({
						source: {
							bucket: this.bucketName,
							key: getPipelineInputKey(this.bucketPrefix, event.pipelineId, event.executionId, 'transformed'),
						},
						pipelineId: event.pipelineId as string,
						executionId: event.executionId as string,
					}),
				})
			);
			const executionArn = command.executionArn;

			// once we trigger the step function, we also need to update the state of the execution to in_progress
			await this.pipelineProcessorsService.update(securityContext, event.pipelineId, event.executionId, {
				status: 'in_progress',
				executionArn,
			});

		} catch (e) {
			// if anything bombs, we catch and update the execution :)
			await this.pipelineProcessorsService.update(securityContext, event.pipelineId, event.executionId, {
				status: 'failed',
				statusMessage: `error: ${e.message}`,
			});
		}

		this.log.info(`EventProcessor > process > exit:`);

	}

	private async copyFile(source: S3Location, destination: S3Location): Promise<void> {
		this.log.debug(`EventProcessor > copyFile > in: source:${JSON.stringify(source)},destination:${JSON.stringify(destination)}`);

		validateNotEmpty(source, 'source');
		validateNotEmpty(destination, 'destination');

		await this.s3Client.send(
			new CopyObjectCommand({
				CopySource: `${source.bucket}/${source.key}`,
				Bucket: destination.bucket,
				Key: destination.key,
			})
		);

		this.log.debug(`EventProcessor > copyFile > out>`);
	}
}

interface S3Location {
	bucket: string,
	key: string
}
