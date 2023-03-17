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

import clone from 'just-clone';

import type { FastifyBaseLogger } from 'fastify';
import type { EditUser, User, NewUser, Groups } from './schemas.js';
import {
	AdminCreateUserCommand,
	AdminCreateUserCommandInput,
	AdminDeleteUserCommand,
	AdminDisableUserCommand,
	AdminDisableUserCommandInput,
	AdminEnableUserCommand,
	AdminEnableUserCommandInput,
	AdminGetUserCommand,
	AdminGetUserCommandInput,
	AdminSetUserPasswordCommand,
	CognitoIdentityProviderClient,
	MessageActionType,
} from '@aws-sdk/client-cognito-identity-provider';
import { atLeastAdmin, atLeastReader, GroupPermissions, SecurityContext } from '@sif/authz';

import { InvalidStateError, NotFoundError, TagService, UnauthorizedError, ResourceService, Tags, type MergeUtils } from '@sif/resource-api-base';

import type { UserRepository } from './repository.js';
import type { GroupModuleService } from '../groups/service.js';
import type { EventPublisher } from '@sif/events';
import { PkType } from '../common/pkTypes.js';
import { SecurityScope } from '@sif/authz';

export class UserService {
	private readonly log: FastifyBaseLogger;
	private readonly authChecker: GroupPermissions;
	private readonly cognito: CognitoIdentityProviderClient;
	private readonly userPoolId: string;
	private readonly groupService: GroupModuleService;
	private readonly repository: UserRepository;
	private readonly eventPublisher: EventPublisher;
	private readonly tagService: TagService;
	private readonly resourceService: ResourceService;
	private readonly mergeUtils: MergeUtils;

	public constructor(
		log: FastifyBaseLogger,
		authChecker: GroupPermissions,
		cognito: CognitoIdentityProviderClient,
		userPoolId: string,
		groupService: GroupModuleService,
		repository: UserRepository,
		eventPublisher: EventPublisher,
		tagService: TagService,
		resourceService: ResourceService,
		mergeUtils: MergeUtils
	) {
		this.log = log;
		this.authChecker = authChecker;
		this.cognito = cognito;
		this.userPoolId = userPoolId;
		this.groupService = groupService;
		this.repository = repository;
		this.eventPublisher = eventPublisher;
		this.tagService = tagService;
		this.resourceService = resourceService;
		this.mergeUtils = mergeUtils;
	}

	public async update(securityContext: SecurityContext, email: string, updated: EditUser): Promise<User> {
		this.log.debug(`UserService> update> email:${email}, updated:${JSON.stringify(updated)}`);

		email = email.toLowerCase();

		// Authz check 1 - `reader` and above may update their own password
		if (updated.password !== undefined) {
			if (email !== securityContext.email) {
				throw new UnauthorizedError(`User's may only update their own password.`);
			}
		}

		// Authz check 2: `admin` roles may update any user status where they are themselves an \`admin\` of all the groups the user is a member of
		if (updated.state !== undefined) {
			const existingUser = await this.get(securityContext, email);
			const isAuthorized = this.authChecker.isAuthorized(Object.keys(existingUser.groups), securityContext.groupRoles, atLeastAdmin, 'all');
			if (!isAuthorized) {
				throw new UnauthorizedError(`The caller is not an \`admin\` of all the groups the user belongs to: \`${JSON.stringify(existingUser.groups)}`);
			}
		}

		// retrieve existing and perform further security checks
		const existing = await this.get(securityContext, email);

		// merge the existing and to be updated
		const merged = this.mergeUtils.mergeResource(existing, updated as unknown) as User;

		const isChildGroup = this.isChildGroup(existing.groups, updated.defaultGroup);

		if (isChildGroup) {
			merged.defaultGroup = updated.defaultGroup;
		}

		merged.updatedAt = new Date(Date.now()).toISOString();
		merged.updatedBy = securityContext.email;
		delete merged['password'];

		// if password has changed, update cognito
		if (updated.password) {
			await this.cognito.send(
				new AdminSetUserPasswordCommand({
					UserPoolId: this.userPoolId,
					Username: email,
					Password: updated.password,
					Permanent: true,
				})
			);
		}

		// if default group has changed update
		if (updated.defaultGroup) {
			const isChildGroup = this.isChildGroup(existing.groups, updated.defaultGroup);
			if (isChildGroup) {
				merged.defaultGroup = updated.defaultGroup;
			}
		}

		// if state or tags has changed, sync cognito. and save
		if (updated.state || updated.tags) {
			if (updated.state === 'active') {
				const params: AdminEnableUserCommandInput = {
					UserPoolId: this.userPoolId,
					Username: email,
				};
				this.log.debug(`UserService> update> AdminEnableUserCommand params:${JSON.stringify(params)}`);
				await this.cognito.send(new AdminEnableUserCommand(params));
			} else {
				const params: AdminDisableUserCommandInput = {
					UserPoolId: this.userPoolId,
					Username: email,
				};
				this.log.debug(`UserService> update> AdminDisableUserCommand params:${JSON.stringify(params)}`);
				await this.cognito.send(new AdminDisableUserCommand(params));
			}

			// determine which tags are to add/delete
			const tagDiff = this.tagService.diff(existing.tags, updated.tags);

			await this.repository.update(merged, tagDiff.toAdd, tagDiff.toDelete);
		}

		this.log.debug(`UserService> update> exit> updated:${JSON.stringify(merged)}`);
		return merged;
	}

