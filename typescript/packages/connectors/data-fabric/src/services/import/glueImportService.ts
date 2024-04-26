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
import { AthenaClient, GetQueryExecutionCommand, StartQueryExecutionCommand } from '@aws-sdk/client-athena';
import { GetObjectCommand, S3Client, waitUntilObjectExists } from '@aws-sdk/client-s3';
import type { BaseLogger } from 'pino';
import type { DataFabricHelper } from '../../plugins/dataFabricHelper';

export type GlueAssetDetail = {
	GlueTableForm: GlueTableForm;
	'df_profile_form': {
		lineage_asset_name: string;
		lineage_asset_namespace: string;
	}
}

export interface Column {
	dataType: string;
	columnName: string;
}

export interface GlueTableForm {
	catalogId: string;
	columns: Column[];
	sourceLocation: string;
	region: string;
	tableArn: string;
	tableName: string;
}

export class GlueImportService {

	constructor(private readonly log: BaseLogger, private readonly dataFabricHelper: DataFabricHelper) {
	}

	public async query(credentials: AwsCredentialIdentity, assetDetail: GlueAssetDetail, params: { domainId: string, environmentId: string }): Promise<NodeJS.ReadableStream> {
		this.log.trace(`GlueImportService> query> in> assetDetail: ${JSON.stringify(assetDetail)}, params: ${params}`);

		const { tableName, region, tableArn } = assetDetail.GlueTableForm;
		const [_tablePrefix, databaseName, _tableName] = tableArn.split('/');

		const athenaDatabaseDetail = await this.dataFabricHelper.getAthenaDatabaseDetail(params.domainId, params.environmentId);

		// Invoke the Athena StartsQueryExecution
		const athenaClient = new AthenaClient({ region, credentials });
		const startsQueryResponse = await athenaClient.send(new StartQueryExecutionCommand({ QueryString: `SELECT * FROM "${databaseName}"."${tableName}"`, WorkGroup: athenaDatabaseDetail.workgroup }));
		const getQueryResponse = await athenaClient.send(new GetQueryExecutionCommand({ QueryExecutionId: startsQueryResponse.QueryExecutionId }));

		// Get the query execution result from S3
		const s3Client = new S3Client({ credentials, region });
		const [bucket, ...keyPath] = getQueryResponse.QueryExecution?.ResultConfiguration?.OutputLocation?.replaceAll('s3://', '').split('/');

		// Wait until the query execution results exists
		await waitUntilObjectExists({ client: s3Client, maxWaitTime: 60 }, { Bucket: bucket, Key: keyPath.join('/') });
		const response = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: keyPath.join('/') }));

		this.log.trace(`GlueImportService> query> in> exit>`);
		return response.Body as NodeJS.ReadableStream;
	}
}
