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

import { afterAll, beforeEach, describe, it, expect } from 'vitest';
import { AggregationTaskAuroraRepository } from './aggregationTask.aurora.repository';
import pino from 'pino';
import type { BaseRepositoryClient } from '../../data/base.repository';
import { mock, MockProxy } from 'vitest-mock-extended';
import type { Client } from 'pg';

describe('AggregationTaskAuroraRepository', () => {
	let aggregationTaskRepository: AggregationTaskAuroraRepository;
	let mockRepositoryClient: MockProxy<BaseRepositoryClient>;
	let mockPostgresClient: MockProxy<Client>;
	beforeEach(() => {
		const logger = pino(
			pino.destination({
				sync: true, // test frameworks must use pino logger in sync mode!
			})
		);
		mockRepositoryClient = mock<BaseRepositoryClient>();
		mockPostgresClient = mock<Client>();
		aggregationTaskRepository = new AggregationTaskAuroraRepository(logger, mockRepositoryClient, 'activity', 'executionNumberValue');
		mockRepositoryClient.getConnection.mockResolvedValue(mockPostgresClient);
		mockPostgresClient.query.mockReset();
	});

	it('getAffectedTimeRange - should get the time range from pipeline execution output', async () => {
		// @ts-ignore
		mockPostgresClient.query.mockResolvedValueOnce({ rows: [{ from: '2023-01-03T16:00:00.000Z', to: '2023-01-05T16:00:00.000Z' }] });
		const result = await aggregationTaskRepository.getAffectedTimeRange('pipe2', 'exec1');
		const expectedQuery = `
SELECT date(min(a.date)) as from , date(max(a.date)) as to
FROM "activity" a
JOIN (
	SELECT "activityId"
	FROM "executionNumberValue" env
	WHERE env."executionId" = 'exec1'
	GROUP BY "activityId" )
env ON (a."activityId"=env."activityId")
WHERE a."type" = 'raw'`;
		expect(mockPostgresClient.query).toBeCalledWith(expectedQuery);
		expect(result.from).toEqual('2023-01-03T16:00:00.000Z');
		expect(result.to).toEqual('2023-01-05T16:00:00.000Z');
	});

	it('aggregatePipelineOutput - should aggregate the output from multiple pipeline', async () => {
		// @ts-ignore
		mockPostgresClient.query.mockResolvedValueOnce({
			rows: [
				{ date: '2023-01-03T16:00:00.000Z', value: '433.000000' },
				{ date: '2023-01-04T16:00:00.000Z', value: '766.000000' },
				{
					date: '2023-01-05T16:00:00.000Z',
					value: '633.000000',
				},
			],
		});
		const result = await aggregationTaskRepository.aggregatePipelineOutput('/a', [
			{ pipelineId: 'pipe1', output: 'name3' },
			{ pipelineId: 'pipe2', output: 'name3' },

		], {
			from: new Date('2023-01-03T16:00:00.000Z'),
			to: new Date( '2023-01-04T16:00:00.000Z')
		});

		const expectedQuery = `
SELECT date(a.date) as date, sum (env.val) as value
FROM "activity" a
JOIN "executionNumberValue" env
ON (a."activityId" = env."activityId")
JOIN ( SELECT env."activityId", env.name, max(env."createdAt") as "createdAt"
FROM "activity" a JOIN "executionNumberValue" env
ON a."activityId" = env."activityId"
WHERE a."groupId" = '/a'
AND (  a."pipelineId" = 'pipe1' AND env."name" = 'name3' OR a."pipelineId" = 'pipe2' AND env."name" = 'name3' )
GROUP BY env."activityId", env."name")
env_latest ON (env."activityId"=env_latest."activityId" AND env."name"=env_latest."name" AND env."createdAt"=env_latest."createdAt")
WHERE a."type" = 'raw' and date(a.date) >= timestamp '2023-01-03' and date(a.date) <= timestamp '2023-01-04'
GROUP BY date(a.date)`;

		expect(mockPostgresClient.query).toBeCalledWith(expectedQuery);
		expect(result.length).toBe(3);
		expect(result).toEqual([
			{ date: '2023-01-03T16:00:00.000Z', groupValue: 433 },
			{ date: '2023-01-04T16:00:00.000Z', groupValue: 766 },
			{ date: '2023-01-05T16:00:00.000Z', groupValue: 633 },
		]);
	});

	afterAll(() => {});
});
