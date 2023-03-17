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
import type { TagListOptions, TagListPaginationKey, TagValueListOptions, TagValueListPaginationKey } from './models.js';
import type { Tags } from './schemas.js';
import type { TagRepository } from './repository.js';
import { atLeastReader, GroupPermissions, SecurityContext } from '@sif/authz';
import { UnauthorizedError } from '../common/errors.js';
import { SendMessageCommand, SendMessageCommandInput, SQSClient } from '@aws-sdk/client-sqs';
import type { AccessManagementClient } from '../clients/accessManagement.client.js';

export class TagService {
	private readonly log: BaseLogger;
	private readonly repository: TagRepository;
	private readonly authChecker: GroupPermissions;
	private readonly sqsClient: SQSClient;
	private readonly workerQueueUrl: string;
	private readonly accessManagementClient: AccessManagementClient;

	public constructor(log: BaseLogger, repository: TagRepository, authChecker: GroupPermissions, sqsClient: SQSClient, workerQueueUrl: string, accessManagementClient: AccessManagementClient) {
		this.log = log;
		this.repository = repository;
		this.authChecker = authChecker;
		this.sqsClient = sqsClient;
		this.workerQueueUrl = workerQueueUrl;
		this.accessManagementClient = accessManagementClient;
	}

	public async _listByResourceId(resourceId: string, keyPrefix: string, options?: TagListOptions): Promise<[Tags, TagListPaginationKey]> {
		this.log.debug(`TagService> _listByResourceId> in> resourceId:${resourceId}, keyPrefix:${keyPrefix}, options:${JSON.stringify(options)}`);

		const response: [Tags, TagListPaginationKey] = await this.repository.listByResourceId(resourceId, keyPrefix, options);
		this.log.debug(`TagService> _listByResourceId> exit: response ${JSON.stringify(response)}`);
		return response;
	}

	public async listAllByResourceId(resourceId: string, keyPrefix: string): Promise<Tags> {
		this.log.debug(`TagService> listAllByResourceId> in> resourceId:${resourceId}, keyPrefix:${keyPrefix}`);

		let tags: Tags = {};
		let paginationOptions: TagListOptions;
		do {
			const [t, paginationKey] = await this.repository.listByResourceId(resourceId, keyPrefix, paginationOptions);
			Object.assign(tags, t);
			paginationOptions = {
				exclusiveStart: paginationKey,
			};
		} while (paginationOptions?.exclusiveStart);

		this.log.info(`TagService> listAllByResourceId> exit: ${JSON.stringify(tags)}`);
		return tags;
	}

