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
import { GroupService } from './service.js';
import type { GroupRepository } from './repository.js';
import type { TagService } from '../tags/service.js';
import type { AccessManagementClient } from '../clients/accessManagement.client.js';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { mockClient } from 'aws-sdk-client-mock';
import type { Resource } from '../resources/models.js';
import type { Group } from './models.js';
import type { Tags } from '../tags/schemas.js';
import type { Utils } from '../common/utils.js';
import type { ResourceRepository } from '../resources/repository.js';

describe('GroupService', () => {
	let mockGroupRepository: MockProxy<GroupRepository>;
	let mockTagService: MockProxy<TagService>;
	let mockAccessManagementClient: MockProxy<AccessManagementClient>;
	const mockedSQSClient = mockClient(SQSClient);
	let mockUtils: MockProxy<Utils>;
	let mockResourceRepository: MockProxy<ResourceRepository>;
	let underTest: GroupService;

	beforeEach(() => {
		const logger = pino(
			pino.destination({
				sync: true, // test frameworks must use pino logger in sync mode!
			})
		);
		logger.level = 'debug';
		mockGroupRepository = mock<GroupRepository>();
		mockTagService = mock<TagService>();
		mockAccessManagementClient = mock<AccessManagementClient>();
		mockedSQSClient.reset();
		mockUtils = mock<Utils>();
		mockResourceRepository = mock<ResourceRepository>();
		underTest = new GroupService(
			logger,
			mockGroupRepository,
			mockTagService,
			mockAccessManagementClient,
			'queueUrl',
			mockedSQSClient as unknown as SQSClient,
			mockUtils,
			mockResourceRepository
		);
	});

	it('grant happy path', async () => {
		const resource: Resource = {
			id: '123',
			keyPrefix: 'r',
			alternateId: 'myAlternateId',
		};
		const group: Group = { id: '/A/B/C' };

		// mocks
		mockUtils.getParentGroupId.mockReturnValueOnce('/A/B');
		mockGroupRepository.isGranted.mockResolvedValueOnce(true);

		const expectedTags: Tags = { Datasource: 'GHG Protocol', Type: 'Material/Metal/Steel' };
		mockTagService.listAllByResourceId.mockResolvedValueOnce(expectedTags);
		mockAccessManagementClient.listSubGroupIds.mockResolvedValueOnce(['/A/B/C/1', '/A/B/C/2']);

		// execute
		await underTest.grant(resource, group);

		// verify
		expect(mockUtils.getParentGroupId).toHaveBeenCalledWith('/A/B/C');
		expect(mockGroupRepository.isGranted).toHaveBeenCalledWith(resource.id, resource.keyPrefix, '/A/B');
		expect(mockTagService.listAllByResourceId).toHaveBeenCalledWith(resource.id, resource.keyPrefix);
		expect(mockAccessManagementClient.listSubGroupIds).toHaveBeenCalledWith(group.id);
		expect(mockGroupRepository.grant).toHaveBeenCalledWith(resource, group, expectedTags);

		let spy = mockedSQSClient.commandCalls(SendMessageCommand)[0];
		expect(spy.args[0].input).toStrictEqual({
			QueueUrl: 'queueUrl',
			MessageBody: JSON.stringify({
				resource,
				group: {
					id: '/A/B/C/1',
				},
			}),
			MessageAttributes: {
				messageType: {
					DataType: 'String',
					StringValue: `group::grant`,
				},
			},
		});

		spy = mockedSQSClient.commandCalls(SendMessageCommand)[1];
		expect(spy.args[0].input).toStrictEqual({
			QueueUrl: 'queueUrl',
			MessageBody: JSON.stringify({
				resource,
				group: {
					id: '/A/B/C/2',
				},
			}),
			MessageAttributes: {
				messageType: {
					DataType: 'String',
					StringValue: `group::grant`,
				},
			},
		});
	});

	it('revoke happy path', async () => {
		const resource: Resource = {
			id: '123',
			keyPrefix: 'r',
			alternateId: 'myAlternateId',
		};
		const group: Group = { id: '/A/B/C' };

		// mocks
		const expectedTags: Tags = { Datasource: 'GHG Protocol', Type: 'Material/Metal/Steel' };
		mockTagService.listAllByResourceId.mockResolvedValueOnce(expectedTags);
		mockAccessManagementClient.listSubGroupIds.mockResolvedValueOnce(['/A/B/C/1', '/A/B/C/2']);

		// execute
		await underTest.revoke(resource, group);

		// verify
		expect(mockTagService.listAllByResourceId).toHaveBeenCalledWith(resource.id, resource.keyPrefix);
		expect(mockAccessManagementClient.listSubGroupIds).toHaveBeenCalledWith(group.id);
		expect(mockGroupRepository.revoke).toHaveBeenCalledWith(resource, group, expectedTags);

		let spy = mockedSQSClient.commandCalls(SendMessageCommand)[0];
		expect(spy.args[0].input).toStrictEqual({
			QueueUrl: 'queueUrl',
			MessageBody: JSON.stringify({
				resource,
				group: {
					id: '/A/B/C/1',
				},
			}),
			MessageAttributes: {
				messageType: {
					DataType: 'String',
					StringValue: `group::revoke`,
				},
			},
		});

		spy = mockedSQSClient.commandCalls(SendMessageCommand)[1];
		expect(spy.args[0].input).toStrictEqual({
			QueueUrl: 'queueUrl',
			MessageBody: JSON.stringify({
				resource,
				group: {
					id: '/A/B/C/2',
				},
			}),
			MessageAttributes: {
				messageType: {
					DataType: 'String',
					StringValue: `group::revoke`,
				},
			},
		});
	});

	it('isAlternateIdInUse happy path', async () => {
		const alternateId = 'myAlternateId';
		const groupId = '/a/b/c';

		// set up mocks
		mockResourceRepository.getIdByAlternateId.mockResolvedValue('r:123');

		// test
		const actual = await underTest.isAlternateIdInUse(alternateId, groupId);

		// verify
		expect(actual).toBeTruthy();
		expect(mockResourceRepository.getIdByAlternateId).toHaveBeenCalledWith(alternateId, groupId);
	});
});
