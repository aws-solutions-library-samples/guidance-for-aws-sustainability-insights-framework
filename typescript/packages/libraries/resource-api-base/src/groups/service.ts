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
import type { AccessManagementClient } from '../clients/accessManagement.client.js';
import type { Resource } from '../resources/models.js';
import type { Tags } from '../tags/schemas.js';
import type { TagService } from '../tags/service.js';
import type { Group } from './models.js';
import type { GroupRepository } from './repository.js';
import { SendMessageCommand, SendMessageCommandInput, SQSClient } from '@aws-sdk/client-sqs';

import type { Utils } from '../common/utils.js';
import type { ResourceRepository } from '../resources/repository.js';

import NodeCache from 'node-cache';
import type { IGroupService } from '@sif/authz';

const groupsCache = new NodeCache({ stdTTL: 30, checkperiod: 30 });

export class GroupService implements IGroupService {
	private readonly accessManagementClient: AccessManagementClient;
	private readonly workerQueueUrl: string;
	private readonly groupRepo: GroupRepository;
	private readonly log: BaseLogger;
	private readonly resourceRepo: ResourceRepository;
	private readonly sqsClient: SQSClient;
	private readonly tagService: TagService;
	private readonly utils: Utils;

	public constructor(
		log: BaseLogger,
		repository: GroupRepository,
		tagService: TagService,
		accessManagementClient: AccessManagementClient,
		workerQueueUrl: string,
		sqsClient: SQSClient,
		utils: Utils,
		resourceRepository: ResourceRepository
	) {
		this.log = log;
		this.groupRepo = repository;
		this.tagService = tagService;
		this.accessManagementClient = accessManagementClient;
		this.workerQueueUrl = workerQueueUrl;
		this.sqsClient = sqsClient;
		this.utils = utils;
		this.resourceRepo = resourceRepository;
	}

	public async isAlternateIdInUse(alternateId: string, groupId: string): Promise<boolean> {
		this.log.debug(`GroupService> isAlternateIdInUse> in> alternateId:${alternateId}, groupId: ${groupId}`);

		const inUseBy = await this.resourceRepo.getIdByAlternateId(alternateId, groupId);
		const inUse = inUseBy !== undefined;

		this.log.debug(`GroupService> isAlternateIdInUse> exit:${inUse}`);
		return inUse;
	}

	public async grant(resource: Resource, group: Group): Promise<void> {
		this.log.debug(`GroupService> grant> in> resource:${JSON.stringify(resource)}, group:${JSON.stringify(group)}`);

		// Step 1: In case this is an implicit group grant, determine if the resource has already been granted to the parent group
		const parentGroupId = this.utils.getParentGroupId(group.id);
		const isImplicitGrant = await this.groupRepo.isGranted(resource.id, resource.keyPrefix, parentGroupId);

		// Step 2: If step 1 determines is an implicit grant, retrieve tags for the resource
		let tags: Tags = {};
		if (isImplicitGrant) {
			tags = await this.tagService.listAllByResourceId(resource.id, resource.keyPrefix);
		}

		// Step 3: Grant access of resource to requested group.
		// Step 4: If step 1 determined implicit grant, within same transaction, increment the distinct tag item for each tag from step 2 for the group being granted.
		await this.groupRepo.grant(resource, group, tags);

		// Step 5: Call Access Management API to retrieve list of sub-groups.
		const subGroupIds = await this.accessManagementClient.listSubGroupIds(group.id);

		// Step 6: Publish message to recursively process the grants to sub groups
		for (const subGroupId of subGroupIds) {
			await this.sendMessage(resource, subGroupId, 'grant');
		}
		this.log.debug(`GroupService> revoke> exit:`);
	}

	public async revoke(resource: Resource, group: Group): Promise<void> {
		this.log.debug(`GroupService> revoke> in> resource:${JSON.stringify(resource)}, group:${JSON.stringify(group)}`);

		// Step 1: List tags for the resource
		const tags = await this.tagService.listAllByResourceId(resource.id, resource.keyPrefix);

		// Step 2: Revoke access of resource to requested group.
		// Step 3: Within same transaction, decrement the distinct tag item for each tag from step 1 for the group being granted.
		await this.groupRepo.revoke(resource, group, tags);

		// Step 4: Call Access Management API to retrieve list of sub-groups.
		const subGroupIds = await this.accessManagementClient.listSubGroupIds(group.id);

		// Step 5: Publish message to recursively process the revokes to sub groups
		for (const subGroupId of subGroupIds) {
			await this.sendMessage(resource, subGroupId, 'revoke');
		}
		this.log.debug(`GroupService> revoke> exit:`);
	}

	private async sendMessage(resource: Resource, subGroupId: string, operation: 'grant' | 'revoke') {
		this.log.debug(`GroupService> sendMessage> in> resource:${JSON.stringify(resource)}, subGroupId:${subGroupId}`);
		const params: SendMessageCommandInput = {
			QueueUrl: this.workerQueueUrl,
			MessageBody: JSON.stringify({
				resource,
				group: {
					id: subGroupId,
				},
			}),
			MessageAttributes: {
				messageType: {
					DataType: 'String',
					StringValue: `group::${operation}`,
				},
			},
		};
		this.log.debug(`GroupService> sendMessage> SendMessageCommandInput:${JSON.stringify(params)}`);
		const r = await this.sqsClient.send(new SendMessageCommand(params));
		this.log.debug(`GroupService> sendMessage> SendMessageCommandOutput:${JSON.stringify(r)}`);
	}

	public async isGroupExists(groupId: string): Promise<boolean> {
		this.log.debug(`GroupService> isGroupExists> in> groupId:${groupId}`);

		const parentGroupId = this.utils.getParentGroupId(groupId);

		// Search the cache for the group
		const cached = groupsCache.has(groupId);

		let exists = false;

		if (!cached) {
			exists = await this.accessManagementClient.isGroupExists(parentGroupId, groupId);
		} else {
			this.log.debug(`GroupService> isGroupExists> found: ${groupId} in cache`);
			exists = true;
		}

		// Cache the group to reduce the load on accessManagement
		if (exists && !cached) {
			this.log.debug(`GroupService> isGroupExists> saving: ${groupId} in cache`);
			groupsCache.set(groupId, groupId, 30);
		}

		this.log.debug(`GroupService> isGroupExists> exit:${exists}`);
		return exists;
	}
}
