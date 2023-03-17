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

import { beforeEach, describe, expect, it } from 'vitest';
import pino from 'pino';
import { ResourceRepository } from './repository.js';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, QueryCommand, QueryCommandInput, QueryCommandOutput } from '@aws-sdk/lib-dynamodb';
import type { ListIdsPaginationOptions, ListByTagPaginationOptions, ListIdsPaginationKey } from './models.js';
import { Utils } from '../common/utils.js';
import { createDelimitedAttribute } from '@sif/dynamodb-utils';
import { CommonPkType } from '../common/pkTypes';

const tableName = 'myTableName';

describe('ResourceRepository', () => {
	const mockedDocumentClient = mockClient(DynamoDBDocumentClient);
	let underTest: ResourceRepository;

	const partitionSize = 2;
	const taskParallelLimit = 10;
	let utils: Utils;

	const getQueryParamsForChildGroups = (partition: number, groupId: string): QueryCommandInput => {
		return {
			TableName: tableName,
			IndexName: 'siKey3-siSort3-index',
			KeyConditionExpression: '#hash=:hash AND begins_with(#sort,:sort)',
			ExpressionAttributeNames: { '#hash': 'siKey3', '#sort': 'siSort3' },
			ExpressionAttributeValues: {
				':hash': createDelimitedAttribute(CommonPkType.Partition, partition),
				':sort': createDelimitedAttribute(CommonPkType.Group, 'r', utils.appendDelimiter(groupId)),
			},
			ProjectionExpression: 'pk,siSort3',
		};
	};

	const getQueryParamsForListIds = (groupId: string, resourcePrefix = 'r'): QueryCommandInput => {
		return {
			TableName: tableName,
			IndexName: 'siKey1-pk-index',
			KeyConditionExpression: `#hash=:hash AND begins_with(#sort,:sort)`,
			ExpressionAttributeNames: {
				'#hash': 'siKey1',
				'#sort': 'pk',
			},
			ExpressionAttributeValues: {
				':hash': createDelimitedAttribute(CommonPkType.Group, groupId),
				':sort': createDelimitedAttribute(resourcePrefix),
			},
			ProjectionExpression: 'pk',
		};
	};

	const getPartitionOutputs = (ids: { id: string; group: string }[], pagination = false): QueryCommandOutput => {
		return {
			Items: ids.map((i) => {
				return {
					pk: createDelimitedAttribute('r', i.id),
					siSort3: createDelimitedAttribute('g', 'r', i.group, 'r', i.id),
				};
			}),
			LastEvaluatedKey: pagination
				? {
						pk: createDelimitedAttribute('r', ids[ids.length - 1].id),
				  }
				: undefined,
			Count: ids.length,
		} as unknown as QueryCommandOutput;
	};

	beforeEach(() => {
		const logger = pino(
			pino.destination({
				sync: true, // test frameworks must use pino logger in sync mode!
			})
		);
		logger.level = 'debug';
		mockedDocumentClient.reset();
		utils = new Utils(logger, partitionSize);
		underTest = new ResourceRepository(logger, mockedDocumentClient as unknown as DynamoDBDocumentClient, tableName, utils, taskParallelLimit);
	});

	describe('listIdsByChildGroups', async () => {
		const groupId = '/';
		const keyPrefix = 'r';
		const pagination: ListIdsPaginationOptions = {
			count: 5,
		};

		it('listIdsByChildGroups should sort based on group hierarchy', async () => {
			// mocks
			mockedDocumentClient.on(QueryCommand, getQueryParamsForChildGroups(0, '/')).resolvesOnce(
				getPartitionOutputs([
					{ id: '01', group: '/' },
					{ id: '02', group: '/' },
					// below will not be included in the list
					{ id: '03', group: '/group1' },
					{ id: '06', group: '/group1' },
					{ id: '07', group: '/group1' },
				])
			);

			mockedDocumentClient.on(QueryCommand, getQueryParamsForChildGroups(1, '/')).resolvesOnce(
				getPartitionOutputs([
					{ id: '04', group: '/' },
					{ id: '05', group: '/' },
					{ id: '08', group: '/' },
					{ id: '09', group: '/' },
				])
			);
			// execute
			const actual = await underTest.listIdsByChildGroups(groupId, keyPrefix, pagination);
			const expected = [['01', '02', '04', '05', '08'], { id: '08', groupId: '/' }];

			// verify
			expect(mockedDocumentClient.calls().length).toBe(2);
			expect(actual).toStrictEqual(expected);
		});

		it('listIdsByChildGroups should no return any result', async () => {
			// mocks
			mockedDocumentClient.on(QueryCommand, getQueryParamsForChildGroups(0, '/')).resolvesOnce(getPartitionOutputs([]));
			mockedDocumentClient.on(QueryCommand, getQueryParamsForChildGroups(1, '/')).resolvesOnce(getPartitionOutputs([]));
			// execute
			const actual = await underTest.listIdsByChildGroups(groupId, keyPrefix, pagination);
			const expected = [[], undefined];

			// verify
			expect(mockedDocumentClient.calls().length).toBe(2);
			expect(actual).toStrictEqual(expected);
		});

		it('listIdsByChildGroups returns results from both partition', async () => {
			// mocks
			mockedDocumentClient.on(QueryCommand, getQueryParamsForChildGroups(0, '/')).resolvesOnce(
				getPartitionOutputs([
					{ id: '01', group: '/group1' },
					{ id: '02', group: '/group1' },
					{ id: '03', group: '/group1' },
					{ id: '06', group: '/group1' },
					{ id: '07', group: '/group1' },
				])
			);
			mockedDocumentClient.on(QueryCommand, getQueryParamsForChildGroups(1, '/')).resolvesOnce(
				getPartitionOutputs([
					{ id: '04', group: '/group1' },
					{ id: '05', group: '/group1' },
					{ id: '08', group: '/group1' },
					{ id: '09', group: '/group1' },
					{ id: '10', group: '/group1' },
				])
			);
			// execute
			const actual = await underTest.listIdsByChildGroups(groupId, keyPrefix, pagination);
			const expected = [['01', '02', '03', '04', '05'], { id: '05', groupId: '/group1' }];

			// verify
			expect(mockedDocumentClient.calls().length).toBe(2);
			expect(actual).toStrictEqual(expected);
		});

		it('listIdsByChildGroups only have few results on partition 0', async () => {
			// mocks
			mockedDocumentClient.on(QueryCommand, getQueryParamsForChildGroups(0, '/')).resolvesOnce(
				getPartitionOutputs([
					{ id: '01', group: '/group1' },
					{ id: '02', group: '/group1' },
					{ id: '03', group: '/group1' },
				])
			);
			mockedDocumentClient.on(QueryCommand, getQueryParamsForChildGroups(1, '/')).resolvesOnce(
				getPartitionOutputs([
					{ id: '06', group: '/group1' },
					{ id: '07', group: '/group1' },
					{ id: '09', group: '/group1' },
					{ id: '10', group: '/group1' },
				])
			);
			// execute
			const actual = await underTest.listIdsByChildGroups(groupId, keyPrefix, pagination);
			const expected = [['01', '02', '03', '06', '07'], { id: '07', groupId: '/group1' }];

			// verify
			expect(mockedDocumentClient.calls().length).toBe(2);
			expect(actual).toStrictEqual(expected);
		});

		it('listIdsByChildGroups returns result only from partition 0', async () => {
			// mocks
			mockedDocumentClient.on(QueryCommand, getQueryParamsForChildGroups(0, '/')).resolvesOnce(
				getPartitionOutputs([
					{ id: '01', group: '/group1' },
					{ id: '02', group: '/group1' },
					{ id: '03', group: '/group1' },
					{ id: '06', group: '/group1' },
					{ id: '07', group: '/group1' },
				])
			);
			mockedDocumentClient.on(QueryCommand, getQueryParamsForChildGroups(1, '/')).resolvesOnce(getPartitionOutputs([]));
			// execute
			const actual = await underTest.listIdsByChildGroups(groupId, keyPrefix, pagination);
			const expected = [['01', '02', '03', '06', '07'], { id: '07', groupId: '/group1' }];

			// verify
			expect(mockedDocumentClient.calls().length).toBe(2);
			expect(actual).toStrictEqual(expected);
		});

		it('listIdsByChildGroups returns result only from partition 1', async () => {
			// mocks
			mockedDocumentClient.on(QueryCommand, getQueryParamsForChildGroups(0, '/')).resolvesOnce(getPartitionOutputs([]));
			mockedDocumentClient.on(QueryCommand, getQueryParamsForChildGroups(1, '/')).resolvesOnce(
				getPartitionOutputs([
					{ id: '01', group: '/group1' },
					{ id: '02', group: '/group1' },
					{ id: '03', group: '/group1' },
					{ id: '06', group: '/group1' },
					{ id: '07', group: '/group1' },
				])
			);
			// execute
			const actual = await underTest.listIdsByChildGroups(groupId, keyPrefix, pagination);
			const expected = [['01', '02', '03', '06', '07'], { id: '07', groupId: '/group1' }];

			// verify
			expect(mockedDocumentClient.calls().length).toBe(2);
			expect(actual).toStrictEqual(expected);
		});

		it('listIdsByChildGroups should append the groupId with / at the end when performing DynamoDB query)', async () => {
			// mocks
			mockedDocumentClient.on(QueryCommand, getQueryParamsForChildGroups(0, '/a/b')).resolvesOnce(
				getPartitionOutputs([
					{ id: '01', group: '/group1' },
					{ id: '02', group: '/group1' },
				])
			);
			mockedDocumentClient.on(QueryCommand, getQueryParamsForChildGroups(1, '/a/b')).resolvesOnce(
				getPartitionOutputs([
					{ id: '03', group: '/group1' },
					{ id: '06', group: '/group1' },
					{ id: '07', group: '/group1' },
				])
			);
			// execute
			const actual = await underTest.listIdsByChildGroups('/a/b', keyPrefix, pagination);
			const expected = [['01', '02', '03', '06', '07'], { id: '07', groupId: '/group1' }];

			// verify
			expect(mockedDocumentClient.calls().length).toBe(2);
			expect(actual).toStrictEqual(expected);
		});

		it('listIdsByChildGroups with pagination', async () => {
			let items = [
				{
					sk: createDelimitedAttribute('g', '/group1'),
					siSort3: createDelimitedAttribute('r', '01', 'g', '/group1'),
					pk: 'r:01',
				},
				{
					sk: createDelimitedAttribute('g', '/group2'),
					siSort3: createDelimitedAttribute('r', '01', 'g', '/group2'),
					pk: 'r:01',
				},
			];

			mockedDocumentClient
				.on(QueryCommand, {
					TableName: tableName,
					KeyConditionExpression: '#hash=:hash AND begins_with(#sortKey,:sortKey)',
					ExpressionAttributeNames: { '#hash': 'pk', '#sortKey': 'sk' },
					ExpressionAttributeValues: { ':hash': 'r:01', ':sortKey': 'g:' },
				})
				.resolvesOnce({ Items: items })
				.resolvesOnce({ Items: items });

			// mock results for partition 1
			mockedDocumentClient
				.on(QueryCommand, {
					TableName: tableName,
					IndexName: 'siKey3-siSort3-index',
					KeyConditionExpression: '#hash=:hash AND begins_with(#sort,:sort)',
					ExpressionAttributeNames: { '#hash': 'siKey3', '#sort': 'siSort3' },
					ExpressionAttributeValues: { ':hash': 'pa:0', ':sort': 'g:r:%2f' },
					ProjectionExpression: 'pk,siSort3',
					ExclusiveStartKey: {
						sk: 'g:%2fgroup1',
						pk: 'r:01',
						siKey3: 'pa:0',
						siSort3: 'r:01:g:%2fgroup1',
					},
				})
				.resolvesOnce(
					getPartitionOutputs([
						{ id: '04', group: '/group1' },
						{ id: '05', group: '/group1' },
					])
				);

			// mock results for partition 1
			mockedDocumentClient
				.on(QueryCommand, {
					TableName: tableName,
					IndexName: 'siKey3-siSort3-index',
					KeyConditionExpression: '#hash=:hash AND begins_with(#sort,:sort)',
					ExpressionAttributeNames: { '#hash': 'siKey3', '#sort': 'siSort3' },
					ExpressionAttributeValues: { ':hash': 'pa:1', ':sort': 'g:r:%2f' },
					ProjectionExpression: 'pk,siSort3',
					ExclusiveStartKey: {
						sk: 'g:%2fgroup1',
						pk: 'r:01',
						siKey3: 'pa:1',
						siSort3: 'r:01:g:%2fgroup1',
					},
				})
				.resolvesOnce(
					getPartitionOutputs([
						{ id: '06', group: '/group1' },
						{ id: '07', group: '/group1' },
						{ id: '08', group: '/group1' },
					])
				);

			// execute
			const actual = await underTest.listIdsByChildGroups(groupId, keyPrefix, {
				...pagination,
				from: {
					id: '01',
					groupId: '/group1',
				},
			});
			const expected = [['04', '05', '06', '07', '08'], { id: '08', groupId: '/group1' }];

			// verify
			expect(mockedDocumentClient.calls().length).toBe(4);
			expect(actual).toStrictEqual(expected);
		});

		it('pagination from parent should be ignored', async () => {
			let items = [
				{
					sk: createDelimitedAttribute('g', '/'),
					siSort3: createDelimitedAttribute('r', '01', 'g', '/'),
					pk: 'r:01',
				},
			];

			mockedDocumentClient
				.on(QueryCommand, {
					TableName: tableName,
					KeyConditionExpression: '#hash=:hash AND begins_with(#sortKey,:sortKey)',
					ExpressionAttributeNames: { '#hash': 'pk', '#sortKey': 'sk' },
					ExpressionAttributeValues: { ':hash': 'r:01', ':sortKey': 'g:' },
				})
				.resolvesOnce({ Items: items })
				.resolvesOnce({ Items: items });

			// mock results for partition 1
			mockedDocumentClient
				.on(QueryCommand, {
					TableName: tableName,
					IndexName: 'siKey3-siSort3-index',
					KeyConditionExpression: '#hash=:hash AND begins_with(#sort,:sort)',
					ExpressionAttributeNames: { '#hash': 'siKey3', '#sort': 'siSort3' },
					ExpressionAttributeValues: { ':hash': 'pa:0', ':sort': 'g:r:%2fa%2f' },
					ProjectionExpression: 'pk,siSort3',
					// no ExclusiveStartKey is being specified here
					ExclusiveStartKey: undefined,
				})
				.resolvesOnce(
					getPartitionOutputs([
						{ id: '04', group: '/group1' },
						{ id: '05', group: '/group1' },
					])
				);

			// mock results for partition 1
			mockedDocumentClient
				.on(QueryCommand, {
					TableName: tableName,
					IndexName: 'siKey3-siSort3-index',
					KeyConditionExpression: '#hash=:hash AND begins_with(#sort,:sort)',
					ExpressionAttributeNames: { '#hash': 'siKey3', '#sort': 'siSort3' },
					ExpressionAttributeValues: { ':hash': 'pa:1', ':sort': 'g:r:%2fa%2f' },
					ProjectionExpression: 'pk,siSort3',
					// no ExclusiveStartKey is being specified here
					ExclusiveStartKey: undefined,
				})
				.resolvesOnce(
					getPartitionOutputs([
						{ id: '06', group: '/group1' },
						{ id: '07', group: '/group1' },
						{ id: '08', group: '/group1' },
					])
				);

			// execute
			const actual = await underTest.listIdsByChildGroups('/a', keyPrefix, {
				...pagination,
				from: {
					id: '01',
					groupId: '/',
				},
			});
			const expected = [['04', '05', '06', '07', '08'], { id: '08', groupId: '/group1' }];

			// verify
			expect(mockedDocumentClient.calls().length).toBe(4);
			expect(actual).toStrictEqual(expected);
		});
	});

	describe('listIdsByParentGroup', async () => {
		const groupId = '/a/b/c';
		const keyPrefix = 'r';
		const pagination: ListIdsPaginationOptions = {
			count: 2,
		};

		it('when querying group resources should explode the parent and only query the children group', async () => {
			mockedDocumentClient.on(QueryCommand, getQueryParamsForListIds('/a/b/c', 'g')).resolves({
				Count: 2,
				Items: [
					{
						pk: 'r:/a/b/c/d',
					},
					{
						pk: 'r:/a/b/c/e',
					},
				],
				LastEvaluatedKey: {
					pk: 'r:02',
					sk: 'g:%2fa%2fb%2fc',
					siKey1: 'g:%2fa%2fb%2fc%2',
				},
			});

			const actual = await underTest.listIdsByParentGroups(groupId, 'g', { count: 5 });
			expect(actual[0].length).toBe(6);
			expect(actual[0]).toEqual(['/', '/a', '/a/b', '/a/b/c', '/a/b/c/d', '/a/b/c/e']);
			expect(actual[1]).toEqual({ id: '/a/b/c/e', groupId: '/a/b/c' });
		});

		it('when querying group resources should explode the parent and return if it already hit the limit', async () => {
			const actual = await underTest.listIdsByParentGroups('/a/b/c/d/e/f/g/h', 'g', { count: 5, from: { id: '/a/b' } });
			expect(actual).toEqual([['/a/b/c', '/a/b/c/d', '/a/b/c/d/e', '/a/b/c/d/e/f', '/a/b/c/d/e/f/g'], { id: '/a/b/c/d/e/f/g', groupId: '/a/b/c/d/e/f/g' }]);
		});

		it('when query results is more or equal to count should return pagination', async () => {
			mockedDocumentClient.on(QueryCommand, getQueryParamsForListIds('/a/b/c', 'g')).resolves({
				Count: 2,
				Items: [
					// children of /a/b/c
					{
						pk: 'g:/a/b/c/d',
					},
					{
						pk: 'g:/a/b/c/e',
					},
				],
				LastEvaluatedKey: {
					pk: 'g:/a/b/c/e',
					sk: 'g:%2fa%2fb%2fc',
					siKey1: 'g:%2fa%2fb%2fc%2',
				},
			});

			const [groupsIds, pagination] = await underTest.listIdsByParentGroups(groupId, 'g', { count: 3, from: { id: '/a/b' } });
			expect(groupsIds.length).toBe(3);
			expect(groupsIds).toEqual(['/a/b/c', '/a/b/c/d', '/a/b/c/e']);
			expect(pagination).toEqual({ id: '/a/b/c/e', groupId: '/a/b/c' });
		});

		it('results from exploding the parent group hit the limit', async () => {
			const [groupsIds, pagination] = await underTest.listIdsByParentGroups('/a/b/c/d/e/f/g/h', 'g', { count: 5 });
			console.log(groupsIds);
			expect(groupsIds).toEqual(['/', '/a', '/a/b', '/a/b/c', '/a/b/c/d']);
			expect(pagination).toEqual({ id: '/a/b/c/d', groupId: '/a/b/c/d' });
		});

		it('results from exploding the parent group hit the limit with pagination', async () => {
			const [groupsIds, pagination] = await underTest.listIdsByParentGroups('/a/b/c/d/e/f/g/h', 'g', { count: 3, from: { id: '/a/b/c' } });
			expect(groupsIds.length).toBe(3);
			expect(groupsIds).toEqual(['/a/b/c/d', '/a/b/c/d/e', '/a/b/c/d/e/f']);
			expect(pagination).toEqual({ id: '/a/b/c/d/e/f', groupId: '/a/b/c/d/e/f' });
		});

		it('when querying group resources with pagination should skip some parents', async () => {
			mockedDocumentClient.on(QueryCommand, getQueryParamsForListIds('/a/b/c', 'g')).resolves({
				Count: 2,
				Items: [
					{
						pk: 'g:/a/b/c/d',
					},
					{
						pk: 'g:/a/b/c/e',
					},
				],
				LastEvaluatedKey: {
					pk: 'g:/a/b/c/e',
					sk: 'g:%2fa%2fb%2fc',
					siKey1: 'g:%2fa%2fb%2fc%2',
				},
			});

			const [groupsIds, pagination] = await underTest.listIdsByParentGroups(groupId, 'g', { count: 5, from: { id: '/a/b' } });
			expect(groupsIds.length).toBe(3);
			expect(groupsIds).toEqual(['/a/b/c', '/a/b/c/d', '/a/b/c/e']);
			expect(pagination).toBeUndefined();
		});

		it('results from root hit pagination limit', async () => {
			mockedDocumentClient.on(QueryCommand, getQueryParamsForListIds('/')).resolves({
				Count: 2,
				Items: [
					{
						pk: 'r:01',
					},
					{
						pk: 'r:02',
					},
				],
				LastEvaluatedKey: {
					pk: 'r:02',
					sk: 'g:%2fa%2fb%2fc',
					siKey1: 'g:%2fa%2fb%2fc%2',
				},
			});

			const actual = await underTest.listIdsByParentGroups(groupId, keyPrefix, pagination);
			expect(actual.length).toBe(2);
			expect(actual[0]).toEqual(['01', '02']);
			expect(actual[1]).toEqual({ id: '02', groupId: '/' });
		});

		it('result exists in last child group /a/b/c', async () => {
			mockedDocumentClient.on(QueryCommand, getQueryParamsForListIds('/')).resolves({
				Count: 0,
				Items: [],
			});
			mockedDocumentClient.on(QueryCommand, getQueryParamsForListIds('/a')).resolves({
				Count: 0,
				Items: [],
			});
			mockedDocumentClient.on(QueryCommand, getQueryParamsForListIds('/a/b')).resolves({
				Count: 0,
				Items: [],
			});
			mockedDocumentClient.on(QueryCommand, getQueryParamsForListIds('/a/b/c')).resolves({
				Count: 2,
				Items: [
					{
						pk: 'r:01',
					},
					{
						pk: 'r:02',
					},
				],
				LastEvaluatedKey: {
					pk: 'r:02',
					sk: 'g:%2fa%2fb%2fc',
					siKey1: 'g:%2fa%2fb%2fc%2f',
				},
			});
			const [resourceIds, paginationKey] = await underTest.listIdsByParentGroups(groupId, keyPrefix, pagination);
			expect(resourceIds.length).toBe(2);
			expect(paginationKey).toEqual({ id: '02', groupId: '/a/b/c' });
			expect(mockedDocumentClient.calls().length).toBe(4);
		});

		it('if pagination from child group /a/b should skip querying from /a and /', async () => {
			mockedDocumentClient
				.on(QueryCommand, {
					TableName: 'myTableName',
					KeyConditionExpression: '#hash=:hash AND begins_with(#sortKey,:sortKey)',
					ExpressionAttributeNames: { '#hash': 'pk', '#sortKey': 'sk' },
					ExpressionAttributeValues: { ':hash': 'r:02', ':sortKey': 'g:' },
				})
				.resolves({
					Items: [
						{
							sk: createDelimitedAttribute(CommonPkType.Group, '/a/b'),
						},
					],
				});

			mockedDocumentClient.on(QueryCommand, getQueryParamsForListIds('/a/b')).resolves({
				Count: 0,
				Items: [],
			});
			mockedDocumentClient.on(QueryCommand, getQueryParamsForListIds('/a/b/c')).resolves({
				Count: 2,
				Items: [
					{
						pk: 'r:03',
					},
					{
						pk: 'r:04',
					},
				],
				LastEvaluatedKey: {
					pk: 'r:04',
				},
			});

			const [resourceIds, paginationKey] = await underTest.listIdsByParentGroups(groupId, keyPrefix, { ...pagination, from: { id: '02' } });
			expect(mockedDocumentClient.calls().length).toBe(3);
			expect(resourceIds.length).toBe(2);
			expect(paginationKey).toEqual({ id: '04', groupId: '/a/b/c' });
		});

		it('results contains results from root, /a and /a/b', async () => {
			mockedDocumentClient.on(QueryCommand, getQueryParamsForListIds('/')).resolves({
				Count: 2,
				Items: [
					{
						pk: 'r:01',
					},
					{
						pk: 'r:02',
					},
				],
			});

			mockedDocumentClient.on(QueryCommand, getQueryParamsForListIds('/a')).resolves({
				Count: 2,
				Items: [
					{
						pk: 'r:03',
					},
					{
						pk: 'r:04',
					},
				],
			});

			mockedDocumentClient.on(QueryCommand, getQueryParamsForListIds('/a/b')).resolves({
				Count: 2,
				Items: [
					{
						pk: 'r:05',
					},
					{
						pk: 'r:06',
					},
				],
			});

			const [resourceIds, paginationKey] = await underTest.listIdsByParentGroups(groupId, keyPrefix, { ...pagination, count: 6 });
			expect(resourceIds.length).toBe(6);
			expect(resourceIds).toEqual(['01', '02', '03', '04', '05', '06']);
			expect(paginationKey).toEqual({
				id: '06',
				groupId: '/a/b',
			});
		});
	});

	describe('listIdsByTag', async () => {
		it('listIdsByTag happy path (no pagination)', async () => {
			const tagKey = 'Type';
			const tagValue = 'Material/Metal';
			const keyPrefix = 'r';
			const pagination: ListByTagPaginationOptions = undefined;

			const expectedMockInput: QueryCommandInput = {
				TableName: tableName,
				IndexName: 'siKey2-pk-index',
				KeyConditionExpression: `#hash=:hash`,
				ExpressionAttributeNames: {
					'#hash': 'siKey2',
					'#g': 'groups',
				},
				ExpressionAttributeValues: {
					':hash': 'tk:type:tv:material%2fmetal:r',
				},
				ProjectionExpression: 'pk,#g',
			};
			mockedDocumentClient.on(QueryCommand, expectedMockInput).resolves({
				Count: 4,
				Items: [
					{
						pk: 'r:01',
						groups: ['/test'],
					},
					{
						pk: 'r:02',
						groups: ['/test'],
					},
					{
						pk: 'r:03',
						groups: ['/test'],
					},
					{
						pk: 'r:04',
						groups: ['/test'],
					},
				],
			});

			const actual = await underTest.listIdsByTag(tagKey, tagValue, keyPrefix, () => true, pagination);

			const expected: [string[], ListIdsPaginationKey] = [['01', '02', '03', '04'], { id: '04' }];

			expect(actual).toStrictEqual(expected);
			expect(mockedDocumentClient.calls().length).toBe(1);
		});

		it('listIdsByTag happy path (with pagination)', async () => {
			const tagKey = 'Type';
			const tagValue = 'Material/Metal';
			const keyPrefix = 'r';
			const pagination: ListByTagPaginationOptions = {
				count: 2,
				from: { id: '02' },
			};

			const expectedMockInput: QueryCommandInput = {
				TableName: tableName,
				IndexName: 'siKey2-pk-index',
				KeyConditionExpression: `#hash=:hash`,
				ExpressionAttributeNames: {
					'#hash': 'siKey2',
					'#g': 'groups',
				},
				ExpressionAttributeValues: {
					':hash': 'tk:type:tv:material%2fmetal:r',
				},
				ProjectionExpression: 'pk,#g',
				ExclusiveStartKey: {
					pk: 'r:02',
					sk: 'tk:type:tv:material%2fmetal',
					siKey2: 'tk:type:tv:material%2fmetal:r',
				},
				Limit: 2,
			};
			mockedDocumentClient.on(QueryCommand, expectedMockInput).resolves({
				Count: 2,
				Items: [
					{
						pk: 'r:03',
						groups: ['/test'],
					},
					{
						pk: 'r:04',
						groups: ['/test'],
					},
				],
				LastEvaluatedKey: {
					pk: 'r:04',
					sk: 'tk:type:tv:material%2fmetal',
					siKey2: 'tk:type:tv:material%2fmetal:r',
				},
			});

			const actual = await underTest.listIdsByTag(tagKey, tagValue, keyPrefix, () => true, pagination);

			const expected: [string[], ListIdsPaginationKey] = [['03', '04'], { id: '04' }];

			expect(actual).toStrictEqual(expected);
			expect(mockedDocumentClient.calls().length).toBe(1);
		});

		it('listIdsByTag happy path (filter)', async () => {
			const tagKey = 'Type';
			const tagValue = 'Material/Metal';
			const keyPrefix = 'r';
			const pagination: ListByTagPaginationOptions = {
				count: 4,
			};

			const expectedMockInput: QueryCommandInput = {
				TableName: tableName,
				IndexName: 'siKey2-pk-index',
				KeyConditionExpression: `#hash=:hash`,
				ExpressionAttributeNames: {
					'#hash': 'siKey2',
					'#g': 'groups',
				},
				ExpressionAttributeValues: {
					':hash': 'tk:type:tv:material%2fmetal:r',
				},
				ProjectionExpression: 'pk,#g',
				Limit: 4,
			};

			mockedDocumentClient.on(QueryCommand, expectedMockInput).resolves({
				Count: 3,
				Items: [
					{
						pk: 'r:03',
						groups: ['/test'],
					},
					{
						pk: 'r:04',
						groups: ['/test'],
					},
					{
						pk: 'r:05',
						groups: ['/nottest'],
					},
				],
				LastEvaluatedKey: {
					pk: 'r:05',
					sk: 'g:%2fa%2fb%2fc',
					siKey1: 'g:%2fa%2fb%2fc',
				},
			});

			mockedDocumentClient
				.on(QueryCommand, {
					...expectedMockInput,
					ExclusiveStartKey: {
						pk: 'r:05',
						sk: 'g:%2fa%2fb%2fc',
						siKey1: 'g:%2fa%2fb%2fc',
					},
				})
				.resolves({
					Count: 3,
					Items: [
						{
							pk: 'r:06',
							groups: ['/test'],
						},
						{
							pk: 'r:07',
							groups: ['/test'],
						},
						{
							pk: 'r:08',
							groups: ['/nottest'],
						},
						{
							pk: 'r:09',
							groups: ['/test'],
						},
					],
				});

			const filterGroup = (groupIds: string[]) => {
				//for our test we only want to return resources which group == 'test'
				return groupIds.find((o) => o === '/test') !== undefined;
			};

			const actual = await underTest.listIdsByTag(tagKey, tagValue, keyPrefix, filterGroup, pagination);
			expect(mockedDocumentClient.calls().length).toBe(2);
			const expected: [string[], ListIdsPaginationKey] = [['03', '04', '06', '07'], { id: '07' }];
			expect(actual).toStrictEqual(expected);
		});
	});

	describe('listIdsByAlternateId', async () => {
		it('listIdsByAlternateId happy path', async () => {
			const aliasName = 'testResource';
			const expectedMockInput: QueryCommandInput = {
				TableName: tableName,
				IndexName: 'siKey2-pk-index',
				KeyConditionExpression: '#hash=:hash',
				ExpressionAttributeNames: { '#hash': 'siKey2' },
				ExpressionAttributeValues: { ':hash': 'aid:testresource:g:%2fa%2fb%2fc' },
				ProjectionExpression: 'pk,sk',
			};

			// simulate where /a and / returns nothing
			mockedDocumentClient.on(QueryCommand).resolves({
				Count: 0,
				Items: [],
			});

			// /a/b/c return 04
			mockedDocumentClient.on(QueryCommand, expectedMockInput).resolves({
				Count: 1,
				Items: [
					{
						pk: 'r:04',
						sk: 'g:%2fa%2fb%2fc',
						siKey2: 'aid:testresource',
					},
				],
			});

			// /a/b return 01
			mockedDocumentClient
				.on(QueryCommand, {
					...expectedMockInput,
					ExpressionAttributeValues: { ':hash': 'aid:testresource:g:%2fa%2fb' },
				})
				.resolves({
					Count: 1,
					Items: [
						{
							pk: 'r:01',
							sk: 'g:%2fa%2fb',
							siKey2: 'aid:testresource',
						},
					],
				});

			const actual = await underTest.listIdsByAlternateId(aliasName, ['/', '/a', '/a/b', '/a/b/c']);
			expect(mockedDocumentClient.calls().length).toBe(4);
			const expected: string[] = ['01', '04'];
			expect(actual).toStrictEqual(expected);
		});
	});

	describe('listIdsByGroupId', async () => {
		it('listIdsByGroupId happy path (no pagination)', async () => {
			const groupId = '/a/b/c';
			const keyPrefix = 'r';
			const pagination: ListIdsPaginationOptions = undefined;

			const expectedMockInput: QueryCommandInput = {
				TableName: tableName,
				IndexName: 'siKey1-pk-index',
				KeyConditionExpression: `#hash=:hash AND begins_with(#sort,:sort)`,
				ExpressionAttributeNames: {
					'#hash': 'siKey1',
					'#sort': 'pk',
				},
				ExpressionAttributeValues: {
					':hash': 'g:%2fa%2fb%2fc',
					':sort': 'r:',
				},
				ProjectionExpression: 'pk',
			};
			mockedDocumentClient.on(QueryCommand, expectedMockInput).resolves({
				Count: 4,
				Items: [
					{
						pk: 'r:01',
					},
					{
						pk: 'r:02',
					},
					{
						pk: 'r:03',
					},
					{
						pk: 'r:04',
					},
				],
				LastEvaluatedKey: {
					pk: 'r:04',
					sk: 'g:%2fa%2fb%2fc',
					siKey1: 'g:%2fa%2fb%2fc%2f',
				},
			});

			const actual = await underTest.listIdsByGroupId(groupId, keyPrefix, pagination);

			const expected: [string[], ListIdsPaginationKey] = [['01', '02', '03', '04'], { id: '04' }];

			expect(actual).toStrictEqual(expected);
			expect(mockedDocumentClient.calls().length).toBe(1);
		});

		it('listIdsByGroupId happy path (with pagination)', async () => {
			const groupId = '/a/b/c';
			const keyPrefix = 'r';
			const pagination: ListIdsPaginationOptions = {
				count: 2,
				from: { id: '02' },
			};

			const expectedMockInput: QueryCommandInput = {
				TableName: tableName,
				IndexName: 'siKey1-pk-index',
				KeyConditionExpression: `#hash=:hash AND begins_with(#sort,:sort)`,
				ExpressionAttributeNames: {
					'#hash': 'siKey1',
					'#sort': 'pk',
				},
				ExpressionAttributeValues: {
					':hash': 'g:%2fa%2fb%2fc',
					':sort': 'r:',
				},
				ProjectionExpression: 'pk',
				ExclusiveStartKey: {
					pk: 'r:02',
					sk: 'g:%2fa%2fb%2fc',
					siKey1: 'g:%2fa%2fb%2fc',
				},
				Limit: 2,
			};
			mockedDocumentClient.on(QueryCommand, expectedMockInput).resolves({
				Count: 2,
				Items: [
					{
						pk: 'r:03',
					},
					{
						pk: 'r:04',
					},
				],
				LastEvaluatedKey: {
					pk: 'r:04',
					sk: 'g:%2fa%2fb%2fc',
					siKey1: 'g:%2fa%2fb%2fc%2f',
				},
			});

			const actual = await underTest.listIdsByGroupId(groupId, keyPrefix, pagination);

			const expected: [string[], ListIdsPaginationKey] = [['03', '04'], { id: '04' }];

			expect(actual).toStrictEqual(expected);
			expect(mockedDocumentClient.calls().length).toBe(1);
		});
	});
});
