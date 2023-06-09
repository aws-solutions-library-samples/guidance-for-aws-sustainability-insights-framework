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
import type { QueryRequest, IMetricsRepository } from './models.js';
import { validateHasSome, validateNotEmpty } from '@sif/validators';
import { atLeastReader, GroupPermissions, SecurityContext } from '@sif/authz';
import { NotFoundError, UnauthorizedError } from '@sif/resource-api-base';
import type { Metric } from './schemas.js';
import type { MetricClient, Metric as MetricResource } from '@sif/clients';

export class MetricsService {
	private readonly log: BaseLogger;
	private readonly repo: IMetricsRepository;
	private readonly authChecker: GroupPermissions;
	private readonly metricClient: MetricClient;

	public constructor(log: BaseLogger, repo: IMetricsRepository, authChecker: GroupPermissions, metricClient: MetricClient) {
		this.log = log;
		this.repo = repo;
		this.authChecker = authChecker;
		this.metricClient = metricClient;
	}

	public async query(sc: SecurityContext, req: QueryRequest): Promise<Metric[]> {
		this.log.info(`MetricsService> query> req: ${JSON.stringify(req)}`);

		const isAuthorized = this.authChecker.isAuthorized([sc.groupId], sc.groupRoles, atLeastReader, 'any');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not authorized of the group in context \`${JSON.stringify(sc.groupId)}`);
		}

		validateNotEmpty(req.groupId, 'groupId');
		validateNotEmpty(req.name, 'name');
		validateHasSome([req.dateFrom, req.dateTo], ['dateFrom', 'dateTo']);

		const metric:MetricResource = await this.metricClient.getByName(req.name, req.version, {
			authorizer: {
				claims: {
					email: '',
					'cognito:groups': `${sc.groupId}|||reader`,
					groupContextId: sc.groupId,
				},
			},
		});
		if (metric === undefined) {
			throw new NotFoundError(`Metric with name '${req.name}' not found`);
		}

		let result: Metric[];
		if (req.members) {
			result = await this.repo.listMembersMetrics(metric, req.groupId, req.timeUnit, { from: req.dateFrom, to: req.dateTo }, req.version);
		} else {
			result = await this.repo.listCollectionMetrics(metric, req.groupId, req.timeUnit, { from: req.dateFrom, to: req.dateTo }, req.version);
		}

		this.log.info(`MetricsService> query> exit:`);
		return result;
	}
}
