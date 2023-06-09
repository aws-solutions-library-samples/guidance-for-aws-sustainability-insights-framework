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
import type { BaseRepositoryClient } from '../../data/base.repository.js';
import type { TimeUnit, AffectedTimeRange, IMetricsRepository } from './models.js';
import type { Metric } from './schemas.js';
import dayjs from 'dayjs';
import { DATE_PART_TO_TIME_UNIT } from './models.js';

export class MetricsRepositoryV2 implements IMetricsRepository {
	private readonly log: BaseLogger;
	private readonly repoClient: BaseRepositoryClient;

	public constructor(log: BaseLogger, repoClient: BaseRepositoryClient) {
		this.log = log;
		this.repoClient = repoClient;
	}

	private assemble(row: any, timestampFields: string[]): Record<string, string> {
		this.log.trace(`MetricsRepositoryV2> assemble> in: row:${JSON.stringify(row)}, timestampFields:${JSON.stringify(timestampFields)}`);
		const metric = {};
		for (const key in row) {
			if (row.hasOwnProperty(key)) {
				// we only need to parse the date type to ISO string
				if (timestampFields.includes(key) && dayjs.utc(row[key]).isValid()) {
					metric[key] = dayjs.utc(row[key]).toISOString();
				} else {
					metric[key] = row[key];
				}
			}
		}
		this.log.trace(`MetricsRepositoryV2> assemble> out: ${JSON.stringify(metric)}`);
		return metric;
	}

	private async executeQuery(query: string): Promise<Record<string, string>[]> {
		this.log.debug(`MetricsRepositoryV2> executeQuery> in: query:${query}`);

		const dbConnection = await this.repoClient.getConnection();

		let result;
		try {
			result = await dbConnection.query(query);
		} catch (e) {
			this.log.error(e);
			throw e;
		} finally {
			await dbConnection.end();
		}

		if ((result?.rows?.length ?? 0) === 0) {
			this.log.debug(`MetricsRepositoryV2> executeQuery: undefined`);
			return [];
		}

		this.log.debug(`MetricsRepositoryV2> executeQuery> data:${JSON.stringify(result)}`);
		return result.rows;
	}

	public async listMetrics({ name, id }: { id: string, name: string }, groupId: string, timeUnit: TimeUnit, timeRange: AffectedTimeRange, members = false, version: number | string = 'latest'): Promise<Metric[]> {
		this.log.debug(`MetricsRepositoryV2> listMetrics> in: name:${name}, groupId:${groupId}, timeUnit:${timeUnit}, timeRange:${JSON.stringify(timeRange)}, version: ${version}`);

		const dateFromEpoch = dayjs(timeRange.from).unix();
		const dateToEpoch = dayjs(timeRange.to).unix();

		const immediateChildSearchPattern = groupId === '/' ? `^\/((?!\/).)+$` : `^${groupId.replaceAll('/', `\/`)}\/((?!\/).)+$`;
		const groupCondition = members ? `m."groupId" ~ '${immediateChildSearchPattern}'` : `m."groupId" = '${groupId}'`;

		const query =
`SELECT m.name,
		'${id}' as "metricId",
		m."groupId",
		m.date,
		'${timeUnit}' as "timeUnit",
		'${version}' as "version",
		ls."createdAt",
		ls."groupValue",
		extract('MONTH' FROM m.date) as "month",
		extract('YEAR' FROM m.date) as "year",
		date_part('doy', m."date") as "day",
		ls."subGroupsValue",
		(ls."groupValue" + ls."subGroupsValue") as "hierarchyValue"
FROM "Metric" m
			LEFT JOIN "MetricLatestValue" ls USING ("metricId")
WHERE 	${groupCondition}
AND 	m."timeUnit" = '${DATE_PART_TO_TIME_UNIT[timeUnit]}'
AND 	m."name" = '${name}'
AND 	"date" BETWEEN to_timestamp(${dateFromEpoch}) AND to_timestamp(${dateToEpoch})
GROUP BY m.name, m.name, m."groupId", m.date, ls."createdAt", ls."groupValue", ls."subGroupsValue", "month", "year", "day"
LIMIT 100 OFFSET 0 `;

		this.log.debug(`MetricsRepositoryV2> listMetrics> in: query: ${JSON.stringify(query)}`);
		const result = await this.executeQuery(query);
		this.log.debug(`MetricsRepositoryV2> listMetrics> in: result: ${JSON.stringify(result)}`);

		const data = result.map(row => this.assemble(row, Array.from(['date'])));
		return data as unknown as Metric[];
	}

	public async listCollectionMetrics({ name, id }: { id: string, name: string }, groupId: string, timeUnit: TimeUnit, timeRange: AffectedTimeRange, version: number | string = 'latest'): Promise<Metric[]> {
		this.log.info(`MetricsRepositoryV2> listCollectionMetrics> in: name:${name}, groupId:${groupId}, timeUnit:${timeUnit}, timeRange:${JSON.stringify(timeRange)}, version: ${version}`);
		return await this.listMetrics({ name, id }, groupId, timeUnit, timeRange, false, version);
	}

	public async listMembersMetrics({ name, id }: { id: string, name: string }, groupId: string, timeUnit: TimeUnit, timeRange: AffectedTimeRange, version: number | string = 'latest'): Promise<Metric[]> {
		this.log.info(`MetricsRepositoryV2> listMembersMetrics> in: metricId:${name}, groupId:${groupId}, timeUnit:${timeUnit}, timeRange:${JSON.stringify(timeRange)}, version: ${version}`);
		return await this.listMetrics({ name, id }, groupId, timeUnit, timeRange, true, version);
	}

}
