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

import type { FastifyBaseLogger } from 'fastify';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { EventBridgeEventBuilder, EventPublisher, outputConnectorRequest, PIPELINE_PROCESSOR_CONNECTOR_REQUEST_EVENT, PIPELINE_PROCESSOR_EVENT_SOURCE } from '@sif/events';
import type { Connector, ConnectorClient, ConnectorIntegrationRequestEvent, ConnectorOutputIntegrationRequestEvent, DataAsset, LambdaRequestContext, OutputConnectorAssetType, Pipeline } from '@sif/clients';
import { InvalidRequestError, NotFoundError } from '@sif/resource-api-base';
import { convertGroupRolesToCognitoGroups, SecurityContext } from '@sif/authz';
import { validateNotEmpty } from '@sif/validators';
import type { PipelineExecution } from '../api/executions/schemas';
import type { GetSignedUrl } from '../plugins/module.awilix.js';
import { getPipelineInputKey } from './helper.utils.js';


export class ConnectorUtility {
	private readonly log: FastifyBaseLogger;
	private readonly s3Client: S3Client;
	private readonly eventPublisher: EventPublisher;
	private readonly connectorClient: ConnectorClient;
	private readonly bucketName: string;
	private readonly bucketPrefix: string;
	private readonly eventBusName: string;
	private readonly csvConnectorName: string;
	private readonly getSignedUrl: GetSignedUrl;

	public constructor(
		log: FastifyBaseLogger,
		s3Client: S3Client,
		getSignedUrl: GetSignedUrl,
		eventPublisher: EventPublisher,
		connectorClient: ConnectorClient,
		bucketName: string,
		bucketPrefix: string,
		eventbusName: string,
		csvConnectorName: string,
	) {
		this.csvConnectorName = csvConnectorName;
		this.connectorClient = connectorClient;
		this.log = log;
		this.s3Client = s3Client;
		this.eventPublisher = eventPublisher;
		this.getSignedUrl = getSignedUrl;
		this.bucketName = bucketName;
		this.bucketPrefix = bucketPrefix;
		this.eventBusName = eventbusName;
	}

	// This function complies or merges parameters which are defined for configured/overrided for the connector.

	public validateConnectorParameters(connector: Connector, pipeline: Pipeline, execution: PipelineExecution) {
		this.log.debug(`ConnectorUtility>validateConnectorParameters in> pipeline ${JSON.stringify(pipeline)}, execution:${execution}, connector: ${connector}`);
		validateNotEmpty(connector, 'connector');
		validateNotEmpty(pipeline, 'pipeline');
		validateNotEmpty(execution, 'execution');
		// check if there are required parameters specified
		if (connector.parameters) {
			const requiredParameters = connector.parameters.filter(p => p.required === true).map(p => p.name);
			// for us to validate, first we have to compile the parameters
			const parameters = this.compileConnectorParameters(connector, pipeline, execution);
			// if there are lets extract the keys for all parameters
			const parameterKeys = Object.keys(parameters);
			const isEqual = requiredParameters.every(p => parameterKeys.includes(p));

			// throw an error if they are not equal
			if (!isEqual) {
				throw new InvalidRequestError(`Connector configured on the pipeline has required parameters requirement which has not been satisfied: requiredParameterKeys: ${JSON.stringify(requiredParameters)}, compiledParameterKeys:${JSON.stringify(parameterKeys)}`);
			}
		}
	}

