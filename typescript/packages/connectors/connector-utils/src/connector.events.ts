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
import { EventPublisher, EventBridgeEventBuilder, PIPELINE_PROCESSOR_CONNECTOR_RESPONSE_EVENT } from '@sif/events';
import type { ConnectorIntegrationResponseEvent } from '@sif/clients';

export class ConnectorEvents {
	constructor(
		private log: BaseLogger,
		private eventPublisher: EventPublisher,
		private eventBusName: string,
		private region: string,
		private source: string,
	) {
	}

	public async publishResponse(params: ConnectorIntegrationResponseEvent): Promise<void> {
		this.log.debug(`PluginEvents>response>in: params:${JSON.stringify(params)}`);

		const event = new EventBridgeEventBuilder()
			.setEventBusName(this.eventBusName)
			.setRegions([this.region])
			.setSource(this.source)
			.setDetailType(PIPELINE_PROCESSOR_CONNECTOR_RESPONSE_EVENT)
			.setDetail(params);

		await this.eventPublisher.publish(event);

		this.log.info(`PluginEvents>response>exit`);
	}
}
