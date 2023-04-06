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

import type { CustomResource } from './customResource.js';
import type { Logger } from 'pino';
import type { LambdaRequestContext, ConnectorClient, NewConnector } from '@sif/clients';
import type { CustomResourceEvent } from './customResource.model.js';
// @ts-ignore
import ow from 'ow';

export class ConnectorSeederCustomResource implements CustomResource {
	private readonly logger: Logger;
	private readonly connectorClient: ConnectorClient;
	private readonly requestContext: LambdaRequestContext;

	constructor(logger: Logger, connectorClient: ConnectorClient) {
		const rootGroup = '/';
		this.connectorClient = connectorClient;
		this.logger = logger;
		// we need admin context to be able to delete and re-create connector resource
		this.requestContext = {
			authorizer: {
				claims: {
					email: 'sif',
					'cognito:groups': `${rootGroup}|||admin`,
					groupContextId: rootGroup,
				},
			},
		};
	}

	private async createConnectors(connectors: NewConnector[]): Promise<void> {
		this.logger.info(`connectorSeeder.customResource > createConnectors > in:`);
		for (const connector of connectors) {
			const existingConnector = await this.connectorClient.getByName(connector.name, this.requestContext);
			if (existingConnector) {
				this.logger.info(`connectorSeeder.customResource > createConnectors > delete existing connector: ${existingConnector.id}`);
				await this.connectorClient.delete(existingConnector.id, this.requestContext);
			}
			const createdConnector = await this.connectorClient.create(connector, this.requestContext);
			this.logger.info(`connectorSeeder.customResource > createConnectors > createdConnector: ${createdConnector}`);
		}
		this.logger.info(`connectorSeeder.customResource > createConnectors > out:`);
	}

	async create(customResourceEvent: CustomResourceEvent): Promise<unknown> {
		this.logger.info(`connectorSeeder.customResource > create > in: customResourceEvent: ${customResourceEvent}`);
		ow(customResourceEvent.ResourceProperties?.['connectors'], ow.object.nonEmpty);
		const connectors = customResourceEvent.ResourceProperties?.['connectors'] as unknown as NewConnector[];
		await this.createConnectors(connectors);
		this.logger.info(`connectorSeeder.customResource > create > out:`);
		return Promise.resolve(undefined);
	}

	async delete(customResourceEvent: CustomResourceEvent): Promise<unknown> {
		this.logger.info(`connectorSeeder.customResource > delete > in > customResourceEvent: ${customResourceEvent}`);
		this.logger.info(`connectorSeeder.customResource > delete > resources will be removed by removal of the pipeline DynamoDB`);
		this.logger.info(`connectorSeeder.customResource > delete > out:`);
		return Promise.resolve(undefined);
	}

	async update(customResourceEvent: CustomResourceEvent): Promise<unknown> {
		this.logger.info(`connectorSeeder.customResource > update > in > customResourceEvent: ${customResourceEvent}`);
		ow(customResourceEvent.ResourceProperties?.['connectors'], ow.object.nonEmpty);
		const connectors = customResourceEvent.ResourceProperties?.['connectors'] as unknown as NewConnector[];
		await this.createConnectors(connectors);
		this.logger.info(`connectorSeeder.customResource > update > out:`);
		return Promise.resolve(undefined);
	}

}
