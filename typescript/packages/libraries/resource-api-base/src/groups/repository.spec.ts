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

import { mockClient } from 'aws-sdk-client-mock';
import pino from 'pino';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import { DynamoDBDocumentClient, TransactWriteCommand, TransactWriteCommandInput } from '@aws-sdk/lib-dynamodb';

import { Utils } from '../common/utils.js';
import { GroupRepository } from './repository.js';

import type { Resource } from '../resources/models.js';
import type { Group } from './models.js';
import type { Tags } from '../tags/schemas.js';
import type { TagRepository } from '../tags/repository.js';

describe('GroupRepository', () => {
	const mockedDocumentClient = mockClient(DynamoDBDocumentClient);
	let mockTagRepository: MockProxy<TagRepository>;
	let underTest: GroupRepository;

	const tableName = 'myTableName';
	const partitionSize = 0;

	beforeEach(() => {
		const logger = pino(
			pino.destination({
				sync: true, // test frameworks must use pino logger in sync mode!
			})
		);
		logger.level = 'debug';
		mockedDocumentClient.reset();
		mockTagRepository = mock<TagRepository>();
		underTest = new GroupRepository(logger, mockedDocumentClient as unknown as DynamoDBDocumentClient, tableName, mockTagRepository, new Utils(logger, partitionSize));
	});

	it('grant happy path', async () => {
		const resource: Resource = {
			id: '123',
			keyPrefix: 'r',
			alternateId: 'myAlternateId',
		};
		const group: Group = {
			id: '/a/b/c',
		};
		const tags: Tags = { Datasource: 'GHG Protocol', Type: 'Material/Metal/Steel' };

		// test
		await underTest.grant(resource, group, tags);

		// verify
		expect(mockTagRepository.updateGroupSummaries).toHaveBeenCalledWith(group.id, resource.keyPrefix, tags, {});

		const expectedWrite: TransactWriteCommandInput = {
			TransactItems: [
				{
					Put: {
						TableName: tableName,
						Item: {
							pk: 'r:123',
							sk: 'g:%2fa%2fb%2fc',
							siKey1: 'g:%2fa%2fb%2fc',
							siKey2: 'aid:myalternateid:g:%2fa%2fb%2fc',
							siKey3: 'pa:0',
							siSort3: 'g:r:%2fa%2fb%2fc%2f:r:123',
						},
					},
				},
			],
		};
		const spy = mockedDocumentClient.commandCalls(TransactWriteCommand)[0];
		expect(spy.args[0].input).toStrictEqual(expectedWrite);
	});

	it('getGrantGroupTransactWriteCommandInput happy path', async () => {
		const resource: Resource = {
			id: '123',
			keyPrefix: 'r',
			alternateId: 'myAlternateId',
		};
		const group: Group = {
			id: '/a/b/c',
		};

		const expected: TransactWriteCommandInput = {
			TransactItems: [
				{
					Put: {
						TableName: tableName,
						Item: {
							pk: 'r:123',
							sk: 'g:%2fa%2fb%2fc',
							siKey1: 'g:%2fa%2fb%2fc',
							siKey2: 'aid:myalternateid:g:%2fa%2fb%2fc',
							siKey3: 'pa:0',
							siSort3: 'g:r:%2fa%2fb%2fc%2f:r:123',
						},
					},
				},
			],
		};

		// test
		const actual = underTest.getGrantGroupTransactWriteCommandInput(resource, group);

		// verify
		expect(actual).toStrictEqual(expected);
	});

	it('revoke happy path', async () => {
		const resource: Resource = {
			id: '123',
			keyPrefix: 'r',
			alternateId: 'myAlternateId',
		};
		const group: Group = {
			id: '/a/b/c',
		};
		const tags: Tags = { Datasource: 'GHG Protocol', Type: 'Material/Metal/Steel' };

		// test
		await underTest.revoke(resource, group, tags);

		// verify
		expect(mockTagRepository.updateGroupSummaries).toHaveBeenCalledWith(group.id, resource.keyPrefix, {}, tags);

		const expectedWrite: TransactWriteCommandInput = {
			TransactItems: [
				{
					Delete: {
						TableName: tableName,
						Key: {
							pk: 'r:123',
							sk: 'g:%2fa%2fb%2fc',
						},
					},
				},
			],
		};

		const spy = mockedDocumentClient.commandCalls(TransactWriteCommand)[0];

		expect(spy.args[0].input).toStrictEqual(expectedWrite);
	});
});
