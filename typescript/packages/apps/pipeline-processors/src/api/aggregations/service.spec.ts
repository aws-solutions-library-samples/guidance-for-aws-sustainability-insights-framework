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

import { beforeEach, describe, expect, test } from 'vitest';
import { mock } from 'vitest-mock-extended';
import pino from 'pino';
import { MetricAggregationJobService } from './service';
import type { GroupPermissions } from '@sif/authz';
import { convertGroupRolesToCognitoGroups, SecurityContext, SecurityScope } from '@sif/authz';
import type { MetricAggregationJobRepository } from './repository';
import type { ResourceService } from '@sif/resource-api-base';
import { Utils } from '@sif/resource-api-base';
import type { SFNClient } from '@aws-sdk/client-sfn';
import type { LambdaRequestContext, MetricClient, Pipeline, PipelineClient } from '@sif/clients';
import type { GetLambdaRequestContext } from '../../plugins/module.awilix';
import { AggregationUtil } from '../../utils/aggregation.util';
import type { S3Client } from '@aws-sdk/client-s3';
import type { GroupsQueue } from '../../stepFunction/tasks/model';
import type { PlatformResourceUtility } from '../../utils/platformResource.utility.js';

describe('MetricAggregationJobService', () => {
	let aggregationsService: MetricAggregationJobService;
	let mockGroupPermissions = mock<GroupPermissions>();
	let mockAggregationsJobRepository = mock<MetricAggregationJobRepository>();
	let mockResourceService = mock<ResourceService>();
	let mockSfnClient = mock<SFNClient>();
	let mockS3Client = mock<S3Client>();
	let mockPipelineClient = mock<PipelineClient>();
	let mockMetricClient = mock<MetricClient>();
	let mockPlatformResourceUtility = mock<PlatformResourceUtility>();

	const firstJobId = 'job-111';
	const secondJobId = 'job-222';
	const pipelineId = 'pipe-222';
	const metricQueue = [{ order: 1, metric: 'metric-one' }, { order: 2, metric: 'metric-two' }];

	const getLambdaRequestContext: GetLambdaRequestContext = (securityContext: SecurityContext): LambdaRequestContext => {
		const { email, groupRoles, groupId } = securityContext;
		return {
			authorizer: {
				claims: {
					email: email,
					'cognito:groups': convertGroupRolesToCognitoGroups(groupRoles),
					groupContextId: groupId
				}
			}
		};
	};

	beforeEach(async () => {
		const logger = pino(
			pino.destination({
				sync: true // test frameworks must use pino logger in sync mode!
			})
		);
		logger.level = 'debug';

		aggregationsService = new MetricAggregationJobService(logger, mockAggregationsJobRepository, mockGroupPermissions, mockResourceService, mockSfnClient, 'StateMachineArn', mockPipelineClient, mockMetricClient, getLambdaRequestContext, new Utils(logger, 3), new AggregationUtil(logger, mockS3Client, 'testBucket', 'testPrefix'), mockPlatformResourceUtility);

		// Reset all mocks
		mockGroupPermissions.isAuthorized.mockReset();
		mockResourceService.listIdsByAlternateId.mockReset();
		mockAggregationsJobRepository.getByIds.mockReset();
		mockPipelineClient.get.mockReset();
		mockMetricClient.sortMetricsByDependencyOrder.mockReset();

		// Mock some return values
		mockGroupPermissions.isAuthorized.mockResolvedValue(true);
		mockPipelineClient.get.mockResolvedValue({
			transformer: {
				transforms: [
					{
						outputs: [{
							metrics: ['metric-one']
						}]
					}
				]
			}
		} as Pipeline);
		mockMetricClient.sortMetricsByDependencyOrder.mockResolvedValue(metricQueue);
		mockResourceService.listIdsByAlternateId.mockResolvedValue([firstJobId]);
		mockAggregationsJobRepository.getByIds.mockResolvedValue([
			{
				id: firstJobId,
				pipelineId: pipelineId,
				groupContextId: '/a/c/e',
				securityContext: {
					groupId: '/a/c/e',
				} as SecurityContext,
				metricQueue: [],
				groupsQueue: [{ order: 1, group: '/a/c/e' }, { order: 1, group: '/x/y' }],
				timeRange: { 'from': '2021-12-31T16:00:00.000Z', 'to': '2022-01-31T16:00:00.000Z' },
				status: 'pending'
			},
			{
				id: secondJobId,
				pipelineId: pipelineId,
				securityContext: {
					groupId: '/b/c/e',
				} as SecurityContext,
				groupContextId: '/b/c/e', metricQueue: [],
				groupsQueue: [{ order: 1, group: '/b/c/e' }],
				timeRange: { 'from': '2023-12-31T16:00:00.000Z', 'to': '2023-01-31T16:00:00.000Z' },
				status: 'pending'
			}]);
	});

	test.each([
			['/a/c', '/a/c/e', [{ order: 1, group: '/a/c/e' }, { order: 2, group: '/x/y' }]],
			['/a/c/e', '/a/c/e', [{ order: 1, group: '/a/c/e' }, { order: 2, group: '/x/y' }]],
			['/x/y/z', '/a/c/e', [{ order: 1, group: '/x/y/z' }, { order: 2, group: '/a/c/e' }]]
		]
	)('given existing job for same pipeline is for group /a/c/e, if input group context is %s then updated group context is %s', async (currentGroupContext: string, expectedGroupContext: string, expectedGroupQueue: GroupsQueue) => {
		const sc: SecurityContext = {
			email: 'testUser',
			groupId: currentGroupContext,
			groupRoles: { '/': SecurityScope.admin }
		};
		const [metricAggregationJob, matchExitingJob] = await aggregationsService.create(sc, {
			pipelineId: pipelineId,
			timeRange: {
				'from': '2021-12-31T16:00:00.000Z',
				'to': '2022-01-31T16:00:00.000Z'
			}
		});
		expect(matchExitingJob).toEqual(true);
		// check if group context is set to the lowest group in the hierarchy
		expect(metricAggregationJob.groupContextId).toEqual(expectedGroupContext);
		expect(metricAggregationJob.groupsQueue).toEqual(expectedGroupQueue);
		// check if new job id is created
		expect(firstJobId).toBe(metricAggregationJob.id);
		expect(metricAggregationJob.status).toEqual('pending');
	});

	test('should create new metric aggregation job if no existing metric aggregation job for the pipeline', async () => {
		const sc: SecurityContext = {
			email: 'testUser',
			groupId: '/a/c/e',
			groupRoles: { '/': SecurityScope.admin }
		};

		mockResourceService.listIdsByAlternateId.mockReset();
		mockResourceService.listIdsByAlternateId.mockResolvedValue([]);

		const [metricAggregationJob, matchExitingJob] = await aggregationsService.create(sc, {
			pipelineId: pipelineId,
			timeRange: {
				'from': '2021-12-31T16:00:00.000Z',
				'to': '2022-04-30T16:00:00.000Z'
			}
		});
		expect(matchExitingJob).toEqual(false);
		expect(metricAggregationJob.id).not.toEqual(firstJobId);
		expect(metricAggregationJob.metricQueue).toEqual(metricQueue);
		expect(metricAggregationJob.status).toEqual('pending');
		expect(metricAggregationJob.timeRange).toEqual({
			'from': '2021-12-31T16:00:00.000Z',
			'to': '2022-04-30T16:00:00.000Z'
		});
		expect(metricAggregationJob.groupContextId).toEqual('/a/c/e');
	});

	test('should create new metric aggregation job is group id does not overlap', async () => {
		const sc: SecurityContext = {
			email: 'testUser',
			groupId: '/a/f/c',
			groupRoles: { '/': SecurityScope.admin }
		};

		const [metricAggregationJob, matchExitingJob] = await aggregationsService.create(sc, {
			pipelineId: pipelineId,
			timeRange: {
				'from': '2021-12-31T16:00:00.000Z',
				'to': '2022-04-30T16:00:00.000Z'
			}
		});
		expect(matchExitingJob).toEqual(false);
		expect(metricAggregationJob.id).not.toEqual(firstJobId);
		expect(metricAggregationJob.metricQueue).toEqual(metricQueue);
		expect(metricAggregationJob.timeRange).toEqual({
			'from': '2021-12-31T16:00:00.000Z',
			'to': '2022-04-30T16:00:00.000Z'
		});
		expect(metricAggregationJob.status).toEqual('pending');
		expect(metricAggregationJob.groupContextId).toEqual('/a/f/c');
	});

	test('should update existing metric aggregation time range if group id overlap', async () => {
		const sc: SecurityContext = {
			email: 'testUser',
			groupId: '/a/c',
			groupRoles: { '/': SecurityScope.admin }
		};

		const [metricAggregationJob, matchExitingJob] = await aggregationsService.create(sc, {
			pipelineId: pipelineId,
			timeRange: {
				'from': '2021-12-31T16:00:00.000Z',
				'to': '2022-04-30T16:00:00.000Z'
			}
		});
		expect(matchExitingJob).toEqual(true);
		expect(metricAggregationJob.id).toEqual(firstJobId);
		expect(metricAggregationJob.status).toEqual('pending');
		expect(metricAggregationJob.timeRange).toEqual({
			'from': '2021-12-31T16:00:00.000Z',
			'to': '2022-04-30T16:00:00.000Z'
		});
		expect(metricAggregationJob.groupContextId).toEqual('/a/c/e');
	});

	test('should update existing metric aggregation group queue to leaf node', async () => {
		const sc: SecurityContext = {
			email: 'testUser',
			groupId: '/a/c',
			groupRoles: { '/': SecurityScope.admin }
		};

		const [metricAggregationJob, matchExitingJob] = await aggregationsService.create(sc, {
			pipelineId: pipelineId,
			timeRange: {
				'from': '2021-12-31T16:00:00.000Z',
				'to': '2022-04-30T16:00:00.000Z'
			}
		}, [{ order: 1, group: '/a/c/e/f' }]);
		expect(matchExitingJob).toEqual(true);
		expect(metricAggregationJob.id).toEqual(firstJobId);
		expect(metricAggregationJob.timeRange).toEqual({
			'from': '2021-12-31T16:00:00.000Z',
			'to': '2022-04-30T16:00:00.000Z'
		});
		expect(metricAggregationJob.groupContextId).toEqual('/a/c/e');
		expect(metricAggregationJob.groupsQueue).toEqual([{ order: 1, group: '/a/c/e/f' }, { order: 2, group: '/x/y' }]);
	});

});

