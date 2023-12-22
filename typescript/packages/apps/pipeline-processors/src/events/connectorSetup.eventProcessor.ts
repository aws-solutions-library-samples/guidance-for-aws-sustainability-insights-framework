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
import type { CloudFormationCustomResourceSuccessResponse } from 'aws-lambda';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { SecurityScope } from '@sif/authz';
import { validateNotEmpty } from '@sif/validators';
import type { ConnectorSetupRequestEvent } from '@sif/clients';
import type { GetLambdaRequestContext, GetSignedUrl } from '../plugins/module.awilix.js';
import type { PipelineClient } from '@sif/clients';
import { CreateStackCommand, type CloudFormationClient, DeleteStackCommand, UpdateStackCommand, CreateStackCommandInput, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';

export class ConnectorSetupEventProcessor {
	constructor(
		private log: BaseLogger,
		private s3Client: S3Client,
		private cloudFormationClient: CloudFormationClient,
		private pipelineClient: PipelineClient,
		private getLambdaRequestContext: GetLambdaRequestContext,
		private env: string,
		private tenantId: string,
		private getSignedUrl: GetSignedUrl,
		private templateBucket: string,
		private templateKey: string
	) {
	}


	/*
	* Will process incoming pipeline events that have a deployment method of lambda
	* And deploy the cloudformation infrastructure that has been uploaded for them on S3
	*/
	public async processConnectorSetupRequestEvent(event: ConnectorSetupRequestEvent): Promise<void> {
		this.log.info(`EventProcessor > processConnectorSetupRequestEvent > event: ${JSON.stringify(event)}`);

		try {
			validateNotEmpty(event, 'event');
			validateNotEmpty(event.connector, 'eventConnector');
			validateNotEmpty(event.pipelineId, 'eventPipelineId');
			validateNotEmpty(event.connector.name, 'eventConnectorName');
			validateNotEmpty(event.type, 'eventType');
			validateNotEmpty(event.connector.parameters, 'eventConnectorParameters');
			validateNotEmpty(event.connector.parameters?.['deploymentMethod'], 'eventConnectorDeploymentMethod');
			// Only connectors with a lambda deployment method can be deployed here
			if (event.connector.parameters?.['deploymentMethod'] === 'managed-pipeline') {
				if (['create', 'update'].includes(event.type)) {

					// Get signed url of the template
					const s3Params: PutObjectCommand = new PutObjectCommand({
						Bucket: this.templateBucket,
						Key: this.templateKey,
					});
					const templateUrl = await this.getSignedUrl(this.s3Client, s3Params);

					// Set the stack parameters
					let params: CreateStackCommandInput;
					switch (event.connector.name) {
						case 'sif-kinesis-pipeline-input-connector':
							params = this.getKinesisConnectorParams(event, templateUrl);
							break;
					}

					this.log.info(`EventProcessor > processConnectorSetupRequestEvent >params: ${JSON.stringify(params)}`);

					if (event.type === 'create') {
						await this.cloudFormationClient.send(new CreateStackCommand(params));
					} else {
						await this.cloudFormationClient.send(new UpdateStackCommand(params));
					}
				} else if (event.type === 'delete') {
					const params = {
						StackName: `sif-${this.tenantId}-${this.env}-kinesis-${event.pipelineId}`
					};
					await this.cloudFormationClient.send(new DeleteStackCommand(params));
				}
			}

		} catch (e) {
			this.log.error(`EventProcessor > processConnectorSetupRequestEvent >Failed ${(e as Error).message}`);
		}

		this.log.info(`EventProcessor > processConnectorSetupRequestEvent > exit:`);

	}


	/*
	* Will process incoming pipeline setup response events that have a deployment method of lambda
	*/
	public async processConnectorSetupResponseEvent(event: CloudFormationCustomResourceSuccessResponse): Promise<void> {
		this.log.info(`EventProcessor > processConnectorSetupResponseEvent > event: ${JSON.stringify(event)}`);

		try {
			validateNotEmpty(event, 'event');
			validateNotEmpty(event?.['stack-id'], 'eventStackId');
			validateNotEmpty(event?.['status-details'], 'eventStatusDetails');
			validateNotEmpty(event?.['status-details']?.['status'], 'eventStatus');

			const stackName = event?.['stack-id'].split('/')[1];

			const stackDescription = await this.cloudFormationClient.send(new DescribeStacksCommand({
				StackName: stackName
			}));

			const parameters = stackDescription.Stacks[0].Parameters;
			const outputs = stackDescription.Stacks[0].Outputs;
			const pipelineId = parameters.find((param) => param.ParameterKey === 'pipelineId')['ParameterValue'];
			const groupId = parameters.find((param) => param.ParameterKey === 'group')['ParameterValue'];
			const connectorConfig = JSON.parse(parameters.find((param) => param.ParameterKey === 'connectorConfig')['ParameterValue']);
			const kinesisDataStreamArn = outputs.find((output) => output.OutputKey === 'KinesisDataStreamArn')['OutputValue'];

			// Set securityContext from the cloudformation parameters
			const securityContext = {
				email: 'sif-pipeline-execution',
				groupId: `${groupId}`,
				groupRoles: { [`${groupId}`]: SecurityScope.contributor },
			};

			//Update the connector setting

			connectorConfig['parameters']['deploymentStatus'] = 'deployed';
			// We will set the flag blockDeploymentForUpdates to true to prevent accidental redeployment of the connector on updates
			connectorConfig['parameters']['blockDeploymentForUpdates'] = true;
			connectorConfig['parameters']['kinesisDataStreamArn'] = kinesisDataStreamArn;


			if (event?.['status-details']?.['status'] === 'CREATE_COMPLETE') {
				await this.pipelineClient.update(pipelineId, {
						state: 'enabled',
						connectorConfig: {
							input: [connectorConfig]
						}
					},
					this.getLambdaRequestContext({
						// the security context passed in is overridden to be 'contributor' for this API call
						...securityContext,
						groupId,
						groupRoles: { [groupId]: SecurityScope.contributor }
					}));
			}
		} catch (e) {
			this.log.error(`EventProcessor > processConnectorSetupResponseEvent >Failed ${(e as Error).message}`);
		}

		this.log.info(`EventProcessor > processConnectorSetupResponseEvent > exit:`);
	}

	private getKinesisConnectorParams(event: ConnectorSetupRequestEvent, templateUrl: string): CreateStackCommandInput {
		const connectorParams = event.connector.parameters;
		const params = {
			StackName: `sif-${this.tenantId}-${this.env}-kinesis-${event.pipelineId}`,
			TemplateURL: templateUrl,
			Parameters: [
				{ ParameterKey: 'handlebarsTemplate', ParameterValue: connectorParams?.['handlebarsTemplate'] ?? '' },
				{ ParameterKey: 'environment', ParameterValue: this.env },
				{ ParameterKey: 'tenantId', ParameterValue: this.tenantId },
				{ ParameterKey: 'pipelineId', ParameterValue: event.pipelineId },
				{ ParameterKey: 'group', ParameterValue: event.group },
				{ ParameterKey: 'connectorConfig', ParameterValue: `${JSON.stringify(event.connector)}` },
				{ ParameterKey: 'useExistingKinesisDataStream', ParameterValue: (connectorParams?.['useExistingDataStream']) ? connectorParams?.['useExistingDataStream'] : 'false' },
				{ ParameterKey: 'kinesisDataStreamArn', ParameterValue: (connectorParams?.['kinesisDataStreamArn']) ? connectorParams?.['kinesisDataStreamArn'] : 'N/A' },
				{ ParameterKey: 'lambdaBufferSize', ParameterValue: (connectorParams?.['bufferSize']) ? connectorParams?.['bufferSize'] : 0.2 },
				{ ParameterKey: 'lambdaBufferInterval', ParameterValue: (connectorParams?.['bufferInterval']) ? connectorParams?.['bufferInterval'] : 60 },
				{ ParameterKey: 'eventBusNameParameter', ParameterValue: `/sif/${this.tenantId}/${this.env}/shared/eventBusName` },
				{ ParameterKey: 'eventBusArnParameter', ParameterValue: `/sif/${this.tenantId}/${this.env}/shared/eventBusArn` },
				{ ParameterKey: 'bucketNameParameter', ParameterValue: `/sif/${this.tenantId}/${this.env}/shared/bucketName` },
				{ ParameterKey: 'customResourceProviderTokenParameter', ParameterValue: `/sif/${this.tenantId}/${this.env}/shared/customResourceProviderToken` },
				{ ParameterKey: 'kmsKeyArnParameter', ParameterValue: `/sif/${this.tenantId}/${this.env}/shared/kmsKeyArn` },
				{ ParameterKey: 'pipelinesApiFunctionNameParameter', ParameterValue: `/sif/${this.tenantId}/${this.env}/pipelines/apiFunctionName` },
				{ ParameterKey: 'pipelineProcessorApiFunctionNameParameter', ParameterValue: `/sif/${this.tenantId}/${this.env}/pipeline-processor/apiFunctionNameV2` },
				{ ParameterKey: 'assetBucketParameter', ParameterValue: `/sif/${this.tenantId}/${this.env}/connectors/kinesis/application/bucket` },
				{ ParameterKey: 'assetKeyParameter', ParameterValue: `/sif/${this.tenantId}/${this.env}/connectors/kinesis/application/key` }
			],
			Capabilities: ['CAPABILITY_IAM']
		};
		return params;
	}
}
