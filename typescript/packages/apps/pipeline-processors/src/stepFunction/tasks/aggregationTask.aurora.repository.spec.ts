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
import type { BaseRepositoryClient } from '../../data/base.repository.js';
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
		aggregationTaskRepository = new AggregationTaskAuroraRepository(logger, mockRepositoryClient);
		mockRepositoryClient.getConnection.mockResolvedValue(mockPostgresClient);
		mockPostgresClient.query.mockReset();
	});

	it('getAffectedTimeRange - should get the time range from pipeline execution output', async () => {
		// @ts-ignore
		mockPostgresClient.query.mockResolvedValueOnce({ rows: [{ from: '2023-01-03T16:00:00.000Z', to: '2023-01-05T16:00:00.000Z' }] });
		const result = await aggregationTaskRepository.getAffectedTimeRange('pipe2', 'exec1');
		const expectedQuery = '\n' +
			`SELECT date_trunc('day', date(min(a.date)))::timestamp with time zone as "from",\n` +
			`       (date_trunc('day', max(a.date)) + interval '1 day' - interval '1 second')::timestamp with time zone as "to"\n` +
			'FROM "Activity" a\n' +
			'         LEFT JOIN "ActivityNumberValue" n\n' +
			`                   on a."activityId" = n."activityId" and n."executionId" = 'exec1'\n` +
			'         LEFT JOIN "ActivityBooleanValue" b\n' +
			`                   on a."activityId" = b."activityId" and b."executionId" = 'exec1'\n` +
			'         LEFT JOIN "ActivityStringValue" s\n' +
			`                   on a."activityId" = s."activityId" and s."executionId" = 'exec1'\n` +
			'         LEFT JOIN "ActivityDateTimeValue" d\n' +
			`                   on a."activityId" = d."activityId" and d."executionId" = 'exec1'\n` +
			`WHERE a."type" = 'raw';`

		console.log(mockPostgresClient.query.mock.calls[0])

		expect(mockPostgresClient.query).toBeCalledWith(expectedQuery);
		expect(result.from).toEqual(new Date('2023-01-03T16:00:00.000Z'));
		expect(result.to).toEqual(new Date('2023-01-05T16:00:00.000Z'));
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

		const expectedQuery ='\n' +
			'SELECT \tdate(a."date") as date, sum (ln."val") as value\n' +
			'FROM\t "Activity" a JOIN "ActivityNumberLatestValue" ln USING ("activityId")\n' +
			`WHERE \ta."type" = 'raw'\n` +
			` AND\ta."groupId" = '/a'\n` +
			' AND \t(\n' +
			`\t\t a."pipelineId" = 'pipe1' AND ln."name" = 'name3' OR a."pipelineId" = 'pipe2' AND ln."name" = 'name3' \n` +
			'\t)\n' +
			" AND \tdate(a.date) >= timestamp '2023-01-03'\n" +
			" AND \tdate(a.date) <= timestamp '2023-01-04'\n" +
			'GROUP BY date(a.date)'

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
