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
import { atLeastReader, GroupPermissions, SecurityContext } from '@sif/authz';
import { UnauthorizedError } from '@sif/resource-api-base';
import type { Pipeline, PipelineClient, LambdaRequestContext } from '@sif/clients';
import type { PipelineProcessorsService } from '../executions/service.js';
import type { PipelineExecution } from '../executions/schemas.js';
import type { QueryRequest, QueryResponse } from './models.js';
import type { ActivitiesRepository } from './repository.js';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import { getPipelineMetadata } from '../../utils/helper.utils.js';

dayjs.extend(utc);

export class ActivityService {
	private readonly log: BaseLogger;
	private readonly repo: ActivitiesRepository;
	private readonly authChecker: GroupPermissions;
	private readonly pipelineClient: PipelineClient;
	private readonly pipelineProcessorService: PipelineProcessorsService;

	public constructor(log: BaseLogger, repo: ActivitiesRepository, authChecker: GroupPermissions, pipelineClient, pipelineProcessorService) {
		this.log = log;
		this.repo = repo;
		this.authChecker = authChecker;
		this.pipelineClient = pipelineClient;
		this.pipelineProcessorService = pipelineProcessorService;
	}

	public async getActivities(sc: SecurityContext, req: QueryRequest): Promise<QueryResponse> {
		this.log.debug(`ActivityService> query> req: ${JSON.stringify(req)}`);

		const isAuthorized = this.authChecker.isAuthorized([sc.groupId], sc.groupRoles, atLeastReader, 'any');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not authorized of the group in context \`${JSON.stringify(sc.groupId)}`);
		}

		validateNotEmpty(req.groupId, 'groupId');
		validateHasSome([req.pipelineId, req.executionId], ['pipelineId', 'executionId']);

		// if the user is trying to get history, you can do that for a particular date
		if (req.showHistory) {
			validateNotEmpty(req.date, 'date');
		}

		const requestContext: LambdaRequestContext = {
			authorizer: {
				claims: {
					email: '',
					'cognito:groups': `${sc.groupId}|||reader`,
					groupContextId: sc.groupId,
				},
			},
		};

		// get the pipeline, so we can figure out what are its outputs
		let pipeline: Pipeline;
		if (req.executionId) {
			// if the filter is for executions, we have to retrieve the pipeline from the execution itself, then get the outputs for a pipeline
			// the version for pipeline is retrieved for from the execution itself
			const execution = await this.getPipelineExecution(req.executionId, sc);
			pipeline = await this.pipelineClient.get(execution.pipelineId, execution.pipelineVersion, requestContext);
			req.pipelineId = pipeline.id;

		} else if (req.pipelineId) {
			// if only the pipelineId filter is specified, then we will retrieve the metadata for the latest pipeline without providing the version
			pipeline = await this.pipelineClient.get(req.pipelineId, undefined, requestContext);
		}

		const pipelineMetadata = getPipelineMetadata(pipeline);
		this.log.debug(`ActivityService> query> pipelineMetadata: ${JSON.stringify(pipelineMetadata)}`);

		// we need to do a check if the showHistory Parameter is set to true, we then need to verify if the transformKeyMap has any keys.
		if (req.showHistory && !req.showAggregate && Object.keys(pipelineMetadata.transformKeyMap).length > 0) {
			// if it does, then we need to validate that user has specified the uniqueKeyAttributes
			validateNotEmpty(req.uniqueKeyAttributes, 'uniqueKeyAttributes');

			// this is done so no changes are required for downstream repository code.
			// we create a new query string parameter called 'uniqueKeyAttributes', this is a required parameter if showHistory=true param is specified
			// since the repository code can handle req.attributes and build out the filters, what we do here is set the req.attributes to equal to req.uniqueKeyAttribute.
			// The other options would be, use the same name "attributes" or change the repository layer code to reference `uniqueKeyAttributes` when building the query filters
			req.attributes = req.uniqueKeyAttributes;
		}

		const result = await this.repo.get(req, pipelineMetadata);

		this.log.info(`ActivityService> query> exit:`);
		return result;
	}

	private async getPipelineExecution(executionId: string, sc: SecurityContext): Promise<PipelineExecution> {
		this.log.debug(`ActivitiesRepository> getPipelineExecution executionId:${executionId}`);

		let execution = await this.pipelineProcessorService.get(sc, executionId);

		this.log.debug(`ActivitiesRepository> getPipelineExecution out> execution:${JSON.stringify(execution)}`);

		return execution;
	}
}
