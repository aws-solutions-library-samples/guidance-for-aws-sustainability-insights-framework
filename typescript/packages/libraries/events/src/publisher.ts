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

	public async publishTenantEvent<T>(event: PlatformEvent<T>): Promise<void> {
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
		this.log.debug(`EventPublisher> publishEvent> exit`);
	}


	public async publish(event: EventBridgeEventBuilder): Promise<void> {
		this.log.debug(`Publisher>publish>in: event:${JSON.stringify(event)}`);

		event.setEventBusName(this.eventBusName);

		const params: PutEventsCommandInput = {
			Entries: [{
				Source: event.Source,
				EventBusName: event.EventBusName,
				DetailType: event.DetailType,
				Time: event.Time,
				Detail: event.Detail
			}]
		};

		await this.client.send(new PutEventsCommand(params));
	}
}

export class EventBridgeEventBuilder {
	public Source:string;
	public EventBusName: string;
	public DetailType: string;
	public Time: Date;
	public Detail: string;
	private regions: string[];

	constructor() {
		this.Time = new Date();
	}

	public setSource(source:string): EventBridgeEventBuilder {
		this.Source = source;
		return this
	}

	public setRegions(regions: string[]): EventBridgeEventBuilder {
		this.regions = regions;
		return this
	}

	public getRegions(): string[] {
		return this.regions
	}

	public setEventBusName(name:string): EventBridgeEventBuilder {
		this.EventBusName = name;
		return this
	}

	public setDetailType(detailType:string): EventBridgeEventBuilder {
		this.DetailType = detailType
		return this
	}

	public setDetail(detail: unknown): EventBridgeEventBuilder {
		this.Detail = JSON.stringify(detail);
		return this
	}
}

