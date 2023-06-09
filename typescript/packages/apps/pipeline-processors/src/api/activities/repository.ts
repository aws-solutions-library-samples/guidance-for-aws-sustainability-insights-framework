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
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import type { BaseRepositoryClient } from '../../data/base.repository.js';
import type { ActivityReference, Aggregate, Output, PipelineMetadata, QueryRequest, QueryResponse } from './models.js';
import type { AffectedTimeRange } from '../metrics/models.js';
import type { Client, Pool } from 'pg';
import { validateNotEmpty } from '@sif/validators';
import { ulid } from 'ulid';
import type { InsertActivityBulkEvent, ProcessedTaskEvent } from '../../stepFunction/tasks/model.js';

const ROW_TYPE_AGGREGATED = 'aggregated';
const ROW_TYPE_RAW = 'raw';
const NEWLINE_DELIMITER = '\r\n';

dayjs.extend(utc);

interface TableDetails {
	name: string;
	alias: string;
}

interface TypeToTableMap {
	string: TableDetails;
	number: TableDetails;
	boolean: TableDetails;
	timestamp: TableDetails;
};

export class ActivitiesRepository {
	private defaultLimit = 100;
	private readonly log: BaseLogger;
	private readonly baseRepositoryClient: BaseRepositoryClient;
	private readonly typeToValueTableMap: TypeToTableMap;
	private readonly typeToLatestValueTableMap: TypeToTableMap;

	constructor(
		log: BaseLogger,
		repoClient: BaseRepositoryClient
	) {
		this.log = log;
		this.baseRepositoryClient = repoClient;
		this.typeToValueTableMap = {
			string: {
				name: 'ActivityStringValue',
				alias: 's'
			},
			number: {
				name: 'ActivityNumberValue',
				alias: 'n'
			},
			boolean: {
				name: 'ActivityBooleanValue',
				alias: 'b'
			},
			timestamp: {
				name: 'ActivityDateTimeValue',
				alias: 'd'
			},
		};
		this.typeToLatestValueTableMap = {
			string: {
				name: 'ActivityStringLatestValue',
				alias: 'ls'
			},
			number: {
				name: 'ActivityNumberLatestValue',
				alias: 'ln'
			},
			boolean: {
				name: 'ActivityBooleanLatestValue',
				alias: 'lb'
			},
			timestamp: {
				name: 'ActivityDateTimeLatestValue',
				alias: 'ld'
			},
		};
	}

	public async getConnection(): Promise<Client> {
		return await this.baseRepositoryClient.getConnection();
	}

	public async getConnectionPool(numOfConnection: number): Promise<Pool> {
		return await this.baseRepositoryClient.getConnectionPool(numOfConnection);
	}

	public async getAffectedTimeRange(pipelineId: string, executionId: string): Promise<AffectedTimeRange> {
		this.log.debug(`ActivitiesRepository> getAffectedTimeRange> in: pipelineId:${pipelineId}, executionId:${executionId}`);

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

		this.log.trace(`ActivitiesRepository> getAffectedTimeRange> query:${query}`);

		const dbConnection = await this.getConnection();

		let result;
		try {
			result = await dbConnection.query(query);
		} catch (e) {
			this.log.error(e);
			throw e;
		} finally {
			await dbConnection.end();
		}

		this.log.trace(`ActivitiesRepository> getAffectedTimeRange> timeRangeResult:${JSON.stringify(result)}`);

		if ((result?.rows?.length ?? 0) === 0) {
			throw new Error(`No existing data found for pipeline '${pipelineId}', execution '${executionId}.`);
		}

		const response: AffectedTimeRange = { from: dayjs.utc(result.rows[0].from).toDate(), to: dayjs.utc(result.rows[0].to).toDate() };

		this.log.debug(`ActivitiesRepository> getAffectedTimeRange> exit: ${JSON.stringify(response)}`);
		return response;
	}

	public async listActivityReferences(req: { activityId: string, groupId: string, versionAsAt?: Date }): Promise<ActivityReference[]> {
		this.log.debug(`ActivitiesRepository> listActivityReferences> in: req:${JSON.stringify(req)}`);

		const { activityId, groupId, versionAsAt } = req;

		let limitFilter = '';
		let createDateFilter = '';

		if (versionAsAt) {
			createDateFilter = `and x."createdAt"  <= timestamp without time zone '${dayjs(versionAsAt).utc().format('YYYY-MM-DD HH:mm:ss.SSS')}'`;
			limitFilter = 'LIMIT 1';
		}

		const query = `
SELECT DISTINCT a."activityId", a."date", a."pipelineId", x."executionId", x."auditId", x."createdAt"
FROM "Activity" a
	JOIN ( SELECT "activityId", "auditId", "createdAt", "executionId" FROM "ActivityStringValue" WHERE "activityId" = ${activityId}
		UNION SELECT "activityId", "auditId", "createdAt", "executionId" FROM "ActivityNumberValue" WHERE "activityId" = ${activityId}
		UNION SELECT "activityId", "auditId", "createdAt", "executionId" FROM "ActivityBooleanValue" WHERE "activityId" = ${activityId}
		UNION SELECT "activityId", "auditId", "createdAt", "executionId" FROM "ActivityDateTimeValue" WHERE "activityId" = ${activityId}
	) x USING ("activityId")
WHERE a."activityId" = '${activityId}'
 AND  a."groupId" = '${groupId}'
${createDateFilter}
ORDER BY x."createdAt" desc
${limitFilter}`;

		this.log.trace(`ActivitiesRepository> listActivityReferences> query:${query}`);
		const queryResponse = await this.executeQuery(query);
		const data: ActivityReference[] =
			queryResponse.map(row => this.assemble(row, Array.from(['date', 'createdAt']))) as unknown as ActivityReference[];

		this.log.debug(`ActivitiesRepository> listActivityReferences> exit: data:${JSON.stringify(data)}`);
		return data;
	}

