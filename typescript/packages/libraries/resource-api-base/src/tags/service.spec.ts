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
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import pino from 'pino';
import type { TagRepository } from './repository.js';
import { DiffResult, TagService } from './service.js';
import type { Tags } from './schemas.js';
import type { GroupPermissions } from '@sif/authz';
import type { AccessManagementClient } from '../clients/accessManagement.client.js';
import { SQSClient } from '@aws-sdk/client-sqs';
import { mockClient } from 'aws-sdk-client-mock';

describe('TagService', () => {
	let mockTagRepository: MockProxy<TagRepository>;
	let mockAuthChecker: MockProxy<GroupPermissions>;
	let mockAccessManagementClient: MockProxy<AccessManagementClient>;
	const mockedSQSClient = mockClient(SQSClient);
	let underTest: TagService;

	beforeEach(() => {
		const logger = pino(
			pino.destination({
				sync: true, // test frameworks must use pino logger in sync mode!
			})
		);
		logger.level = 'debug';

		mockTagRepository = mock<TagRepository>();
		mockAuthChecker = mock<GroupPermissions>();
		mockAccessManagementClient = mock<AccessManagementClient>();
		mockedSQSClient.reset();
		underTest = new TagService(logger, mockTagRepository, mockAuthChecker, mockedSQSClient as unknown as SQSClient, 'queueUrl', mockAccessManagementClient);
	});

	it('listByResourceId happy path (no pagination)', async () => {
		const resourceId = '123';
		const keyPrefix = 'r';

		// set up mocks
		const mockedTags: Tags = { Datasource: 'GHG Protocol', Type: 'Material/Metal/Steel' };
		mockTagRepository.listByResourceId.mockResolvedValue([mockedTags, undefined]);

		// test
		const actual = await underTest._listByResourceId(resourceId, keyPrefix);

		// verify
		expect(actual[0]).toStrictEqual(mockedTags);
		expect(actual[1]).toBeUndefined();
		expect(mockTagRepository.listByResourceId).toHaveBeenCalledWith(resourceId, keyPrefix, undefined);
	});

	it('listAllByResourceId happy path', async () => {
		const resourceId = '123';
		const keyPrefix = 'r';

		const expected: Tags = { Datasource: 'GHG Protocol', Location: 'USA/CO/Denver', Type: 'Material/Metal/Steel' };

		// set up mocks
		const mockedTagsPage1: Tags = { Datasource: 'GHG Protocol', Type: 'Material/Metal' };
		const mockedTagsPage2: Tags = { Type: 'Material/Metal/Steel', Location: 'USA/CO/Denver' };
		mockTagRepository.listByResourceId
			.mockResolvedValueOnce([mockedTagsPage1, { key: 'Type', value: mockedTagsPage1['Type'] }])
			.mockResolvedValueOnce([mockedTagsPage2, undefined]);

		// test
		const actual = await underTest.listAllByResourceId(resourceId, keyPrefix);

		// verify
		expect(actual).toStrictEqual(expected);
		expect(mockTagRepository.listByResourceId).toHaveBeenCalledWith(resourceId, keyPrefix, undefined);
		expect(mockTagRepository.listByResourceId).toHaveBeenCalledWith(resourceId, keyPrefix, {
			exclusiveStart: { key: 'Type', value: mockedTagsPage1['Type'] },
		});
	});

	it('diff - test 1', async () => {
		const existing: Tags = { type: 'Material/Metal/Steel', datasource: 'GHG Protocol' };
		const updated: Tags = { type: 'Material/Metal/Steel', datasource: 'GHG Protocol' };

		const actual = underTest.diff(existing, updated);
		const expected: DiffResult = {
			toAdd: {},
			toDelete: {},
		};

		expect(actual).toStrictEqual(expected);
	});

	it('diff - test 2', async () => {
		const existing: Tags = { type: 'Material/Metal/Steel', datasource: 'GHG Protocol' };
		const updated: Tags = { type: 'Material/Metal/Plastic', datasource: 'GHG Protocol' };

		const actual = underTest.diff(existing, updated);
		const expected: DiffResult = {
			toAdd: { type: 'Material/Metal/Plastic' },
			toDelete: { type: 'Material/Metal/Steel' },
		};

		expect(actual).toStrictEqual(expected);
	});

	it('diff - test 3', async () => {
		const existing: Tags = { type: 'Material/Metal/Steel' };
		const updated: Tags = { type: 'Material/Metal/Plastic', datasource: 'GHG Protocol' };

		const actual = underTest.diff(existing, updated);
		const expected: DiffResult = {
			toAdd: { type: 'Material/Metal/Plastic', datasource: 'GHG Protocol' },
			toDelete: { type: 'Material/Metal/Steel' },
		};

		expect(actual).toStrictEqual(expected);
	});

	it('diff - test 4', async () => {
		const existing: Tags = { type: 'Material/Metal/Steel', datasource: 'GHG Protocol' };
		const updated: Tags = { type: 'Material/Metal/Plastic' };

		const actual = underTest.diff(existing, updated);
		const expected: DiffResult = {
			toAdd: { type: 'Material/Metal/Plastic' },
			toDelete: { type: 'Material/Metal/Steel', datasource: 'GHG Protocol' },
		};

		expect(actual).toStrictEqual(expected);
	});
});
