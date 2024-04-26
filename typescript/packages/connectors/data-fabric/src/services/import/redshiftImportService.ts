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


import type { AwsCredentialIdentity } from '@aws-sdk/types';
import { DescribeStatementCommand, DescribeStatementCommandInput, DescribeStatementCommandOutput, ExecuteStatementCommand, GetStatementResultCommand, RedshiftDataClient } from '@aws-sdk/client-redshift-data';
import { ReadableStream } from 'stream/web';
import type { BaseLogger } from 'pino';
import { createWaiter, WaiterConfiguration, WaiterResult, WaiterState } from '@smithy/util-waiter';
import type { DataFabricHelper } from '../../plugins/dataFabricHelper';

const checkState = async (client: RedshiftDataClient, input: DescribeStatementCommandInput): Promise<WaiterResult> => {
	let reason: DescribeStatementCommandOutput;
	const result: DescribeStatementCommandOutput = await client.send(new DescribeStatementCommand(input));
	reason = result;

	switch (result.Status) {
		case 'STARTED':
		case 'SUBMITTED':
		case 'PICKED':
			return { state: WaiterState.RETRY, reason };
		case 'FINISHED':
			return { state: WaiterState.SUCCESS, reason };
		case 'ABORTED':
			return { state: WaiterState.ABORTED, reason };
		case 'FAILED':
			return { state: WaiterState.FAILURE, reason };
	}

	return { state: WaiterState.SUCCESS, reason };
};

export const waitForRedshiftExecution = async (
	params: WaiterConfiguration<RedshiftDataClient>,
	input: DescribeStatementCommandInput
): Promise<WaiterResult> => {
	const serviceDefaults = { minDelay: 5, maxDelay: 120 };
	return createWaiter({ ...serviceDefaults, ...params }, input, checkState);
};

export interface RedshiftAssetDetail {
	RedshiftTableForm: RedshiftTableForm;
	'df_profile_form': {
		lineage_asset_name: string;
		lineage_asset_namespace: string;
	};
}

export interface RedshiftTableForm {
	accountId: string;
	databaseName: string;
	redshiftStorage: RedshiftStorage;
	columns: Column[];
	storageType: string;
	region: string;
	schemaName: string;
	tableName: string;
}

export interface RedshiftStorage {
	redshiftServerlessSource: RedshiftServerlessSource;
}

export interface RedshiftServerlessSource {
	workgroupArn: string;
	namespaceArn: string;
	workgroupName: string;
	namespaceName: string;
}

export interface Column {
	dataType: string;
	columnName: string;
}

export class RedshiftImportService {

	constructor(private readonly log: BaseLogger, private readonly dataFabricHelper: DataFabricHelper) {
	}

	public async query(credentials: AwsCredentialIdentity, assetDetail: RedshiftAssetDetail, params: { domainId: string, environmentId: string, assetListingId: string }): Promise<NodeJS.ReadableStream> {
		this.log.trace(`RedshiftImportService> query> in> assetDetail: ${JSON.stringify(assetDetail)}`);
		const { region } = assetDetail.RedshiftTableForm;

		const { databaseName, workgroupName, targetName } = await this.dataFabricHelper.getRedshiftDatabaseDetail(params.domainId, params.environmentId, params.assetListingId);

		const redshiftDataClient = new RedshiftDataClient({
			credentials,
			region
		});

		const executeStatementResponse = await redshiftDataClient.send(new ExecuteStatementCommand({
			Database: databaseName,
			Sql: `SELECT * FROM ${targetName};`,
			WorkgroupName: workgroupName
		}));

		await waitForRedshiftExecution({ client: redshiftDataClient, maxWaitTime: 60 }, { Id: executeStatementResponse.Id });

		const results = await redshiftDataClient.send(new GetStatementResultCommand({
			Id: executeStatementResponse.Id
		}));

		this.log.trace(`RedshiftImportService> query> exit>`);

		return new ReadableStream({
			start(controller) {
				function push() {
					controller.enqueue(results.Records[0].map(r => Object.keys(r).pop()).join(',').concat('\n'));
					for (const row of results.Records) {
						controller.enqueue(row.map(r => Object.values(r).pop()).join(',').concat('\n'));
					}
					controller.close();
					return;
				}

				push();
			},
		}) as any;
	}

}