	public async aggregateRaw(req: QueryRequest, pipelineMetadata: PipelineMetadata): Promise<QueryResponse> {
		this.log.debug(`ActivitiesRepository> aggregateRaw> in: req:${JSON.stringify(req)}`);

		// we will default the maxRows which can be retrieved to the default limit set
		// don't want to return thousands of records, works like a fail-safe
		if (!req.maxRows) {
			req.maxRows = this.defaultLimit;
		}

		// nextToken will always start from 0 if one hasn't been provided through the request,
		// since we are dealing with an offset which is our nextToken, we want that that next
		if (!req.nextToken) {
			req.nextToken = 0;
		}

		// these two fields are default field names used by the system
		// createdAt is the timestamp of the activity values is being calculated
		// date is the timestamp of the activity based on the input file
		const timestampFields = new Set(['createdAt', 'date']);
		for (const [key, value] of Object.entries(pipelineMetadata.transformKeyMap)) {
			if (value === 'timestamp') {
				timestampFields.add(key);
			}
		}

		const query = this.buildAggregateRawQuery(pipelineMetadata, req);
		const rows = await this.executeQuery(query);
		const data = rows.map(row => this.assemble(row, Array.from(timestampFields)));

		const queryResult: QueryResponse = {
			data,
		};

		// check if the data returned is greater or equal to the max rows which can be returned
		// we will only add the next token if the condition is met. If the condition isn't met,
		// then we don't return anything. example: If there are 24 activities, and we requested 100,
		// we only get 24 back which is less than the requested 100, so we will not return the token back.
		// If there are 1204 activities, and we request 100, we get 100 back. that means there are more activities,
		// we return the token since it is equal or more than the requested 100 activities.
		if (data.length === req.maxRows) {
			queryResult.nextToken = req.maxRows + req.nextToken;
		}

		this.log.debug(`ActivitiesRepository> aggregateRaw> out: result:${JSON.stringify(queryResult)}`);
		return queryResult;
	}

	public async get(req: QueryRequest, pipelineMetadata: PipelineMetadata): Promise<QueryResponse> {
		this.log.debug(`ActivitiesRepository> get> in: req:${JSON.stringify(req)}`);

		// we will default the maxRows which can be retrieved to the default limit set
		// don't want to return thousands of records, works like a fail-safe
		if (!req.maxRows) {
			req.maxRows = this.defaultLimit;
		}

		// nextToken will always start from 0 if one hasn't been provided through the request,
		// since we are dealing with an offset which is our nextToken, we want that that next
		if (!req.nextToken) {
			req.nextToken = 0;
		}

		// these two fields are default field names used by the system
		// createdAt is the timestamp of the activity values is being calculated
		// date is the timestamp of the activity based on the input file
		const timestampFields = new Set(['createdAt', 'date']);
		for (const [key, value] of Object.entries(pipelineMetadata.transformKeyMap)) {
			if (value === 'timestamp') {
				timestampFields.add(key);
			}
		}

		const query = (req.showHistory) ? this.buildGetHistoryQuery(pipelineMetadata, req) : this.buildGetLatestQuery(pipelineMetadata, req);

		const rows = await this.executeQuery(query);
		const data = rows.map(row => this.assemble(row, Array.from(timestampFields)));

		const queryResult: QueryResponse = {
			data,
		};

		// check if the data returned is greater or equal to the max rows which can be returned
		// we will only add the next token if the condition is met. If the condition isn't met,
		// then we don't return anything. example: If there are 24 activities, and we requested 100,
		// we only get 24 back which is less than the requested 100, so we will not return the token back.
		// If there are 1204 activities, and we request 100, we get 100 back. that means there are more activities,
		// we return the token since it is equal or more than the requested 100 activities.
		if (data.length === req.maxRows) {
			queryResult.nextToken = req.maxRows + req.nextToken;
		}

		this.log.trace(`ActivitiesRepository> get> out: result:${JSON.stringify(queryResult)}`);
		return queryResult;
	}

	public async getTotalValueRows(executionId: string, type: string): Promise<number> {
		this.log.debug(`ActivitiesRepository> getTotalValueRows> in: executionId:${executionId}, type: ${type}`);

		const query = `SELECT COUNT ("activityId")
			from "${this.typeToValueTableMap[type].name}"
			where "executionId" = '${executionId}'`;

		const queryResponse = await this.executeQuery(query);
		const count = parseInt(queryResponse?.[0]['count']);

		this.log.debug(`ActivitiesRepository> getTotalValueRows> exit> count: ${count}`);
		return count;
	}

