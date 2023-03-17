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
import {
	AdminAddUserToGroupCommand,
	AdminRemoveUserFromGroupCommand,
	AdminRemoveUserFromGroupCommandInput,
	CognitoIdentityProviderClient,
	CreateGroupCommand,
	DeleteGroupCommand,
	DeleteGroupCommandInput,
	ListUsersInGroupCommand,
	ListUsersInGroupCommandInput,
} from '@aws-sdk/client-cognito-identity-provider';
import { atLeastAdmin, atLeastReader, GroupPermissions, SecurityContext, SecurityScope } from '@sif/authz';

import { UnauthorizedError, NotFoundError, InvalidNameError, InvalidStateError, groupHierarchyDelimiter, TagRepository, TagService, ResourceService } from '@sif/resource-api-base';

import type { EditGroup, Group, GroupRole, NewGroup } from './schemas.js';
import type { GroupListOptions, GroupListPaginationKey, GroupMembership, GroupModuleRepository } from './repository.js';
import type { EventPublisher } from '@sif/events';
import { PkType } from '../common/pkTypes.js';
import type { MergeUtils, Configuration, ConfigurationSource, Utils } from '@sif/resource-api-base';
import merge from 'deepmerge';
import { diff } from 'deep-object-diff';

export class GroupModuleService {
	private readonly log: FastifyBaseLogger;
	private readonly authChecker: GroupPermissions;
	private readonly cognito: CognitoIdentityProviderClient;
	private readonly utils: Utils;
	private readonly userPoolId: string;
	private readonly repository: GroupModuleRepository;
	private readonly eventPublisher: EventPublisher;
	private readonly tagRepository: TagRepository;
	private readonly tagService: TagService;
	private readonly resourceService: ResourceService;
	private readonly mergeUtils: MergeUtils;

	public constructor(
		log: FastifyBaseLogger,
		authChecker: GroupPermissions,
		cognito: CognitoIdentityProviderClient,
		userPoolId: string,
		repository: GroupModuleRepository,
		eventPublisher: EventPublisher,
		tagRepository: TagRepository,
		tagService: TagService,
		resourceService: ResourceService,
		mergeUtils: MergeUtils,
		utils: Utils
	) {
		this.utils = utils;
		this.log = log;
		this.authChecker = authChecker;
		this.cognito = cognito;
		this.userPoolId = userPoolId;
		this.repository = repository;
		this.eventPublisher = eventPublisher;
		this.tagRepository = tagRepository;
		this.tagService = tagService;
		this.resourceService = resourceService;
		this.mergeUtils = mergeUtils;
	}