	public async publishConnectorOutputIntegrationEvent(security: SecurityContext,
														pipeline: Pipeline,
														execution: PipelineExecution | undefined,
														s3ObjectKeys: string[],
														assetType: OutputConnectorAssetType): Promise<void> {

		this.log.debug(`ConnectorUtility > publishConnectorOutputIntegrationEvent > in> pipeline ${JSON.stringify(pipeline)}, execution:${execution}, s3ObjectKeys: ${s3ObjectKeys}, assetType: ${assetType} `);

		validateNotEmpty(pipeline, 'pipeline');
		validateNotEmpty(s3ObjectKeys, 's3ObjectKeys');
		validateNotEmpty(assetType, 'assetType');
		validateNotEmpty(security, 'security');

		const outputConnector = await this.resolveConnectorFromPipeline(security, pipeline, 'output');
		const inputConnector = await this.resolveConnectorFromPipeline(security, pipeline, 'input');

		const inputDataAssets: DataAsset[] = [];
		for (const [tagKey, tagValue] of Object.entries(execution.tags ?? {})) {
			// We only track if the source of the data comes from Data Fabric
			if (tagKey.startsWith('df:source')) {
				const [assetNamespace, assetName] = tagValue.split(':');
				if (assetNamespace && assetName) {
					inputDataAssets.push({ assetNamespace, assetName });
				}
			}
		}

		const integrationEventPayload: ConnectorOutputIntegrationRequestEvent = {
			assetType,
			inputDataAssets,
			pipeline: {
				id: pipeline.id,
				name: pipeline.name,
				createdBy: pipeline.createdBy
			},
			execution: execution ? {
				id: execution.id,
				createdBy: execution.createdBy
			} : undefined,
			files: s3ObjectKeys.map(o => ({ key: o, bucket: this.bucketName })),
			fields: pipeline.transformer.transforms.filter(o => !(o.outputs[0].index === 0 && o.outputs[0].type === 'timestamp')).map(r => ({ key: r.outputs[0].key, type: r.outputs[0].type })),
			connectors: {
				input: [{
					name: inputConnector.name,
					parameters: this.compileConnectorParameters(inputConnector, pipeline, execution)
				}],
				output: [{
					name: outputConnector.name,
					parameters: this.compileConnectorParameters(outputConnector, pipeline, execution)
				}]
			},
		};

		const event = new EventBridgeEventBuilder()
			.setEventBusName(this.eventBusName)
			.setSource(PIPELINE_PROCESSOR_EVENT_SOURCE)
			.setDetailType(outputConnectorRequest(outputConnector.name))
			.setDetail(integrationEventPayload);

		// publish the connector integration event
		await this.eventPublisher.publish(event);
	}

	public async publishConnectorIntegrationEvent(pipeline: Pipeline, execution: PipelineExecution, connector: Connector, sc?: SecurityContext): Promise<void> {
		this.log.debug(`ConnectorUtility > publishConnectorIntegrationEvent > in> pipeline ${JSON.stringify(pipeline)}, execution:${execution}, connector: ${connector} `);

		validateNotEmpty(connector, 'connector');
		validateNotEmpty(pipeline, 'pipeline');
		validateNotEmpty(execution, 'execution');

		// we define a connector integration request event to be sent out to the consumer connector which is subscribed to the sif bus
		const integrationEventPayload: ConnectorIntegrationRequestEvent = {
			pipeline,
			executionId: execution.id,
			connector: {
				name: connector.name,
				parameters: this.compileConnectorParameters(connector, pipeline, execution)
			},
			transformedInputUploadUrl: await this.generateSignedUrl(getPipelineInputKey(this.bucketPrefix, pipeline.id, execution.id, 'transformed'), 5000, true)
		};

		// add security context to the payload if it exits
		if (sc) {
			integrationEventPayload.securityContext = sc;
		}

		// if the connector requires a file to be uploaded then we need to provide access to that file to the connector through a signedUrl to download it
		if (connector.requiresFileUpload) {
			integrationEventPayload.rawInputDownloadUrl = await this.generateSignedUrl(getPipelineInputKey(this.bucketPrefix, pipeline.id, execution.id, 'archived'), 5000, false);
		}

		this.log.debug(`ConnectorUtility > publishConnectorIntegrationEvent> out> eventPayload: ${JSON.stringify(integrationEventPayload)}`);

		const event = new EventBridgeEventBuilder()
			.setEventBusName(this.eventBusName)
			.setSource(PIPELINE_PROCESSOR_EVENT_SOURCE)
			.setDetailType(PIPELINE_PROCESSOR_CONNECTOR_REQUEST_EVENT)
			.setDetail(integrationEventPayload);

		// publish the connector integration event
		await this.eventPublisher.publish(event);
	}

	public async resolveConnectorFromPipeline(securityContext: SecurityContext, pipeline: Pipeline, type: 'input' | 'output'): Promise<Connector> {
		this.log.debug(`ConnectorUtility > resolveConnectorFromPipeline:>in? pipeline:${JSON.stringify(pipeline)}`);

		validateNotEmpty(pipeline, 'pipeline');

		let connector: Connector;
		// check if pipeline has an input connector configured
		if (pipeline.connectorConfig?.[type]?.length > 0) {
			// let's get the connector itself
			// for now, there will always be 1 input connector configured for a pipeline, we will grab that one
			let pipelineInputConnector = pipeline.connectorConfig[type][0];
			connector = await this.getConnector(securityContext, pipelineInputConnector.name);
		}
		// by default, we will integrate the sif CSV connector if no connector has been defined. This makes existing pipelines work as is and any new pipeline with no connector configured will be defaulted to CSV
		else {
			// since the connector requires a file to be uploaded as its input, we will generate the signedUrl and provide it in the response
			connector = await this.getConnector(securityContext, this.csvConnectorName);
		}
		this.log.debug(`ConnectorUtility > resolveConnectorFromPipeline> out: connector:${JSON.stringify(connector)}`);
		return connector;
	}

