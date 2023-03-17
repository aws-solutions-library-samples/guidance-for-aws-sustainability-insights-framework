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

import { describe, expect, it, beforeEach } from 'vitest';
import pino from 'pino';
import { TagRepository } from './repository.js';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, QueryCommand, QueryCommandInput, TransactWriteCommand, TransactWriteCommandInput } from '@aws-sdk/lib-dynamodb';
import type { Tags } from './schemas.js';

describe('TagRepository', () => {
	const mockedDocumentClient = mockClient(DynamoDBDocumentClient);
	let underTest: TagRepository;

	const tableName = 'myTableName';

	beforeEach(() => {
		const logger = pino(
			pino.destination({
				sync: true, // test frameworks must use pino logger in sync mode!
			})
		);
		logger.level = 'debug';
		mockedDocumentClient.reset();
		underTest = new TagRepository(logger, mockedDocumentClient as unknown as DynamoDBDocumentClient, tableName);
	});

	it('updateGroupSummaries happy path', async () => {
		const groupId = '/A/B';
		const resourcePrefix = 'x';
		const tagsAdded: Tags = { Datasource: 'GHG Protocol' };
		const tagsRemoved: Tags = { Type: 'Material/Metal/Steel' };

		const expected: TransactWriteCommandInput = {
			TransactItems: [
				{
					Update: {
						TableName: tableName,
						Key: {
							pk: 'g:%2fa%2fb:tk:datasource:tv:ghg%20protocol',
							sk: 'tk:datasource:x',
						},
						UpdateExpression: 'SET #inUse = if_not_exists(#inUse, :start) + :inc, #siKey1 = :siKey1, #label= :label',
						ExpressionAttributeNames: {
							'#inUse': 'inUse',
							'#siKey1': 'siKey1',
							'#label': 'label',
						},
						ExpressionAttributeValues: {
							':start': 0,
							':inc': 1,
							':siKey1': 'g:%2fa%2fb:tk:datasource:x',
							':label': 'GHG Protocol',
						},
					},
				},
				{
					Update: {
						TableName: tableName,
						Key: {
							pk: 'g:%2fa%2fb:tk:type:tv:material',
							sk: 'tk:type:x',
						},
						UpdateExpression: 'SET #inUse = if_not_exists(#inUse, :start) + :inc, #siKey1 = :siKey1, #label= :label',
						ExpressionAttributeNames: {
							'#inUse': 'inUse',
							'#siKey1': 'siKey1',
							'#label': 'label',
						},
						ExpressionAttributeValues: {
							':start': 0,
							':inc': -1,
							':siKey1': 'g:%2fa%2fb:tk:type:x',
							':label': 'Material',
						},
					},
				},
				{
					Update: {
						TableName: tableName,
						Key: {
							pk: 'g:%2fa%2fb:tk:type:tv:material%2fmetal',
							sk: 'tk:type:tv:material:x',
						},
						UpdateExpression: 'SET #inUse = if_not_exists(#inUse, :start) + :inc, #siKey1 = :siKey1, #label= :label',
						ExpressionAttributeNames: {
							'#inUse': 'inUse',
							'#siKey1': 'siKey1',
							'#label': 'label',
						},
						ExpressionAttributeValues: {
							':start': 0,
							':inc': -1,
							':siKey1': 'g:%2fa%2fb:tk:type:tv:material:x',
							':label': 'Metal',
						},
					},
				},
				{
					Update: {
						TableName: tableName,
						Key: {
							pk: 'g:%2fa%2fb:tk:type:tv:material%2fmetal%2fsteel',
							sk: 'tk:type:tv:material%2fmetal:x',
						},
						UpdateExpression: 'SET #inUse = if_not_exists(#inUse, :start) + :inc, #siKey1 = :siKey1, #label= :label',
						ExpressionAttributeNames: {
							'#inUse': 'inUse',
							'#siKey1': 'siKey1',
							'#label': 'label',
						},
						ExpressionAttributeValues: {
							':start': 0,
							':inc': -1,
							':siKey1': 'g:%2fa%2fb:tk:type:tv:material%2fmetal:x',
							':label': 'Steel',
						},
					},
				},
			],
		};

		await underTest.updateGroupSummaries(groupId, resourcePrefix, tagsAdded, tagsRemoved);

		const spy = mockedDocumentClient.commandCalls(TransactWriteCommand)[0];
		expect(spy.args[0].input).toStrictEqual(expected);
	});

	it('updateGroupSummaries hierarchical processing', async () => {
		const groupId = '/A/B';
		const resourcePrefix = 'x';
		const tagsAdded: Tags = { Type: 'Material/Metal/Iron' };
		const tagsRemoved: Tags = { Type: 'Material/Metal/Steel' };

		const expected: TransactWriteCommandInput = {
			TransactItems: [
				{
					Update: {
						TableName: tableName,
						Key: {
							pk: 'g:%2fa%2fb:tk:type:tv:material%2fmetal%2firon',
							sk: 'tk:type:tv:material%2fmetal:x',
						},
						UpdateExpression: 'SET #inUse = if_not_exists(#inUse, :start) + :inc, #siKey1 = :siKey1, #label= :label',
						ExpressionAttributeNames: {
							'#inUse': 'inUse',
							'#siKey1': 'siKey1',
							'#label': 'label',
						},
						ExpressionAttributeValues: {
							':start': 0,
							':inc': 1,
							':siKey1': 'g:%2fa%2fb:tk:type:tv:material%2fmetal:x',
							':label': 'Iron',
						},
					},
				},
				{
					Update: {
						TableName: tableName,
						Key: {
							pk: 'g:%2fa%2fb:tk:type:tv:material%2fmetal%2fsteel',
							sk: 'tk:type:tv:material%2fmetal:x',
						},
						UpdateExpression: 'SET #inUse = if_not_exists(#inUse, :start) + :inc, #siKey1 = :siKey1, #label= :label',
						ExpressionAttributeNames: {
							'#inUse': 'inUse',
							'#siKey1': 'siKey1',
							'#label': 'label',
						},
						ExpressionAttributeValues: {
							':start': 0,
							':inc': -1,
							':siKey1': 'g:%2fa%2fb:tk:type:tv:material%2fmetal:x',
							':label': 'Steel',
						},
					},
				},
			],
		};

		await underTest.updateGroupSummaries(groupId, resourcePrefix, tagsAdded, tagsRemoved);

		const spy = mockedDocumentClient.commandCalls(TransactWriteCommand)[0];
		expect(spy.args[0].input).toStrictEqual(expected);
	});

	it('listByResourceId happy path (no pagination)', async () => {
		const resourceId = '123';
		const keyPrefix = 'r';
		const expected: Tags = { Datasource: 'GHG Protocol', Type: 'Material/Metal/Steel' };

		const expectedMockInput: QueryCommandInput = {
			TableName: 'myTableName',
			KeyConditionExpression: `#hash=:hash AND begins_with(#sortKey,:sortKey)`,
			ExpressionAttributeNames: {
				'#hash': 'pk',
				'#sortKey': 'sk',
				'#key': 'key',
				'#value': 'value',
			},
			ExpressionAttributeValues: {
				':hash': 'r:123',
				':sortKey': 'tk:',
			},
			ProjectionExpression: '#key,#value',
		};
		mockedDocumentClient.on(QueryCommand, expectedMockInput).resolves({
			Count: 4,
			Items: [
				{
					key: 'Datasource',
					value: 'GHG Protocol',
				},
				{
					key: 'Type',
					value: 'Material',
				},
				{
					key: 'Type',
					value: 'Material/Metal',
				},
				{
					key: 'Type',
					value: 'Material/Metal/Steel',
				},
			],
		});

		const actual = await underTest.listByResourceId(resourceId, keyPrefix);

		expect(actual.length).toBe(2);
		expect(actual[0]).toStrictEqual(expected);
		expect(actual[1]).toBeUndefined();
		expect(mockedDocumentClient.calls().length).toBe(1);
	});
});