	public async insertExecutionValuesToLatestTablesPerOutput(executionId: string, outputs:Output[], sharedConnection?: Client): Promise<void> {
		this.log.debug(`ActivitiesRepository> insertExecutionValuesToLatestTablesPerOutput> in: executionId: ${executionId}, outputs:${JSON.stringify(outputs)}`);

		for(const output of outputs) {
			this.log.debug(`ActivitiesRepository> insertExecutionValuesToLatestTables> processing:${JSON.stringify(output.name)} (${output.type}))}`);
			const valueTable = this.typeToValueTableMap[output.type].name;
			const latestTable = this.typeToLatestValueTableMap[output.type].name;
			const statements = [];

			// 1st perform the updates to be performed for a specific column of a specific execution
			statements.push(`
UPDATE "${latestTable}" as lv
SET		"createdAt"=uv."createdAt", "executionId"=uv."executionId", val=uv.val, "auditId"=uv."auditId"
FROM 	(
			SELECT DISTINCT ON (iv."activityId", iv.name) iv."activityId", name, iv."createdAt", iv."executionId", iv."auditId", iv. val
			from "${valueTable}" iv join "${latestTable}"  ilv using ("activityId", name )
			where iv."executionId" = '${executionId}' and iv.name = '${output.name}'
			ORDER BY  iv."activityId", iv.name, iv."createdAt" desc
		) uv
WHERE	uv."activityId" = lv."activityId"
and		uv.name = lv.name;`);

			// 2nd create the updates to be performed for a specific column of a specific execution
			statements.push(`
INSERT INTO "${latestTable}" ("activityId",  name, "createdAt", "executionId", "auditId", val)
SELECT DISTINCT ON (v."activityId", v.name) v."activityId", name, v."createdAt", v."executionId", v."auditId", v. val
from "${valueTable}" v left outer join "${latestTable}"  lv using ("activityId", name )
where v."executionId" = '${executionId}' and v.name = '${output.name}'
AND 	lv IS NULL
ORDER BY  v."activityId", v.name, v."createdAt" desc`);

			// execute per output column so they are smaller inserts/updates
			await this.executeQuery(statements.join('\n'), sharedConnection);
			this.log.debug(`ActivitiesRepository> insertExecutionValuesToLatestTablesPerOutput> finished processing:${JSON.stringify(output.name)} (${output.type}))}`);
		}

		this.log.debug(`ActivitiesRepository> insertExecutionValuesToLatestTablesPerOutput> exit:`);
	}

	public async createRawActivities(statement: string, sharedConnection?: Client): Promise<void> {
		this.log.debug(`ActivitiesRepository> createActivities> in: statement: ${statement}`);
		await this.executeQuery(statement, sharedConnection);
		this.log.debug(`ActivitiesRepository> createActivities> exit:`);
	}

	public async createAggregatedActivities(activities: Record<string, string>[], pipelineId: string, executionId: string, groupId: string, fieldToTypeMap: { [key: string]: string }, pipelineMetadata: PipelineMetadata): Promise<void> {
		this.log.debug(`ActivitiesRepository> createAggregatedActivities> in: pipelineId:${JSON.stringify(pipelineId)}, pipelineMetadata: ${JSON.stringify(pipelineMetadata)}, executionId: ${executionId}`);
		const queries = this.buildInsertAggregatedActivityQuery(activities, pipelineId, executionId, groupId, fieldToTypeMap, pipelineMetadata);
		if (queries.length < 1) return;

		await this.executeQueriesInsideTransaction(queries);
		this.log.debug(`ActivitiesRepository> createAggregatedActivities> out:`);
	}

	private async executeQueriesInsideTransaction(queries: string[]): Promise<void> {
		this.log.debug(`ActivitiesRepository> executeQueriesInsideTransaction> in: `);

		const dbConnection = await this.baseRepositoryClient.getConnection();

		try {
			await dbConnection.query('BEGIN');
			for (let query of queries) {
				await dbConnection.query(query);
			}
			await dbConnection.query('COMMIT');
		} catch (e) {
			await dbConnection.query('ROLLBACK');
			this.log.error(e);
			throw e;
		} finally {
			await dbConnection.end();
		}

		this.log.debug(`ActivitiesRepository> executeQueriesInsideTransaction> out: `);
	}

	private async executeQuery(query: string, sharedConnection?: Client): Promise<Record<string, string>[]> {
		this.log.debug(`ActivitiesRepository> executeQuery> in: query:${query}`);

		let connection;
		if (sharedConnection) {
			connection = sharedConnection;
		} else {
			connection = await this.baseRepositoryClient.getConnection();
		}

		let result;
		try {
			result = await connection.query(query);
		} catch (e) {
			this.log.error(e);
			throw e;
		} finally {
			if (!sharedConnection) {
				await connection.end();
			}
		}

		if ((result?.rows?.length ?? 0) === 0) {
			this.log.debug(`ActivitiesRepository> executeQuery: undefined`);
			return [];
		}

		this.log.debug(`ActivitiesRepository> executeQuery> data:${JSON.stringify(result)}`);
		return result.rows;
	}

	private assemble(row: any, timestampFields: string[]): Record<string, string> {
		this.log.trace(`ActivitiesRepository> assemble> in: row:${JSON.stringify(row)}, timestampFields:${JSON.stringify(timestampFields)}`);
		const activity = {};
		for (const key in row) {
			if (row.hasOwnProperty(key)) {
				// we only need to parse the date type to ISO string
				if (timestampFields.includes(key) && dayjs.utc(row[key]).isValid()) {
					activity[key] = dayjs.utc(row[key]).toISOString();
				} else {
					activity[key] = row[key];
				}
			}
		}
		this.log.trace(`ActivitiesRepository> assemble> out: ${JSON.stringify(activity)}`);
		return activity;
	}

	private buildInsertAggregatedActivityQuery(activities: Record<string, string>[], pipelineId: string, executionId: string, groupId: string, fieldToTypeMap: { [key: string]: string }, pipelineMetadata: PipelineMetadata): string[] {
		this.log.debug(`ActivitiesRepository> buildInsertAggregatedActivityQuery> in: activities:${JSON.stringify(activities)}`);

		const insertStatements: string[] = [];

		for (let activity of activities) {

			// Check if any of the aggregation keys are null
			let skipAggregation = false;
			for (const key in activity) {
				for (const aggregate of pipelineMetadata.aggregate.fields) {
					if (Object.is(activity[key], null) && aggregate.key === key && ['sum', 'mean', 'min', 'max', 'count'].includes(aggregate.aggregate)) {
						skipAggregation = true;
					}
				}
			}

			// skip activity if its a aggregate keys are null
			if (skipAggregation) {
				continue;
			}

			const insertActivityReference = ulid();
			const insertActivityStatement = this.buildInsertActivityStatement(activity, insertActivityReference, groupId, pipelineId, pipelineMetadata.aggregate);
			const insertMultipleActivityValueStatements = this.buildInsertActivityValuesStatements(activity, insertActivityReference, executionId, fieldToTypeMap, pipelineMetadata.aggregate.timestampField);
			const query = [insertActivityStatement, ...insertMultipleActivityValueStatements].join('');
			insertStatements.push(query);
		}

		this.log.debug(`ActivitiesRepository> buildInsertAggregatedActivityQuery> out: ${insertStatements}`);
		return insertStatements;
	}


