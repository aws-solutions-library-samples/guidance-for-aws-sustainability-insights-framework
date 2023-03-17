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

import type { SQSEvent } from 'aws-lambda';
import type { BaseLogger } from 'pino';
import type { GroupService } from './groups/service.js';
import type { TagService } from './tags/service.js';

export class MessageService {
	private readonly log: BaseLogger;
	private readonly groupService: GroupService;
	private readonly tagService: TagService;

	public constructor(log: BaseLogger, groupService: GroupService, tagService: TagService) {
		this.log = log;
		this.groupService = groupService;
		this.tagService = tagService;
	}

	public async handleEvent(event: SQSEvent) {
		this.log.debug(`MessageService> handleEvent> in> event:${JSON.stringify(event)}`);

		if (event?.Records) {
			for (const r of event.Records) {
				if (r.eventSource !== 'aws:sqs') {
					this.log.warn(`MessageService> handleEvent> ignoring non-sqs events: ${JSON.stringify(r)}`);
					continue;
				}

				const messageType = r.messageAttributes?.['messageType']?.stringValue;
				const messageBody = JSON.parse(r.body);

				const isHandled = await this.handleMessage(messageType, messageBody);
				if (!isHandled) {
					this.log.warn(`MessageService> handleEvent> ignoring un-recognized sqs event`);
				}
			}
		}
		this.log.debug(`MessageService> handleEvent> exit:`);
	}

	public async handleMessage(messageType: string, messageBody: any): Promise<boolean> {
		this.log.debug(`MessageService> handleMessage> in> messageType:${messageType}, messageBody:${JSON.stringify(messageBody)}`);

		switch (messageType) {
			case 'group::grant':
				await this.groupService.grant(messageBody.resource, messageBody.group);
				return true;
			case 'group::revoke':
				await this.groupService.revoke(messageBody.resource, messageBody.group);
				return true;
			case 'tags::group':
				await this.tagService.processGroupSummaries(messageBody.groupId, messageBody.resourceKeyPrefix, messageBody.added, messageBody.removed);
				return true;

			default:
				return true;
		}
	}
}