	// These config related parameters can be defined in three places, connector, pipeline, execution. This function will merge them all together into one parameter object
	private compileConnectorParameters(connector: Connector, pipeline: Pipeline, execution: PipelineExecution | undefined) {
		this.log.debug(`ConnectorUtility>compileConnectorParameters in> pipeline ${JSON.stringify(pipeline)}, execution:${execution}, connector: ${connector}`);
		// let's pull the first level parameters from the connector itself
		validateNotEmpty(connector, 'connector');
		validateNotEmpty(pipeline, 'pipeline');

		let parameters = {};

		// we will only compile parameters if there are parameters defined on the connector object
		if (connector.parameters) {

			let connectorParameterNames = [];
			// iterate of the connector config parameter definition
			connector.parameters.forEach((p) => {
				// let's track all the parameter names as well, this will be useful in the next steps where we need to compile out the parameters passed through the pipeline or execution
				connectorParameterNames.push(p.name);
				// check if it has a default value, if it does let's add it to the parameters object
				if (p.defaultValue) parameters[p.name] = p.defaultValue;
			});

			// let's get the second level parameters from the pipeline, since we are processing the input connector we check for that
			if (pipeline.connectorConfig?.[connector.type]) {
				//  for the particular connector, since the connectors are configured as list we have to find it
				const pipelineConnectorConfig = pipeline.connectorConfig?.[connector.type].filter((p) => p.name === connector.name)[0];
				// validate if the pipeline connector config has parameters to be compiled
				if (pipelineConnectorConfig.parameters) {
					// iterate over the parameter names and then only get the parameters with the same name, this will ignore any other parameters which are not specified on the connector itself
					connectorParameterNames.forEach((n) => {
						if (pipelineConnectorConfig.parameters[n]) parameters[n] = pipelineConnectorConfig.parameters[n];
					});
				}
			}

			// let's get the third level parameters from the execution request
			if (execution?.connectorOverrides?.[connector.name]?.parameters) {
				// iterate over the parameter names and then only get the parameters with the same name, this will ignore any other parameters which are not specified on the connector itself
				connectorParameterNames.forEach((n) => {
					if (execution?.connectorOverrides[connector.name].parameters[n]) parameters[n] = execution.connectorOverrides[connector.name].parameters[n];
				});
			}
		}

		// another validation step which should validate if the parameters which are passed through have any unknown parameters in them, if they do we need to throw an error here
		const parameterNames = connector?.parameters?.map((p) => p.name) ?? [];
		// we will get the keys for the parameters overrided on the pipeline's connectorConfiguration object and then do a match,
		// if we dont find a match, it means we have a parameter override which isnt define on the connectors parameter config
		const isMatch = Object.keys(parameters).every(k => parameterNames.includes(k));

		// if it doens't match, then we will throw an error here
		if (!isMatch) {
			throw new InvalidRequestError(`unknown parameter overrides specified: ${JSON.stringify(parameters)}, valid parameters for this connector are: ${JSON.stringify(parameterNames)}`);
		}

		this.log.debug(`ConnectorUtility> compileConnectorParameters> out: ${JSON.stringify(parameters)}`);
		return parameters;
	}

	private async getConnector(sc: SecurityContext, name: string): Promise<Connector> {
		this.log.debug(`ConnectorUtility> getConnector> sc:${sc}, name: ${name}`);

		validateNotEmpty(name, 'name');

		const requestContext: LambdaRequestContext = {
			authorizer: {
				claims: {
					email: sc.email,
					'cognito:groups': convertGroupRolesToCognitoGroups(sc.groupRoles),
					groupContextId: sc.groupId,
				},
			},
		};

		const connector = await this.connectorClient.getByName(name, requestContext);

		if (!connector) {
			throw new NotFoundError(`connector ${name} not found`);
		}

		this.log.debug(`ConnectorUtility> getConnector> exit: ${JSON.stringify(connector)}`);
		return connector;
	}

	private async generateSignedUrl(key: string, expiresIn?: number, forUpload?: boolean): Promise<string> {
		this.log.info(`ConnectorUtility> generateSignedUrl > in: key: ${key}, expireIn: ${expiresIn}, forUpload:${forUpload}`);

		let params;

		if (!forUpload) {
			params = new GetObjectCommand({
				Bucket: this.bucketName,
				Key: key
			});
		} else {
			params = new PutObjectCommand({
				Bucket: this.bucketName,
				Key: key
			});
		}

		const url = await this.getSignedUrl(this.s3Client, params, { expiresIn });

		this.log.info(`ConnectorUtility> generateSignedUrl > exit`);

		return url;
	}

}

