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

import pino from 'pino';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { MockProxy } from 'vitest-mock-extended';
import type { ResourceRepository } from './repository.js';
import { ResourceService } from './service.js';
import type { ResourceListOptions } from './models.js';
import type { AccessManagementClient } from '../clients/accessManagement.client';
import { Utils } from '../common/utils';

describe('ResourceService', () => {
	let mockResourceRepository: MockProxy<ResourceRepository>;
	let mockAccessManagementClient: MockProxy<AccessManagementClient>;
	let underTest: ResourceService;
	let partitionSize = 3;
	let utils: Utils;

	beforeEach(() => {
		const logger = pino(
			pino.destination({
				sync: true, // test frameworks must use pino logger in sync mode!
			})
		);
		logger.level = 'debug';
		mockResourceRepository = mock<ResourceRepository>();
		mockAccessManagementClient = mock<AccessManagementClient>();
		utils = new Utils(logger, partitionSize);
		underTest = new ResourceService(logger, mockResourceRepository, mockAccessManagementClient, utils);
	});

	describe('listIdsByAlternateId', () => {
		it('should list the current group context only if options are not specified', async () => {
			mockResourceRepository.listIdsByAlternateId.mockResolvedValueOnce(['01', '02', '04']);
			const result = await underTest.listIdsByAlternateId('/group1', 'aliasName', { includeParentGroups: false, includeChildGroups: false });
			expect(result).toEqual(['01', '02', '04']);
			expect(mockResourceRepository.listIdsByAlternateId).toHaveBeenCalledWith('aliasName', ['/group1']);
		});

		it('should list parent groups if includeParentGroups is set to true', async () => {
			mockResourceRepository.listIdsByAlternateId.mockResolvedValueOnce(['01', '02', '04']);
			const result = await underTest.listIdsByAlternateId('/group1/group2/group3', 'aliasName', { includeParentGroups: true, includeChildGroups: false });
			expect(result).toEqual(['01', '02', '04']);
			expect(mockResourceRepository.listIdsByAlternateId).toHaveBeenCalledWith('aliasName', ['/group1/group2/group3', '/', '/group1', '/group1/group2']);
		});

		it('should list child groups if includeChild is set to true', async () => {
			mockResourceRepository.listIdsByAlternateId.mockResolvedValueOnce(['01', '02', '04']);
			mockAccessManagementClient.listSubGroupIds.mockResolvedValueOnce(['/group1/group2', '/group1/group2/group3']);
			const result = await underTest.listIdsByAlternateId('/group1', 'aliasName', { includeParentGroups: false, includeChildGroups: true });
			expect(result).toEqual(['01', '02', '04']);
			expect(mockResourceRepository.listIdsByAlternateId).toHaveBeenCalledWith('aliasName', ['/group1', '/group1/group2', '/group1/group2/group3']);
		});

		it('should explode parent path and all the child paths', async () => {
			mockResourceRepository.listIdsByAlternateId.mockResolvedValueOnce(['01', '02', '04']); // results from parent does not meet the limit
			mockAccessManagementClient.listSubGroupIds.mockResolvedValueOnce(['/group1/group2', '/group1/group2/group3']);
			const result = await underTest.listIdsByAlternateId('/group1', 'aliasName', { includeParentGroups: true, includeChildGroups: true });
			expect(result).toEqual(['01', '02', '04']);
			expect(mockResourceRepository.listIdsByAlternateId).toHaveBeenCalledWith('aliasName', ['/group1', '/', '/group1/group2', '/group1/group2/group3']);
		});
	});

	describe('listIds', () => {
		it('listIds with includeParentGroups and includeChildGroups set to true and result contains results from both', async () => {
			const groupId = '/a/b/c';
			const resourcePrefix = 'R';
			const options: ResourceListOptions = {
				pagination: {
					count: 5,
				},
				includeChildGroups: true,
				includeParentGroups: true,
			};

			// mocks
			mockResourceRepository.listIdsByParentGroups.mockResolvedValueOnce([['01', '02', '04'], { id: '04' }]); // results from parent does not meet the limit
			mockResourceRepository.listIdsByChildGroups.mockResolvedValueOnce([['05', '06'], { id: '06' }]); // results from children

			// execute
			const actual = await underTest.listIds(groupId, resourcePrefix, options);

			// pagination should be from children
			const expected = [['01', '02', '04', '05', '06'], utils.encodeToPaginationToken({ id: '06' })];

			// verify
			expect(actual).toStrictEqual(expected);
			expect(mockResourceRepository.listIdsByParentGroups).toHaveBeenCalledWith(
				groupId,
				resourcePrefix,
				{
					count: 5,
				},
				false
			);
			expect(mockResourceRepository.listIdsByChildGroups).toHaveBeenCalledWith(groupId, resourcePrefix, {
				count: 2,
				from: undefined,
			});
		});

		it('listIds with includeParentGroups and includeChildGroups set to true and result only exists in child groups', async () => {
			const groupId = '/a/b/c';
			const resourcePrefix = 'R';
			const options: ResourceListOptions = {
				pagination: {
					count: 5,
				},
				includeChildGroups: true,
				includeParentGroups: true,
			};

			// mocks
			mockResourceRepository.listIdsByParentGroups.mockResolvedValueOnce([[], undefined]); // results from parent does not meet the limit
			mockResourceRepository.listIdsByChildGroups.mockResolvedValueOnce([['05', '06'], { id: '06' }]); // results from children

			// execute
			const actual = await underTest.listIds(groupId, resourcePrefix, options);

			// pagination should be from children
			const expected = [['05', '06'], utils.encodeToPaginationToken({ id: '06' })];

			// verify
			expect(actual).toStrictEqual(expected);
			expect(mockResourceRepository.listIdsByParentGroups).toHaveBeenCalledWith(
				groupId,
				resourcePrefix,
				{
					count: 5,
				},
				false
			);
			expect(mockResourceRepository.listIdsByChildGroups).toHaveBeenCalledWith(groupId, resourcePrefix, {
				count: 5,
				from: undefined,
			});
		});

		it('listIds with includeParentGroups and includeChildGroups set to true, but parent result has hit the limit', async () => {
			const groupId = '/a/b/c';
			const resourcePrefix = 'R';
			const options: ResourceListOptions = {
				pagination: {
					count: 5,
				},
				includeChildGroups: true,
				includeParentGroups: true,
			};

			// mocks
			mockResourceRepository.listIdsByParentGroups.mockResolvedValueOnce([['01', '02', '08', '09', '10'], { id: '10' }]); // results from parent does not meet the limit

			// execute
			const actual = await underTest.listIds(groupId, resourcePrefix, options);
			const expected = [['01', '02', '08', '09', '10'], utils.encodeToPaginationToken({ id: '10' })];

			// verify
			expect(actual).toStrictEqual(expected);
			expect(mockResourceRepository.listIdsByChildGroups).toHaveBeenCalledTimes(0);
			expect(mockResourceRepository.listIdsByParentGroups).toHaveBeenCalledWith(
				groupId,
				resourcePrefix,
				{
					count: 5,
				},
				false
			);
		});

		it('listIds with includeChildGroups set to true', async () => {
			const groupId = '/a/b/c';
			const resourcePrefix = 'R';
			const options: ResourceListOptions = {
				pagination: {
					count: 5,
				},
				includeChildGroups: true,
			};

			// mocks
			mockResourceRepository.listIdsByChildGroups.mockResolvedValueOnce([['01', '02', '04', '05', '07'], { id: '07' }]);

			// execute
			const actual = await underTest.listIds(groupId, resourcePrefix, options);
			const expected = [['01', '02', '04', '05', '07'], utils.encodeToPaginationToken({ id: '07' })];

			// verify
			expect(actual).toStrictEqual(expected);
			expect(mockResourceRepository.listIdsByParentGroups).toHaveBeenCalledTimes(0);
			expect(mockResourceRepository.listIdsByChildGroups).toHaveBeenCalledWith(groupId, resourcePrefix, {
				count: 5,
			});
		});

		it('listIds with includeParentGroups set to true', async () => {
			const groupId = '/a/b/c';
			const resourcePrefix = 'R';
			const options: ResourceListOptions = {
				pagination: {
					count: 5,
				},
				includeParentGroups: true,
			};

			// mocks
			mockResourceRepository.listIdsByParentGroups.mockResolvedValueOnce([['01', '02', '04', '05', '07'], { id: '07' }]);

			// execute
			const actual = await underTest.listIds(groupId, resourcePrefix, options);
			const expected = [['01', '02', '04', '05', '07'], utils.encodeToPaginationToken({ id: '07' })];

			// verify
			expect(actual).toStrictEqual(expected);
			expect(mockResourceRepository.listIdsByChildGroups).toHaveBeenCalledTimes(0);
			expect(mockResourceRepository.listIdsByParentGroups).toHaveBeenCalledWith(groupId, resourcePrefix, {
				count: 5,
			});
		});
	});

	describe('listIdsByTag', () => {
		it('listIdsByTag happy path (first page of results)', async () => {
			const groupId = '/a/b/c';
			const resourcePrefix = 'R';
			const options: ResourceListOptions = {
				pagination: {
					count: 5,
				},
				tagFilter: { Datasource: 'GHG Protocol', Type: 'Material/Metal/Steel' },
			};

			// mocks
			mockResourceRepository.listIdsByTag
				.mockResolvedValueOnce([['01', '02', '04', '05', '07'], { id: '07' }]) // tag filter 1 - page 1
				.mockResolvedValueOnce([['02', '03', '05', '06', '08'], { id: '08' }]) // tag filter 2 - page 1
				.mockResolvedValueOnce([['08', '10', '11', '13', '14'], { id: '14' }]) // tag filter 1 - page 2
				.mockResolvedValueOnce([['09', '11', '12', '14', '15'], { id: '15' }]); // tag filter 2 - page 2

			// execute
			const actual = await underTest.listIds(groupId, resourcePrefix, options);
			const expected = [['02', '05', '08', '11', '14'], utils.encodeToPaginationToken({ id: '14' })];

			// verify
			expect(actual).toStrictEqual(expected);

			expect(mockResourceRepository.listIdsByTag).toHaveBeenCalledWith('Datasource', 'GHG Protocol', resourcePrefix, expect.any(Function), {
				count: 5,
				from: { id: undefined },
			});

			expect(mockResourceRepository.listIdsByTag).toHaveBeenCalledWith('Type', 'Material/Metal/Steel', resourcePrefix, expect.any(Function), {
				count: 5,
				from: { id: undefined },
			});

			expect(mockResourceRepository.listIdsByTag).toHaveBeenCalledWith('Datasource', 'GHG Protocol', resourcePrefix, expect.any(Function), {
				count: 5,
				from: { id: '07' },
			});

			expect(mockResourceRepository.listIdsByTag).toHaveBeenCalledWith('Type', 'Material/Metal/Steel', resourcePrefix, expect.any(Function), {
				count: 5,
				from: { id: '08' },
			});
		});

		it('listIdsByTag happy path (second page of results)', async () => {
			const groupId = '/a/b/c';
			const resourcePrefix = 'R';
			const options: ResourceListOptions = {
				pagination: {
					count: 5,
					from: utils.encodeToPaginationToken({ id: '14' }),
				},
				tagFilter: { Datasource: 'GHG Protocol', Type: 'Material/Metal/Steel' },
			};

			// mocks

			mockResourceRepository.listIdsByTag
				.mockResolvedValueOnce([['16', '17', '19', '20', '22'], { id: '22' }]) // tag filter 1 - page 1
				.mockResolvedValueOnce([['15', '17', '18', '20', '21'], { id: '21' }]) // tag filter 2 - page 1
				.mockResolvedValueOnce([['23', '25', '26', '28', '29'], { id: '29' }]) // tag filter 1 - page 2
				.mockResolvedValueOnce([['23', '24', '26', '27', '29'], { id: '29' }]); // tag filter 2 - page 2

			// execute
			const actual = await underTest.listIds(groupId, resourcePrefix, options);
			const expected = [['17', '20', '23', '26', '29'], utils.encodeToPaginationToken({ id: '29' })];

			// verify
			expect(actual).toStrictEqual(expected);

			expect(mockResourceRepository.listIdsByTag).toHaveBeenCalledWith('Datasource', 'GHG Protocol', resourcePrefix, expect.any(Function), {
				count: 5,
				from: { id: '14' },
			});

			expect(mockResourceRepository.listIdsByTag).toHaveBeenCalledWith('Type', 'Material/Metal/Steel', resourcePrefix, expect.any(Function), {
				count: 5,
				from: { id: '14' },
			});

			expect(mockResourceRepository.listIdsByTag).toHaveBeenCalledWith('Datasource', 'GHG Protocol', resourcePrefix, expect.any(Function), {
				count: 5,
				from: { id: '22' },
			});

			expect(mockResourceRepository.listIdsByTag).toHaveBeenCalledWith('Type', 'Material/Metal/Steel', resourcePrefix, expect.any(Function), {
				count: 5,
				from: { id: '21' },
			});
		});
	});
});
