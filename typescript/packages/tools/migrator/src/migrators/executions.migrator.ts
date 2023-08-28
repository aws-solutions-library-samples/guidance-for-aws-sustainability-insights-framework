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

import { Command, Option } from 'clipanion';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import { BatchWriteCommand, BatchWriteCommandInput, DynamoDBDocumentClient, ScanCommand, ScanCommandInput, TranslateConfig } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { createDelimitedAttribute, expandDelimitedAttribute } from '@sif/dynamodb-utils';

dayjs.extend(utc);

const dynamoDBClient = new DynamoDBClient({});
const marshallOptions = {
	convertEmptyValues: false,
	removeUndefinedValues: true,
	convertClassInstanceToMap: false
};
const unmarshallOptions = {
	wrapNumbers: false
};
const translateConfig: TranslateConfig = { marshallOptions, unmarshallOptions };
const dbc = DynamoDBDocumentClient.from(dynamoDBClient, translateConfig);

const pageSize = 10; // max number of items to return per page
const delay = 1000; // delay between requests

export class ExecutionsMigrator extends Command {

	tenantId = Option.String();
	environment = Option.String();

	static override usage = Command.Usage({
		category: `SIF Migration`,
		description: `This command migrates pipeline execution from v1 to v2`,
		details: `The latest release of SIF has changes which refactor the way pipeline execution being saved into DynamoDB`,
		examples: [[
			`example of running the command`,
			`npm run start migrate:execution <tenantId> <environment>`
		]]
	});

	async execute() {
		try {
			// we will export the data from dynamodb to the tmp file
			await exportFromDynamoDB(this.tenantId, this.environment, undefined);

		} catch (e) {
			throw e;
		} finally {
		}

	}
}

export enum CommonPkType {
	Group = 'g',
	Partition = 'pa',
}

export enum PkType {
	PipelineExecution = 'pe',
}

const v1TableName = (tenantId: string, environment: string) => `sif-${tenantId}-${environment}-pipelineProcessors`;
const v2TableName = (tenantId: string, environment: string) => `sif-${tenantId}-${environment}-pipelineProcessorsV2`;

const getRandomPartition = () => {
	const min = Math.ceil(0);
	const max = Math.floor(3);
	return Math.floor(Math.random() * (max - min) + min); // The maximum is exclusive and the minimum is inclusive
};

const appendDelimiter = (groupId: string): string => {
	groupId = groupId.trim().toLowerCase();
	return groupId.endsWith('/') ? groupId : groupId + '/';
};

const convertV1ToV2 = (item: any): any[] => {

	const { pk, sk } = item;
	const pipelineId = expandDelimitedAttribute(pk)[1];
	const executionId = expandDelimitedAttribute(sk)[1];
	const groupDbId = createDelimitedAttribute(CommonPkType.Group, pipelineId);
	const pipelineExecutionId = createDelimitedAttribute(PkType.PipelineExecution, executionId);

	// Delete all key fields
	delete item['pk'];
	delete item['sk'];
	delete item['siKey1'];

	return [
		{
			// execution row
			PutRequest: {
				Item: {
					pk: pipelineExecutionId,
					sk: pipelineExecutionId,
					pipelineId: pipelineId,
					// migrate all old fields to new field
					groupContextId: item.hasOwnProperty('groupContextId') ? item['groupContextId'] : item['securityContextId'],
					/// migrate all unset auditVersion to version 0
					auditVersion: (item['auditVersion'] as number) ?? 0,
					groups: [pipelineId],
					...item,
				},
			},
		},
		{
			// execution mapped to pipeline row
			PutRequest: {
				Item: {
					pk: pipelineExecutionId,
					sk: groupDbId,
					siKey1: groupDbId,
					siKey3: createDelimitedAttribute(CommonPkType.Partition, getRandomPartition()),
					siSort3: createDelimitedAttribute(CommonPkType.Group, PkType.PipelineExecution, appendDelimiter(pipelineId), PkType.PipelineExecution, executionId),
				},
			},
		}
	];
};

let rowsProcessed = 0;

const exportFromDynamoDB = async (tenantId: string, environment: string, exclusiveStartKey?: Record<string, any>) => {
	const sourceTable = v1TableName(tenantId, environment);
	const destinationTable = v2TableName(tenantId, environment);

	try {
		const input: ScanCommandInput = {
			TableName: sourceTable,
			Limit: pageSize,
			ExclusiveStartKey: exclusiveStartKey ?? undefined
		};
		const response = await dbc.send(new ScanCommand(input));

		const batchWriteItems: BatchWriteCommandInput = {
			RequestItems: {
				[destinationTable]: []
			}
		};

		if (response.Items && response.Items.length > 0) {
			for (const item of response.Items) {
				batchWriteItems.RequestItems[destinationTable].push(...convertV1ToV2(item));
			}
			await dbc.send(new BatchWriteCommand(batchWriteItems));
			rowsProcessed = rowsProcessed + pageSize;
			console.log(`${rowsProcessed} rows are processed`);
		}

		// if there are more records to process, lets recursively get them
		if (response.LastEvaluatedKey) {
			// let's add a sleep so we don't bombard the service too much, also we need to make the scans predictable
			await new Promise((resolve) => setTimeout(resolve, delay));
			await exportFromDynamoDB(tenantId, environment, response.LastEvaluatedKey);
		}
	} catch (e) {
		/*
		* Semgrep issue https://sg.run/7Y5R
		* Ignore reason: Migrator tool is run by end user - there is no risk of command injection in this context
		*/
		// nosemgrep
		console.error(`Error scanning dynamodb table: ${sourceTable}`, e);
	}
};

