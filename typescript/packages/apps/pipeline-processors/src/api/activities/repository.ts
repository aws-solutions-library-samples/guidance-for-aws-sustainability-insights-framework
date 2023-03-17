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
import type { Aggregate, PipelineMetadata, QueryRequest, QueryResponse } from './models.js';
import type { AffectedTimeRange } from '../metrics/models.js';
import type { Client } from 'pg';
import { validateNotEmpty } from '@sif/validators';
import { ulid } from 'ulid';

const ROW_TYPE_AGGREGATED = 'aggregated';
const ROW_TYPE_RAW = 'raw';

dayjs.extend(utc);

export class ActivitiesRepository {
	private defaultLimit = 100;
	private readonly log: BaseLogger;
	private readonly baseRepositoryClient: BaseRepositoryClient;
	private readonly attributeTableNameMap: { string: string; number: string; boolean: string; timestamp: string };
	private readonly activitiesTableName: string;
	private readonly activitiesStringValueTableName: string;
	private readonly activitiesNumberTableName: string;
	private readonly activitiesBooleanTableName: string;
	private readonly activitiesDateTimeTableName: string;

	constructor(
		log: BaseLogger,
		repoClient: BaseRepositoryClient,
		activitiesTableName: string,
		activitiesStringValueTableName: string,
		activitiesNumberTableName: string,
		activitiesBooleanTableName: string,
		activitiesDateTimeTableName: string
	) {
		this.log = log;
		this.baseRepositoryClient = repoClient;
		this.activitiesTableName = activitiesTableName;
		this.activitiesStringValueTableName = activitiesStringValueTableName;
		this.activitiesBooleanTableName = activitiesBooleanTableName;
		this.activitiesDateTimeTableName = activitiesDateTimeTableName;
		this.activitiesNumberTableName = activitiesNumberTableName;
		this.attributeTableNameMap = {
			string: this.activitiesStringValueTableName,
			number: this.activitiesNumberTableName,
			boolean: this.activitiesBooleanTableName,
			timestamp: this.activitiesDateTimeTableName,
		};
	}

	public async getAffectedTimeRange(pipelineId: string, executionId: string): Promise<AffectedTimeRange> {
		this.log.info(`ActivitiesRepository> getAffectedTimeRange> in: pipelineId:${pipelineId}, executionId:${executionId}`);

		validateNotEmpty(pipelineId, 'pipelineId');
		validateNotEmpty(executionId, 'executionId');

		// min and max are based on the latest pipeline execution based on the max(date) field of the activity
		const query = `
SELECT min(a.date) as from , date_trunc('day', max(a.date)) + interval '1 day' as to
FROM "${this.activitiesTableName}" a
JOIN (
	SELECT "activityId"
	FROM "${this.activitiesNumberTableName}" env
	WHERE env."executionId" = '${executionId}'
	GROUP BY "activityId" )
env ON (a."activityId"=env."activityId")`;

		this.log.trace(`ActivitiesRepository> getAffectedTimeRange> query:${query}`);

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

		this.log.trace(`ActivitiesRepository> getAffectedTimeRange> timeRangeResult:${JSON.stringify(result)}`);

		if ((result?.rows?.length ?? 0) === 0) {
			// TODO: custom error
			throw new Error(`No existing data found for pipeline '${pipelineId}', execution '${executionId}.`);
		}

		// this should only return 1 row
		const response: AffectedTimeRange = { from: result.rows[0].from, to: result.rows[0].to };

		this.log.info(`ActivitiesRepository> getAffectedTimeRange> exit: ${JSON.stringify(response)}`);
		return response;
	}

	public async get(req: QueryRequest, pipelineMetadata: PipelineMetadata, runAggregate = false): Promise<QueryResponse> {
		this.log.info(`ActivitiesRepository> get> in: req:${JSON.stringify(req)}`);

		// we will default the maxRows which can be retrieved to the default limit set
		// dont want to return thousands of records, works like a fail safe
		if (!req.maxRows) {
			req.maxRows = this.defaultLimit;
		}

		// nextToken will always start from 0 if one hasnt been provided through the request,
		// since we are dealing with an offset which is our nextToke, we want that that next
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

		const query = runAggregate ? this.createAggregatedQuery(pipelineMetadata, req) : this.createQuery(pipelineMetadata, req);

		const rows = await this.executeQuery(query);
		const data = rows.map(row => this.assemble(row, Array.from(timestampFields)));

		const queryResult: QueryResponse = {
			nextToken: req.maxRows + req.nextToken || 0,
			data,
		};

		this.log.info(`ActivitiesRepository> get> out: result:${JSON.stringify(queryResult)}`);
		return queryResult;
	}

