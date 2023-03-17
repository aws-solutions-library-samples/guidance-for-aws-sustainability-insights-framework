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

import { NotFoundError, UnauthorizedError } from '@sif/resource-api-base';
import type { EditImpact, Impact, NewImpact } from './schemas.js';
import type { ActivityService } from '../activities/service.js';
import type { ImpactValidator } from './validator.js';
import { merge } from 'merge-anything';
import type { CommonUtils } from '../common/common.utils.js';

export class ImpactService {
	private readonly log: FastifyBaseLogger;
	private readonly authChecker: GroupPermissions;
	private readonly validator: ImpactValidator;
	private readonly activityService: ActivityService;
	private readonly commonUtils: CommonUtils;

	public constructor(
		log: FastifyBaseLogger,
		authChecker: GroupPermissions,
		validator: ImpactValidator,
		activityService: ActivityService,
		commonUtils: CommonUtils
	) {
		this.log = log;
		this.authChecker = authChecker;
		this.validator = validator;
		this.activityService = activityService;
		this.commonUtils = commonUtils;
	}

	public async create(securityContext: SecurityContext, activityId: string, impactName: string, impact: NewImpact): Promise<Impact> {
		this.log.debug(`ImpactService> create> activityId:${activityId} impact name: ${impactName}, impact:${JSON.stringify(impact)}`);

		// Authz check - Only `admin` and above may create new impacts
		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId], securityContext.groupRoles, atLeastContributor, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not an \`admin\` of the group in context \`${JSON.stringify(securityContext.groupId)}`);
		}

		// Validation - check name
		impactName = impactName.toLowerCase();
		this.commonUtils.impactToLowerCase(impact);
		this.validator.validateName(impactName);

		// retrieve existing activity
		// const activity = await this.activityService.get(securityContext, activityId, undefined, { impactsOnly: true });
		const activity = await this.activityService.get(securityContext, activityId);

		// save
		const newImpact: Impact = {
			name: impactName,
			...impact,
		};

		// merge the existing and to be updated
		if (activity.impacts === undefined) {
			activity.impacts = {};
		}
		activity.impacts[impactName] = newImpact;

		// save
		await this.activityService.update(securityContext, activityId, activity);

		this.log.debug(`ImpactService> create> exit:${JSON.stringify(newImpact)}`);
		return newImpact;
	}

	public async get(securityContext: SecurityContext, activityId: string, impactName: string): Promise<Impact> {
		this.log.debug(`ImpactService> get> impact activityID: ${activityId} name: ${impactName}`);

		impactName = impactName.toLowerCase();

		// Authz check - `reader` and above may get new activity.
		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId], securityContext.groupRoles, atLeastReader, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not at least a \`reader\` of the group in context \`${JSON.stringify(securityContext.groupId)}`);
		}

		// retrieve and verify activity is permissible to group
		const activity = await this.activityService.get(securityContext, activityId);

		// retrieve impact
		const impact = activity.impacts?.[impactName];
		if (impact === undefined) {
			throw new NotFoundError(`Impact '${impactName}' of activity '${activityId}' not found.`);
		}

		this.log.debug(`ImpactService> get> exit: ${JSON.stringify(impact)}`);
		return impact;
	}

	public async update(securityContext: SecurityContext, activityId: string, impactName: string, updateRequest: EditImpact): Promise<Impact> {
		this.log.debug(`ImpactService> update> activityId:${activityId} name: ${impactName} updateRequest ${JSON.stringify(updateRequest)} `);

		impactName = impactName.toLowerCase();

		// Authz check - `admin` and above may get update components
		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId], securityContext.groupRoles, atLeastContributor, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not at least an \`admin\` of the group in context \`${JSON.stringify(securityContext.groupId)}`);
		}

		// retrieve and verify activity is permissible to group
		const activity = await this.activityService.get(securityContext, activityId);

		// get existing impact
		const impact = activity.impacts?.[impactName];
		if (impact === undefined) {
			throw new NotFoundError(`Impact '${impactName}' of activity '${activityId}' not found.`);
		}

		// merge the impact into the activity
		const merged = merge(impact, updateRequest) as Impact;
		activity.impacts[impactName] = merged;

		// save
		await this.activityService.update(securityContext, activityId, activity);

		this.log.debug(`ImpactService> update> exit:${JSON.stringify(merged)}`);
		return merged;
	}

	public async list(securityContext: SecurityContext, activityId: string): Promise<Record<string, Impact>> {
		this.log.debug(`ImpactService> list> activityId : ${activityId}`);

		// Authz check - `reader` and above may list activity versions
		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId], securityContext.groupRoles, atLeastReader, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not at least a \`reader\` of the group in context \`${JSON.stringify(securityContext.groupId)}`);
		}

		// retrieve and verify activity is permissible to group
		const activity = await this.activityService.get(securityContext, activityId);

		this.log.debug(`ImpactService> list> exit:${JSON.stringify(activity.impacts)}`);
		return activity.impacts;
	}

	public async delete(securityContext: SecurityContext, activityId: string, impactName: string): Promise<void> {
		this.log.debug(`ImpactService> delete> impact activityID: ${activityId}, impactName: ${impactName}`);

		impactName = impactName.toLowerCase();

		// Authz check - `admin` and above may get delete components
		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId], securityContext.groupRoles, atLeastAdmin, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not at least an \`admin\` of the group in context \`${JSON.stringify(securityContext.groupId)}`);
		}

		// retrieve and verify activity is permissible to group
		const activity = await this.activityService.get(securityContext, activityId);

		// check impact exists
		if (activity.impacts?.[impactName] === undefined) {
			throw new NotFoundError(`Impact '${impactName}' of activity '${activityId}' not found.`);
		}

		// remove the impact
		delete activity.impacts[impactName];

		// save
		await this.activityService.update(securityContext, activityId, activity);

		this.log.debug(`ImpactService> delete> exit:`);
	}
}
