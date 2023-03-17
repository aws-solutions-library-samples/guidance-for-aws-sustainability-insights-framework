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
import type { Component, EditComponent, NewComponent } from './schemas.js';
import type { ActivityService } from '../activities/service.js';
import type { ComponentValidator } from './validator.js';
import { merge } from 'merge-anything';
export class ComponentService {
	private readonly log: FastifyBaseLogger;
	private readonly authChecker: GroupPermissions;
	private readonly validator: ComponentValidator;
	private readonly activityService: ActivityService;

	public constructor(log: FastifyBaseLogger, authChecker: GroupPermissions, validator: ComponentValidator, activityService: ActivityService) {
		this.log = log;
		this.authChecker = authChecker;
		this.validator = validator;
		this.activityService = activityService;
	}

	public async create(securityContext: SecurityContext, activityId: string, impactName: string, component: NewComponent): Promise<Component> {
		this.log.debug(`ComponentService> create> in> activityId:${activityId} impactName: ${impactName}, component:${JSON.stringify(component)}`);

		impactName = impactName.toLowerCase();

		// Authz check - Only `admin` and above may create new components.
		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId], securityContext.groupRoles, atLeastContributor, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not an \`admin\` of the group in context \`${JSON.stringify(securityContext.groupId)}`);
		}

		// Validation - check key
		this.validator.validateKey(component.key);

		// retrieve existing activity
		const activity = await this.activityService.get(securityContext, activityId);
		if (activity?.impacts?.[impactName] === undefined) {
			throw new NotFoundError(`Impact '${impactName}' of activity '${activityId}' not found.`);
		}

		// merge the existing and to be updated
		if (activity.impacts[impactName].components === undefined) {
			activity.impacts[impactName].components = {};
		}
		activity.impacts[impactName].components[component.key.toLowerCase()] = component;

		// save
		await this.activityService.update(securityContext, activityId, activity);

		this.log.debug(`ComponentService> create> exit:${JSON.stringify(component)}`);
		return component;
	}

	public async get(securityContext: SecurityContext, activityId: string, impactName: string, componentKey: string): Promise<Component> {
		this.log.debug(`ComponentService> get> impact activityID: ${activityId}, impactName: ${impactName}, componentKey: ${componentKey}`);

		componentKey = componentKey.toLowerCase();
		impactName = impactName.toLowerCase();

		// Authz check - `reader` and above may get new activity.
		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId], securityContext.groupRoles, atLeastReader, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not at least a \`reader\` of the group in context \`${JSON.stringify(securityContext.groupId)}`);
		}

		// retrieve and verify activity is permissible to group
		const activity = await this.activityService.get(securityContext, activityId);

		// retrieve component
		const component = activity.impacts?.[impactName]?.components?.[componentKey];
		if (component === undefined) {
			throw new NotFoundError(`Component '${componentKey}' of impact '${impactName}', activity '${activityId}', not found.`);
		}

		this.log.debug(`ComponentService> get> exit:${JSON.stringify(component)}`);
		return component;
	}

	public async update(
		securityContext: SecurityContext,
		activityId: string,
		impactName: string,
		componentKey: string,
		updateRequest: EditComponent
	): Promise<Component> {
		this.log.debug(
			`ComponentService> update> activityId:${activityId}, impactName: ${impactName}, componentKey:${componentKey} updateRequest ${JSON.stringify(
				updateRequest
			)} `
		);

		componentKey = componentKey.toLowerCase();
		impactName = impactName.toLowerCase();

		// Authz check - `admin` and above may get update components
		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId], securityContext.groupRoles, atLeastContributor, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not at least an \`admin\` of the group in context \`${JSON.stringify(securityContext.groupId)}`);
		}

		// retrieve and verify activity is permissible to group
		const activity = await this.activityService.get(securityContext, activityId);

		// get existing component
		const component = activity.impacts?.[impactName]?.components?.[componentKey];
		if (component === undefined) {
			throw new NotFoundError(`Component '${componentKey}' of impact '${impactName}', activity '${activityId}', not found.`);
		}

		// merge the component into the activity
		const merged = merge(component, updateRequest) as Component;
		activity.impacts[impactName].components[componentKey] = merged;

		// save
		await this.activityService.update(securityContext, activityId, activity);

		this.log.debug(`ComponentService> update> exit:${JSON.stringify(merged)}`);
		return merged;
	}

	public async list(securityContext: SecurityContext, activityId: string, impactName: string): Promise<Record<string, Component>> {
		this.log.debug(`ComponentService> list> activityId : ${activityId}, impactName:${impactName}`);

		impactName = impactName.toLowerCase();

		// Authz check - `reader` and above may list activity versions
		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId], securityContext.groupRoles, atLeastReader, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not at least a \`reader\` of the group in context \`${JSON.stringify(securityContext.groupId)}`);
		}

		// retrieve and verify activity is permissible to group
		const activity = await this.activityService.get(securityContext, activityId, undefined);

		// verify impact exists
		const impact = activity.impacts?.[impactName];
		if (impact === undefined) {
			throw new NotFoundError(`Impact '${impactName}' of activity '${activityId}' not found.`);
		}

		this.log.debug(`ImpactService> list> exit:${JSON.stringify(impact.components)}`);
		return impact.components;
	}

	public async delete(securityContext: SecurityContext, activityId: string, impactName: string, componentKey: string): Promise<void> {
		this.log.debug(`ComponentService> delete> impact activityID: ${activityId}, impactName: ${impactName}, componentKey: ${componentKey}`);

		componentKey = componentKey.toLowerCase();
		impactName = impactName.toLowerCase();

		// Authz check - `admin` and above may get delete components
		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId], securityContext.groupRoles, atLeastAdmin, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not at least an \`admin\` of the group in context \`${JSON.stringify(securityContext.groupId)}`);
		}

		// retrieve and verify activity is permissible to group
		const activity = await this.activityService.get(securityContext, activityId, undefined);

		// check component exists
		if (activity.impacts?.[impactName]?.components?.[componentKey] === undefined) {
			throw new NotFoundError(`Component '${componentKey}' of Impact '${impactName}', activity '${activityId}', not found.`);
		}

		// remove the component
		delete activity.impacts[impactName].components[componentKey];

		// save
		await this.activityService.update(securityContext, activityId, activity);

		this.log.debug(`ComponentService> delete> exit:`);
	}
}