	public async createAggregatedActivities(activities: Record<string, string>[], pipelineId: string, executionId: string, groupId: string, fieldToTypeMap: { [key: string]: string }, pipelineMetadata: PipelineMetadata): Promise<void> {
		this.log.info(`ActivitiesRepository> createAggregatedActivities> in: pipelineId:${JSON.stringify(pipelineId)}, pipelineMetadata: ${JSON.stringify(pipelineMetadata)}, executionId: ${executionId}`);
		const queries = this.createInsertAggregatedActivityQuery(activities, pipelineId, executionId, groupId, fieldToTypeMap, pipelineMetadata);
		if (queries.length < 1) return;

		await this.executeQueriesInsideTransaction(queries);
		this.log.info(`ActivitiesRepository> createAggregatedActivities> out:`);
	}

	private async executeQueriesInsideTransaction(queries: string[]): Promise<void> {
		this.log.info(`ActivitiesRepository> executeQueriesInsideTransaction> in: `);

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

		this.log.info(`ActivitiesRepository> executeQueriesInsideTransaction> out: `);
	}

	private async executeQuery(query: string): Promise<Record<string, string>[]> {
		this.log.info(`ActivitiesRepository> executeQuery> in: `);

		const dbConnection = await this.baseRepositoryClient.getConnection();

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
			this.log.debug(`ActivitiesRepository> executeQuery: undefined`);
			return [];
		}

