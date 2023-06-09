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
import dayjs from 'dayjs';
import type { InputPipeline } from '@sif/clients';
import { TIME_UNIT_TO_DATE_PART, TimeUnitAbbreviation } from '../../api/metrics/models.js';

export class MetricAggregationRepository {
	private readonly log: BaseLogger;
	private readonly repoClient: BaseRepositoryClient;

	public constructor(log: BaseLogger, repoClient: BaseRepositoryClient) {
		this.log = log;
		this.repoClient = repoClient;
	}

	private buildGetMetricIdFragment(metricName: string, groupId: string, dateFromEpoch: number, dateToEpoch: number, timeUnit: TimeUnitAbbreviation): string {
		this.log.debug(`MetricAggregationRepository > buildGetMetricIdFragment > metricName: ${metricName}, groupId: ${groupId}, dateFromEpoch: ${dateFromEpoch}, dateToEpoch: ${dateToEpoch}, timeUnit: ${timeUnit}`);
		const query = `
			SELECT "metricId", "groupId", "date"
		 	FROM	"Metric"
		 	WHERE	"name" = '${metricName}'
		 	 AND	"groupId" = '${groupId}'
		 	 AND 	"date" BETWEEN to_timestamp(${dateFromEpoch}) AND to_timestamp(${dateToEpoch})
		 	 AND	"timeUnit" = '${timeUnit}'`;
		this.log.debug(`MetricAggregationRepository > buildGetMetricIdFragment > query: ${query}`);
		return query;
	}

	private buildNewMetricIdsFromInputMetrics(metricName: string, groupId: string, inputMetrics: string[], dateFromEpoch: number, dateToEpoch: number, timeUnit: TimeUnitAbbreviation): string {
		this.log.debug(
			`MetricAggregationRepository > buildNewMetricIdsFromInputMetrics > metricName: ${metricName}, groupId: ${groupId}, inputMetrics" ${inputMetrics}, dateFromEpoch: ${dateFromEpoch}, dateToEpoch: ${dateToEpoch}, timeUnit: ${timeUnit}`
		);
		const query = `INSERT INTO "Metric" ("groupId", "date", "name", "timeUnit")
SELECT DISTINCT	"groupId", "date", '${metricName}', "timeUnit"
FROM	"Metric" JOIN "MetricLatestValue" USING ("metricId")
WHERE 	"groupId" = '${groupId}'
AND		"name" = any('{${inputMetrics.map((m) => `"${m}"`).join(',')}}')
AND		"timeUnit" = '${timeUnit}'
AND 	"date" BETWEEN to_timestamp(${dateFromEpoch}) AND to_timestamp(${dateToEpoch})
ON CONFLICT ("groupId", "date", "name", "timeUnit") DO NOTHING;`;
		this.log.debug(`MetricAggregationRepository > buildNewMetricIdsFromInputMetrics > query: ${query}`);
		return query;
	}

	private buildInputMetrics(metricName: string, groupId: string, inputMetrics: string[], dateFromEpoch: number, dateToEpoch: number, timeUnit: TimeUnitAbbreviation): string {
		this.log.debug(`MetricAggregationRepository > buildInputMetrics > metricName: ${metricName}, groupId: ${groupId}, inputMetrics" ${inputMetrics}, dateFromEpoch: ${dateFromEpoch}, dateToEpoch: ${dateToEpoch}, timeUnit: ${timeUnit}`);

		/* previously calculated input metrics for current time unit. Note we intentionally only use the groupValue as the
			subGroupValue would already have been used as part of the calculation when calculating the group in contexts
			child group values */
		const query = `SELECT	"groupId", "date", SUM("groupValue") AS "groupValue"
		FROM	"MetricLatestValue" JOIN "Metric" USING ("metricId")
		WHERE	"groupId" = '${groupId}'
		AND 	"name" = any('{${inputMetrics.map((m) => `"${m}"`).join(',')}}')
		AND 	"date" BETWEEN to_timestamp(${dateFromEpoch}) AND to_timestamp(${dateToEpoch})
		AND		"timeUnit" = '${timeUnit}'
		GROUP BY "groupId", "date" `;
		this.log.debug(`MetricAggregationRepository > buildInputMetrics > query: ${query}`);
		return query;
	}

	private async executeQuery(query: string): Promise<Record<string, string>[]> {
		this.log.debug(`MetricAggregationRepository> executeQuery> in: query:${query}`);

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
			this.log.debug(`MetricAggregationRepository> executeQuery: undefined`);
			return [];
		}

