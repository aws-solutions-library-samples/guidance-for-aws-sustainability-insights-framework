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
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { SecurityContext, atLeastReader, GroupPermissions } from '@sif/authz';
import type { ActivitiesRepository } from '../repository.js';
import pLimit from 'p-limit';
import type { ActivityReference } from '../models.js';
import { NotFoundError, UnauthorizedError } from '@sif/resource-api-base';

export class ActivityAuditService {
	private readonly log: BaseLogger;
	private readonly s3Client: S3Client;
	private readonly artifactBucket: string;
	private readonly repository: ActivitiesRepository;
	private readonly authChecker: GroupPermissions;
	private readonly taskParallelLimit: number;

	public constructor(log: BaseLogger, s3Client: S3Client, artifactBucket: string, repository: ActivitiesRepository, authChecker: GroupPermissions, taskParalelLLimit) {
		this.log = log;
		this.s3Client = s3Client;
		this.artifactBucket = artifactBucket;
		this.repository = repository;
		this.authChecker = authChecker;
		this.taskParallelLimit = taskParalelLLimit;
	}

	public async listAudits(securityContext: SecurityContext, activityId: string, versionAsAt?: Date): Promise<any> {
		this.log.debug(`ActivityAuditService> listAudits> activityId: ${activityId}, versionAsAt: ${versionAsAt}, securityContext: ${securityContext}`);

		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId], securityContext.groupRoles, atLeastReader, 'any');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not authorized of the group in context \`${JSON.stringify(securityContext.groupId)}`);
		}

		let activityReferenceList: ActivityReference[] = await this.repository.listActivityReferences({ activityId, groupId: securityContext.groupId, versionAsAt });

		// if versionAsAt specified only return the audit closest to the date
		if (versionAsAt) {
			if (activityReferenceList.length > 0) {
				activityReferenceList = activityReferenceList.slice(0, 1);
			} else {
				throw new NotFoundError(`could not find any activity with id: ${activityId} and versionAsAt: ${versionAsAt}`);
			}
		}

		const limit = pLimit(this.taskParallelLimit);
		const listAuditFutures = activityReferenceList.map((o) => {
			return limit(async () => {
				const command: GetObjectCommand = new GetObjectCommand({
					Bucket: this.artifactBucket,
					Key: `pipelines/${o.pipelineId}/executions/${o.executionId}/audits/${o.auditId}.json`
				});
				const response = await this.s3Client.send(command);
				const audit = JSON.parse(await response.Body.transformToString());
				return {
					...o,
					...audit
				};
			});
		});
		const audits = await Promise.all(listAuditFutures);

		this.log.debug(`ActivityAuditService> listAudits> exit:`);
		return audits;
	}
}