	private buildInsertActivityStatement(activity: Record<string, string>, insertActivityReference: string, groupId: string, pipelineId: string, aggregateMetadata: {
		fields: Aggregate[],
		timestampField: string
	}) {
		this.log.debug(`ActivitiesRepository> buildInsertActivityStatement> in: activity: ${JSON.stringify(activity)}, insertActivityReference: ${insertActivityReference}, groupId: ${groupId}, pipelineId: ${pipelineId}, aggregateMetadata: ${aggregateMetadata}`);

		const nullValues: string [] = ['___NULL___', '___NULL___', '___NULL___', '___NULL___', '___NULL___'];
		let nullIndex = 0;
		for (const aggregate of aggregateMetadata.fields) {
			if (aggregate.aggregate === 'groupBy' && activity[aggregate.key]) {
				nullValues[nullIndex++] = activity[aggregate.key];
			}
		}

		const query = `with "${insertActivityReference}" as (
INSERT INTO "Activity" ("groupId", "pipelineId", "date", "type", "key1", "key2", "key3", "key4", "key5")
VALUES (
	'${groupId}',
	'${pipelineId}',
	to_timestamp(${dayjs(activity[aggregateMetadata.timestampField]).unix()}),
	'${ROW_TYPE_AGGREGATED}',
	'${nullValues[0]}',
	'${nullValues[1]}',
	'${nullValues[2]}',
	'${nullValues[3]}',
	'${nullValues[4]}'
)
ON CONFLICT  ("groupId", "pipelineId", "date", "type", "key1", "key2", "key3", "key4", "key5")
DO UPDATE SET "groupId" = EXCLUDED."groupId" Returning "activityId"
)`;

		this.log.debug(`ActivitiesRepository> buildInsertActivityStatement> out: query: ${query}`);
		return query;
	}

	private buildInsertActivityValuesStatements(activity: Record<string, string>, insertActivityReference: string, executionId: string, fieldToTypeMap: { [key: string]: string }, timestampField: string): string[] {
		this.log.debug(`ActivitiesRepository> buildInsertActivityValuesStatements> in: activity: ${JSON.stringify(activity)}, insertActivityReference: ${insertActivityReference}, fieldToTypeMap: ${JSON.stringify(fieldToTypeMap)}, executionId: ${executionId}, timestampField: ${timestampField}`);

		const createdAt = dayjs().unix();
		const insertMultipleActivityValueStatements: string[] = [];
		const insertFieldStatements = [];

		for (const key in activity) {
			// generate insert statement to the appropriate table for each of the activity field (except the timestamp)
			if (key !== timestampField && activity.hasOwnProperty(key)) {
				const tableName = this.typeToValueTableMap[fieldToTypeMap[key]].name;
				const latestTableName = this.typeToLatestValueTableMap[fieldToTypeMap[key]].name;
				let val;
				// convert the value to the right format
				switch (fieldToTypeMap[key]) {
					case 'timestamp' : {
						val = Number.isInteger(dayjs(activity[key]).unix()) ? `to_timestamp('${dayjs(activity[key]).unix()}')` : null;
						break;
					}
					case 'number' : {
						val = Number.isInteger(parseFloat(activity[key])) ? parseFloat(activity[key]) : null;
						break;
					}
					case 'string' :
					case 'boolean' : {
						val = `'${activity[key]}'`;
						break;
					}
				}

				// insert to value table
				const insertActivityValue = `
INSERT INTO "${tableName}" ("activityId", "name", "createdAt","executionId", "val", "error", "errorMessage")
VALUES( (SELECT "activityId" from "${insertActivityReference}"), '${key}', to_timestamp('${createdAt}'), '${executionId}', ${val}, false, null)`;
				insertFieldStatements.push(insertActivityValue);

				// insert to latest value table
				const insertActivityLatestValue = `
INSERT INTO "${latestTableName}" ("activityId", "name", "createdAt","executionId", "val")
VALUES( (SELECT "activityId" from "${insertActivityReference}"), '${key}', to_timestamp('${createdAt}'), '${executionId}', ${val})
ON CONFLICT ("activityId","name") DO UPDATE SET "createdAt" = excluded."createdAt",
                                                "executionId" = excluded."executionId",
                                                "val"         = excluded."val",
                                                "auditId"     = excluded."auditId"`;
				insertFieldStatements.push(insertActivityLatestValue);
			}
		}

		for (let i = 0; i < insertFieldStatements.length; i++) {
			if (i === insertFieldStatements.length - 1) {
				insertMultipleActivityValueStatements.push(insertFieldStatements[i]);
			} else {
				// all statements before the last one need to be enclosed inside an AS
				insertMultipleActivityValueStatements.push(`,"${ulid()}" as (${insertFieldStatements[i]})`);
			}
		}

		this.log.debug(`ActivitiesRepository> buildInsertActivityValuesStatements> exit: ${insertMultipleActivityValueStatements}`);

		return insertMultipleActivityValueStatements;
	}