	public async create(securityContext: SecurityContext, group: NewGroup): Promise<Group> {
		this.log.debug(`GroupService> create> in> group:${JSON.stringify(group)}`);

		// Authz check - only admins of the group in context may create new groups.
		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId], securityContext.groupRoles, atLeastAdmin, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not an \`admin\` of the parent group \`${securityContext.groupId}\``);
		}

		this.validateName(group.name, securityContext.groupId);

		// the group in context must be valid
		await this.get(securityContext, securityContext.groupId);

		const delimiter = securityContext.groupId.endsWith('/') ? '' : '/';
		const groupId = `${securityContext.groupId.toLowerCase()}${delimiter}${group.name.toLowerCase()}`;

		// create the permission groups in Cognito
		for (const role of Object.values(SecurityScope)) {
			if (role === SecurityScope.superAdmin) {
				continue;
			}
			const cognitoGroupName = this.cognitoGroupName(groupId, role);
			try {
				await this.cognito.send(
					new CreateGroupCommand({
						UserPoolId: this.userPoolId,
						GroupName: cognitoGroupName,
						Description: `${role} users for application group ${groupId}.`,
					})
				);
			} catch (err) {
				if (err instanceof Error && err.name === 'GroupExistsException') {
					this.log.warn(`GroupService> create> Cognito group:${cognitoGroupName} unexpectedly already existed!`);
				} else {
					throw err;
				}
			}
		}

		// for the group that we're creating, we only want to save overridden configuration (delta)
		const configuration = await this.extractOverriddenConfiguration(groupId, group.configuration);

		// save details
		const saved: Group = {
			id: groupId,
			name: group.name,
			state: 'active',
			description: group.description as string,
			tags: group.tags,
			createdBy: securityContext.email,
			createdAt: new Date(Date.now()).toISOString(),
			configuration: configuration,
		};
		await this.repository.create(securityContext.groupId, saved);

		// update tag group summaries
		await this.tagRepository.updateGroupSummaries(groupId, PkType.Group, saved.tags, {});

		// publish event
		await this.eventPublisher.publishEvent({
			resourceType: 'group',
			eventType: 'created',
			id: saved.id,
			new: saved,
		});

		let [mergedConfiguration, _] = await this.mergeConfigurationFromParentGroups(groupId);

		saved.configuration = mergedConfiguration;

		this.log.debug(`GroupService> create> exit:${JSON.stringify(saved)}`);
		return saved;
	}

	public async delete(securityContext: SecurityContext, groupId: string): Promise<void> {
		this.log.debug(`GroupService> delete> in> groupId:${groupId}`);

		groupId = groupId.toLowerCase();

		// Authz check - only admins of the group in context may delete a group.
		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId, groupId], securityContext.groupRoles, atLeastAdmin, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not an \`admin\` of the group \`${securityContext.groupId}\``);
		}

		// Check to see if the group exists (a NotFoundError is thrown if not)
		const existing = await this.get(securityContext, groupId);

		// Check to see if the group is disabled
		if (existing.state !== 'disabled') {
			throw new InvalidStateError(`Group '${groupId}' cannot be deleted as has not been set to 'disabled'.`);
		}

		// check to see if all child groups have been removed
		const [childGroups, _paginationKey] = await this.resourceService.listIds(groupId, PkType.Group, { pagination: { count: 1 } });
		if ((childGroups?.length ?? 0) > 0) {
			throw new InvalidStateError(`Group '${groupId}' cannot be deleted as still has sub groups associated with it.`);
		}

		// check to see if all users have been removed
		for (const role of Object.values(SecurityScope)) {
			const cognitoGroupName = this.cognitoGroupName(groupId, role);
			const params: ListUsersInGroupCommandInput = {
				GroupName: cognitoGroupName,
				UserPoolId: this.userPoolId,
				Limit: 1,
			};
			try {
				this.log.debug(`GroupService> delete> ListUsersInGroup params:${JSON.stringify(params)}`);
				const users = await this.cognito.send(new ListUsersInGroupCommand(params));
				this.log.debug(`GroupService> delete> users:${JSON.stringify(users)}`);
				if ((users?.Users?.length ?? 0) > 0) {
					throw new InvalidStateError(`Group '${groupId}' cannot be deleted as still has users associated with it.`);
				}
			} catch (err) {
				if (err instanceof Error && err.name === 'ResourceNotFoundException') {
					// silently ignore
				} else {
					this.log.error(`GroupService> delete> Failed ListUsersInGroup group '${cognitoGroupName}': ${err}`);
					throw err;
				}
			}
		}

		// if reach here we are good to delete. start by deleting the cognito groups
		for (const role of Object.values(SecurityScope)) {
			const cognitoGroupName = this.cognitoGroupName(groupId, role);
			const params: DeleteGroupCommandInput = {
				GroupName: cognitoGroupName,
				UserPoolId: this.userPoolId,
			};
			try {
				this.log.debug(`GroupService> delete> DeleteGroup params:${JSON.stringify(params)}`);
				const r = await this.cognito.send(new DeleteGroupCommand(params));
				this.log.debug(`GroupService> delete> DeleteGroup r:${JSON.stringify(r)}`);
			} catch (err) {
				if (err instanceof Error && err.name === 'ResourceNotFoundException') {
					// silently ignore
				} else {
					this.log.error(`GroupService> delete> Failed deleting Cognito group '${cognitoGroupName}': ${err}`);
					throw err;
				}
			}
		}

		// delete the group from our own datastore
		await this.repository.delete(groupId);

		// publish event
		await this.eventPublisher.publishEvent({
			resourceType: 'group',
			eventType: 'deleted',
			id: groupId,
		});
		this.log.debug(`GroupService> delete> exit>`);
	}

	public async update(securityContext: SecurityContext, groupId: string, updated: EditGroup): Promise<Group> {
		this.log.debug(`GroupService> update> in> groupId:${groupId}, updated:${JSON.stringify(updated)}`);

		groupId = groupId.toLowerCase();

		// Authz check - only admins of the group may update.
		const isAuthorized = this.authChecker.isAuthorized([groupId], securityContext.groupRoles, atLeastAdmin, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not an \`admin\` of the group \`${groupId}\``);
		}

		const existing = await this.get(securityContext, groupId);

		// merge the existing and to be updated
		const merged = this.mergeUtils.mergeResource(existing, updated) as Group;

		// for the updated application configuration we only want to save the delta
		const configuration = await this.extractOverriddenConfiguration(groupId, merged.configuration);

		merged.updatedAt = new Date(Date.now()).toISOString();
		merged.updatedBy = securityContext.email;

		// determine which tags are to add/delete
		const tagDiff = this.tagService.diff(existing.tags, updated.tags);

		// save details
		await this.repository.update(
			{
				...merged,
				configuration,
			},
			tagDiff.toAdd,
			tagDiff.toDelete
		);

		// publish event
		await this.eventPublisher.publishEvent({
			resourceType: 'group',
			eventType: 'updated',
			id: groupId,
			old: existing,
			new: merged,
		});

		this.log.debug(`GroupService> update> exit> updated:${JSON.stringify(merged)}`);
		return merged;
	}

	private isChild(groupContextId: string, groupId: string): boolean {
		let parentId = groupId.substring(0, groupId.lastIndexOf(groupHierarchyDelimiter));
		if (parentId === '') {
			parentId = groupHierarchyDelimiter;
		}
		return groupContextId === parentId;
	}

	private async extractOverriddenConfiguration(groupId: string, updatedConfig: Configuration): Promise<Configuration> {
		this.log.debug(`GroupService> extractOverriddenConfiguration> in> groupId:${groupId}, updatedConfig: ${JSON.stringify(updatedConfig)}`);

		let configuration = updatedConfig;

		let groups = await this.repository.listByIds(this.utils.explodeGroupId(groupId));

		for (let group of groups) {
			if (group.id !== groupId) {
				configuration = diff((group && group.configuration) ?? {}, configuration);
			}
		}

		this.log.debug(`GroupService> extractOverriddenConfiguration> exit> ${JSON.stringify(configuration)}`);
		return configuration;
	}

	private async mergeConfigurationFromParentGroups(groupId: string): Promise<[Configuration, ConfigurationSource]> {
		this.log.debug(`GroupService> mergeConfigurationFromParentGroups> in> groupId:${groupId}`);

		let configuration = {},
			configurationSource = {};

		let groups = await this.repository.listByIds(this.utils.explodeGroupId(groupId));

		for (let group of groups) {
			configurationSource[group.id] = group.configuration;
			configuration = merge(configuration, group.configuration ?? {});
		}

		this.log.debug(`GroupService> mergeConfigurationFromParentGroups> exit> configuration: ${JSON.stringify(configuration)}, audit: ${JSON.stringify(configurationSource)}`);
		return [configuration, configurationSource];
	}

	public async get(securityContext: SecurityContext, groupId: string, showAudit = false): Promise<Group> {
		this.log.debug(`GroupService> get> in> groupId:${groupId}`);

		groupId = groupId.toLowerCase();

		// Authz check - Only members of a group or its parent group(s) may retrieve details of a group.
		const isAuthorized = this.authChecker.isAuthorized([groupId], securityContext.groupRoles, atLeastReader, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not a member of the group.`);
		}

		// retrieve
		const group = await this.repository.get(groupId);

		// verify requested group is either the group in context or a child of the group in context
		if (securityContext.groupId !== groupId && !this.isChild(securityContext.groupId, groupId)) {
			throw new UnauthorizedError(`The requested group '${groupId}' is not accessible within the group in context '${securityContext.groupId}' .`);
		}

		if (group === undefined) {
			throw new NotFoundError(`Group ${groupId} not found.`);
		}

		// construct application configuration from parents
		const [mergedConfiguration, configurationSource] = await this.mergeConfigurationFromParentGroups(groupId);

		group.configuration = mergedConfiguration;

		if (showAudit) {
			group.configurationSource = configurationSource;
		}

		this.log.debug(`GroupService> get> exit:${JSON.stringify(group)}`);
		return group;
	}

	public async list(securityContext: SecurityContext, options: GroupListOptions): Promise<[Group[], GroupListPaginationKey]> {
		this.log.debug(`GroupService> list> options:${JSON.stringify(options)}`);

		// Authz check - Only groups where the user is a member of are accessible.
		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId], securityContext.groupRoles, atLeastReader, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not a member of the parent group ${securityContext.groupId}.`);
		}

		const [groupIds, paginationKey] = await this.resourceService.listIds(securityContext.groupId, PkType.Group, {
			tagFilter: options?.tags,
			pagination: {
				count: options?.count,
				from: {
					paginationToken: options?.exclusiveStart?.paginationToken,
				},
			},
			includeChildGroups: options?.includeChildGroups,
			includeParentGroups: options?.includeParentGroups,
		});

		const groups = (await this.repository.listByIds(groupIds)).map((g) => {
			const { configuration, ...rest } = g;
			return rest;
		});

		this.log.debug(`GroupService> list> exit:${JSON.stringify([groups, paginationKey])}`);
		return [groups, paginationKey];
	}

	public async grantUser(securityContext: SecurityContext, email: string, groupRole: GroupRole): Promise<void> {
		this.log.debug(`GroupService> grantUser> in> email:${email}, groupRole:${JSON.stringify(groupRole)}`);

		email = email.toLowerCase();

		// Authz check -  Only `admins` of the group in context may add an existing user as a member
		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId], securityContext.groupRoles, atLeastAdmin, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not an \`admin\` of the group in context: \`${securityContext.groupId}\``);
		}

		// revoke any possible existing access to the same group
		await this.revokeUser(securityContext, email);

		// grant the user access to the Cognito group
		const cognitoGroupName = this.cognitoGroupName(securityContext.groupId, groupRole.role as SecurityScope);
		await this.cognito.send(
			new AdminAddUserToGroupCommand({
				UserPoolId: this.userPoolId,
				GroupName: cognitoGroupName,
				Username: email,
			})
		);

		// save details
		const membership: GroupMembership = {
			email,
			groupId: securityContext.groupId,
			role: groupRole.role,
			createdBy: securityContext.email,
			createdAt: new Date(Date.now()).toISOString(),
		};

		await this.repository.saveMembership(membership);

		// publish event
		await this.eventPublisher.publishEvent({
			resourceType: 'groupMembership',
			eventType: 'created',
			id: email,
			new: membership,
		});

		this.log.debug(`GroupService> grantUser> exit:${JSON.stringify(membership)}`);
	}

	public async revokeUser(securityContext: SecurityContext, email: string): Promise<void> {
		this.log.debug(`GroupService> revokeUser> in: email:${email}`);

		email = email.toLowerCase();

		// Authz check -  Only `admins` of the group in context may add an existing user as a member
		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId], securityContext.groupRoles, atLeastAdmin, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not an \`admin\` of the group in context: \`${securityContext.groupId}\``);
		}

		// get existing
		const existing = await this.repository.getMembership(email, securityContext.groupId);

		// revoke the user access to the Cognito group(s)
		for (const role of Object.values(SecurityScope)) {
			if (role === SecurityScope.superAdmin) {
				continue;
			}
			const cognitoGroupName = this.cognitoGroupName(securityContext.groupId, role);
			try {
				const request: AdminRemoveUserFromGroupCommandInput = {
					UserPoolId: this.userPoolId,
					GroupName: cognitoGroupName,
					Username: email,
				};
				this.log.debug(`GroupService> revokeUser> request:${JSON.stringify(request)}`);
				const response = await this.cognito.send(new AdminRemoveUserFromGroupCommand(request));
				this.log.debug(`GroupService> revokeUser> response:${JSON.stringify(response)}`);
			} catch (err) {
				if (err instanceof Error && err.name === 'UserNotFoundException') {
					// silently swallow
				} else {
					throw err;
				}
			}
		}

		// save details
		await this.repository.deleteMembership(email, securityContext.groupId);

		// publish event
		await this.eventPublisher.publishEvent({
			resourceType: 'groupMembership',
			eventType: 'deleted',
			id: email,
			old: existing,
		});

		this.log.debug(`GroupService> revokeUser> exit:`);
	}

	private cognitoGroupName(groupId: string, role: SecurityScope): string {
		return `${groupId.toLowerCase()}|||${role}`;
	}

	private validateName(name: string, parentId: string): void {
		const allowedCharacters = /^[a-zA-Z0-9-]+$/;
		if (!allowedCharacters.test(name)) {
			throw new InvalidNameError(`The name may only contain letters, numbers, or a dash.`);
		}
		const groupId = parentId.endsWith(groupHierarchyDelimiter) ? parentId + name : parentId + groupHierarchyDelimiter + name;
		if (groupId.length > 114) {
			throw new InvalidNameError(`The length of the provided name will cause the generated group id to exceed the maximum allowed 114 character limit.`);
		}
	}
}