	public async list(securityContext: SecurityContext, options?: UserListOptions): Promise<[User[], UserListPaginationKey]> {
		this.log.debug(`UserService> list> options:${JSON.stringify(options)}`);

		// authz check: `reader` and above for the group in context
		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId], securityContext.groupRoles, atLeastReader, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not at least a \`reader\` of the group in context \`${JSON.stringify(securityContext.groupId)}`);
		}

		const [userIds, paginationKey] = await this.resourceService.listIds(securityContext.groupId, PkType.User, {
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

		let users = userIds ? await this.repository.listByIds(userIds) : [];

		this.log.debug(`UserService> list> exit:${JSON.stringify([users, paginationKey])}`);
		return [users, paginationKey];
	}

	public async get(securityContext: SecurityContext, email: string, enforceGroupAccessCheck = true): Promise<User> {
		this.log.debug(`UserService> get> in> email:${email}, enforceGroupAccessCheck:${enforceGroupAccessCheck}`);

		email = email.toLowerCase();

		// authz check: `reader` and above for the group in context
		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId], securityContext.groupRoles, atLeastReader, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not at least a \`reader\` of the group in context \`${JSON.stringify(securityContext.groupId)}`);
		}

		const user = await this.repository.get(email);
		if (user === undefined) {
			throw new NotFoundError(`User '${email}' not found.`);
		}

		// TODO: This is how the pre token generation lambda can bypass the group access check
		// We need a way to bypass this because the lambda will not have the right security context
		// It need to query the user details to figure out what its default security context
		if (securityContext.groupRoles['/'] && securityContext.groupRoles['/'] === SecurityScope.admin) {
			enforceGroupAccessCheck = false;
		}

		if (enforceGroupAccessCheck) {
			// verify user is permissible to group
			const isAllowed = this.authChecker.matchGroup(Object.keys(user.groups), securityContext.groupId);
			if (!isAllowed) {
				throw new UnauthorizedError(`The user is not part of this group.`);
			}
		}

		this.log.debug(`UserService> get> exit:${JSON.stringify(user)}`);
		return user;
	}

	public async grant(securityContext: SecurityContext, updated: NewUser): Promise<User> {
		this.log.debug(`UserService> grant> in> updated:${JSON.stringify(updated)}`);

		updated.email = updated.email.toLowerCase();

		// Authz check - Only `admin` of group in context may create new users.
		let isAuthorized = this.authChecker.isAuthorized([securityContext.groupId], securityContext.groupRoles, atLeastAdmin, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not an \`admin\` of the group in context \`${JSON.stringify(securityContext.groupId)}`);
		}

		// the group in context must be valid
		await this.groupService.get(securityContext, securityContext.groupId);

		if (updated.defaultGroup && updated.defaultGroup !== securityContext.groupId) await this.groupService.get(securityContext, updated.defaultGroup);

		// has user already been registered with the app?
		let existing: User = {
			email: updated.email,
		};
		let isNewUser = false;
		try {
			Object.assign(existing, await this.get(securityContext, updated.email, false));
		} catch (err) {
			if (err instanceof Error && err.name === 'NotFoundError') {
				isNewUser = true;
			} else {
				throw err;
			}
		}

		// Authz check - Only `admin` of current user's groups may create grant users.
		if (!isNewUser) {
			isAuthorized = this.authChecker.isAuthorized(Object.keys(existing.groups), securityContext.groupRoles, atLeastAdmin, 'any');
			if (!isAuthorized) {
				throw new UnauthorizedError(`The caller is not an \`admin\` of the users existing groups \`${JSON.stringify(Object.keys(existing.groups))}`);
			}
		}

		// has user been registered in cognito? If not, register
		try {
			const params1: AdminGetUserCommandInput = {
				UserPoolId: this.userPoolId,
				Username: updated.email,
			};
			this.log.debug(`UserService> grant> AdminGetUserCommandInput: ${JSON.stringify(params1)}`);
			const r = await this.cognito.send(new AdminGetUserCommand(params1));
			this.log.debug(`UserService> grant> AdminGetUserCommandOutput: ${JSON.stringify(r)}`);
			if (isNewUser) {
				this.log.warn(`UserService> grant> user ${updated.email} unexpectedly exists in Cognito!`);
			}
			if (existing.state === undefined) {
				// handle edge case where user may exist in cognito but not in app which would happen if someone reset access
				// management database but not cognito (such as during development or testing)
				switch (r.UserStatus) {
					case 'UNCONFIRMED':
						existing.state = 'invited';
						break;
					case 'CONFIRMED':
					case 'RESET_REQUIRED':
					case 'FORCE_CHANGE_PASSWORD':
						existing.state = 'active';
						break;
					case 'ARCHIVED':
					case 'UNKNOWN':
						existing.state = 'disabled';
						break;
				}
			}
		} catch (err) {
			if (err instanceof Error && err.name === 'UserNotFoundException') {
				this.log.debug(`UserService> grant> registering in Cognito`);
				try {
					const params2: AdminCreateUserCommandInput = {
						UserPoolId: this.userPoolId,
						Username: updated.email,
						TemporaryPassword: updated.password,
					};
					if (updated.password) {
						params2.MessageAction = MessageActionType.SUPPRESS;
					}
					this.log.debug(`UserService> grant> AdminCreateUserCommand: ${JSON.stringify(params2)}`);
					const r = await this.cognito.send(new AdminCreateUserCommand(params2));
					this.log.debug(`UserService> grant> AdminCreateUserCommandOutput: ${JSON.stringify(r)}`);
					existing.state = 'invited';
				} catch (err) {
					if (err instanceof Error && err.name === 'UsernameExistsException') {
						//silently ignore
						this.log.warn(`UserService> grant> user ${updated.email} UsernameExistsException`);
					} else {
						throw err;
					}
				}
			} else {
				this.log.error(`UserService> grant> AdminGetUserCommand err: ${err}`);
				throw err;
			}
		}

		// assign user to cognito group
		await this.groupService.grantUser(securityContext, updated.email, { role: updated.role });
		if (existing.groups === undefined) {
			existing.groups = {
				[securityContext.groupId]: updated.role,
			};

			const isChildGroup = this.isChildGroup(existing.groups, updated.defaultGroup);

			if (isChildGroup) {
				existing.defaultGroup = updated.defaultGroup;
			}

			existing.createdBy = securityContext.email;
			existing.createdAt = new Date(Date.now()).toISOString();
			await this.repository.create(existing);
			await this.eventPublisher.publishEvent({
				resourceType: 'user',
				eventType: 'created',
				id: updated.email,
				new: existing,
			});
		} else {
			// merge
			const merged = this.mergeUtils.mergeResource(existing, updated as unknown) as User;
			this.tagService.removeUnusedTags(merged.tags);
			merged.email = existing.email;
			delete merged['password'];
			delete merged['role'];

			merged.groups[securityContext.groupId] = updated.role;

			merged.updatedAt = securityContext.email;
			merged.updatedBy = new Date(Date.now()).toISOString();

			// determine which tags are to add/delete
			const tagDiff = this.tagService.diff(existing.tags, merged.tags);

			await this.repository.update(merged, tagDiff.toAdd, tagDiff.toDelete);

			await this.eventPublisher.publishEvent({
				resourceType: 'user',
				eventType: 'updated',
				id: existing.email,
				old: existing,
				new: merged,
			});
		}

		this.log.debug(`UserService> grant> exit:${JSON.stringify(existing)}`);
		return existing;
	}

	public async revoke(securityContext: SecurityContext, email: string): Promise<void> {
		this.log.debug(`UserService> revoke> in> email:${email}`);

		email = email.toLowerCase();

		// Authz check - Only `admin` may revoke users.
		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId], securityContext.groupRoles, atLeastAdmin, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not an \`admin\` of the group in context \`${JSON.stringify(securityContext.groupId)}`);
		}

		// get existing user (and performs security checks)
		const existing = await this.get(securityContext, email);

		// users may only be revoked from explicit granted groups (not inherited)
		const explicitlyGrantedGroup = Object.entries(existing.groups).find(([g, _r]) => g === securityContext.groupId);
		if ((explicitlyGrantedGroup?.length ?? 0) === 0) {
			throw new InvalidStateError(`User's may only be revoked from groups they have been explicitly granted.`);
		}

		// remove the user from the cognito group
		await this.groupService.revokeUser(securityContext, email);

		const updated = clone(existing);
		delete updated.groups[securityContext.groupId];

		// if the user has no more roles, delete
		if (Object.keys(updated.groups).length === 0) {
			// delete cognito
			try {
				await this.cognito.send(
					new AdminDeleteUserCommand({
						UserPoolId: this.userPoolId,
						Username: email,
					})
				);
			} catch (err) {
				if (err instanceof Error && err.name === 'UserNotFoundException') {
					//silently ignore
				} else {
					throw err;
				}
			}

			// delete from datastore
			await this.repository.delete(email);

			await this.eventPublisher.publishEvent({
				resourceType: 'user',
				eventType: 'deleted',
				id: email,
				old: existing,
			});
		} else {
			// save datastore
			updated.updatedBy = securityContext.email;
			updated.updatedAt = new Date(Date.now()).toISOString();
			await this.repository.update(updated, {}, updated.tags);

			await this.eventPublisher.publishEvent({
				resourceType: 'user',
				eventType: 'updated',
				id: email,
				old: existing,
				new: updated,
			});
		}

		this.log.debug(`UserService> revoke> exit:`);
	}

	private appendDelimiter(groupId: string): string {
		groupId = groupId.trim().toLowerCase();
		return groupId.endsWith('/') ? groupId : groupId + '/';
	}

	protected isChildGroup(groups: Groups, defaultGroup: string): boolean {
		this.log.debug(`UserService> isChildGroup> start groups:${JSON.stringify(groups)}, defaultGroup: ${defaultGroup}`);

		if (!defaultGroup || !groups) {
			return false;
		}

		for (let group in groups) {
			if (this.appendDelimiter(defaultGroup).startsWith(this.appendDelimiter(group))) {
				this.log.debug(`UserService> isChildGroup> exit`);
				return true;
			}
		}
		return false;
	}
}

export interface UserListOptions {
	count?: number;
	exclusiveStart?: UserListPaginationKey;
	tags?: Tags;
	includeChildGroups?: boolean;
	includeParentGroups?: boolean;
}

export interface UserListPaginationKey {
	paginationToken?: string;
}