	private buildActivityFilterExpressions(req: QueryRequest, transformKeyMap: Record<string, string>, tableAlias: string): string[] {
		this.log.debug(`ActivitiesRepository> buildActivityFilterExpressions> in: req: ${JSON.stringify(req)}, transformKeyMap: ${JSON.stringify(transformKeyMap)}, tableAlias:${tableAlias}`);

		let filters = [];

		// the conditionals to check pipelineId, executionId, is really either/or, this check of one of the property being present as a filter gets checked in the service layer before we get to this part
		// At this stage we assume one of the property has already been validated and we can proceed.

		if (req.groupId) {
			filters.push(`${tableAlias}."groupId" = '${req.groupId}'`);
		}

		// check if we need to filter by pipeline
		if (req.pipelineId) {
			filters.push(`${tableAlias}."pipelineId" = '${req.pipelineId}'`);
		}

		const attrKeys = Object.keys(req.attributes || {});
		if (attrKeys.length > 0) {
			attrKeys.forEach((attr) => {
				if (transformKeyMap[attr]) filters.push(`${tableAlias}."${transformKeyMap[attr]}" = '${req.attributes[attr]}'`);
			});
		}

		// this looks complex, but it really isn't
		// we first check if the user has specified date, if not, then we check if user has specified dateTo or dateFrom, if neither then we dont do any filtering
		// this is either/or type of scenario
		if (req.date) {
			filters.push(`${tableAlias}."date" = timestamp without time zone '${dayjs(req.date).utc().format('YYYY-MM-DD HH:mm:ss')}'`);
		} else {
			if (req.dateFrom) {
				filters.push(`${tableAlias}."date" >= timestamp without time zone  '${dayjs(req.dateFrom).utc().format('YYYY-MM-DD HH:mm:ss')}'`);
			}

			if (req.dateTo) {
				filters.push(`${tableAlias}."date" <= timestamp without time zone  '${dayjs(req.dateTo).utc().format('YYYY-MM-DD HH:mm:ss')}'`);
			}
		}

		this.log.debug(`ActivitiesRepository> buildActivityFilterExpressions> exit: ${JSON.stringify(filters)}`);
		return filters;
	}

	private buildActivityValueFilterExpressions(req: QueryRequest, tableAlias: string): string[] {
		this.log.debug(`ActivitiesRepository> buildActivityValueFilterExpressions> in: req: ${JSON.stringify(req)}, tableAlias:${tableAlias}`);

		let filters = [];

		// check if we need to filter by execution of a pipeline
		if (req.executionId) {
			filters.push(`${tableAlias}."executionId" = '${req.executionId}'`);
		}

		this.log.debug(`ActivitiesRepository> buildActivityValueFilterExpressions> exit: ${JSON.stringify(filters)}`);
		return filters;
	}

	private buildAggregateRawQuery(pipelineMetadata: PipelineMetadata, req: QueryRequest): string {
		this.log.debug(`ActivitiesRepository> buildAggregateRawQuery> in: pipelineMetadata: ${JSON.stringify(pipelineMetadata)}, req: ${JSON.stringify(req)}`);

		const selectExpressions = `${pipelineMetadata?.aggregate?.fields.map(o => {
			let statement: string;
			switch (o.aggregate) {
				case 'groupBy' :
					if (o.type === 'timestamp') {
						statement = `date("${o.key}") as "${o.key}"`;
					} else {
						statement = `"${o.key}"`;
					}
					break;
				case 'count':
					statement = `${o.aggregate}("${o.key}") "${o.key}"`;
					break;
				case 'mean':
					// avg is sql equivalent of mean function, this can only be
					// performed on numeric value
					statement = `avg(CAST( "${o.key}" as float)) "${o.key}"`;
					break;
				default:
					// other aggregation function can only be performed on numeric value
					statement = `${o.aggregate}(CAST( "${o.key}" as float)) "${o.key}"`;
					break;
			}
			return statement;

		}).join(',')}`;

		const groupByExpressions = `GROUP BY ${pipelineMetadata.aggregate.fields.filter(o => o.aggregate === 'groupBy').map(o => `data."${o.key}"`).join(',')}`;

		const filters = this.buildActivityFilterExpressions(req, pipelineMetadata.transformKeyMap, 'a');
		const filterClause = filters.length > 0 ? ` AND ${filters.join(' AND ')}` : '';

		/* transpose the name/value multi rows into a single row multi column output  */
		const query = `
SELECT ${selectExpressions} FROM (
	SELECT	a."activityId",
		${this.buildColumnSelects(pipelineMetadata.outputKeysAndTypes, pipelineMetadata.transformKeyMap, true)}
	FROM "Activity" a
		${this.buildLeftJoinTables(pipelineMetadata.outputTypes, true)}
	WHERE "type" = 'raw'
		${filterClause}
	GROUP BY a."activityId"
) AS data
${groupByExpressions}
LIMIT ${req.maxRows} OFFSET ${req.nextToken}
`;

		this.log.debug(`ActivitiesRepository> buildAggregateRawQuery> exit:${query}`);
		return query;
	}

	private containsFieldType(pipelineMetadata: PipelineMetadata, type: string, aggregateType: boolean): boolean {
		if (aggregateType) {
			return pipelineMetadata.aggregate.fields.filter(o => o.key !== pipelineMetadata.aggregate.timestampField).find(o => o.type === type) !== undefined;
		}
		return pipelineMetadata.outputTypes.find(o => o === type) !== undefined;
	}

