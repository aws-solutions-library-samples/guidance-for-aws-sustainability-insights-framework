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

import type { Logger } from 'pino';
import type { CustomResource } from './customResource.js';
import type { CustomResourceEvent } from './customResource.model.js';
import type { DatabaseSeederCustomResource } from './databaseSeeder.customResource.js';
import type { ConnectorSeederCustomResource } from './connectorSeederCustomResource';

export class CustomResourceManager {
	private readonly customResources: { [key: string]: CustomResource };
	private readonly logger: Logger;

	constructor(logger: Logger, databaseSeederCustomResource: DatabaseSeederCustomResource, connectorSeederCustomResource: ConnectorSeederCustomResource) {
		this.logger = logger;
		this.customResources = {};
		this.customResources['Custom::DatabaseSeeder'] = databaseSeederCustomResource;
		this.customResources['Custom::ConnectorSeeder'] = connectorSeederCustomResource;
	}

	public async create(event: CustomResourceEvent): Promise<unknown> {
		this.logger.info(`CustomResourceManager: create: event:${JSON.stringify(event)}`);
		return await this.customResources[event.ResourceType].create(event);
	}

	public async update(event: CustomResourceEvent): Promise<unknown> {
		this.logger.info(`CustomResourceManager: update: event:${JSON.stringify(event)}`);
		return await this.customResources[event.ResourceType].update(event);
	}

	public async delete(event: CustomResourceEvent): Promise<unknown> {
		this.logger.info(`CustomResourceManager: delete: event:${JSON.stringify(event)}`);
		return await this.customResources[event.ResourceType].delete(event);
	}
}