		this.log.debug(`ActivitiesRepository> getData> data:${JSON.stringify(result)}`);
		return result.rows;
	}

	private assemble(row: any, timestampFields: string[]): Record<string, string> {
		this.log.debug(`ActivitiesRepository> assemble> in: `);
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
		this.log.debug(`ActivitiesRepository> assemble> out: `);
		return activity;
	}

	private createInsertAggregatedActivityQuery(activities: Record<string, string>[], pipelineId: string, executionId: string, groupId: string, fieldToTypeMap: { [key: string]: string }, pipelineMetadata: PipelineMetadata): string[] {
		this.log.debug(`ActivitiesRepository> createInsertAggregatedActivityQuery> in: `);

		const insertStatements: string[] = [];

		for (let activity of activities) {
			const insertActivityReference = ulid();
			const insertActivityStatement = this.createInsertActivityStatement(activity, insertActivityReference, groupId, pipelineId, pipelineMetadata.aggregate);
			const insertMultipleActivityValueStatements = this.createInsertActivityValuesStatements(activity, insertActivityReference, executionId, fieldToTypeMap, pipelineMetadata.aggregate.timestampField);
			const query = [insertActivityStatement, ...insertMultipleActivityValueStatements].join('');
			insertStatements.push(query);
		}

		this.log.debug(`ActivitiesRepository> createInsertAggregatedActivityQuery> out: `);
		return insertStatements;
	}


	private createInsertActivityStatement(activity: Record<string, string>, insertActivityReference: string, groupId: string, pipelineId: string, aggregateMetadata: {
		fields: Aggregate[],
		timestampField: string
	}) {
		this.log.debug(`ActivitiesRepository> createInsertActivityStatement> in: activity: ${activity}, insertActivityReference: ${insertActivityReference}, groupId: ${groupId}, pipelineId: ${pipelineId}, aggregateMetadata: ${aggregateMetadata}`);

		const nullValues: string [] = ['___NULL___', '___NULL___', '___NULL___', '___NULL___', '___NULL___'];
		let nullIndex = 0;
		for (const aggregate of aggregateMetadata.fields) {
			if (aggregate.aggregate === 'groupBy' && activity[aggregate.key]) {
				nullValues[nullIndex++] = activity[aggregate.key];
			}
		}

		const query = `with "${insertActivityReference}" as (
INSERT INTO "${this.activitiesTableName}"
("groupId", "pipelineId", "date", "type", "key1", "key2", "key3", "key4", "key5")
VALUES
(
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

		this.log.debug(`ActivitiesRepository> createInsertActivityStatement> out: query: ${query}`);
		return query;
	}

	private createInsertActivityValuesStatements(activity: Record<string, string>, insertActivityReference: string, executionId: string, fieldToTypeMap: { [key: string]: string }, timestampField: string): string[] {
		this.log.debug(`ActivitiesRepository> createInsertActivityValuesStatements> in: activity: ${activity}, insertActivityReference: ${insertActivityReference}, fieldToTypeMap: ${fieldToTypeMap}, executionId: ${executionId}, timestampField: ${timestampField}`);

		const createdAt = dayjs().unix();
		const insertMultipleActivityValueStatements = [];
		const insertFieldStatements = [];

		for (const key in activity) {
			// generate insert statement to the appropriate table for each of the activity field (except the timestamp)
			if (key !== timestampField && activity.hasOwnProperty(key)) {
				const tableName = this.attributeTableNameMap[fieldToTypeMap[key]];
				let val;
				// convert the value to the right format
				switch (fieldToTypeMap[key]) {
					case 'timestamp' : {
						val = `to_timestamp('${dayjs(activity[key]).unix()}')`;
						break;
					}
					case 'number' : {
						val = parseFloat(activity[key]);
						break;
					}
					case 'string' :
					case 'boolean' : {
						val = `'${activity[key]}'`;
						break;
					}
				}

				const insertActivityValue = `
INSERT INTO "${tableName}"
("activityId", "name", "createdAt","executionId", "val", "error", "errorMessage")
VALUES (
( SELECT "activityId" from "${insertActivityReference}"),
'${key}', to_timestamp('${createdAt}'), '${executionId}', ${val}, false, null)
`;
				insertFieldStatements.push(insertActivityValue);
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

		this.log.debug(`ActivitiesRepository> createInsertActivityValuesStatements> out: insertMultipleActivityValueStatements: ${insertMultipleActivityValueStatements}`);

		return insertMultipleActivityValueStatements;
	}


	private createAggregatedQuery(pipelineMetadata: PipelineMetadata, req: QueryRequest): string {
		this.log.debug(`ActivitiesRepository> createInsertActivityValuesStatements> in: pipelineMetadata: ${pipelineMetadata}, req: ${req}`);

		const pagination = `LIMIT ${req.maxRows} OFFSET ${req.nextToken}`;

		const selectExpressions = `${pipelineMetadata?.aggregate?.fields.map(o => {
			let statement;
			switch (o.aggregate) {
				case 'groupBy' :
					if (o.type === 'timestamp') {
						statement = `date(y."${o.key}") as "${o.key}"`;
					} else {
						statement = `y."${o.key}"`;
					}
					break;
				case 'count':
					statement = `${o.aggregate}(y."${o.key}") "${o.key}"`;
					break;
				case 'mean':
					// avg is sql equivalent of mean function, this can only be
					// performed on numeric value
					statement = `avg(CAST( y."${o.key}" as float)) "${o.key}"`;
					break;
				default:
					// other aggregation function can only be performed on numeric value
					statement = `${o.aggregate}(CAST( y."${o.key}" as float)) "${o.key}"`;
					break;
			}
			return statement;

		}).join(',')}`;

		const groupByExpressions = `${pipelineMetadata.aggregate.fields.filter(o => o.aggregate === 'groupBy').map(o => `y."${o.key}"`).join(',')}`;

		const query = `SELECT ${selectExpressions} from (
SELECT a1."date", a1."pipelineId", x."executionId", x."createdAt",
${this.createColumnSelects(pipelineMetadata.outputKeys)}
FROM "${this.activitiesTableName}" a1
JOIN (${this.createOuterUnionQuery(pipelineMetadata.outputTypes, pipelineMetadata.transformKeyMap, req)}
) as x ON a1."activityId" = x."activityId"
WHERE a1."type" = '${ROW_TYPE_RAW}'
GROUP BY a1."date", a1."pipelineId", x."executionId", x."createdAt"
${this.createAttributeFilters(req)}
) as y
${this.createOutputFilter(pipelineMetadata.outputKeys, req)}
GROUP BY ${groupByExpressions}
${pagination}`;

		this.log.debug(`ActivitiesRepository> createInsertActivityValuesStatements> out: result:${JSON.stringify(query)}`);
		return query;
	}

	private createQuery(pipelineMetadata: PipelineMetadata, req: QueryRequest, count?: boolean): string {
		this.log.info(`ActivitiesRepository> createQuery> in: req:${JSON.stringify(req)}, pipelineMetadata: ${JSON.stringify(pipelineMetadata)}, count: ${count}`);
		// we have to figure out what the output column names are (outputKeys) and also what the output column types are (outputTypes)
		// this will help us build the required nested query

		const pagination = `LIMIT ${req.maxRows} OFFSET ${req.nextToken}`;

		let fields = pipelineMetadata.outputKeys;
		let rowType = ROW_TYPE_RAW;
		let groupByUniqueKeyFields = '';

		if (req.showAggregate) {
			// should only query for aggregated row type
			rowType = ROW_TYPE_AGGREGATED;
			if (pipelineMetadata?.aggregate?.fields) {
				// for aggregate query, we only select the properties that are aggregated
				fields = pipelineMetadata.aggregate.fields.filter(o => o.type !== 'timestamp').map(o => o.key);
				for (const [i, _] of pipelineMetadata?.aggregate?.fields?.entries()) {
					// to ensure all unique rows for the aggregated results to be queried
					// we need to add the groupBy statement for the key1, key2, key3, key4, key5 as required
					groupByUniqueKeyFields += `, key${i + 1}`;
				}
			}
		}

		const query = `SELECT * from (
SELECT a1."date", a1."pipelineId", x."executionId", x."createdAt", ${this.createColumnSelects(pipelineMetadata.outputKeys)}
FROM "${this.activitiesTableName}" a1
JOIN (${this.createOuterUnionQuery(pipelineMetadata.outputTypes, pipelineMetadata.transformKeyMap, req)}
) as x ON a1."activityId" = x."activityId"
WHERE a1."type" = '${rowType}'
GROUP BY a1."date", a1."pipelineId", x."executionId", x."createdAt"${groupByUniqueKeyFields}
${this.createAttributeFilters(req)}
) as y
${this.createOutputFilter(fields, req)}
${pagination}`;

		this.log.info(`ActivitiesRepository> createQuery> out: result:${JSON.stringify(query)}`);
		return query;
	}

	private createInnerNestedQuery(tableName: string, transformKeyMap: Record<string, string>, req: QueryRequest): string {
		let filters = [];

		// the conditionals to check pipelineId, executionId, is really either/or, this check of one of the property being present as a filter gets checked in the service layer before we get to this part
		// At this stage we assume one of the property has already been validated and we can proceed.

		// check if we need to filter by pipeline
		if (req.pipelineId) {
			filters.push(`AND a."pipelineId" = '${req.pipelineId}'`);
		}

		// check if we need to filter by execution of a pipeline
		if (req.executionId) {
			filters.push(`AND t."executionId" = '${req.executionId}'`);
		}

		const attrKeys = Object.keys(req.attributes || {});
		if (attrKeys.length > 0) {
			attrKeys.forEach((attr) => {
				if (transformKeyMap[attr]) filters.push(`AND a."${transformKeyMap[attr]}" = '${req.attributes[attr]}'`);
			});
		}

		// this looks complex, but it really isn't
		// we first check if the user has specified date, if not, then we check if user has specified dateTo or dateFrom, if neither then we dont do any filtering
		// this is either/or type of scenario
		if (req.date) {
			filters.push(`AND a."date" = timestamp '${dayjs.utc(req.date).format('YYYY-MM-DD HH:mm:ss')}'`);
		} else {
			if (req.dateFrom) {
				filters.push(`AND a."date" >= timestamp '${dayjs.utc(req.dateFrom).format('YYYY-MM-DD HH:mm:ss')}'`);
			}

			if (req.dateTo) {
				filters.push(`AND a."date" <= timestamp '${dayjs.utc(req.dateTo).format('YYYY-MM-DD HH:mm:ss')}'`);
			}
		}

		// handle a case where we need to remove the trailing zeros on ActivityNumberValueTable values
		// this is a conditional because we can only remove trailing zeros on a numeric field we do this by adding the ::REAL part on a."val" part, hence
		// this statement is pulled out from the query at line 208 and resolved conditionally before plugging it back in at like 208
		// one might ask. Why didn't I just do an inline conditional, well, inline conditional within a string interpolation will return either/or
		// result in my case, I only need to add this "::REAL" part if the table name is "ActivityNumberValueTable", in case it's not I would have to return something
		// since that something will get added as  "" or undefined or null as the result it will be a malformed sql statement,
		const conditionalSelect = req.showHistory
			? `${
				tableName === 'ActivityNumberValue'
					? 'SELECT t."activityId", t."name", t."createdAt", cast(t."val"::REAL as varchar), t."executionId"'
					: 'SELECT t."activityId", t."name", t."createdAt", cast(t."val" as varchar), t."executionId"'
			}`
			: `${
				tableName === 'ActivityNumberValue'
					? 'SELECT b."activityId", b."name", b."createdAt", cast(a."val"::REAL as varchar), a."executionId"'
					: 'SELECT b."activityId", b."name", b."createdAt", cast(a."val" as varchar), a."executionId"'
			}`;

		// lets construct the query itself, this is the most inner part of the query
		const str = `${conditionalSelect}
${
			req.showHistory
				? `FROM "${this.activitiesTableName}" a
JOIN "${tableName}" t ON (a."activityId"=t."activityId")
WHERE a."groupId" = '${req.groupId}'
${filters.join('\n')}`
				: `FROM "${tableName}" a
JOIN (SELECT t."activityId", t."name", max(t."createdAt") as "createdAt"
FROM "${this.activitiesTableName}" a
JOIN "${tableName}" t ON a."activityId" = t."activityId"
WHERE a."groupId" = '${req.groupId}' AND a."type" = '${req.showAggregate ? ROW_TYPE_AGGREGATED : ROW_TYPE_RAW}'
${filters.join('\n')}
GROUP BY t."activityId", t."name"
) b ON (a."activityId" = b."activityId" AND a."name" = b."name" AND a."createdAt" = b."createdAt")`
		}`;

		return str;
	}

	private createOuterUnionQuery(outputTypes: string[], transformKeys: Record<string, string>, req: QueryRequest): string {
		let outerUnionStatements = [];
		// lets loop over the output types i.e [string, number, ...]
		outputTypes.forEach((t) => {
			outerUnionStatements.push(this.createInnerNestedQuery(this.attributeTableNameMap[t], transformKeys, req));
		});
		// join the inner statements with a union
		return outerUnionStatements.join('\nUNION\n');
	}

	private createColumnSelects(outputKeys: string[]): string {
		let columnSelects = [];
		// let's loop over the output keys
		outputKeys.forEach((o) => {
			columnSelects.push(`max(CASE WHEN name='${o}' THEN val ELSE NULL END) "${o}"`);
		});
		// join the column select statements with a comma
		return columnSelects.join(',\n');
	}

	private createAttributeFilters(req: QueryRequest): string {
		let attributeFilterStatements = [];

		// if filter by attributes are specified then we need to construct this attribute filter like so:
		// HAVING max(CASE WHEN name='numericOutput' THEN val ELSE NULL END) = '100.000000'
		// AND max(CASE WHEN name='stringOutput' THEN val ELSE NULL END) = '1-1-first'
		// AND max(CASE WHEN name='stringOutput' THEN val ELSE NULL END) = '1-2-first'
		// since attributes will be initialized as an empty object to being with, we need to do a check if it has keys or not
		const attrKeys = Object.keys(req.attributes || {});
		if (attrKeys.length > 0) {
			attrKeys.forEach((attr, index) => {
				let innerStatement = ``;
				if (index === 0) {
					innerStatement = innerStatement.concat('HAVING ');
				}
				if (index !== 0) {
					innerStatement = innerStatement.concat('AND ');
				}
				if (req.showHistory) {
					innerStatement = innerStatement.concat('(');
				}

				innerStatement = innerStatement.concat(`max(CASE WHEN name='${attr}' THEN val ELSE NULL END) = '${req.attributes[attr]}'`);

				if (req.showHistory) {
					innerStatement = innerStatement.concat(` OR max(CASE WHEN name='${attr}' THEN val ELSE NULL END) IS NULL)`);
				}
				attributeFilterStatements.push(innerStatement);
			});
		}

		return attributeFilterStatements.join('\n');
	}


	private createOutputFilter(fields: string[], req: QueryRequest): string {
		let innerStatement = ``;

		// this filter is only applied when the showHistory flag is false
		if (!req.showHistory && fields.length > 0) {
			fields.forEach((key, index) => {

				if (index === 0) {
					innerStatement = innerStatement.concat('WHERE ');
				}
				if (index !== 0) {
					innerStatement = innerStatement.concat(' OR ');
				}
				innerStatement = innerStatement.concat(`"${key}" IS NOT NULL`);
			});
		}

		return innerStatement;
	}
}
