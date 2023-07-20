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
import { AthenaClient, StartQueryExecutionCommand, GetQueryExecutionCommand, GetQueryResultsCommandOutput, GetQueryResultsCommand } from '@aws-sdk/client-athena';
import type { QueryRequest } from './models';
import type { AuditExportUtil } from '../../../utils/auditExport.util.js';
import type { AuditList, AuditResource } from './schema';


const QUERY_RESULT_LOCATION = 'query/results/';
const POLLING_FREQUENCY = 200; // in milliseconds
const MAX_RETRIES = 125; // the number of allowed retries to return the results in 25 seconds before time out

export class ActivityAuditRepository {
	private readonly log: BaseLogger;
	private readonly athenaClient: AthenaClient;
	private readonly bucketName: string;
	private readonly bucketPrefix: string;
	private readonly athenaDatabaseName: string;
	private readonly athenaAuditLogsTableName: string;
	private readonly exportUtility: AuditExportUtil;

	constructor(
		log: BaseLogger,
		athenaClient: AthenaClient,
		bucketName:string,
		bucketPrefix:string,
		athenaDatabaseName:string,
		athenaAuditLogsTableName:string,
		exportUtility:AuditExportUtil
	) {
		this.log = log;
		this.athenaClient = athenaClient;
		this.bucketName = bucketName;
		this.bucketPrefix = bucketPrefix;
		this.athenaDatabaseName = athenaDatabaseName;
		this.athenaAuditLogsTableName = athenaAuditLogsTableName;
		this.exportUtility = exportUtility;
	}

	public async list(version:number, queryRequest:QueryRequest): Promise<AuditList> {
		this.log.debug(`ActivityAuditRepository > list > in version:${version} queryRequest: ${JSON.stringify(queryRequest)}`);


		const auditQuery = queryRequest[version];
		const tableName = `${this.athenaAuditLogsTableName}-v${version}`;

		const query = `SELECT auditid, pipeline_id, execution_id, cast (inputs as json) as inputs, cast (outputs as json) as outputs  FROM "${tableName}"
		WHERE "pipeline_id" in (${Array.from(auditQuery.pipelineIds).map(item => `'${item}'`).join(', ')})
		AND "execution_id" in (${Array.from(auditQuery.executionIds).map(item => `'${item}'`).join(', ')})
		AND "auditid" in (${Array.from(auditQuery.auditIds).map(item => `'${item}'`).join(', ')})
		ORDER BY "execution_id","auditid"`;

		const response = await this.execute(query);
		this.log.debug(`ActivityAuditRepository > list > exit ${JSON.stringify(response)}`);

		return response;

	}

	private async execute(query:string): Promise<AuditList> {
		this.log.debug(`ActivityAuditRepository > execute > in`);
		try {
			const startQueryExecutionCommand = new StartQueryExecutionCommand({
				QueryString: query,
				QueryExecutionContext: {
					Catalog: 'AwsDataCatalog',
					Database: this.athenaDatabaseName
				},
				ResultConfiguration: {
					OutputLocation: `s3://${this.bucketName}/${this.bucketPrefix}/${QUERY_RESULT_LOCATION}`,
				}
			});


			const queryExecution = await this.athenaClient.send(startQueryExecutionCommand);
			const queryExecutionId = queryExecution.QueryExecutionId;
			const result = this.getQueryResults(queryExecutionId);
			this.log.info(`ActivityAuditRepository > execute > exit`)
			return result;

		} catch (e) {
			console.log(e)
			throw new Error(`ActivityAuditRepository > execute > Failed: ${e.message}`)
		}
	}

	private async getQueryResults(queryExecutionId:string): Promise<AuditList>{
		this.log.debug(`ActivityAuditRepository > getQueryResults > in queryExecutionId: ${queryExecutionId}`);

		const response:AuditList = {
			status: 'FAILED',
			exportUrl: '',
			audits:[]
		}

		let executionResult;

		let queryStatus = 'QUEUED';
		let retries = 0;
		while ((queryStatus === 'QUEUED' || queryStatus === 'RUNNING') && retries <= MAX_RETRIES) {
			await new Promise(resolve => setTimeout(resolve, POLLING_FREQUENCY)); // Wait for the query to complete
			const getQueryExecutionCommand = new GetQueryExecutionCommand({ QueryExecutionId: queryExecutionId });
			executionResult = await this.athenaClient.send(getQueryExecutionCommand);
			queryStatus = executionResult.QueryExecution.Status.State;
			retries++;
		}

		if (queryStatus === 'SUCCEEDED'){
			const getQueryResultsCommand = new GetQueryResultsCommand({QueryExecutionId:queryExecutionId});
			const queryResults = await this.athenaClient.send(getQueryResultsCommand);
			const audits = this.convertResultsToJson(queryResults);
			response.status = 'SUCCEEDED';
			response['audits'] = audits;

			const exportUrl = await this.exportUtility.generateExportUrl(`${this.bucketPrefix}/${QUERY_RESULT_LOCATION}${executionResult.QueryExecution.QueryExecutionId}.csv`);
			response.exportUrl = exportUrl;
		} else if ( retries >= MAX_RETRIES ) {
			response.status = 'SUCCEEDED';
			response['audits'] = [];
			const exportUrl = await this.exportUtility.generateExportUrl(`${this.bucketPrefix}/${QUERY_RESULT_LOCATION}${executionResult.QueryExecution.QueryExecutionId}.csv`);
			response.exportUrl = exportUrl;
		} else {
			response.status = 'FAILED';
			response['audits'] = [];
		}
		this.log.debug(`ActivityAuditRepository > getQueryResults > out`);
		return response;

	}



	private convertResultsToJson(data: GetQueryResultsCommandOutput): AuditResource[] {
		const columns = data.ResultSet.ResultSetMetadata.ColumnInfo;
		const rows = data.ResultSet.Rows.slice(1); // Skip the header row
		const columnMap = {'auditid': 'auditId', 'execution_id': 'executionId', 'pipeline_id': 'pipelineId'}
		let results:AuditResource[] =[];
		if ( rows.length > 0 ){
			 results = rows.map((row) => {
				const result: AuditResource = {
				  pipelineId:'',
				  executionId:'',
				  auditId:''
				};

				row.Data.forEach((value, index) => {
				  let columnName = columns[index].Name;
				  if(columnMap[columnName]){
					  columnName = columnMap[columnName];
				  }

				  if(['inputs','outputs'].includes(columnName) ){
					  result[columnName] = JSON.parse(value.VarCharValue);
				  } else {
					  result[columnName] = value.VarCharValue;
				  }

				});
				return result;
			  });

		}

		return results;
	  }

}
