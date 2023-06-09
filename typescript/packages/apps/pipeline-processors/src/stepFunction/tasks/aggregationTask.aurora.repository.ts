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
import type { AffectedTimeRange } from '../../api/metrics/models';
import { validateNotEmpty } from '@sif/validators';
import type { BaseRepositoryClient } from '../../data/base.repository.js';
import type { Client } from 'pg';
import type { AggregationResult } from './model.js';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';

dayjs.extend(utc);


export class AggregationTaskAuroraRepository {
	private readonly log: BaseLogger;
	private readonly baseRepositoryClient: BaseRepositoryClient;

	constructor(log: BaseLogger, repositoryClient: BaseRepositoryClient) {
		this.log = log;
		this.baseRepositoryClient = repositoryClient;
	}

	public async aggregatePipelineOutput(
		groupId: string,
		pipelines: {
			pipelineId: string;
			output: string;
		}[],
		timeRange: AffectedTimeRange
	): Promise<AggregationResult[]> {
		this.log.info(`AggregationTaskAuroraRepository> aggregatePipelineOutput> in: groupId:${groupId}, pipelines:${JSON.stringify(pipelines)}, timeRange: ${JSON.stringify(timeRange)}`);

		validateNotEmpty(groupId, 'groupId');
		validateNotEmpty(pipelines, 'pipelines');
		validateNotEmpty(timeRange.from, 'timeRange.from');
		validateNotEmpty(timeRange.to, 'timeRange.to');

		for (const p of pipelines) {
			validateNotEmpty(p.pipelineId, 'pipeline pipelineId');
			validateNotEmpty(p.output, 'pipeline output');
		}


		const query = `
SELECT 	date(a."date") as date, sum (ln."val") as value
FROM	 "Activity" a JOIN "ActivityNumberLatestValue" ln USING ("activityId")
WHERE 	a."type" = 'raw'
 AND	a."groupId" = '${groupId}'
 AND 	(
		${pipelines.map((p) => ` a."pipelineId" = '${p.pipelineId}' AND ln."name" = '${p.output}' `).join('OR')}
	)
 AND 	date(a.date) >= timestamp '${dayjs.utc(timeRange.from).format('YYYY-MM-DD')}'
 AND 	date(a.date) <= timestamp '${dayjs.utc(timeRange.to).format('YYYY-MM-DD')}'
GROUP BY date(a.date)`;

		this.log.info(`AggregationTaskAuroraRepository> aggregatePipelineOutput> query: ${query}`);

		let aggregates: AggregationResult[] = [];
		const dbConnection = await this.baseRepositoryClient.getConnection();

		let queryResponse;
		try {
			queryResponse = await dbConnection.query(query);
		} catch (e) {
			this.log.error(e);
			throw e;
		} finally {
			await dbConnection.end();
		}

		for (const row of queryResponse.rows) {
			const value = parseFloat(row['value']);
			aggregates.push({
				date: row['date'],
				groupValue: isNaN(value) ? 0 : value,
			});
		}

		this.log.info(`AggregationTaskAuroraRepository> aggregatePipelineOutput> exit: ${JSON.stringify(aggregates)}`);
		return aggregates;
	}

	public async getAffectedTimeRange(pipelineId: string, executionId: string): Promise<AffectedTimeRange> {
		this.log.info(`AggregationTaskAuroraRepository> getAffectedTimeRange> in: pipelineId:${pipelineId}, executionId:${executionId}`);

		validateNotEmpty(pipelineId, 'pipelineId');
		validateNotEmpty(executionId, 'executionId');

		// min and max are based on the latest pipeline execution based on the max(createdAt) condition
		// we need to set the "to" to end of day to cover all activities for aggregation
		const query = `
SELECT date_trunc('day', date(min(a.date)))::timestamp with time zone as "from",
       (date_trunc('day', max(a.date)) + interval '1 day' - interval '1 second')::timestamp with time zone as "to"
FROM "Activity" a
         LEFT JOIN "ActivityNumberValue" n
                   on a."activityId" = n."activityId" and n."executionId" = '${executionId}'
         LEFT JOIN "ActivityBooleanValue" b
                   on a."activityId" = b."activityId" and b."executionId" = '${executionId}'
         LEFT JOIN "ActivityStringValue" s
                   on a."activityId" = s."activityId" and s."executionId" = '${executionId}'
         LEFT JOIN "ActivityDateTimeValue" d
                   on a."activityId" = d."activityId" and d."executionId" = '${executionId}'
WHERE a."type" = 'raw';`;

		this.log.trace(`AggregationTaskAuroraRepository> getAffectedTimeRange> query:${query}`);

		const dbConnection: Client = await this.baseRepositoryClient.getConnection();

		let result;
		try {
			result = await dbConnection.query(query);
		} catch (e) {
			this.log.error(e);
			throw e;
		} finally {
			await dbConnection.end();
		}

		this.log.trace(`AggregationTaskAuroraRepository> getAffectedTimeRange> timeRangeResult:${JSON.stringify(result)}`);

		if ((result?.rows?.length ?? 0) === 0) {
			// TODO: custom error
			throw new Error(`No existing data found for pipeline '${pipelineId}', execution '${executionId}.`);
		}

		const response: AffectedTimeRange = { from: dayjs.utc(result.rows[0].from).toDate(), to: dayjs.utc(result.rows[0].to).toDate() };

		this.log.info(`AggregationTaskAuroraRepository> getAffectedTimeRange> exit: ${JSON.stringify(response)}`);
		return response;
	}
}