	private buildGetLatestQuery(pipelineMetadata: PipelineMetadata, req: QueryRequest): string {
		this.log.debug(`ActivitiesRepository> buildGetQuery> in: req:${JSON.stringify(req)}, pipelineMetadata: ${JSON.stringify(pipelineMetadata)}`);

		const rowType = (req.showAggregate) ? ROW_TYPE_AGGREGATED : ROW_TYPE_RAW;

		// if request does not have executionId use the latest value tables
		const tableMap = req.executionId ? this.typeToValueTableMap : this.typeToLatestValueTableMap;
		const useLatestValue = !req.executionId;

		const allFilters = [
			...this.buildActivityFilterExpressions(req, pipelineMetadata.transformKeyMap, 'a'),
			...this.containsFieldType(pipelineMetadata, 'string', req.showAggregate) ? this.buildActivityValueFilterExpressions(req, tableMap.string.alias) : [],
			...this.containsFieldType(pipelineMetadata, 'number', req.showAggregate) ? this.buildActivityValueFilterExpressions(req, tableMap.number.alias) : [],
			...this.containsFieldType(pipelineMetadata, 'boolean', req.showAggregate) ? this.buildActivityValueFilterExpressions(req, tableMap.boolean.alias) : [],
			...this.containsFieldType(pipelineMetadata, 'timestamp', req.showAggregate) ? this.buildActivityValueFilterExpressions(req, tableMap.timestamp.alias) : []
		];

		const filterClause = allFilters.length > 0 ? ` AND ${allFilters.join(' AND ')}` : '';
		/* transpose the name/value multi rows into a single row multi column output  */
		const query = `
SELECT	a."activityId", a."date", a."pipelineId",
	${this.buildCoalesce(pipelineMetadata.outputTypes, 'executionId', useLatestValue)} "executionId",
	${this.buildCoalesce(pipelineMetadata.outputTypes, 'auditId', useLatestValue)} "auditId",
	${this.buildCoalesce(pipelineMetadata.outputTypes, 'createdAt', useLatestValue)} "createdAt",
	${this.buildColumnSelects(pipelineMetadata.outputKeysAndTypes, pipelineMetadata.transformKeyMap, useLatestValue)}

FROM "Activity" a
	${this.buildLeftJoinTables(pipelineMetadata.outputTypes, useLatestValue)}

WHERE "type" = '${rowType}'
	${filterClause} ${req.showAggregate ? ` AND  ${this.buildCoalesce(pipelineMetadata.outputTypes, 'createdAt', useLatestValue)} >= timestamp without time zone  '${dayjs(pipelineMetadata.updatedAt).utc().format('YYYY-MM-DD HH:mm:ss')}'` : ''}
GROUP BY a."activityId", a."date", a."pipelineId",
	${this.buildCoalesce(pipelineMetadata.outputTypes, 'executionId', useLatestValue)},
	${this.buildCoalesce(pipelineMetadata.outputTypes, 'auditId', useLatestValue)},
	${this.buildCoalesce(pipelineMetadata.outputTypes, 'createdAt', useLatestValue)}
LIMIT ${req.maxRows} OFFSET ${req.nextToken}
`;
		return query;
	}

	private buildSelectJoinFromMultipleAttributes({ updatedAt, outputKeysAndTypes, aggregate }: PipelineMetadata, executionId?: string, showAggregate?: boolean): [string, string] {
		this.log.debug(`ActivitiesRepository> buildSelectJoinFromMultipleAttributes> in: ${outputKeysAndTypes}`);

		const selectColumns = [];
		const joinStatements = [];
		const filteredConditions = [];
		let filteredConditionStatements = '';
		if (showAggregate) {
			// get the output keys from the fields that has aggregation configured
			outputKeysAndTypes = aggregate.fields.reduce((prev, currentValue) => {
				if (!aggregate.timestampField.includes(currentValue.key)) {
					prev[currentValue.key] = currentValue.type;
				}
				return prev;
			}, {});

			// make sure that we only select aggregation value that has been created after a specific pipeline
			filteredConditions.push(`"createdAt" >= timestamp without time zone '${dayjs(updatedAt).utc().format('YYYY-MM-DD HH:mm:ss')}'`);
		}

		if (executionId) {
			filteredConditions.push(`"executionId"='${executionId}'`);
		}

		if (filteredConditions.length > 0) {
			filteredConditionStatements = `WHERE ${filteredConditions.join(' AND ')}`;
		}

		Object.entries(outputKeysAndTypes).forEach(([key, value], index) => {
			const tableAlias = `col${index}`;
			selectColumns.push(`col${index}."${key}"`, `col${index}."${key}__error"`, `col${index}."${key}__errorMessage"`);
			joinStatements.push(`JOIN (	(SELECT	"activityId", ${index < 1 ? '"executionId", "auditId",' : ''}  "createdAt", "val" as "${key}", "error" as "${key}__error", "errorMessage" as "${key}__errorMessage"
			FROM "${this.typeToValueTableMap[value].name}" ${filteredConditionStatements} )asv join "filtered_activity" fa USING ("activityId")
		  ) ${tableAlias} USING ("activityId" ${index < 1 ? '' : ', "createdAt"'})`);
		});

		const fragment: [string, string] = [selectColumns.join(`,${NEWLINE_DELIMITER}`), joinStatements.join(NEWLINE_DELIMITER)];
		this.log.debug(`ActivitiesRepository> buildSelectJoinFromMultipleAttributes> exit: ${fragment}`);
		return fragment;
	}