		this.log.debug(`MetricAggregationRepository> executeQuery> data:${JSON.stringify(result)}`);
		return result.rows;
	}

	public async aggregateRawToDayMetric(
		metricName: string,
		groupId: string,
		metricsInputs: string[],
		pipelineInputs: InputPipeline[],
		triggeringPipelineId: string,
		triggeringExecutionId: string,
		dateFrom: Date,
		dateTo: Date
	): Promise<void> {
		this.log.debug(
			`MetricAggregationRepository > aggregateRawToDayMetric> metricName: ${metricName}, groupId: ${groupId}, metricsInputs: ${metricsInputs}, pipelineInputs: ${JSON.stringify(
				pipelineInputs
			)}, triggeringPipelineId:${triggeringPipelineId}, triggeringExecutionId:${triggeringExecutionId}, dateFrom: ${dateFrom}, dateTo: ${dateTo}`
		);

		const queries: string[] = [];
		const inputPipelineCriteria = pipelineInputs.length === 0 ? `a."pipelineId" = any('{}')` : pipelineInputs?.map((pi) => ` (a."pipelineId" = '${pi.pipelineId}' AND lv."name" = '${pi.output}') `).join(' OR ');

		const dateFromEpoch = dayjs(dateFrom).unix();
		const dateToEpoch = dayjs(dateTo).unix();
		const createdAt = dayjs().unix();

		const immediateChildSearchPattern = groupId === '/' ? `^\/((?!\/).)+$` : `^${groupId.replaceAll('/', `\/`)}\/((?!\/).)+$`;

		/* create new metric rows based on groups own pipeline executions */
		queries.push(
			`INSERT INTO "Metric" ("groupId", date, name, "timeUnit")
SELECT DISTINCT	a."groupId", date_trunc('day', a.date), '${metricName}', 'd'
FROM	"Activity" a JOIN "ActivityNumberLatestValue" lv USING ("activityId")
	left outer join "Metric" m on (a."groupId"=m."groupId" and date_trunc('day', a.date)=m.date and m.name='${metricName}' and m."timeUnit"='d')
WHERE 	a."groupId" = '${groupId}'
AND		( ${inputPipelineCriteria} )
AND 	a.date BETWEEN to_timestamp(${dateFromEpoch}) AND to_timestamp(${dateToEpoch})
AND		lv.val IS NOT NULL
AND		a.type = 'raw'
AND		m."metricId" IS NULL
ON CONFLICT ("groupId", "date", "name", "timeUnit") DO NOTHING;`
		);

		/* create new metric rows based on child groups pipeline executions */
		queries.push(
			`INSERT INTO "Metric" ("groupId", date, name, "timeUnit")
SELECT DISTINCT	'${groupId}', m.date, '${metricName}', m."timeUnit"
FROM	"MetricLatestValue" lv JOIN "Metric" m USING ("metricId")
WHERE	m.name = '${metricName}'
AND		m."groupId" ~ '${immediateChildSearchPattern}'
AND 	m.date BETWEEN to_timestamp(${dateFromEpoch}) AND to_timestamp(${dateToEpoch})
AND		m."timeUnit" = 'd'
ON CONFLICT ("groupId", "date", "name", "timeUnit") DO NOTHING;`
		);

		/* create new metric rows based on input from other metrics */
		if ((metricsInputs?.length ?? 0) > 0) {
			queries.push(this.buildNewMetricIdsFromInputMetrics(metricName, groupId, metricsInputs, dateFromEpoch, dateToEpoch, 'd'));
		}

		/* create metric values which is a combination of input pipelines and input metrics */
		queries.push(
			`INSERT INTO "MetricValue" ("metricId", "createdAt", "groupValue", "subGroupsValue", "pipelineId", "executionId")
SELECT 	m."metricId", to_timestamp('${createdAt}'),
		coalesce(la."groupValue",0) + coalesce(im."groupValue",0) AS "groupValue",
		coalesce(mc."subGroupsValue",0) AS "subGroupsValue",
		'${triggeringPipelineId}', '${triggeringExecutionId}'
FROM 	( ${this.buildGetMetricIdFragment(metricName, groupId, dateFromEpoch, dateToEpoch, 'd')}	) AS m
	LEFT JOIN (
		SELECT 	m.date, sum("groupValue" + "subGroupsValue") AS "subGroupsValue"
		FROM	"MetricLatestValue" lv JOIN "Metric" m USING ("metricId")
		WHERE	m.name = '${metricName}'
		AND		m."groupId" ~ '${immediateChildSearchPattern}'
		AND 	m.date BETWEEN to_timestamp(${dateFromEpoch}) AND to_timestamp(${dateToEpoch})
		AND		m."timeUnit" = 'd'
		GROUP BY  m.date
		) mc ON (m."date" = mc."date")
	LEFT JOIN (
			${this.buildInputPipelines(groupId, pipelineInputs, dateFromEpoch, dateToEpoch)}
	 ) la ON (m."groupId" = la."groupId" AND m.date = la."dateTruncated")
	 LEFT JOIN (
			 ${this.buildInputMetrics(metricName, groupId, metricsInputs, dateFromEpoch, dateToEpoch, 'd')}
		 ) im ON (m."groupId" = im."groupId" AND m.date = im.date)
;`
		);

		await this.executeQuery(queries.join('\n\n'));

		this.log.debug(`MetricAggregationRepository > aggregateRawToDayMetric> exit:`);
	}

	private buildInputPipelines(groupId: string, pipelineInputs: InputPipeline[], dateFromEpoch: number, dateToEpoch: number): string {
		this.log.debug(`MetricAggregationRepository > buildInputPipelines >  groupId: ${groupId}, pipelineInputs" ${pipelineInputs}, dateFromEpoch: ${dateFromEpoch}, dateToEpoch: ${dateToEpoch}`);

		// this will return empty row
		let statement = `SELECT NULL "groupId", now()::timestamp "dateTruncated", 0 "groupValue" WHERE FALSE`;

		if (pipelineInputs.length > 0) {
			statement = `SELECT "groupId", "dateTruncated", sum("groupValue") as "groupValue"
		FROM (
		${pipelineInputs.map(p=> `
			SELECT 	a."groupId", date_trunc('day', a.date) AS "dateTruncated", sum(lv.val) as "groupValue"
			FROM	"Activity" a JOIN "ActivityNumberLatestValue" lv USING ("activityId")
			WHERE 	a.date BETWEEN to_timestamp(${dateFromEpoch}) AND to_timestamp(${dateToEpoch})
			AND		a."pipelineId" = '${p.pipelineId}'
			AND		a.type = 'raw'
			AND		a."groupId" ='${groupId}'
			AND 	lv.name = '${p.output}'
			AND 	lv.val IS NOT NULL
		   GROUP BY a."groupId", date_trunc('day', a.date)
		   `
		).join(`UNION ALL
		`)}
				) pipelineInputs
		GROUP BY "groupId", "dateTruncated"`;
		}
		this.log.debug(`MetricAggregationRepository > buildInputPipelines> exit:`);
		return statement;
	}

	public async aggregateMetrics(
		metricName: string,
		groupId: string,
		inputMetrics: string[],
		fromTimeUnit: TimeUnitAbbreviation,
		toTimeUnit: TimeUnitAbbreviation,
		triggeringPipelineId: string,
		triggeringExecutionId: string,
		dateFrom: Date,
		dateTo: Date
	): Promise<void> {
		this.log.debug(
			`MetricAggregationRepository > aggregateMetrics> metricName: ${metricName}, groupId: ${groupId}, inputMetrics:${inputMetrics}, fromTimeUnit: ${fromTimeUnit}, toTimeUnit: ${toTimeUnit}, triggeringPipelineId:${triggeringPipelineId}, triggeringExecutionId:${triggeringExecutionId}, dateFrom: ${dateFrom}, dateTo: ${dateTo}`
		);

		const queries: string[] = [];

		const dateFromEpoch = dayjs(dateFrom).unix();
		const dateToEpoch = dayjs(dateTo).unix();

		const createdAt = dayjs().unix();
		const toDatePart = TIME_UNIT_TO_DATE_PART[toTimeUnit];

		/* create new metric rows based on previously calculated metrics for more granular time units */
		queries.push(
			`INSERT INTO "Metric" ("groupId", "date", "name", "timeUnit")
SELECT DISTINCT	"groupId", date_trunc('${toDatePart}', "date"), "name", '${toTimeUnit}'
FROM	"Metric" JOIN "MetricLatestValue" USING ("metricId")
WHERE 	"groupId" = '${groupId}'
AND		"name" = '${metricName}'
AND		"timeUnit" = '${fromTimeUnit}'
AND 	"date" BETWEEN to_timestamp(${dateFromEpoch}) AND to_timestamp(${dateToEpoch})
ON CONFLICT ("groupId", "date", "name", "timeUnit") DO NOTHING;`
		);

		/* create new metric rows based on input from other metrics */
		if ((inputMetrics?.length ?? 0) > 0) {
			queries.push(this.buildNewMetricIdsFromInputMetrics(metricName, groupId, inputMetrics, dateFromEpoch, dateToEpoch, toTimeUnit));
		}

		/* create metric values which is an aggregation of previously calculated metrics for more granular time units */
		queries.push(
			`INSERT INTO "MetricValue" ("metricId", "createdAt", "groupValue", "subGroupsValue", "pipelineId", "executionId")
SELECT 	m."metricId", to_timestamp('${createdAt}'),
			coalesce(la."groupValue",0) AS "groupValue",
			coalesce(la."subGroupsValue",0) AS "subGroupsValue",
			'${triggeringPipelineId}', '${triggeringExecutionId}'
FROM 	( ${this.buildGetMetricIdFragment(metricName, groupId, dateFromEpoch, dateToEpoch, toTimeUnit)} ) AS m
	LEFT JOIN (
			/* previously calculated metrics for more granular time units */
			SELECT	"groupId", date_trunc('${toDatePart}', "date") AS "date", sum("groupValue") AS "groupValue", sum("subGroupsValue") AS "subGroupsValue"
			FROM	"MetricLatestValue" JOIN "Metric" USING ("metricId")
			WHERE 	"groupId" = '${groupId}'
			AND		"name" = '${metricName}'
			AND 	"date" BETWEEN to_timestamp(${dateFromEpoch}) AND to_timestamp(${dateToEpoch})
			AND		"timeUnit" = '${fromTimeUnit}'
			GROUP BY "groupId", date_trunc('${toDatePart}', "date") ) la ON (m."groupId" = la."groupId" AND m."date" = la."date")`
		);

		await this.executeQuery(queries.join('\n\n'));

		this.log.debug(`MetricAggregationRepository > aggregateMetrics> exit:`);
	}
}
