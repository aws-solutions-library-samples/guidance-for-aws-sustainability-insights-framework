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

import { beforeEach, describe, it, expect, vi } from 'vitest';
import pino from 'pino';
import type { Client } from 'pg';
import { mock, MockProxy } from 'vitest-mock-extended';
import utc from 'dayjs/plugin/utc.js';
import { ActivitiesRepository } from './repository.js';
import type { BaseRepositoryClient } from '../../data/base.repository.js';
import type { PipelineMetadata, QueryRequest } from './models.js';


vi.mock('ulid', () => {
	let counter = 1;
	return {
		ulid: () => `id-${counter++}`
	};
});

const unixTimestampCreatedDate = 1640966400;

vi.mock('dayjs', async () => {
	const actualDayJs = await vi.importActual('dayjs');
	// @ts-ignore
	actualDayJs.default.extend(utc);
	const dayjs = function(date) {
		if (date) { // @ts-ignore
			return actualDayJs.default(date);
		}
		return {
			unix: () => unixTimestampCreatedDate,
			// @ts-ignore
			toDate: () => actualDayJs.default(date).toDate(),
			// @ts-ignore
			utc: () => actualDayJs.default().utc()
		};
	};
	dayjs.utc = (date) => {
		// @ts-ignore
		return actualDayJs.default(date).utc();
	};
	dayjs.extend = () => {
	};
	return {
		default: dayjs
	};
});


import dayjs from 'dayjs';
dayjs.extend(utc);


const pipelineUpdatedAt = dayjs('1/1/2022').toDate();

