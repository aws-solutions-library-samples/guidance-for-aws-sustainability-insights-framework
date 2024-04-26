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

import { Invoker, LambdaApiGatewayEventBuilder } from '@sif/lambda-invoker';

import { ClientServiceBase } from '../../common/common.js';
import type { LambdaRequestContext } from '../../common/models.js';
import type { NewConnector, Connector, Connectors } from './connector.models.js';

export class ConnectorClient extends ClientServiceBase {

	private readonly pipelineFunctionName: string;
	private readonly log: BaseLogger;

	private readonly lambdaInvoker: Invoker;

	constructor(log: BaseLogger, lambdaInvoke: Invoker, pipelineFunctionName: string) {
		super();
		this.lambdaInvoker = lambdaInvoke;
		this.pipelineFunctionName = pipelineFunctionName;
		this.log = log;
	}

	public async getByName(name: string, requestContext?: LambdaRequestContext): Promise<Connector | undefined> {
		this.log.debug(`ConnectorClient> getByName> in: name:${name}, requestContext: ${JSON.stringify(requestContext)}`);
		const additionalHeaders = {};

		if (requestContext.authorizer.claims.groupContextId) {
			additionalHeaders['x-groupcontextid'] = requestContext.authorizer.claims.groupContextId;
		}

		const event: LambdaApiGatewayEventBuilder = new LambdaApiGatewayEventBuilder()
			.setMethod('GET')
			.setRequestContext(requestContext)
			.setHeaders(super.buildHeaders(additionalHeaders))
			.setQueryStringParameters({
				name,
				includeParentGroups: 'true',
			})
			.setPath(`/connectors`);

		const result = (await this.lambdaInvoker.invoke(this.pipelineFunctionName, event))?.body as Connectors;
		let connector = result?.connectors?.[0];
		this.log.info(`ConnectorClient> getByName> exit> result: ${JSON.stringify(connector)}`);
		return connector;
	}

	public async create(newConnector: NewConnector, requestContext?: LambdaRequestContext): Promise<Connector> {
		this.log.info(`ConnectorClient> create> in> newConnector: ${newConnector}`);

		const additionalHeaders = {};

		if (requestContext.authorizer.claims.groupContextId) {
			additionalHeaders['x-groupcontextid'] = requestContext.authorizer.claims.groupContextId;
		}

		const event: LambdaApiGatewayEventBuilder = new LambdaApiGatewayEventBuilder()
			.setMethod('POST')
			.setRequestContext(requestContext)
			.setHeaders(super.buildHeaders(additionalHeaders))
			.setBody(newConnector)
			.setPath(`connectors`);

		const result = await this.lambdaInvoker.invoke(this.pipelineFunctionName, event);
		this.log.info(`ConnectorClient> create> exit> result: ${JSON.stringify(result)}`);
		return result.body as Connector;
	}

	public async get(connectorId: string, version?: number, requestContext?: LambdaRequestContext): Promise<Connector> {
		this.log.info(`ConnectorClient> get> in> connectorId: ${connectorId}, version : ${version}`);

		const additionalHeaders = {};

		if (requestContext.authorizer.claims.groupContextId) {
			additionalHeaders['x-groupcontextid'] = requestContext.authorizer.claims.groupContextId;
		}

		const event: LambdaApiGatewayEventBuilder = new LambdaApiGatewayEventBuilder()
			.setMethod('GET')
			.setRequestContext(requestContext)
			.setHeaders(super.buildHeaders(additionalHeaders))
			.setPath(version ? `connectors/${connectorId}/versions/${version}` : `pipelines/${connectorId}`);

		const result = await this.lambdaInvoker.invoke(this.pipelineFunctionName, event);
		this.log.info(`ConnectorClient> get> exit> result: ${JSON.stringify(result)}`);
		return result.body as Connector;
	}

	public async delete(connectorId: string, requestContext?: LambdaRequestContext): Promise<void> {
		this.log.info(`ConnectorClient> delete> in> connectorId: ${connectorId}`);

		const additionalHeaders = {};

		if (requestContext.authorizer.claims.groupContextId) {
			additionalHeaders['x-groupcontextid'] = requestContext.authorizer.claims.groupContextId;
		}

		const event: LambdaApiGatewayEventBuilder = new LambdaApiGatewayEventBuilder()
			.setMethod('DELETE')
			.setRequestContext(requestContext)
			.setHeaders(super.buildHeaders(additionalHeaders))
			.setBody({})
			.setPath(`connectors/${connectorId}`);

		const result = await this.lambdaInvoker.invoke(this.pipelineFunctionName, event);
		this.log.info(`ConnectorClient> delete> exit> result: ${JSON.stringify(result)}`);
		return;
	}

	public async update(connectorId:string, updatedConnector: NewConnector, requestContext?: LambdaRequestContext): Promise<Connector> {
		this.log.info(`ConnectorClient> update> in> connector: ${updatedConnector}`);

		const additionalHeaders = {};

		if (requestContext.authorizer.claims.groupContextId) {
			additionalHeaders['x-groupcontextid'] = requestContext.authorizer.claims.groupContextId;
		}

		const event: LambdaApiGatewayEventBuilder = new LambdaApiGatewayEventBuilder()
			.setMethod('PATCH')
			.setRequestContext(requestContext)
			.setHeaders(super.buildHeaders(additionalHeaders))
			.setBody(updatedConnector)
			.setPath(`connectors/${connectorId}`);

		const result = await this.lambdaInvoker.invoke(this.pipelineFunctionName, event);
		this.log.info(`ConnectorClient> update> exit> result: ${JSON.stringify(result)}`);
		return result.body as Connector;
	}
}
