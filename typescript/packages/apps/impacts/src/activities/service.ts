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
import { atLeastAdmin, atLeastReader, GroupPermissions, SecurityContext, atLeastContributor } from '@sif/authz';
import { ulid } from 'ulid';
import type { ActivityListOptions, ActivityListPaginationKey, ActivityListVersionPaginationKey, ActivityListVersionsOptions, ActivityRepository } from './repository.js';
import type { EditActivity, Activity, NewActivity } from './schemas.js';
import type { ActivityValidator } from './validator.js';
import { AlternateIdInUseError, InvalidRequestError, NotFoundError, UnauthorizedError, GroupService, TagService, ResourceService, MergeUtils } from '@sif/resource-api-base';
import { PkType } from '../common/pkTypes.js';
import type { CommonUtils } from '../common/common.utils.js';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';

dayjs.extend(utc);

export class ActivityService {
	private readonly log: FastifyBaseLogger;
	private readonly authChecker: GroupPermissions;
	private readonly validator: ActivityValidator;
	private readonly repository: ActivityRepository;
	private readonly resourceService: ResourceService;
	private readonly groupService: GroupService;
	private readonly tagService: TagService;
	private readonly commonUtils: CommonUtils;
	private readonly mergeUtils: MergeUtils;

	public constructor(
		log: FastifyBaseLogger,
		authChecker: GroupPermissions,
		validator: ActivityValidator,
		repository: ActivityRepository,
		resourceService: ResourceService,
		groupService: GroupService,
		tagService: TagService,
		commonUtils: CommonUtils,
		mergeUtils: MergeUtils
	) {
		this.log = log;
		this.authChecker = authChecker;
		this.validator = validator;
		this.repository = repository;
		this.resourceService = resourceService;
		this.groupService = groupService;
		this.tagService = tagService;
		this.commonUtils = commonUtils;
		this.mergeUtils = mergeUtils;
	}