const mockPipelineMetadata: PipelineMetadata = {
	outputTypes: ['string', 'number', 'boolean'],
	outputKeysAndTypes: { 'stringOutput': 'string', 'numericOutput': 'number', 'booleanOutput': 'boolean' },
	transformKeyMap: {
		stringOutput: 'key1'
	},
	aggregate: {
		fields: [{ key: 'numericOutput', type: 'number', aggregate: 'sum' }],
		timestampField: 'month'
	},
	updatedAt: pipelineUpdatedAt

};
describe('ActivitiesRepository', () => {
	let activitiesRepository: ActivitiesRepository;
	let mockRepositoryClient: MockProxy<BaseRepositoryClient>;
	let mockPostgresClient: MockProxy<Client>;

	beforeEach(() => {
		const logger = pino(
			pino.destination({
				sync: true, // test frameworks must use pino logger in sync mode!
			})
		);
		logger.level = 'info';
		mockRepositoryClient = mock<BaseRepositoryClient>();
		mockPostgresClient = mock<Client>();
		activitiesRepository = new ActivitiesRepository(logger, mockRepositoryClient);
		mockRepositoryClient.getConnection.mockResolvedValue(mockPostgresClient);
		mockPostgresClient.query.mockReset();
	});

	it('should get latest activities for a pipeline for a given day', async () => {
		// the query we want to perform
		const qr: QueryRequest = {
			pipelineId: 'pipe1',
			groupId: '/a',
			date: dayjs('2023-01-26').utc().toDate(),
		};

		// @ts-ignore
		// mock query result
		mockPostgresClient.query.mockResolvedValueOnce({
			rows: [
				{
					date: '2023-01-12T07:00:00.000Z',
					pipelineId: 'pipe1',
					executionId: 'pipe1-exec3               ',
					stringOutput: '3-1-third',
					numericOutput: '900',
					booleanOutput: 'true',
					createdAt: '2023-01-25T00:00:00.750Z',
				},
			],
		});
		const expectedQuery = '\n' +
			'SELECT\ta."activityId", a."date", a."pipelineId",\n' +
			'\tcoalesce(ls."executionId",ln."executionId",lb."executionId") "executionId",\n' +
			'\tcoalesce(ls."auditId",ln."auditId",lb."auditId") "auditId",\n' +
			'\tcoalesce(ls."createdAt",ln."createdAt",lb."createdAt") "createdAt",\n' +
			`\ta.key1 "stringOutput",\n` +
			`max(CASE WHEN ln."name"='numericOutput' THEN ln."val" ELSE NULL END) "numericOutput",\n` +
			`max(CASE WHEN lb."name"='booleanOutput' THEN lb."val" ELSE NULL END) "booleanOutput"\n` +
			'\n' +
			'FROM "Activity" a\n' +
			'\t\n' +
			'\t\tLEFT JOIN "ActivityStringLatestValue" ls USING ("activityId")\n' +
			'\t\tLEFT JOIN "ActivityNumberLatestValue" ln USING ("activityId")\n' +
			'\t\tLEFT JOIN "ActivityBooleanLatestValue" lb USING ("activityId")\n' +
			'\n' +
			`WHERE "type" = 'raw'\n` +
			`\t AND a."groupId" = '/a' AND a."pipelineId" = 'pipe1' AND a."date" = timestamp without time zone '${dayjs(qr.date).utc().format('YYYY-MM-DD HH:mm:ss')}' \n` +
			'GROUP BY a."activityId", a."date", a."pipelineId",\n' +
			'\tcoalesce(ls."executionId",ln."executionId",lb."executionId"),\n' +
			'\tcoalesce(ls."auditId",ln."auditId",lb."auditId"),\n' +
			'\tcoalesce(ls."createdAt",ln."createdAt",lb."createdAt")\n' +
			'LIMIT 100 OFFSET 0\n';

		const result = await activitiesRepository.get(qr, mockPipelineMetadata);

		expect(result).toEqual({
			data: [
				{
					pipelineId: 'pipe1',
					executionId: 'pipe1-exec3               ',
					stringOutput: '3-1-third',
					numericOutput: '900',
					booleanOutput: 'true',
					createdAt: '2023-01-25T00:00:00.750Z',
					date: '2023-01-12T07:00:00.000Z',
				},
			]
		});
		expect(mockPostgresClient.query).toBeCalledWith(expectedQuery);
	});

	it('should get latest activities for a pipeline', async () => {
		// the query we want to perform
		const qr: QueryRequest = {
			pipelineId: 'pipe1',
			groupId: '/a',
		};

		// @ts-ignore
		mockPostgresClient.query.mockResolvedValueOnce({
			rows: [
				{
					date: '2023-01-10T07:00:00.000Z',
					pipelineId: 'pipe1',
					executionId: 'pipe1-exec3               ',
					stringOutput: '1-1-third',
					numericOutput: '100',
					booleanOutput: 'true',
					createdAt: '2023-01-10T07:00:00.000Z',
				},
				{
					date: '2023-01-11T07:00:00.000Z',
					pipelineId: 'pipe1',
					executionId: 'pipe1-exec3               ',
					stringOutput: '2-1-third',
					numericOutput: '400',
					booleanOutput: 'false',
					createdAt: '2023-01-10T07:00:00.000Z',
				},
				{
					date: '2023-01-12T07:00:00.000Z',
					pipelineId: 'pipe1',
					executionId: 'pipe1-exec3               ',
					stringOutput: '3-1-third',
					numericOutput: '900',
					booleanOutput: 'true',
					createdAt: '2023-01-10T07:00:00.000Z',
				},
				{
					date: '2023-02-13T07:00:00.000Z',
					pipelineId: 'pipe1',
					executionId: 'pipe1-exec2               ',
					stringOutput: '7-2-second',
					numericOutput: '100',
					booleanOutput: 'true',
					createdAt: '2023-01-10T07:00:00.000Z',
				},
				{
					date: '2023-02-14T07:00:00.000Z',
					pipelineId: 'pipe1',
					executionId: 'pipe1-exec2               ',
					stringOutput: '8-2-second',
					numericOutput: '400',
					booleanOutput: 'false',
					createdAt: '2023-01-10T07:00:00.000Z',
				},
				{
					date: '2023-02-15T07:00:00.000Z',
					pipelineId: 'pipe1',
					executionId: 'pipe1-exec2               ',
					stringOutput: '9-2-second',
					numericOutput: '900',
					booleanOutput: 'true',
					createdAt: '2023-01-10T07:00:00.000Z',
				},
			],
		});
		const expectedQuery = '\n' +
			'SELECT\ta."activityId", a."date", a."pipelineId",\n' +
			'\tcoalesce(ls."executionId",ln."executionId",lb."executionId") "executionId",\n' +
			'\tcoalesce(ls."auditId",ln."auditId",lb."auditId") "auditId",\n' +
			'\tcoalesce(ls."createdAt",ln."createdAt",lb."createdAt") "createdAt",\n' +
			`\ta.key1 "stringOutput",\n` +
			`max(CASE WHEN ln."name"='numericOutput' THEN ln."val" ELSE NULL END) "numericOutput",\n` +
			`max(CASE WHEN lb."name"='booleanOutput' THEN lb."val" ELSE NULL END) "booleanOutput"\n` +
			'\n' +
			'FROM "Activity" a\n' +
			'\t\n' +
			'\t\tLEFT JOIN "ActivityStringLatestValue" ls USING ("activityId")\n' +
			'\t\tLEFT JOIN "ActivityNumberLatestValue" ln USING ("activityId")\n' +
			'\t\tLEFT JOIN "ActivityBooleanLatestValue" lb USING ("activityId")\n' +
			'\n' +
			`WHERE "type" = 'raw'\n` +
			`\t AND a."groupId" = '/a' AND a."pipelineId" = 'pipe1' \n` +
			'GROUP BY a."activityId", a."date", a."pipelineId",\n' +
			'\tcoalesce(ls."executionId",ln."executionId",lb."executionId"),\n' +
			'\tcoalesce(ls."auditId",ln."auditId",lb."auditId"),\n' +
			'\tcoalesce(ls."createdAt",ln."createdAt",lb."createdAt")\n' +
			'LIMIT 100 OFFSET 0\n';

		const result = await activitiesRepository.get(qr, mockPipelineMetadata);

		expect(result).toEqual({
			data: [
				{
					date: '2023-01-10T07:00:00.000Z',
					pipelineId: 'pipe1',
					executionId: 'pipe1-exec3               ',
					stringOutput: '1-1-third',
					numericOutput: '100',
					booleanOutput: 'true',
					createdAt: '2023-01-10T07:00:00.000Z',
				},
				{
					date: '2023-01-11T07:00:00.000Z',
					pipelineId: 'pipe1',
					executionId: 'pipe1-exec3               ',
					stringOutput: '2-1-third',
					numericOutput: '400',
					booleanOutput: 'false',
					createdAt: '2023-01-10T07:00:00.000Z',
				},
				{
					date: '2023-01-12T07:00:00.000Z',
					pipelineId: 'pipe1',
					executionId: 'pipe1-exec3               ',
					stringOutput: '3-1-third',
					numericOutput: '900',
					booleanOutput: 'true',
					createdAt: '2023-01-10T07:00:00.000Z',
				},
				{
					date: '2023-02-13T07:00:00.000Z',
					pipelineId: 'pipe1',
					executionId: 'pipe1-exec2               ',
					stringOutput: '7-2-second',
					numericOutput: '100',
					booleanOutput: 'true',
					createdAt: '2023-01-10T07:00:00.000Z',
				},
				{
					date: '2023-02-14T07:00:00.000Z',
					pipelineId: 'pipe1',
					executionId: 'pipe1-exec2               ',
					stringOutput: '8-2-second',
					numericOutput: '400',
					booleanOutput: 'false',
					createdAt: '2023-01-10T07:00:00.000Z',
				},
				{
					date: '2023-02-15T07:00:00.000Z',
					pipelineId: 'pipe1',
					executionId: 'pipe1-exec2               ',
					stringOutput: '9-2-second',
					numericOutput: '900',
					booleanOutput: 'true',
					createdAt: '2023-01-10T07:00:00.000Z',
				},
			]
		});


		expect(mockPostgresClient.query).toBeCalledWith(expectedQuery);
	});

	it('should get latest activities for a pipeline paginated', async () => {
		// the query we want to perform
		const qr: QueryRequest = {
			pipelineId: 'pipe1',
			groupId: '/a',
			maxRows: 2,
		};
		// @ts-ignore
		mockPostgresClient.query.mockResolvedValueOnce({
			rows: [
				{
					date: '2023-01-10T07:00:00.000Z',
					pipelineId: 'pipe1',
					executionId: 'pipe1-exec3               ',
					stringOutput: '1-1-third',
					numericOutput: '100',
					booleanOutput: 'true',
					createdAt: '2023-01-10T07:00:00.000Z',
				},
				{
					date: '2023-01-11T07:00:00.000Z',
					pipelineId: 'pipe1',
					executionId: 'pipe1-exec3               ',
					stringOutput: '2-1-third',
					numericOutput: '400',
					booleanOutput: 'false',
					createdAt: '2023-01-10T07:00:00.000Z',
				},
			],
		});

		const expectedQuery = '\n' +
			'SELECT\ta."activityId", a."date", a."pipelineId",\n' +
			'\tcoalesce(ls."executionId",ln."executionId",lb."executionId") "executionId",\n' +
			'\tcoalesce(ls."auditId",ln."auditId",lb."auditId") "auditId",\n' +
			'\tcoalesce(ls."createdAt",ln."createdAt",lb."createdAt") "createdAt",\n' +
			`\ta.key1 "stringOutput",\n` +
			`max(CASE WHEN ln."name"='numericOutput' THEN ln."val" ELSE NULL END) "numericOutput",\n` +
			`max(CASE WHEN lb."name"='booleanOutput' THEN lb."val" ELSE NULL END) "booleanOutput"\n` +
			'\n' +
			'FROM "Activity" a\n' +
			'\t\n' +
			'\t\tLEFT JOIN "ActivityStringLatestValue" ls USING ("activityId")\n' +
			'\t\tLEFT JOIN "ActivityNumberLatestValue" ln USING ("activityId")\n' +
			'\t\tLEFT JOIN "ActivityBooleanLatestValue" lb USING ("activityId")\n' +
			'\n' +
			`WHERE "type" = 'raw'\n` +
			`\t AND a."groupId" = '/a' AND a."pipelineId" = 'pipe1' \n` +
			'GROUP BY a."activityId", a."date", a."pipelineId",\n' +
			'\tcoalesce(ls."executionId",ln."executionId",lb."executionId"),\n' +
			'\tcoalesce(ls."auditId",ln."auditId",lb."auditId"),\n' +
			'\tcoalesce(ls."createdAt",ln."createdAt",lb."createdAt")\n' +
			'LIMIT 2 OFFSET 0\n';

		const result = await activitiesRepository.get(qr, mockPipelineMetadata);
		expect(result).toEqual({
			data: [
				{
					date: '2023-01-10T07:00:00.000Z',
					pipelineId: 'pipe1',
					executionId: 'pipe1-exec3               ',
					stringOutput: '1-1-third',
					numericOutput: '100',
					booleanOutput: 'true',
					createdAt: '2023-01-10T07:00:00.000Z',
				},
				{
					date: '2023-01-11T07:00:00.000Z',
					pipelineId: 'pipe1',
					executionId: 'pipe1-exec3               ',
					stringOutput: '2-1-third',
					numericOutput: '400',
					booleanOutput: 'false',
					createdAt: '2023-01-10T07:00:00.000Z',
				},
			],
			nextToken: 2,
		});

		expect(mockPostgresClient.query).toBeCalledWith(expectedQuery);
	});

	it('should get latest activities for a pipeline filtered by time range', async () => {
		// the query we want to perform
		const qr: QueryRequest = {
			pipelineId: 'pipe1',
			groupId: '/a',
			dateFrom: dayjs.utc('2023-01-10T07:00:00.775Z').toDate(),
			dateTo: dayjs.utc('2023-01-12T07:00:00.775Z').toDate(),
		};

		// @ts-ignore
		mockPostgresClient.query.mockResolvedValueOnce({
			rows: [
				{
					date: '2023-01-10T07:00:00.000Z',
					pipelineId: 'pipe1',
					executionId: 'pipe1-exec3               ',
					stringOutput: '1-1-third',
					numericOutput: '100',
					booleanOutput: 'true',
					createdAt: '2023-01-15T07:00:00.000Z',
				},
				{
					date: '2023-01-11T07:00:00.000Z',
					pipelineId: 'pipe1',
					executionId: 'pipe1-exec3               ',
					stringOutput: '2-1-third',
					numericOutput: '400',
					booleanOutput: 'false',
					createdAt: '2023-01-15T07:00:00.000Z',
				},
				{
					date: '2023-01-12T07:00:00.000Z',
					pipelineId: 'pipe1',
					executionId: 'pipe1-exec3               ',
					stringOutput: '3-1-third',
					numericOutput: '900',
					booleanOutput: 'true',
					createdAt: '2023-01-15T07:00:00.000Z',
				},
			],
		});
		const expectedQuery = '\n' +
			'SELECT\ta."activityId", a."date", a."pipelineId",\n' +
			'\tcoalesce(ls."executionId",ln."executionId",lb."executionId") "executionId",\n' +
			'\tcoalesce(ls."auditId",ln."auditId",lb."auditId") "auditId",\n' +
			'\tcoalesce(ls."createdAt",ln."createdAt",lb."createdAt") "createdAt",\n' +
			`\ta.key1 "stringOutput",\n` +
			`max(CASE WHEN ln."name"='numericOutput' THEN ln."val" ELSE NULL END) "numericOutput",\n` +
			`max(CASE WHEN lb."name"='booleanOutput' THEN lb."val" ELSE NULL END) "booleanOutput"\n` +
			'\n' +
			'FROM "Activity" a\n' +
			'\t\n' +
			'\t\tLEFT JOIN "ActivityStringLatestValue" ls USING ("activityId")\n' +
			'\t\tLEFT JOIN "ActivityNumberLatestValue" ln USING ("activityId")\n' +
			'\t\tLEFT JOIN "ActivityBooleanLatestValue" lb USING ("activityId")\n' +
			'\n' +
			`WHERE "type" = 'raw'\n` +
			`\t AND a."groupId" = '/a' AND a."pipelineId" = 'pipe1' AND a."date" >= timestamp without time zone  '2023-01-10 07:00:00' AND a."date" <= timestamp without time zone  '2023-01-12 07:00:00' \n` +
			'GROUP BY a."activityId", a."date", a."pipelineId",\n' +
			'\tcoalesce(ls."executionId",ln."executionId",lb."executionId"),\n' +
			'\tcoalesce(ls."auditId",ln."auditId",lb."auditId"),\n' +
			'\tcoalesce(ls."createdAt",ln."createdAt",lb."createdAt")\n' +
			'LIMIT 100 OFFSET 0\n';

		const result = await activitiesRepository.get(qr, mockPipelineMetadata);
		expect(result).toEqual({
			data: [
				{
					booleanOutput: 'true',
					date: '2023-01-10T07:00:00.000Z',
					executionId: 'pipe1-exec3               ',
					numericOutput: '100',
					pipelineId: 'pipe1',
					stringOutput: '1-1-third',
					createdAt: '2023-01-15T07:00:00.000Z',
				},
				{
					booleanOutput: 'false',
					date: '2023-01-11T07:00:00.000Z',
					executionId: 'pipe1-exec3               ',
					numericOutput: '400',
					pipelineId: 'pipe1',
					stringOutput: '2-1-third',
					createdAt: '2023-01-15T07:00:00.000Z',
				},
				{
					booleanOutput: 'true',
					date: '2023-01-12T07:00:00.000Z',
					executionId: 'pipe1-exec3               ',
					numericOutput: '900',
					pipelineId: 'pipe1',
					stringOutput: '3-1-third',
					createdAt: '2023-01-15T07:00:00.000Z',
				},
			]
		});
		expect(mockPostgresClient.query).toBeCalledWith(expectedQuery);
	});

	it('should get latest activities for a pipeline filtered by time range and attributes', async () => {
		// the query we want to perform
		const qr: QueryRequest = {
			pipelineId: 'pipe1',
			groupId: '/a',
			dateFrom: dayjs.utc('2023-01-10T07:00:00.000Z').toDate(),
			dateTo: dayjs.utc('2023-01-12T07:00:00.000Z').toDate(),
			attributes: {
				stringOutput: '2-1-third',
				numericOutput: '400',
			},
		};
		// @ts-ignore
		mockPostgresClient.query.mockResolvedValueOnce({
			rows: [
				{
					date: '2023-01-11T07:00:00.000Z',
					pipelineId: 'pipe1',
					executionId: 'pipe1-exec3               ',
					stringOutput: '2-1-third',
					numericOutput: '400',
					booleanOutput: 'false',
					createdAt: '2023-01-14T07:00:00.000Z',
				},
			],
		});

		const expectedQuery = '\n' +
			'SELECT\ta."activityId", a."date", a."pipelineId",\n' +
			'\tcoalesce(ls."executionId",ln."executionId",lb."executionId") "executionId",\n' +
			'\tcoalesce(ls."auditId",ln."auditId",lb."auditId") "auditId",\n' +
			'\tcoalesce(ls."createdAt",ln."createdAt",lb."createdAt") "createdAt",\n' +
			`\ta.key1 "stringOutput",\n` +
			`max(CASE WHEN ln."name"='numericOutput' THEN ln."val" ELSE NULL END) "numericOutput",\n` +
			`max(CASE WHEN lb."name"='booleanOutput' THEN lb."val" ELSE NULL END) "booleanOutput"\n` +
			'\n' +
			'FROM "Activity" a\n' +
			'\t\n' +
			'\t\tLEFT JOIN "ActivityStringLatestValue" ls USING ("activityId")\n' +
			'\t\tLEFT JOIN "ActivityNumberLatestValue" ln USING ("activityId")\n' +
			'\t\tLEFT JOIN "ActivityBooleanLatestValue" lb USING ("activityId")\n' +
			'\n' +
			`WHERE "type" = 'raw'\n` +
			`\t AND a."groupId" = '/a' AND a."pipelineId" = 'pipe1' AND a."key1" = '2-1-third' AND a."date" >= timestamp without time zone  '2023-01-10 07:00:00' AND a."date" <= timestamp without time zone  '2023-01-12 07:00:00' \n` +
			'GROUP BY a."activityId", a."date", a."pipelineId",\n' +
			'\tcoalesce(ls."executionId",ln."executionId",lb."executionId"),\n' +
			'\tcoalesce(ls."auditId",ln."auditId",lb."auditId"),\n' +
			'\tcoalesce(ls."createdAt",ln."createdAt",lb."createdAt")\n' +
			'LIMIT 100 OFFSET 0\n';

		const result = await activitiesRepository.get(qr, mockPipelineMetadata);

		expect(result).toBeDefined();
		expect(result).toEqual({
			data: [
				{
					date: '2023-01-11T07:00:00.000Z',
					pipelineId: 'pipe1',
					executionId: 'pipe1-exec3               ',
					stringOutput: '2-1-third',
					numericOutput: '400',
					booleanOutput: 'false',
					createdAt: '2023-01-14T07:00:00.000Z',
				},
			]
		});
		expect(mockPostgresClient.query).toBeCalledWith(expectedQuery);
	});

	it('should get latest activities for an execution filtered by time range and attributes', async () => {
		const qr: QueryRequest = {
			executionId: 'pipe1-exec1',
			groupId: '/a',
			dateFrom: dayjs.utc('2023-01-10T07:00:00.000Z').toDate(),
			dateTo: dayjs.utc('2023-01-11T07:00:00.000Z').toDate(),
			attributes: {
				stringOutput: '2-1-first',
				numericOutput: '400',
			},
		};
		// @ts-ignore
		mockPostgresClient.query.mockResolvedValueOnce({
			rows: [
				{
					date: '2023-01-11T07:00:00.000Z',
					pipelineId: 'pipe1',
					executionId: 'pipe1-exec1               ',
					stringOutput: '2-1-first',
					numericOutput: '400',
					booleanOutput: 'false',
					createdAt: '2023-01-15T07:00:00.000Z',
				},
			]
		});
		const expectedQuery = '\n' +
			'SELECT\ta."activityId", a."date", a."pipelineId",\n' +
			'\tcoalesce(s."executionId",n."executionId",b."executionId") "executionId",\n' +
			'\tcoalesce(s."auditId",n."auditId",b."auditId") "auditId",\n' +
			'\tcoalesce(s."createdAt",n."createdAt",b."createdAt") "createdAt",\n' +
			`\ta.key1 "stringOutput",\n` +
			`max(CASE WHEN n."name"='numericOutput' THEN n."val" ELSE NULL END) "numericOutput",\n` +
			`max(CASE WHEN b."name"='booleanOutput' THEN b."val" ELSE NULL END) "booleanOutput"\n` +
			'\n' +
			'FROM "Activity" a\n' +
			'\t\n' +
			'\t\tLEFT JOIN "ActivityStringValue" s USING ("activityId")\n' +
			'\t\tLEFT JOIN "ActivityNumberValue" n USING ("activityId")\n' +
			'\t\tLEFT JOIN "ActivityBooleanValue" b USING ("activityId")\n' +
			'\n' +
			`WHERE "type" = 'raw'\n` +
			`\t AND a."groupId" = '/a' AND a."key1" = '2-1-first' AND a."date" >= timestamp without time zone  '2023-01-10 07:00:00' AND a."date" <= timestamp without time zone  '2023-01-11 07:00:00' AND s."executionId" = 'pipe1-exec1' AND n."executionId" = 'pipe1-exec1' AND b."executionId" = 'pipe1-exec1' \n` +
			'GROUP BY a."activityId", a."date", a."pipelineId",\n' +
			'\tcoalesce(s."executionId",n."executionId",b."executionId"),\n' +
			'\tcoalesce(s."auditId",n."auditId",b."auditId"),\n' +
			'\tcoalesce(s."createdAt",n."createdAt",b."createdAt")\n' +
			'LIMIT 100 OFFSET 0\n';

		const result = await activitiesRepository.get(qr, mockPipelineMetadata);

		expect(result).toBeDefined();
		expect(result).toEqual({
			data: [
				{
					date: '2023-01-11T07:00:00.000Z',
					pipelineId: 'pipe1',
					executionId: 'pipe1-exec1               ',
					stringOutput: '2-1-first',
					numericOutput: '400',
					booleanOutput: 'false',
					createdAt: '2023-01-15T07:00:00.000Z',
				},
			]
		});
		expect(mockPostgresClient.query).toBeCalledWith(expectedQuery);
	});

	it('should get all historical activities for a specific date and pipeline', async () => {
		const qr: QueryRequest = {
			executionId: 'pipe1-exec1',
			groupId: '/a',
			date: dayjs.utc('2023-01-10T07:00:00.000Z').toDate(),
			attributes: {
				stringOutput: '2-1-first',
				numericOutput: '400',
			},
			showHistory: true,
		};
		// @ts-ignore
		mockPostgresClient.query.mockResolvedValueOnce({
			rows: [
				{
					date: '2023-01-11T07:00:00.000Z',
					pipelineId: 'pipe1',
					executionId: 'pipe1-exec1               ',
					stringOutput: '2-1-first',
					numericOutput: '400',
					booleanOutput: 'false',
					createdAt: '2023-01-15T07:00:00.000Z',
				},
			]
		});
		const expectedQuery = 'WITH filtered_activity AS (\n' +
			'\tSELECT\t"activityId", "date", "pipelineId"\n' +
			'\tFROM "Activity" a\n' +
			`\tWHERE "type" = 'raw'\n` +
			`\t   AND a."groupId" = '/a' AND a."key1" = '2-1-first' AND a."date" = timestamp without time zone '2023-01-10 07:00:00'\n` +
			')\n' +
			'SELECT DISTINCT ON (fa."activityId", col0."createdAt")\n' +
			'\t   fa."activityId",\n' +
			'       fa."date",\n' +
			'       fa."pipelineId",\n' +
			'       col0."executionId",\n' +
			'       col0."auditId",\n' +
			'       col0."createdAt",\n' +
			'       col0."stringOutput",\r\n' +
			'col0."stringOutput__error",\r\n' +
			'col0."stringOutput__errorMessage",\r\n' +
			'col1."numericOutput",\r\n' +
			'col1."numericOutput__error",\r\n' +
			'col1."numericOutput__errorMessage",\r\n' +
			'col2."booleanOutput",\r\n' +
			'col2."booleanOutput__error",\r\n' +
			'col2."booleanOutput__errorMessage"\n' +
			'FROM "filtered_activity" fa\n' +
			'\tJOIN (\t(SELECT\t"activityId", "executionId", "auditId",  "createdAt", "val" as "stringOutput", "error" as "stringOutput__error", "errorMessage" as "stringOutput__errorMessage"\n' +
			`\t\t\tFROM "ActivityStringValue" WHERE "executionId"='pipe1-exec1' )asv join "filtered_activity" fa USING ("activityId")\n` +
			'\t\t  ) col0 USING ("activityId" )\r\n' +
			'JOIN (\t(SELECT\t"activityId",   "createdAt", "val" as "numericOutput", "error" as "numericOutput__error", "errorMessage" as "numericOutput__errorMessage"\n' +
			`\t\t\tFROM "ActivityNumberValue" WHERE "executionId"='pipe1-exec1' )asv join "filtered_activity" fa USING ("activityId")\n` +
			'\t\t  ) col1 USING ("activityId" , "createdAt")\r\n' +
			'JOIN (\t(SELECT\t"activityId",   "createdAt", "val" as "booleanOutput", "error" as "booleanOutput__error", "errorMessage" as "booleanOutput__errorMessage"\n' +
			`\t\t\tFROM "ActivityBooleanValue" WHERE "executionId"='pipe1-exec1' )asv join "filtered_activity" fa USING ("activityId")\n` +
			'\t\t  ) col2 USING ("activityId" , "createdAt")\n' +
			'ORDER BY col0."createdAt"\n' +
			'LIMIT 100 OFFSET 0';

		const result = await activitiesRepository.get(qr, mockPipelineMetadata);

		expect(result).toBeDefined();
		expect(result).toEqual({
			data: [
				{
					date: '2023-01-11T07:00:00.000Z',
					pipelineId: 'pipe1',
					executionId: 'pipe1-exec1               ',
					stringOutput: '2-1-first',
					numericOutput: '400',
					booleanOutput: 'false',
					createdAt: '2023-01-15T07:00:00.000Z',
				},
			]
		});
		expect(mockPostgresClient.query).toBeCalledWith(expectedQuery);
	});


	describe('query pipeline aggregated output', () => {

		it('should get the aggregated output from the database > happy path', async () => {
			const qr: QueryRequest = {
				executionId: 'pipe1-exec1',
				groupId: '/a',
				date: dayjs.utc('2023-01-10T07:00:00.000Z').toDate(),
				attributes: {
					stringOutput: '2-1-first',
					numericOutput: '400',
				},
				showAggregate: true,
			};
			// @ts-ignore
			mockPostgresClient.query.mockResolvedValueOnce({
				rows: []
			});

			const expectedQuery = '\n' +
				'SELECT\ta."activityId", a."date", a."pipelineId",\n' +
				'\tcoalesce(s."executionId",n."executionId",b."executionId") "executionId",\n' +
				'\tcoalesce(s."auditId",n."auditId",b."auditId") "auditId",\n' +
				'\tcoalesce(s."createdAt",n."createdAt",b."createdAt") "createdAt",\n' +
				`\ta.key1 "stringOutput",\n` +
				`max(CASE WHEN n."name"='numericOutput' THEN n."val" ELSE NULL END) "numericOutput",\n` +
				`max(CASE WHEN b."name"='booleanOutput' THEN b."val" ELSE NULL END) "booleanOutput"\n` +
				'\n' +
				'FROM "Activity" a\n' +
				'\t\n' +
				'\t\tLEFT JOIN "ActivityStringValue" s USING ("activityId")\n' +
				'\t\tLEFT JOIN "ActivityNumberValue" n USING ("activityId")\n' +
				'\t\tLEFT JOIN "ActivityBooleanValue" b USING ("activityId")\n' +
				'\n' +
				`WHERE "type" = 'aggregated'\n` +
				`\t AND a."groupId" = '/a' AND a."key1" = '2-1-first' AND a."date" = timestamp without time zone '${dayjs(qr.date).utc().format('YYYY-MM-DD HH:mm:ss')}' AND n."executionId" = 'pipe1-exec1'  AND  coalesce(s."createdAt",n."createdAt",b."createdAt") >= timestamp without time zone  '${dayjs(pipelineUpdatedAt).utc().format('YYYY-MM-DD HH:mm:ss')}'\n` +
				'GROUP BY a."activityId", a."date", a."pipelineId",\n' +
				'\tcoalesce(s."executionId",n."executionId",b."executionId"),\n' +
				'\tcoalesce(s."auditId",n."auditId",b."auditId"),\n' +
				'\tcoalesce(s."createdAt",n."createdAt",b."createdAt")\n' +
				'LIMIT 100 OFFSET 0\n';

			await activitiesRepository.get(qr, mockPipelineMetadata);
			expect(mockPostgresClient.query).toBeCalledWith(expectedQuery);
		});

	});


	describe('Insert aggregated activities > ', () => {
		it('should not execute sql statement if there are not activities', async () => {
			const activities = [];
			await activitiesRepository.createAggregatedActivities(activities, 'pipeline1', 'execution1', '/tests', mockPipelineMetadata.transformKeyMap, mockPipelineMetadata);
			expect(mockPostgresClient.query).not.toBeCalled();
		});

		it('should generate insert activities statement into multiple tables', async () => {
			const activities = [
				{
					'month': '1-1-2022',
					'numericOutput': '100',
					'stringOutput': 'Row1',
				},
				{
					'month': '1-2-2022',
					'numericOutput': '200',
					'stringOutput': 'Row2',
				}
			];

			await activitiesRepository.createAggregatedActivities(activities, 'pipeline1', 'execution1', '/tests',
				{ 'numericOutput': 'number', 'stringOutput': 'string' }, {
					...mockPipelineMetadata,
					aggregate: {
						fields: [
							{ key: 'numericOutput', type: 'number', aggregate: 'sum' },
							{ key: 'stringOutput', type: 'string', aggregate: 'groupBy' }
						],
						timestampField: 'month'
					},

				});

			const firstActivityInsertStatement = 'with "id-1" as (\n' +
				'INSERT INTO "Activity" ("groupId", "pipelineId", "date", "type", "key1", "key2", "key3", "key4", "key5")\n' +
				'VALUES (\n' +
				'\t\'/tests\',\n' +
				'\t\'pipeline1\',\n' +
				`\tto_timestamp(${dayjs(activities[0].month).unix()}),\n` +
				'\t\'aggregated\',\n' +
				'\t\'Row1\',\n' +
				'\t\'___NULL___\',\n' +
				'\t\'___NULL___\',\n' +
				'\t\'___NULL___\',\n' +
				'\t\'___NULL___\'\n' +
				')\n' +
				'ON CONFLICT  ("groupId", "pipelineId", "date", "type", "key1", "key2", "key3", "key4", "key5")\n' +
				'DO UPDATE SET "groupId" = EXCLUDED."groupId" Returning "activityId"\n' +
				'),"id-2" as (\n' +
				'INSERT INTO "ActivityNumberValue" ("activityId", "name", "createdAt","executionId", "val", "error", "errorMessage")\n' +
				`VALUES( (SELECT "activityId" from "id-1"), 'numericOutput', to_timestamp('1640966400'), 'execution1', 100, false, null)),"id-3" as (\n` +
				'INSERT INTO "ActivityNumberLatestValue" ("activityId", "name", "createdAt","executionId", "val")\n' +
				`VALUES( (SELECT "activityId" from "id-1"), 'numericOutput', to_timestamp('1640966400'), 'execution1', 100)\n` +
				'ON CONFLICT ("activityId","name") DO UPDATE SET "createdAt" = excluded."createdAt",\n' +
				'                                                "executionId" = excluded."executionId",\n' +
				'                                                "val"         = excluded."val",\n' +
				'                                                "auditId"     = excluded."auditId"),"id-4" as (\n' +
				'INSERT INTO "ActivityStringValue" ("activityId", "name", "createdAt","executionId", "val", "error", "errorMessage")\n' +
				`VALUES( (SELECT "activityId" from "id-1"), 'stringOutput', to_timestamp('1640966400'), 'execution1', 'Row1', false, null))\n` +
				'INSERT INTO "ActivityStringLatestValue" ("activityId", "name", "createdAt","executionId", "val")\n' +
				`VALUES( (SELECT "activityId" from "id-1"), 'stringOutput', to_timestamp('1640966400'), 'execution1', 'Row1')\n` +
				'ON CONFLICT ("activityId","name") DO UPDATE SET "createdAt" = excluded."createdAt",\n' +
				'                                                "executionId" = excluded."executionId",\n' +
				'                                                "val"         = excluded."val",\n' +
				'                                                "auditId"     = excluded."auditId"';

			const secondActivityInsertStatement = 'with "id-5" as (\n' +
				'INSERT INTO "Activity" ("groupId", "pipelineId", "date", "type", "key1", "key2", "key3", "key4", "key5")\n' +
				'VALUES (\n' +
				'\t\'/tests\',\n' +
				'\t\'pipeline1\',\n' +
				`\tto_timestamp(${dayjs(activities[1].month).unix()}),\n` +
				'\t\'aggregated\',\n' +
				'\t\'Row2\',\n' +
				'\t\'___NULL___\',\n' +
				'\t\'___NULL___\',\n' +
				'\t\'___NULL___\',\n' +
				'\t\'___NULL___\'\n' +
				')\n' +
				'ON CONFLICT  ("groupId", "pipelineId", "date", "type", "key1", "key2", "key3", "key4", "key5")\n' +
				'DO UPDATE SET "groupId" = EXCLUDED."groupId" Returning "activityId"\n' +
				'),"id-6" as (\n' +
				'INSERT INTO "ActivityNumberValue" ("activityId", "name", "createdAt","executionId", "val", "error", "errorMessage")\n' +
				`VALUES( (SELECT "activityId" from "id-5"), 'numericOutput', to_timestamp('1640966400'), 'execution1', 200, false, null)),"id-7" as (\n` +
				'INSERT INTO "ActivityNumberLatestValue" ("activityId", "name", "createdAt","executionId", "val")\n' +
				`VALUES( (SELECT "activityId" from "id-5"), 'numericOutput', to_timestamp('1640966400'), 'execution1', 200)\n` +
				'ON CONFLICT ("activityId","name") DO UPDATE SET "createdAt" = excluded."createdAt",\n' +
				'                                                "executionId" = excluded."executionId",\n' +
				'                                                "val"         = excluded."val",\n' +
				'                                                "auditId"     = excluded."auditId"),"id-8" as (\n' +
				'INSERT INTO "ActivityStringValue" ("activityId", "name", "createdAt","executionId", "val", "error", "errorMessage")\n' +
				`VALUES( (SELECT "activityId" from "id-5"), 'stringOutput', to_timestamp('1640966400'), 'execution1', 'Row2', false, null))\n` +
				'INSERT INTO "ActivityStringLatestValue" ("activityId", "name", "createdAt","executionId", "val")\n' +
				`VALUES( (SELECT "activityId" from "id-5"), 'stringOutput', to_timestamp('1640966400'), 'execution1', 'Row2')\n` +
				'ON CONFLICT ("activityId","name") DO UPDATE SET "createdAt" = excluded."createdAt",\n' +
				'                                                "executionId" = excluded."executionId",\n' +
				'                                                "val"         = excluded."val",\n' +
				'                                                "auditId"     = excluded."auditId"'
			;


			console.log(mockPostgresClient.query.mock.calls);

			expect(mockPostgresClient.query).toBeCalledWith('BEGIN');
			expect(mockPostgresClient.query).toBeCalledWith(firstActivityInsertStatement);
			expect(mockPostgresClient.query).toBeCalledWith(secondActivityInsertStatement);
			expect(mockPostgresClient.query).toBeCalledWith('COMMIT');
		});
	});
});