	public async listByGroupId(securityContext: SecurityContext, tagKey: string, options?: TagValueListOptions): Promise<[Record<string, string>, TagValueListPaginationKey]> {
		this.log.debug(`TagService> listByGroupId> in> tagKey:${tagKey}, options:${JSON.stringify(options)}`);

		// Authz check - Only `reader` and above may list tags.
		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId], securityContext.groupRoles, atLeastReader, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not a \`reader\` of the group in context \`${JSON.stringify(securityContext.groupId)}`);
		}

		const response: [Record<string, string>, TagValueListPaginationKey] = await this.repository.listByGroupId(securityContext.groupId, tagKey, options);
		this.log.debug(`TagService> listByGroupId> exit: response ${JSON.stringify(response)}`);
		return response;
	}

	public async listAllByGroupId(securityContext: SecurityContext, resourceKeyPrefix: string, tagKey: string, parentTagValue?: string): Promise<Record<string, string>> {
		this.log.debug(`TagService> listAllByGroupId> in> resourceKeyPrefix:${resourceKeyPrefix}, tagKey:${tagKey}, parentTagValue:${parentTagValue}`);

		// Authz check - Only `reader` and above may list tags.
		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId], securityContext.groupRoles, atLeastReader, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not a \`reader\` of the group in context \`${JSON.stringify(securityContext.groupId)}`);
		}

		const tagValues: Record<string, string> = {};
		const paginationOptions: TagValueListOptions = {
			parentTagValue,
			resourceKeyPrefix,
		};
		do {
			const [v, paginationKey] = await this.repository.listByGroupId(securityContext.groupId, tagKey, paginationOptions);
			Object.assign(tagValues, v);
			paginationOptions.exclusiveStart = paginationKey;
		} while (paginationOptions?.exclusiveStart?.value);

		this.log.info(`TagService> listAllByGroupId> exit: ${JSON.stringify(tagValues)}`);
		return tagValues;
	}

	public diff(existing: Tags = {}, updated: Tags = {}): DiffResult {
		this.log.debug(`TagService> diff> in> existing:${JSON.stringify(existing)}, updated:${JSON.stringify(updated)}`);

		const result: DiffResult = {
			toAdd: {},
			toDelete: {},
		};

		Object.entries(updated)
			.filter(([xk, xv]) => Object.entries(existing).find(([yk, yv]) => xk === yk && xv === yv) === undefined)
			.forEach(([k, v]) => (result.toAdd[k] = v));

		Object.entries(result.toAdd).forEach(([k, v]) => {
			if ((v?.length ?? 0) === 0) {
				delete result.toAdd[k];
			}
		});

		Object.entries(existing)
			.filter(([xk, xv]) => Object.entries(updated).find(([yk, yv]) => xk === yk && xv === yv) === undefined)
			.forEach(([k, v]) => (result.toDelete[k] = v));

		this.log.debug(`TagService> diff> exit:${JSON.stringify(result)}`);
		return result;
	}

	public async submitGroupSummariesProcess(groupId: string, resourceKeyPrefix: string, added: Tags, removed: Tags): Promise<void> {
		this.log.debug(`TagService> submitGroupSummariesProcess> in> groupId:${groupId}, resourceKeyPrefix:${resourceKeyPrefix}, added:${JSON.stringify(added)}, removed:${JSON.stringify(removed)}`);

		await this.sendMessage(groupId, resourceKeyPrefix, added, removed);

		this.log.debug(`TagService> submitGroupSummariesProcess> exit:`);
	}

	public async processGroupSummaries(groupId: string, resourceKeyPrefix: string, added: Tags, removed: Tags): Promise<void> {
		this.log.debug(`TagService> processGroupSummaries> in> groupId:${groupId}, resourceKeyPrefix:${resourceKeyPrefix}, added:${JSON.stringify(added)}, removed:${JSON.stringify(removed)}`);

		// step 1: update group items
		await this.repository.updateGroupSummaries(groupId, resourceKeyPrefix, added, removed);

		// step 2: list sub groups
		const subGroupIds = await this.accessManagementClient.listSubGroupIds(groupId);

		// step 3: submit job to process sub group tag summaries
		for (const subGroupId of subGroupIds) {
			await this.sendMessage(subGroupId, resourceKeyPrefix, added, removed);
		}
		this.log.debug(`TagService> processGroupSummaries> exit:`);
	}

	private async sendMessage(groupId: string, resourceKeyPrefix: string, added: Tags, removed: Tags) {
		this.log.debug(`TagService> sendMessage> in> groupId:${groupId}, resourceKeyPrefix:${resourceKeyPrefix}, added:${JSON.stringify(added)}, removed:${JSON.stringify(removed)}`);
		const params: SendMessageCommandInput = {
			QueueUrl: this.workerQueueUrl,
			MessageBody: JSON.stringify({
				groupId,
				resourceKeyPrefix,
				added,
				removed,
			}),
			MessageAttributes: {
				messageType: {
					DataType: 'String',
					StringValue: `tags::group`,
				},
			},
		};
		this.log.debug(`TagService> sendMessage> SendMessageCommandInput:${JSON.stringify(params)}`);
		const r = await this.sqsClient.send(new SendMessageCommand(params));
		this.log.debug(`TagService> sendMessage> SendMessageCommandOutput:${JSON.stringify(r)}`);
	}

	public removeUnusedTags(tags: Tags) {
		this.log.debug(`TagService> removeUnusedTags> in> tags:${JSON.stringify(tags)}`);
		if (tags !== undefined) {
			Object.entries(tags).forEach(([k, v]) => {
				if ((v?.length ?? 0) === 0) {
					delete tags[k];
				}
			});
		}
		this.log.debug(`TagService> removeUnusedTags> exit> tags:${JSON.stringify(tags)}`);
	}

	public expandTagsQS(tagKeyValuePairs: string[]): Tags {
		const expandedTags: Tags = {};
		if ((tagKeyValuePairs?.length ?? 0) > 0) {
			tagKeyValuePairs?.forEach((t) => {
				const kv = t.split(':');
				const k = decodeURIComponent(kv[0] as string);
				const v = decodeURIComponent(kv[1] as string);
				expandedTags[k] = v;
			});
		}
		return expandedTags;
	}
}

export interface DiffResult {
	toAdd: Tags;
	toDelete: Tags;
}