	public async create(securityContext: SecurityContext, activity: NewActivity): Promise<Activity> {
		this.log.debug(`ActivityService> create> activity:${JSON.stringify(activity)}`);

		// Authz check - Only `admin` and above may create new activities.
		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId], securityContext.groupRoles, atLeastContributor, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not an \`admin\` of the group in context \`${JSON.stringify(securityContext.groupId)}`);
		}

		if (activity.activeAt && !dayjs(activity.activeAt).isValid()) {
			throw new InvalidRequestError('Invalid Date specified double check if the date/time is in ISO8601 local time');
		}

		// Convert unique keys to lower case
		this.commonUtils.impactsToLowerCase(activity.impacts);

		// Validation - check name
		this.validator.validateName(activity.name);

		// Validation - ensure name is unique for the group
		if (await this.groupService.isAlternateIdInUse(activity.name, securityContext.groupId, PkType.Activity)) {
			throw new AlternateIdInUseError(activity.name);
		}

		// save
		const created: Activity = {
			id: ulid().toLowerCase(),
			name: activity.name,
			description: activity.description,
			attributes: activity.attributes,
			impacts: activity.impacts,
			version: 1,
			state: 'enabled',
			groups: [securityContext.groupId],
			tags: activity.tags,
			createdBy: securityContext.email,
			createdAt: new Date(Date.now()).toISOString(),
			activeAt: activity.activeAt ? dayjs.utc(activity.activeAt).toISOString() : undefined,
		};
		await this.repository.create(created);

		// async tag group processing
		await this.tagService.submitGroupSummariesProcess(securityContext.groupId, PkType.Activity, created.tags, {});

		this.log.debug(`ActivityService> create> exit:${JSON.stringify(created)}`);
		return created;
	}

	public async get(securityContext: SecurityContext, id: string, version?: number): Promise<Activity> {
		this.log.debug(`ActivityService> get> activity:${id}, version:${version}`);

		// Authz check - `reader` and above may get new activity.
		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId], securityContext.groupRoles, atLeastReader, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not at least a \`reader\` of the group in context \`${JSON.stringify(securityContext.groupId)}`);
		}

		const activity = await this.repository.get(id, version);

		if (activity === undefined) {
			throw new NotFoundError(`Activity '${id}' not found.`);
		}

		// verify activity is permissible to group
		const isAllowed = this.authChecker.matchGroup(activity.groups, securityContext.groupId);
		if (!isAllowed) {
			throw new UnauthorizedError(`The caller does not have access the group(s) that activity '${id}' is part of.`);
		}

		// override version state if a specific version was requested and latest has been disabled or frozen
		if (version !== undefined) {
			const latest = await this.repository.get(id);
			if (latest.state === 'disabled' || latest.state === 'frozen') {
				activity.state = latest.state;
			}
		}

		this.log.debug(`ActivityService> get> exit:${JSON.stringify(activity)}`);
		return activity;
	}

	public async update(securityContext: SecurityContext, id: string, toUpdate: EditActivity & { groups?: string[] }): Promise<Activity> {
		this.log.debug(`ActivityService> update> id:${id} updateRequest ${JSON.stringify(toUpdate)} `);

		// Authz check - `reader` and above may get new activity.
		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId], securityContext.groupRoles, atLeastContributor, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not at least a \`admin\` of the group in context \`${JSON.stringify(securityContext.groupId)}`);
		}

		if (toUpdate.activeAt && !dayjs(toUpdate.activeAt).isValid()) {
			throw new InvalidRequestError('Invalid Date specified double check if the date/time is in ISO8601 local time');
		}

		// retrieve
		const existing = await this.get(securityContext, id);

		// merge the existing and to be updated
		const merged = this.mergeUtils.mergeResource(existing, toUpdate) as Activity;
		merged.version++;
		merged.updatedAt = new Date(Date.now()).toISOString();
		merged.activeAt = toUpdate.activeAt ? dayjs.utc(toUpdate.activeAt).toISOString() : undefined;
		merged.updatedBy = securityContext.email;

		// determine which tags are to add/delete
		this.tagService.removeUnusedTags(merged.tags);
		const tagDiff = this.tagService.diff(existing.tags, merged.tags);

		// save
		await this.repository.update(merged, tagDiff.toAdd, tagDiff.toDelete);

		// async tag group processing
		await this.tagService.submitGroupSummariesProcess(securityContext.groupId, PkType.Activity, tagDiff.toAdd, tagDiff.toDelete);

		this.log.debug(`ActivityService> update> exit :${JSON.stringify(merged)}`);
		return merged;
	}

	public async list(securityContext: SecurityContext, options: ActivityListOptions): Promise<[Activity[], ActivityListPaginationKey]> {
		this.log.debug(`ActivityService> list> Start options: ${JSON.stringify(options)}`);

		// Authz check - `reader` and above may list activity versions
		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId], securityContext.groupRoles, atLeastReader, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not at least a \`reader\` of the group in context \`${JSON.stringify(securityContext.groupId)}`);
		}

		// retrieve
		const activities: Activity[] = [];
		let activityIds, paginationKey: ActivityListPaginationKey;

		if (options.name) {
			this.log.info(`ActivitiesService> list> searching by name : ${options.name}`);
			options.name = options.name.toLowerCase();
			activityIds = await this.resourceService.listIdsByAlternateId(securityContext.groupId, options.name, PkType.Activity, {
				includeParentGroups: options?.includeParentGroups,
				includeChildGroups: options?.includeChildGroups,
			});
		} else {
			this.log.info(`ActivitiesService> list> searching by group and tags : ${options.name}`);

			[activityIds, paginationKey] = await this.resourceService.listIds(securityContext.groupId, PkType.Activity, {
				tagFilter: options?.tags,
				pagination: {
					count: options?.count,
					from: {
						paginationToken: options?.exclusiveStart?.paginationToken,
					},
				},
				includeParentGroups: options?.includeParentGroups,
				includeChildGroups: options?.includeChildGroups,
			});
		}
		activities.push(...(await this.repository.listByIds(activityIds)));

		this.log.debug(`ActivityService> list> exit:${JSON.stringify([activities, paginationKey])}`);
		return [activities, paginationKey];
	}

	public async listVersions(securityContext: SecurityContext, id: string, options: ActivityListVersionsOptions): Promise<[Activity[], ActivityListVersionPaginationKey]> {
		this.log.debug(`ActivityService> listVersions> id:${id}`);

		// Authz check - `reader` and above may list activity versions
		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId], securityContext.groupRoles, atLeastReader, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not at least a \`reader\` of the group in context \`${JSON.stringify(securityContext.groupId)}`);
		}

		// retrieve the versions
		let activities: Activity[] = [];
		let paginationKey: ActivityListVersionPaginationKey = undefined;
		do {
			// retrieve a page of versions
			[activities, paginationKey] = await this.repository.listVersions(id, options);

			// as each version may have different groups applied, check group membership individually
			const versionsToRemove: number[] = [];
			for (let i = 0; i < activities.length; i++) {
				const version = activities[i];
				const isAllowed = this.authChecker.matchGroup(version.groups, securityContext.groupId);
				if (!isAllowed) {
					versionsToRemove.push(i);
				}
			}
			for (let i = versionsToRemove.length - 1; i >= 0; i--) {
				activities.splice(versionsToRemove[i], 1);
			}

			// once we have checked the version we may have ended up with less than the requested page of results. if so, retrieve the next page
		} while (paginationKey !== undefined && activities.length < options.count);

		this.log.debug(`ActivityService> listVersions> exit:${JSON.stringify([activities, paginationKey])}`);
		return [activities, paginationKey];
	}

	public async grant(securityContext: SecurityContext, id: string, groupId: string): Promise<void> {
		this.log.debug(`ActivityService> grant> id:${id}, groupId:${groupId}`);

		// Authz check - Only `admin` and above of both current and target groups may grant
		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId, groupId], securityContext.groupRoles, atLeastAdmin, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not an \`admin\` of either the group in context \`${JSON.stringify(securityContext.groupId)} or the target group \`${groupId}\`.`);
		}

		// retrieve existing activity (also verifying permissions)
		const existing = await this.get(securityContext, id);
		if (!existing) {
			throw new NotFoundError(`Activity '${id}' not found.`);
		}

		// grant
		await this.groupService.grant(
			{
				id: existing.id,
				alternateId: existing.name,
				keyPrefix: PkType.Activity,
			},
			{ id: groupId }
		);

		// update the main resource item
		existing.groups.push(groupId);
		await this.update(securityContext, id, existing);

		this.log.debug(`ActivityService> grant> exit:`);
	}

	public async revoke(securityContext: SecurityContext, id: string, groupId: string): Promise<void> {
		this.log.debug(`ActivityService> revoke> id:${id}, groupId:${groupId}`);

		// Authz check - Only `admin` and above of both current and target groups may grant
		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId, groupId], securityContext.groupRoles, atLeastAdmin, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not an \`admin\` of either the group in context \`${JSON.stringify(securityContext.groupId)} or the target group \`${groupId}\`.`);
		}

		// retrieve existing activity (also verifying permissions)
		const existing = await this.get(securityContext, id);
		if (!existing) {
			throw new NotFoundError(`Activity '${id}' not found.`);
		}

		// revoke
		await this.groupService.revoke(
			{
				id: existing.id,
				alternateId: existing.name,
				keyPrefix: PkType.Activity,
			},
			{ id: groupId }
		);

		// update the main resource item
		const index = existing.groups.indexOf(groupId);
		if (index > 0) {
			existing.groups.splice(index, 1);
			await this.update(securityContext, id, existing);
		}

		this.log.debug(`ActivityService> revoke> exit:`);
	}

	public async delete(securityContext: SecurityContext, activityId: string): Promise<void> {
		this.log.debug(`ActivityService> delete> impact activityID: ${activityId}`);

		// Authz check - `admin` and above may get delete activities
		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId], securityContext.groupRoles, atLeastAdmin, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not at least an \`admin\` of the group in context \`${JSON.stringify(securityContext.groupId)}`);
		}

		// retrieve and verify activity is permissible to group
		const existing = await this.get(securityContext, activityId);

		// save
		await this.repository.delete(activityId);

		// async tag group processing
		await this.tagService.submitGroupSummariesProcess(securityContext.groupId, PkType.Activity, {}, existing.tags);

		this.log.debug(`ActivityService> delete> exit:`);
	}
}