	private buildGetHistoryQuery(pipelineMetadata: PipelineMetadata, req: QueryRequest): string {
		this.log.debug(`ActivitiesRepository> buildGetHistoryQuery> in: req:${JSON.stringify(req)}, pipelineMetadata: ${JSON.stringify(pipelineMetadata)}`);

		const rowType = (req.showAggregate) ? ROW_TYPE_AGGREGATED : ROW_TYPE_RAW;

		const filters = this.buildActivityFilterExpressions(req, pipelineMetadata.transformKeyMap, 'a');
		const filterClause = filters.length > 0 ? ` AND ${filters.join(' AND ')}` : '';

		const [multipleTableSelectStatements, multipleJoinStatements] = this.buildSelectJoinFromMultipleAttributes(pipelineMetadata, req.executionId, req.showAggregate);

		const query = `WITH filtered_activity AS (
	SELECT	"activityId", "date", "pipelineId"
	FROM "Activity" a
	WHERE "type" = '${rowType}'
	  ${filterClause}
)
SELECT DISTINCT ON (fa."activityId", col0."createdAt")
	   fa."activityId",
       fa."date",
       fa."pipelineId",
       col0."executionId",
       col0."auditId",
       col0."createdAt",
       ${multipleTableSelectStatements}
FROM "filtered_activity" fa
	${multipleJoinStatements}
ORDER BY col0."createdAt"
LIMIT ${req.maxRows} OFFSET ${req.nextToken??0}`;

		this.log.debug(query);
		return query;
	}

	private buildLeftJoinTables(outputTypes: string[], useLatestValues: boolean): string {
		this.log.debug(`ActivitiesRepository> buildLeftJoinTables> in: ${outputTypes}, useLatestValues:${useLatestValues}`);

		const tableMap = (useLatestValues) ? this.typeToLatestValueTableMap : this.typeToValueTableMap;
		const fragment = outputTypes?.map(t => `\n\t\tLEFT JOIN "${tableMap[t].name}" ${tableMap[t].alias} USING ("activityId")`)?.join('');
		this.log.debug(`ActivitiesRepository> buildLeftJoinTables> exit: ${fragment}`);
		return fragment;
	}

	private buildCoalesce(outputTypes: string[], columnName: string, useLatestValues: boolean): string {
		this.log.debug(`ActivitiesRepository> buildCoalesce> in: outputTypes:${outputTypes}, columnName:${columnName}, useLatestValues:${useLatestValues}`);

		const tableMap = (useLatestValues) ? this.typeToLatestValueTableMap : this.typeToValueTableMap;
		const fragment = `coalesce(${outputTypes?.map(t => `${tableMap[t].alias}."${columnName}"`).join(',')})`;

		this.log.debug(`ActivitiesRepository> buildCoalesce> exit: ${fragment}`);
		return fragment;
	}

	private buildColumnSelects(outputKeysAndTypes: Record<string, string>, transFormKeyMap: Record<string, string>, latestValues: boolean): string {
		this.log.debug(`ActivitiesRepository> buildColumnSelects> in: outputKeysAndTypes:${JSON.stringify(outputKeysAndTypes)}, latestValues:${latestValues}`);

		let columnSelects = [];

		for (const outputKey in outputKeysAndTypes) {
			const outputType = outputKeysAndTypes[outputKey];
			const tableAlias = (latestValues) ? this.typeToLatestValueTableMap[outputType].alias : this.typeToValueTableMap[outputType].alias;
			const tablePrefix = `${tableAlias}.`;
			if(transFormKeyMap[outputKey]) {
				columnSelects.push(`a.${transFormKeyMap[outputKey]} "${outputKey}"`);
			} else {
				columnSelects.push(`max(CASE WHEN ${tablePrefix}"name"='${outputKey}' THEN ${tablePrefix}"val" ELSE NULL END) "${outputKey}"`);
			}
		}

		// join the column select statements with a comma
		return columnSelects.join(',\n');
	}

	public async createTempTables(event:InsertActivityBulkEvent, sharedConnection?: Client) {
		this.log.debug(`ActivitiesRepository> createTempTables> in: event:${JSON.stringify(event)}`);
		let createStatement = '';

		//Create temporary de normalized activity value table
		createStatement += `CREATE UNLOGGED TABLE IF NOT EXISTS "ActivityValue_${event.executionId}_${event.sequence}" (
			"activityId" varchar(128),
			"groupId" varchar(128),
			"pipelineId" varchar(32),
			"executionId" varchar(32),
			"dateString" varchar(26) NOT NULL,
			"isDeletion" boolean DEFAULT false,
			key1 varchar(128),
			key2 varchar(128),
			key3 varchar(128),
			key4 varchar(128),
			key5 varchar(128),
			"name" varchar(128),
			"createdAtString" varchar(32),
			val varchar(256),
			error boolean,
			"errorMessage" varchar(512),
			"auditId" uuid,
			"dataType" varchar(26));
			\n`;

		this.log.trace(`ActivitiesRepository> createTempTables> query: ${createStatement}`);
		await this.executeQuery(createStatement, sharedConnection);
		this.log.debug(`ActivitiesRepository> createTempTables> exit`);
	}


	public async cleanupTempTables(events:ProcessedTaskEvent[], sharedConnection?: Client, dropFlag?: boolean) {
		this.log.debug(`ActivitiesRepository> cleanupTempTables> in: ActivityEvents:${JSON.stringify(events)}`);
		let cleanupStatement = '';
		const executionId = events[0].executionId;

			for (const event of events){
				const tablePostfix = `${executionId}_${event.sequence}`;
				//TODO: This truncate statement might cause session pinning need further load testing to confirm
			cleanupStatement+= `
			do $$
			BEGIN
			IF (SELECT EXISTS (
				SELECT FROM
					information_schema.tables
				WHERE
					table_schema LIKE 'public' AND
					table_type LIKE 'BASE TABLE' AND
					table_name = 'ActivityValue_${tablePostfix}'
				)) THEN
				TRUNCATE "ActivityValue_${tablePostfix}";
			END IF;
			END;
			$$;\n`;

				if (dropFlag) {
					cleanupStatement += (`DROP TABLE "ActivityValue_${tablePostfix}"; \n `);
				}
			}

		this.log.trace(`ActivitiesRepository> cleanupTempTables> query: ${cleanupStatement}`);
		await this.executeQuery(cleanupStatement, sharedConnection);
		this.log.debug(`ActivitiesRepository> cleanupTempTables> exit`);
	}


