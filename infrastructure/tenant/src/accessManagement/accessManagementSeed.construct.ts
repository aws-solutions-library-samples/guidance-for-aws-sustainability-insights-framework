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

import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import { DynamoDBSeeder, Seeds } from '@sif/dynamodb-seeder';

export type AccessManagementSeedConstructProperties = {
	administratorEmail: string;
	tableName: string;
};

export class AccessManagementSeed extends Construct {
	constructor(scope: Construct, id: string, props: AccessManagementSeedConstructProperties) {
		super(scope, id);

		const table = Table.fromTableName(this, 'Table', props.tableName);

		const userDbId = `u:${encodeURIComponent(props.administratorEmail).toLowerCase()}`;
		const rootGroupDbId = 'g:%2f';

		new DynamoDBSeeder(this, 'DatabaseSeeder', {
			table,
			seeds: Seeds.fromInline([
				{
					pk: rootGroupDbId,
					sk: rootGroupDbId,
					siKey1: 'g',
					id: '/',
					name: 'Root',
					description: 'Root group',
					state: 'active',
					createdBy: 'installer',
					createdAt: new Date(Date.now()).toISOString(),
					configuration: {
						preferredGroup: '/',
						referenceDatasets: {
							alwaysUseLatest: true,
						},
						pipelineProcessor: {
							chunkSize: 1,
						},
					},
				},
				{
					pk: userDbId,
					sk: userDbId,
					siKey1: 'u',
					email: props.administratorEmail.toLowerCase(),
					state: 'invited',
					groups: {
						'/': 'admin',
					},
					defaultGroup: '/',
					createdBy: 'installer',
					createdAt: new Date(Date.now()).toISOString(),
				},
				{
					pk: userDbId,
					sk: rootGroupDbId,
					email: props.administratorEmail.toLowerCase(),
					siKey1: 'g:%2f',
					groupId: '/',
					role: 'admin',
					createdBy: 'installer',
					createdAt: new Date(Date.now()).toISOString(),
					siKey3: 'pa:0',
					siSort3: `g:u:%2f:${userDbId}`,
				},
			]),
		});

	}
}
