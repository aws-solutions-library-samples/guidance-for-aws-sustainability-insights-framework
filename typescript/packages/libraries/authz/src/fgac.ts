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
import type { SecurityScope, GroupRoles } from './scopes.js';

export class GroupPermissions {
	private readonly log: FastifyBaseLogger;

	public constructor(log: FastifyBaseLogger) {
		this.log = log;
	}

	private appendDelimiter(groupId: string): string {
		groupId = groupId.trim().toLowerCase();
		return groupId.endsWith('/') ? groupId : groupId + '/';
	}

	public matchGroup(resourceGroupIds: string[], contextGroupId: string): boolean {
		this.log.debug(`GroupPermissions> matchGroup> resourceGroupIds:${JSON.stringify(resourceGroupIds)}, contextGroupId:${contextGroupId}`);
		const match = resourceGroupIds.find((g) => this.appendDelimiter(contextGroupId).startsWith(this.appendDelimiter(g)));
		const inUse = match !== undefined;
		this.log.debug(`GroupPermissions> matchGroup> exit>:${inUse}`);
		return inUse;
	}

	public isAuthorized(sourceGroups: string[], callerPermissions: GroupRoles, allowedRoles: SecurityScope[], mode: AuthorizationMode): boolean {
		this.log.debug(
			`GroupPermissions> isAuthorized> in> sourceGroups:${JSON.stringify(sourceGroups)}, callerPermissions:${JSON.stringify(
				callerPermissions
			)}, allowedRoles:${JSON.stringify(allowedRoles)}, mode:${mode}`
		);

		if ((sourceGroups?.length ?? 0) === 0) {
			// every source should have a related group. if we have none then something is wrong therefore assume not authorized
			this.log.debug(`GroupPermissions> isAuthorized> exit: no sourceGroups provided`);
			return false;
		}

		if (callerPermissions === undefined || Object.keys(callerPermissions).length === 0) {
			// every caller should have permissions. if we have none then something is wrong therefore assume not authorized
			this.log.debug(`GroupPermissions> isAuthorized> exit: no callerPermissions provided`);
			return false;
		}

		// sort the groups (desc) to aid with checking permissions of hierarchical groups ensuring that the role at the lowest level of a hierarchy takes precedence
		sourceGroups.sort((a, b) => (a > b ? -1 : 1));
		const callerGroups = Object.keys(callerPermissions);
		callerGroups.sort((a, b) => (a > b ? -1 : 1));

		// determined by the required role, check the callers permissions to see if we have a match with the source groups
		let isAuthorized = false;
		for (const sourceGroup of sourceGroups) {
			let matchingCallerGroup = undefined;
			for (const callerGroup of callerGroups) {
				if (this.appendDelimiter(sourceGroup).startsWith(this.appendDelimiter(callerGroup))) {
					matchingCallerGroup = callerGroup;
					break;
				}
			}
			if (matchingCallerGroup === undefined) {
				this.log.debug(`GroupPermissions> isAuthorized> exit: no matchingCallerGroup found`);
				return false;
			}

			const callerGroupRole = callerPermissions[matchingCallerGroup] as SecurityScope;
			isAuthorized = allowedRoles.includes(callerGroupRole);

			if (!isAuthorized) {
				// member of the groups, but insufficient role
				this.log.debug(`GroupPermissions> isAuthorized> exit: matched caller group but insufficient role (${callerGroupRole})`);
				return false;
			}

			if (mode === 'any') {
				// we only need one matching so we can stop checking the others
				break;
			}
		}
		this.log.debug(`GroupPermissions> isAuthorized> exit: isAuthorized:${isAuthorized}`);
		return isAuthorized;
	}
}

export type AuthorizationMode = 'any' | 'all';
