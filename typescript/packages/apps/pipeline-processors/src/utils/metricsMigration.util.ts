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
import type { BaseRepositoryClient } from '../data/base.repository.js';
import type { Client } from 'pg';

const metricTempTableName = 'MetricTemp';

export class MetricsMigrationUtil {
	public constructor(
		private log: FastifyBaseLogger,
		private repoClient: BaseRepositoryClient
	) {}

	public async process(params: { bucket: string, key: string }) {
		this.log.info(`MetricsMigrationUtil> process> in> params: ${JSON.stringify(params)}`);

		let client;
		try {
			client = await this.repoClient.getConnection();

			// create a temporary table which contains the following columns (metricId,groupId,date,timeUnit,name,executionId,pipelineId,createdAt,groupValue,subGroupValue,isLatest)
			// all as varchars to copy the exported metrics from dynamodb into this temp table
			const createMetricTempTableStatement = `CREATE UNLOGGED TABLE IF NOT EXISTS "${metricTempTableName}" (
				"metricId" CHARACTER(26) NOT NULL PRIMARY KEY,
				"groupId" CHARACTER VARYING(128) NOT NULL,
				"date" TIMESTAMP WITHOUT TIME ZONE NOT NULL,
				"timeUnit" CHARACTER(1) NOT NULL,
				"name" CHARACTER VARYING(512) NOT NULL,
				"executionId" CHARACTER(26) NOT NULL,
				"pipelineId" CHARACTER(26) NOT NULL,
				"createdAt" TIMESTAMP WITHOUT TIME ZONE NOT NULL,
				"groupValue" NUMERIC(16,6) NOT NULL,
				"subGroupsValue" NUMERIC(16,6) NOT NULL,
				"isLatest" BOOLEAN NOT NULL
			)`

			await this.execQuery(client, createMetricTempTableStatement);

			const insertMetricsTempStatement = `SELECT aws_s3.table_import_from_s3(
				'"${metricTempTableName}"',
				'"metricId","groupId","date","timeUnit","name","executionId","pipelineId","createdAt","groupValue","subGroupsValue","isLatest"',
				'(format csv, header 1)',
				'${params.bucket}',
				'${params.key}',
				'${process.env['AWS_REGION']}',
				'${process.env['AWS_ACCESS_KEY_ID']}',
				'${process.env['AWS_SECRET_ACCESS_KEY']}',
				'${process.env['AWS_SESSION_TOKEN']}'
			);`;

			await this.execQuery(client, insertMetricsTempStatement);

			// At this point the data is loaded in the temp table, now we are going to move the data from temp table to the actual metrics table
			// this requires 3 different queries to be executed to load the data into the actual Metric, MetricValue and MetricLatestValues table
			const metricInsert = `
INSERT INTO "Metric" ("groupId", "date", "timeUnit", "name")
SELECT t."groupId", t."date", t."timeUnit", t."name"
FROM "${metricTempTableName}" t
LEFT JOIN "Metric" m
ON m."groupId"=t."groupId" AND m."date"=t."date" AND m."name"=t."name" AND m."timeUnit"= t."timeUnit"
WHERE m."metricId" IS NULL
GROUP BY t."groupId", t."date", t."name", t."timeUnit"`;

			await this.execQuery(client, metricInsert);

			const metricValueInsert = `
INSERT INTO "MetricValue" ("metricId", "executionId", "pipelineId", "createdAt", "groupValue", "subGroupsValue")
SELECT m."metricId", t."executionId", t."pipelineId", t."createdAt", t."groupValue", t."subGroupsValue"
FROM "${metricTempTableName}" t
LEFT JOIN "Metric" m
ON m."groupId"=t."groupId" AND m."date"=t."date" AND m."name"=t."name" AND m."timeUnit"= t."timeUnit"`;

			await this.execQuery(client, metricValueInsert);
			// now we are going to delete the temp table
			await this.execQuery(client, `DROP TABLE IF EXISTS "${metricTempTableName}"`);

		} catch (e) {
			this.log.error(e);
			throw e;
		} finally {
			if(client) await client.end()
		}
	}

	private async execQuery(client: Client, query:string) {
		this.log.info(`MetricsMigrationUtil> execQuery> in> query: ${query}`);
		try {
			const result = await client.query(query);
			this.log.info(`MetricsMigrationUtil> execQuery> out>: ${JSON.stringify(result)}`)
		} catch (e) {
			this.log.error(e);
			throw e
		}
	}
}

