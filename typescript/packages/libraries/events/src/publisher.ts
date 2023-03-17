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

import { EventBridgeClient, PutEventsCommandInput, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import type { BaseLogger } from 'pino';
import type { PlatformEvent, EventSource } from './models.js';

export class EventPublisher {
	private readonly log: BaseLogger;
	private readonly eventBusName: string;
	private readonly client: EventBridgeClient;
	private readonly eventSource: EventSource;

	public constructor(log: BaseLogger, client: EventBridgeClient, eventBusName: string, eventSource: EventSource) {
		this.log = log;
		this.client = client;
		this.eventBusName = eventBusName;
		this.eventSource = eventSource;
	}

	public async publishEvent<T>(event: PlatformEvent<T>): Promise<void> {
		this.log.debug(`EventPublisher> publishEvent> in: event:${JSON.stringify(event)}`);

		let error;

		if (event.error) {
			error = {
				name: event.error.name,
				message: event.error.message,
				stack: event.error.stack,
			};
		}

		const params: PutEventsCommandInput = {
			Entries: [
				{
					EventBusName: this.eventBusName,
					Source: this.eventSource as unknown as string,
					DetailType: `SIF>${this.eventSource}>${event.resourceType}>${event.eventType}`,
					Detail: JSON.stringify({
						...event,
						error: error,
					}),
				},
			],
		};

		await this.client.send(new PutEventsCommand(params));
	}
}
