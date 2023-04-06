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
import { validateHasSome, validateNotEmpty } from '@sif/validators';
import { atLeastReader, convertGroupRolesToCognitoGroups, GroupPermissions, SecurityContext } from '@sif/authz';
import { UnauthorizedError } from '@sif/resource-api-base';
import type { ActivityClient,ActivityResource, ActivityQS } from '@sif/clients';

export class ActivityService {
	private readonly log: BaseLogger;
	private readonly authChecker: GroupPermissions;
	private readonly activityClient: ActivityClient;

	public constructor(log: BaseLogger, authChecker: GroupPermissions, activityClient: ActivityClient) {
		this.log = log;
		this.authChecker = authChecker;
		this.activityClient = activityClient;
	}

	public async list(sc: SecurityContext, req: ActivityQS): Promise<ActivityResource[]> {
		this.log.info(`Connectors> SIF> pipeline-processor> activity> list> req: ${JSON.stringify(req)}, sc: ${JSON.stringify(sc)}`);

		const isAuthorized = this.authChecker.isAuthorized([sc.groupId], sc.groupRoles, atLeastReader, 'any');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not authorized of the group in context \`${JSON.stringify(sc.groupId)}`);
		}

		validateNotEmpty(req.groupId, 'groupId');
		validateHasSome([req.pipelineId, req.executionId], ['pipelineId', 'executionId']);


		// Get the activities from the client
		let hasMore = true;
		let lastEvaluatedToken = 0;
		let result:ActivityResource[] = [];

		do {
			req.fromToken = lastEvaluatedToken.toString();
			const {activities, pagination} = await this.activityClient.listActivities(req, {
				authorizer: {
					claims: {
						email: sc.email,
						'cognito:groups': convertGroupRolesToCognitoGroups(sc.groupRoles),
						groupContextId: sc.groupId,
					},
				},
			});

			result.push(...activities);

			if (activities.length < Number(req.count)){
				hasMore = false;
			}

			if (pagination?.lastEvaluatedToken){
				lastEvaluatedToken = pagination.lastEvaluatedToken;
			}

		} while (hasMore);

		this.log.info(`Connectors> SIF> pipeline-processor> activity> list> exit}`);
		return result;
	}

}
