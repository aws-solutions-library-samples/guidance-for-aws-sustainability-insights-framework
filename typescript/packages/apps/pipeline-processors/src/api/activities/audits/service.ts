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
import type { ActivityAuditRepository } from './repository.js';
import type { ActivitiesRepository } from '../repository.js';
import pLimit from 'p-limit';
import type { ActivityReference } from '../models.js';
import { NotFoundError, UnauthorizedError } from '@sif/resource-api-base';
import type { QueryRequest } from './models.js';
import type { AuditList, AuditResource } from './schema.js';
import merge from "deepmerge";

export class ActivityAuditService {
	private readonly log: BaseLogger;
	private readonly s3Client: S3Client;
	private readonly artifactBucket: string;
	private readonly repository: ActivityAuditRepository;
	private readonly activityRepository: ActivitiesRepository;
	private readonly authChecker: GroupPermissions;
	private readonly taskParallelLimit: number;



	public constructor(log: BaseLogger, s3Client: S3Client, artifactBucket: string,repository:ActivityAuditRepository ,activityRepository: ActivitiesRepository, authChecker: GroupPermissions, taskParallelLimit) {
		this.log = log;
		this.s3Client = s3Client;
		this.artifactBucket = artifactBucket;
		this.repository = repository
		this.activityRepository = activityRepository;
		this.authChecker = authChecker;
		this.taskParallelLimit = taskParallelLimit;
	}

	public async listAudits(securityContext: SecurityContext, activityId: string, versionAsAt?: Date): Promise<AuditList[]> {
		this.log.debug(`ActivityAuditService> listAudits> activityId: ${activityId}, versionAsAt: ${versionAsAt}, securityContext: ${securityContext}`);

		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId], securityContext.groupRoles, atLeastReader, 'any');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not authorized of the group in context \`${JSON.stringify(securityContext.groupId)}`);
		}

		let activityReferenceList: ActivityReference[] = await this.activityRepository.listActivityReferences({ activityId, groupId: securityContext.groupId, versionAsAt });

		// if versionAsAt specified only return the audit closest to the date
		if (versionAsAt) {
			if (activityReferenceList.length > 0) {
				activityReferenceList = activityReferenceList.slice(0, 1);
			} else {
				throw new NotFoundError(`could not find any activity with id: ${activityId} and versionAsAt: ${versionAsAt}`);
			}
		}

		// merge the different audit versions
		const auditsV1 = await this.listAuditsV1(activityReferenceList);
		const auditsV0 = await this.listAuditsV0(activityReferenceList);

		// merge audit version 0  with other audit versions
		let auditList:AuditList[] = auditsV1;
		if(auditsV0.audits.length > 0 ){
			auditList = merge(auditsV1,[auditsV0]);
		}
		this.log.debug(`ActivityAuditService> listAudits> exit:`);
		return auditList;
	}

	// This function is for returning V0 audits that use S3 select instead of Athena
	private async listAuditsV0(activityReferenceList: ActivityReference[]): Promise<AuditList> {
		this.log.debug(`ActivityAuditService> listAuditsV0> in`);

		const limit = pLimit(this.taskParallelLimit);
			const listAuditFutures = activityReferenceList.map((o) => {
				return limit(async () => {
					if( !o?.auditVersion || o?.auditVersion === 0 ){
					const command: GetObjectCommand = new GetObjectCommand({
						Bucket: this.artifactBucket,
						Key: `pipelines/${o.pipelineId}/executions/${o.executionId}/audits/${o.auditId}.json`
					});
					const response = await this.s3Client.send(command);
					const result = JSON.parse(await response.Body.transformToString());
					const audit:AuditResource= {
						pipelineId: result.pipeline_id.toString(),
						executionId: result.execution_id.toString(),
						auditId: result.auditid.toString(),
						inputs:result.input,
						outputs: result.output
					}
					return audit;
				} else{
					return null;
				}
				});
			});
			const audits = await Promise.all(listAuditFutures);
			const filteredAudits = audits.filter(function(element){
				return element != null;
			})
			const response:AuditList = { audits:filteredAudits};

			this.log.debug(`ActivityAuditService> listAuditsV0> exit`);
			return response;

	}

	// This function is for returning V1+ audits that use Athena instead of s3Select
	private async listAuditsV1(activityReferenceList: ActivityReference[]): Promise<AuditList[]> {
		this.log.debug(`ActivityAuditService> listAuditsV1> in ${JSON.stringify(activityReferenceList)}`);
		let auditRequest:QueryRequest={};

		/*
		 * There may be multiple versions of audits logs that we will need to query for
		 * these queries will be executed against Athena in parallel
        */
		activityReferenceList.map((o) => {

			let pipelineIds:string[] = [];
			let executionIds:string[] = [];
			let auditIds:string[] = [];

			// Choose the Athena query path
			if (auditRequest?.[o.auditVersion] && o.auditVersion > 0 ){
				pipelineIds  = auditRequest[o.auditVersion].pipelineIds;
				executionIds = auditRequest[o.auditVersion].executionIds;
				auditIds = auditRequest[o.auditVersion].auditIds;
			}

			pipelineIds.push(o.pipelineId);
			executionIds.push(o.executionId);
			auditIds.push(o.auditId);

			auditRequest[o.auditVersion] = {
				pipelineIds: [...new Set(pipelineIds)],
				executionIds: [...new Set(executionIds)],
				auditIds: [...new Set(auditIds)]
			};

		});

		const limit = pLimit(this.taskParallelLimit);
		let promises:Promise<AuditList>[] = [];
		this.log.debug(`ActivityAuditService> listAuditsV1> auditRequest:${JSON.stringify(auditRequest)}`);
		 for(const version in auditRequest) {
			promises.push(
			limit(async () => {
				const result:AuditList = await this.repository.list(Number(version),auditRequest);
				return result;
			}));
		};

		const auditLists:AuditList[] = await Promise.all(promises);
		this.log.debug(`ActivityAuditService> listAuditsV1> exit`);
		return auditLists;
	}

}