	public async getCountTempTables(executionId: string, sharedConnection?: Client) {
		this.log.debug(`ActivitiesRepository> getCountTempTables> in: executionId:${executionId}`);

		const queryStatement = `SELECT COUNT(*) FROM information_schema.tables WHERE table_name like 'ActivityValue_${executionId}%'`;
		const queryResponse = await this.executeQuery(queryStatement, sharedConnection);

		this.log.trace(`ActivitiesRepository> getCountTempTables> exit : ${JSON.stringify(queryResponse)}`);
		const count: number = Number(queryResponse?.[0]?.['count']) ?? 0;

		this.log.debug(`ActivitiesRepository> getCountTempTables> exit count: ${count}`);
		return count;
	}

	public async moveActivities(event:InsertActivityBulkEvent, sharedConnection?: Client){
		this.log.debug(`ActivitiesRepository> moveActivities> in: executionId:${event.executionId}, sequence:${event.sequence}`);

		const queryStatement = `INSERT INTO "Activity"("groupId", "pipelineId", "date", "key1", "key2","key3","key4","key5")
			SELECT t."groupId", t."pipelineId", to_timestamp("dateString"::numeric), t."key1", t."key2",t."key3",t."key4",t."key5"
			FROM "ActivityValue_${event.executionId}_${event.sequence}" t
			LEFT JOIN "Activity" a
			ON a."groupId"=t."groupId" AND a."pipelineId"=t."pipelineId" AND a."date"=to_timestamp("dateString"::numeric) AND a."type"='raw'
			AND a."key1"= t."key1" AND a."key2"=t."key2" AND a."key3"=t."key3" AND a."key4"=t."key4" AND a."key5"=t."key5"
			where a."activityId" IS NULL
			GROUP BY t."groupId", t."pipelineId", to_timestamp("dateString"::numeric), t."key1", t."key2",t."key3",t."key4",t."key5"`

		this.log.trace(`ActivitiesRepository> moveActivities> queryStatement:${queryStatement}`);
		await this.executeQuery(queryStatement, sharedConnection);
		this.log.debug(`ActivitiesRepository> moveActivities> exit`);

	}


	public async moveActivityValues(event:InsertActivityBulkEvent, sharedConnection?: Client){
		this.log.debug(`ActivitiesRepository> moveActivityValues> in: executionId:${event.executionId}, sequence:${event.sequence}`);
		let queries= [];
		const types = ['Boolean','DateTime','Number','String'];

		const insertStatement = `INSERT INTO "Activity#TypeValue" ("activityId","name", "createdAt", "executionId", "val", "error", "errorMessage", "auditId")
			SELECT a."activityId","name", to_timestamp("createdAtString"::numeric), '${event.executionId}', #Value, "error","errorMessage","auditId"
			FROM "ActivityValue_${event.executionId}_${event.sequence}" av
			JOIN "Activity" a on a."groupId"= av."groupId" AND a."pipelineId"= av."pipelineId" AND a."date"= to_timestamp(av."dateString"::numeric) AND a."key1"= av."key1" AND a."key2"= av."key2" AND a."key3"= av."key3" AND a."key4"= av."key4" AND a."key5"= av."key5" AND a."type"= 'raw'
			WHERE av."dataType" = '#Type';
`
		for (const type of types){
			switch(type) {
				case "Boolean":
					queries.push(insertStatement.replaceAll('#Type',type).replaceAll('#Value',`"val"::BOOLEAN`)) ;
					break;
				case "Number":
					queries.push( insertStatement.replaceAll('#Type',type).replaceAll('#Value',`"val"::numeric`));
					break;
				case "DateTime":
					queries.push(insertStatement.replaceAll('#Type',type).replaceAll('#Value',`to_timestamp("val"::numeric)`));
					break;
				default:
					queries.push(insertStatement.replaceAll('#Type',type).replaceAll('#Value',`"val"`));
					break;

			}
		}

		const queryStatement = queries.join('\n');
		this.log.trace(`ActivitiesRepository> moveActivityValues> queryStatement:${queryStatement}`);
		await this.executeQuery(queryStatement, sharedConnection);
		this.log.debug(`ActivitiesRepository> moveActivityValues> exit`);

	}
	public async loadDataFromS3(event:InsertActivityBulkEvent,bucket:string, sharedConnection?: Client){
		this.log.debug(`ActivitiesRepository> loadDataFromS3> in: executionId:${event.executionId}, sequence:${event.sequence}`);

		 const insertDeNormalizedActivityValueStatement = `SELECT aws_s3.table_import_from_s3(
			'"ActivityValue_${event.executionId}_${event.sequence}"',
			'"activityId","groupId","pipelineId","executionId","dateString","key1","key2","key3","key4","key5","isDeletion","name","createdAtString","val","error","errorMessage","auditId","dataType"',
			'(format csv, header 1)',
			'${bucket}',
			'${event.activityValuesKey}',
			'${process.env['AWS_REGION']}',
			'${process.env['AWS_ACCESS_KEY_ID']}',
			'${process.env['AWS_SECRET_ACCESS_KEY']}',
			'${process.env['AWS_SESSION_TOKEN']}'
		);
		 `
		 this.log.trace(`ActivitiesRepository> loadDataFromS3> insertDeNormalizedActivityValueStatement: ${insertDeNormalizedActivityValueStatement}`);
		 await this.executeQuery(insertDeNormalizedActivityValueStatement, sharedConnection);

		 this.log.debug(`ActivitiesRepository> loadDataFromS3> completed insertDeNormalizedActivityValueStatement`);
	}

}
