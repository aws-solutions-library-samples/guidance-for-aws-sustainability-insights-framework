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
import { createDelimitedAttribute } from '@sif/dynamodb-utils';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { ProtectedQueryDetail } from './cleanRooms.model.js';
import { PkType } from './cleanRooms.model.js';

export class CleanRoomsRepository {

	public constructor(private log: BaseLogger, private dynamodbClient: DynamoDBDocumentClient, private tableName: string) {
	}

	public async get(queryId: string): Promise<ProtectedQueryDetail | undefined> {
		this.log.info(`CleanRoomsRepository> get> queryId: ${queryId}`);

		const queryDbId = createDelimitedAttribute(PkType.Query, queryId);

		const { Item } = await this.dynamodbClient.send(new GetCommand({
			Key: {
				pk: queryDbId
			}, TableName: this.tableName
		}));

		if (!Item) {
			return undefined;
		}

		const { pk, ...rest } = Item;

		const queryDetail: ProtectedQueryDetail = {
			...rest,
			queryId
		} as ProtectedQueryDetail;

		this.log.info(`CleanRoomsRepository> get> queryDetail: ${queryDetail}`);

		return queryDetail;
	}

	public async create(queryDetail: ProtectedQueryDetail): Promise<void> {
		this.log.info(`CleanRoomsRepository> create> queryDetail: ${JSON.stringify(queryDetail)}`);

		const { queryId, ...rest } = queryDetail;

		const queryDbId = createDelimitedAttribute(PkType.Query, queryId);

		await this.dynamodbClient.send(new PutCommand({
			TableName: this.tableName,
			Item: {
				pk: queryDbId,
				...rest
			}
		}));

		this.log.info(`CleanRoomsRepository> create> exit:`);
	}

}
