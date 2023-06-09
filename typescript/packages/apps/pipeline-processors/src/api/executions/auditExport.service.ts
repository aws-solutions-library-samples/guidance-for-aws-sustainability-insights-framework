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

import { GroupPermissions, SecurityContext, atLeastReader } from '@sif/authz';
import { UnauthorizedError } from '@sif/resource-api-base';
import type { FastifyBaseLogger } from 'fastify';
import type { PipelineExecutionUtils } from './utils.js';
import type { PipelineProcessorsService } from './service.js';
import type { AuditExportUtil } from '../../utils/auditExport.util';

export class ExecutionAuditExportService {
	private readonly log: FastifyBaseLogger;
	private readonly authChecker: GroupPermissions;
	private readonly utils: PipelineExecutionUtils;
	private readonly pipelineProcessorsService: PipelineProcessorsService;
	private readonly exportUtility: AuditExportUtil;

	public constructor(
		log: FastifyBaseLogger,
		authChecker: GroupPermissions,
		utils: PipelineExecutionUtils,
		pipelineProcessorsService: PipelineProcessorsService,
		exportUtility: AuditExportUtil
	) {
		this.log = log;
		this.authChecker = authChecker;
		this.utils = utils;
		this.pipelineProcessorsService = pipelineProcessorsService;
		this.exportUtility = exportUtility;
	}


	public async createAuditExportUrl(sc: SecurityContext, pipelineId: string, executionId: string): Promise<{url?: string, state?: 'inProgress' | 'success'}> {
		this.log.info(`ExecutionAuditExportService> export> pipelineId: ${pipelineId}, executionId: ${executionId}`);

		// authorization role check
		const isAuthorized = this.authChecker.isAuthorized([sc.groupId], sc.groupRoles, atLeastReader, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not a \`reader\` of the group in context \`${JSON.stringify(sc.groupId)}`);
		}

		// ensure execution exists
		const execution = await this.pipelineProcessorsService.get(sc, pipelineId, executionId);

		if(!execution) {
			throw new Error('Not Found')
		}

		// ensure user has access to the pipeline execution
		this.utils.validatePipelineExecutionAccess([execution.groupContextId], sc.groupId, executionId);

		// check to see if an export archive has already been previously generated
		const auditExportFileKey = await this.exportUtility.getAuditExportFileKey(pipelineId, executionId);
		let archiveUrl;
		if(auditExportFileKey) {
			// if one exists, return 200 with presigned url
			archiveUrl = await this.exportUtility.generateExportUrl(auditExportFileKey);
		}

		// if not, see if lock file exists which means one is in progress
		if(!auditExportFileKey) {
			const lockFileExists = await this.exportUtility.lockFileExists(pipelineId, executionId);
			// if lock file does exist, return 204
			if(lockFileExists) {
				return {
					state: 'inProgress'
				}
			}

			if(!lockFileExists) {
				// if no lock file then async publish to sqs where a listener (in this same project) will receive, build the athena query, execute, then store metadata file linking containing athena filename. but in meantime return a 204
				await this.exportUtility.publishAuditGenerationRequest(sc, pipelineId, executionId);
				return {
					state: 'inProgress'
				}
			}
		}
		this.log.info(`ExecutionAuditExportService> export> url: ${archiveUrl}`);
		return {
			url: archiveUrl
		}

	}

}

