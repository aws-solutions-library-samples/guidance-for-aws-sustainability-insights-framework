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

import { Construct } from 'constructs';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { DynamoDBSeeder, Seeds } from '@cloudcomponents/cdk-dynamodb-seeder';
import { createDelimitedAttribute } from '@sif/dynamodb-utils';

export interface SemaphoreSeederConstructProperties {
	tableName: string;
	lockName: string;
}

export enum PkType {
	Lock = 'l',
	Queue = 'q'
}

export class SemaphoreSeeder extends Construct {
	constructor(scope: Construct, id: string, props: SemaphoreSeederConstructProperties) {
		super(scope, id);

		const table = Table.fromTableName(this, 'Table', props.tableName);

		new DynamoDBSeeder(this, 'DatabaseSeeder', {
			table,
			seeds: Seeds.fromInline([
				{
					pk: createDelimitedAttribute(PkType.Lock, props.lockName),
					currentLockCount: 0
				}]),
		});

	}
}