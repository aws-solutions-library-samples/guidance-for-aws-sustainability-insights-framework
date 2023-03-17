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
		return {
			unix: () => unixTimestampCreatedDate,
			// @ts-ignore
			toDate: () => actualDayJs.default(date).toDate(),
			// @ts-ignore
			utc: (date) => actualDayJs.default().utc(date)
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

const mockPipelineMetadata: PipelineMetadata = {
	outputTypes: ['string', 'number', 'boolean'],
	outputKeys: ['stringOutput', 'numericOutput', 'booleanOutput'],
	transformKeyMap: {
		stringOutput: 'key1'
	},
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
		activitiesRepository = new ActivitiesRepository(logger, mockRepositoryClient, 'Activity', 'ActivityStringValue', 'ActivityNumberValue', 'ActivityBooleanValue', 'ActivityDateTimeValue');
		mockRepositoryClient.getConnection.mockResolvedValue(mockPostgresClient);
		mockPostgresClient.query.mockReset();
	});

	it('should get latest activities for a pipeline for a given day', async () => {
		// the query we want to perform
		const qr: QueryRequest = {
			pipelineId: 'pipe1',
			groupId: '/a',
			date: dayjs('2023-01-26T18:00:00.775Z').toDate(),
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
		const expectedQuery = `SELECT * from (
SELECT a1."date", a1."pipelineId", x."executionId", x."createdAt", max(CASE WHEN name='stringOutput' THEN val ELSE NULL END) "stringOutput",
max(CASE WHEN name='numericOutput' THEN val ELSE NULL END) "numericOutput",
max(CASE WHEN name='booleanOutput' THEN val ELSE NULL END) "booleanOutput"
FROM "Activity" a1
JOIN (SELECT b."activityId", b."name", b."createdAt", cast(a."val" as varchar), a."executionId"
FROM "ActivityStringValue" a
JOIN (SELECT t."activityId", t."name", max(t."createdAt") as "createdAt"
FROM "Activity" a
JOIN "ActivityStringValue" t ON a."activityId" = t."activityId"
WHERE a."groupId" = '/a' AND a."type" = 'raw'
AND a."pipelineId" = 'pipe1'
AND a."date" = timestamp '2023-01-26 18:00:00'
GROUP BY t."activityId", t."name"
) b ON (a."activityId" = b."activityId" AND a."name" = b."name" AND a."createdAt" = b."createdAt")
UNION
SELECT b."activityId", b."name", b."createdAt", cast(a."val"::REAL as varchar), a."executionId"
FROM "ActivityNumberValue" a
JOIN (SELECT t."activityId", t."name", max(t."createdAt") as "createdAt"
FROM "Activity" a
JOIN "ActivityNumberValue" t ON a."activityId" = t."activityId"
WHERE a."groupId" = '/a' AND a."type" = 'raw'
AND a."pipelineId" = 'pipe1'
AND a."date" = timestamp '2023-01-26 18:00:00'
GROUP BY t."activityId", t."name"
) b ON (a."activityId" = b."activityId" AND a."name" = b."name" AND a."createdAt" = b."createdAt")
UNION
SELECT b."activityId", b."name", b."createdAt", cast(a."val" as varchar), a."executionId"
FROM "ActivityBooleanValue" a
JOIN (SELECT t."activityId", t."name", max(t."createdAt") as "createdAt"
FROM "Activity" a
JOIN "ActivityBooleanValue" t ON a."activityId" = t."activityId"
WHERE a."groupId" = '/a' AND a."type" = 'raw'
AND a."pipelineId" = 'pipe1'
AND a."date" = timestamp '2023-01-26 18:00:00'
GROUP BY t."activityId", t."name"
) b ON (a."activityId" = b."activityId" AND a."name" = b."name" AND a."createdAt" = b."createdAt")
) as x ON a1."activityId" = x."activityId"
WHERE a1."type" = 'raw'
GROUP BY a1."date", a1."pipelineId", x."executionId", x."createdAt"

) as y
WHERE "stringOutput" IS NOT NULL OR "numericOutput" IS NOT NULL OR "booleanOutput" IS NOT NULL
LIMIT 100 OFFSET 0`;

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
			],
			nextToken: 100,
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
		const expectedQuery = `SELECT * from (
SELECT a1."date", a1."pipelineId", x."executionId", x."createdAt", max(CASE WHEN name='stringOutput' THEN val ELSE NULL END) "stringOutput",
max(CASE WHEN name='numericOutput' THEN val ELSE NULL END) "numericOutput",
max(CASE WHEN name='booleanOutput' THEN val ELSE NULL END) "booleanOutput"
FROM "Activity" a1
JOIN (SELECT b."activityId", b."name", b."createdAt", cast(a."val" as varchar), a."executionId"
FROM "ActivityStringValue" a
JOIN (SELECT t."activityId", t."name", max(t."createdAt") as "createdAt"
FROM "Activity" a
JOIN "ActivityStringValue" t ON a."activityId" = t."activityId"
WHERE a."groupId" = '/a' AND a."type" = 'raw'
AND a."pipelineId" = 'pipe1'
GROUP BY t."activityId", t."name"
) b ON (a."activityId" = b."activityId" AND a."name" = b."name" AND a."createdAt" = b."createdAt")
UNION
SELECT b."activityId", b."name", b."createdAt", cast(a."val"::REAL as varchar), a."executionId"
FROM "ActivityNumberValue" a
JOIN (SELECT t."activityId", t."name", max(t."createdAt") as "createdAt"
FROM "Activity" a
JOIN "ActivityNumberValue" t ON a."activityId" = t."activityId"
WHERE a."groupId" = '/a' AND a."type" = 'raw'
AND a."pipelineId" = 'pipe1'
GROUP BY t."activityId", t."name"
) b ON (a."activityId" = b."activityId" AND a."name" = b."name" AND a."createdAt" = b."createdAt")
UNION
SELECT b."activityId", b."name", b."createdAt", cast(a."val" as varchar), a."executionId"
FROM "ActivityBooleanValue" a
JOIN (SELECT t."activityId", t."name", max(t."createdAt") as "createdAt"
FROM "Activity" a
JOIN "ActivityBooleanValue" t ON a."activityId" = t."activityId"
WHERE a."groupId" = '/a' AND a."type" = 'raw'
AND a."pipelineId" = 'pipe1'
GROUP BY t."activityId", t."name"
) b ON (a."activityId" = b."activityId" AND a."name" = b."name" AND a."createdAt" = b."createdAt")
) as x ON a1."activityId" = x."activityId"
WHERE a1."type" = 'raw'
GROUP BY a1."date", a1."pipelineId", x."executionId", x."createdAt"

) as y
WHERE "stringOutput" IS NOT NULL OR "numericOutput" IS NOT NULL OR "booleanOutput" IS NOT NULL
LIMIT 100 OFFSET 0`;

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
			],
			nextToken: 100,
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

		const expectedQuery = `SELECT * from (
SELECT a1."date", a1."pipelineId", x."executionId", x."createdAt", max(CASE WHEN name='stringOutput' THEN val ELSE NULL END) "stringOutput",
max(CASE WHEN name='numericOutput' THEN val ELSE NULL END) "numericOutput",
max(CASE WHEN name='booleanOutput' THEN val ELSE NULL END) "booleanOutput"
FROM "Activity" a1
JOIN (SELECT b."activityId", b."name", b."createdAt", cast(a."val" as varchar), a."executionId"
FROM "ActivityStringValue" a
JOIN (SELECT t."activityId", t."name", max(t."createdAt") as "createdAt"
FROM "Activity" a
JOIN "ActivityStringValue" t ON a."activityId" = t."activityId"
WHERE a."groupId" = '/a' AND a."type" = 'raw'
AND a."pipelineId" = 'pipe1'
GROUP BY t."activityId", t."name"
) b ON (a."activityId" = b."activityId" AND a."name" = b."name" AND a."createdAt" = b."createdAt")
UNION
SELECT b."activityId", b."name", b."createdAt", cast(a."val"::REAL as varchar), a."executionId"
FROM "ActivityNumberValue" a
JOIN (SELECT t."activityId", t."name", max(t."createdAt") as "createdAt"
FROM "Activity" a
JOIN "ActivityNumberValue" t ON a."activityId" = t."activityId"
WHERE a."groupId" = '/a' AND a."type" = 'raw'
AND a."pipelineId" = 'pipe1'
GROUP BY t."activityId", t."name"
) b ON (a."activityId" = b."activityId" AND a."name" = b."name" AND a."createdAt" = b."createdAt")
UNION
SELECT b."activityId", b."name", b."createdAt", cast(a."val" as varchar), a."executionId"
FROM "ActivityBooleanValue" a
JOIN (SELECT t."activityId", t."name", max(t."createdAt") as "createdAt"
FROM "Activity" a
JOIN "ActivityBooleanValue" t ON a."activityId" = t."activityId"
WHERE a."groupId" = '/a' AND a."type" = 'raw'
AND a."pipelineId" = 'pipe1'
GROUP BY t."activityId", t."name"
) b ON (a."activityId" = b."activityId" AND a."name" = b."name" AND a."createdAt" = b."createdAt")
) as x ON a1."activityId" = x."activityId"
WHERE a1."type" = 'raw'
GROUP BY a1."date", a1."pipelineId", x."executionId", x."createdAt"

) as y
WHERE "stringOutput" IS NOT NULL OR "numericOutput" IS NOT NULL OR "booleanOutput" IS NOT NULL
LIMIT 2 OFFSET 0`;

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
		const expectedQuery = `SELECT * from (
SELECT a1."date", a1."pipelineId", x."executionId", x."createdAt", max(CASE WHEN name='stringOutput' THEN val ELSE NULL END) "stringOutput",
max(CASE WHEN name='numericOutput' THEN val ELSE NULL END) "numericOutput",
max(CASE WHEN name='booleanOutput' THEN val ELSE NULL END) "booleanOutput"
FROM "Activity" a1
JOIN (SELECT b."activityId", b."name", b."createdAt", cast(a."val" as varchar), a."executionId"
FROM "ActivityStringValue" a
JOIN (SELECT t."activityId", t."name", max(t."createdAt") as "createdAt"
FROM "Activity" a
JOIN "ActivityStringValue" t ON a."activityId" = t."activityId"
WHERE a."groupId" = '/a' AND a."type" = 'raw'
AND a."pipelineId" = 'pipe1'
AND a."date" >= timestamp '2023-01-10 07:00:00'
AND a."date" <= timestamp '2023-01-12 07:00:00'
GROUP BY t."activityId", t."name"
) b ON (a."activityId" = b."activityId" AND a."name" = b."name" AND a."createdAt" = b."createdAt")
UNION
SELECT b."activityId", b."name", b."createdAt", cast(a."val"::REAL as varchar), a."executionId"
FROM "ActivityNumberValue" a
JOIN (SELECT t."activityId", t."name", max(t."createdAt") as "createdAt"
FROM "Activity" a
JOIN "ActivityNumberValue" t ON a."activityId" = t."activityId"
WHERE a."groupId" = '/a' AND a."type" = 'raw'
AND a."pipelineId" = 'pipe1'
AND a."date" >= timestamp '2023-01-10 07:00:00'
AND a."date" <= timestamp '2023-01-12 07:00:00'
GROUP BY t."activityId", t."name"
) b ON (a."activityId" = b."activityId" AND a."name" = b."name" AND a."createdAt" = b."createdAt")
UNION
SELECT b."activityId", b."name", b."createdAt", cast(a."val" as varchar), a."executionId"
FROM "ActivityBooleanValue" a
JOIN (SELECT t."activityId", t."name", max(t."createdAt") as "createdAt"
FROM "Activity" a
JOIN "ActivityBooleanValue" t ON a."activityId" = t."activityId"
WHERE a."groupId" = '/a' AND a."type" = 'raw'
AND a."pipelineId" = 'pipe1'
AND a."date" >= timestamp '2023-01-10 07:00:00'
AND a."date" <= timestamp '2023-01-12 07:00:00'
GROUP BY t."activityId", t."name"
) b ON (a."activityId" = b."activityId" AND a."name" = b."name" AND a."createdAt" = b."createdAt")
) as x ON a1."activityId" = x."activityId"
WHERE a1."type" = 'raw'
GROUP BY a1."date", a1."pipelineId", x."executionId", x."createdAt"

) as y
WHERE "stringOutput" IS NOT NULL OR "numericOutput" IS NOT NULL OR "booleanOutput" IS NOT NULL
LIMIT 100 OFFSET 0`;

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
			],
			nextToken: 100,
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

		const expectedQuery = `SELECT * from (
SELECT a1."date", a1."pipelineId", x."executionId", x."createdAt", max(CASE WHEN name='stringOutput' THEN val ELSE NULL END) "stringOutput",
max(CASE WHEN name='numericOutput' THEN val ELSE NULL END) "numericOutput",
max(CASE WHEN name='booleanOutput' THEN val ELSE NULL END) "booleanOutput"
FROM "Activity" a1
JOIN (SELECT b."activityId", b."name", b."createdAt", cast(a."val" as varchar), a."executionId"
FROM "ActivityStringValue" a
JOIN (SELECT t."activityId", t."name", max(t."createdAt") as "createdAt"
FROM "Activity" a
JOIN "ActivityStringValue" t ON a."activityId" = t."activityId"
WHERE a."groupId" = '/a' AND a."type" = 'raw'
AND a."pipelineId" = 'pipe1'
AND a."key1" = '2-1-third'
AND a."date" >= timestamp '2023-01-10 07:00:00'
AND a."date" <= timestamp '2023-01-12 07:00:00'
GROUP BY t."activityId", t."name"
) b ON (a."activityId" = b."activityId" AND a."name" = b."name" AND a."createdAt" = b."createdAt")
UNION
SELECT b."activityId", b."name", b."createdAt", cast(a."val"::REAL as varchar), a."executionId"
FROM "ActivityNumberValue" a
JOIN (SELECT t."activityId", t."name", max(t."createdAt") as "createdAt"
FROM "Activity" a
JOIN "ActivityNumberValue" t ON a."activityId" = t."activityId"
WHERE a."groupId" = '/a' AND a."type" = 'raw'
AND a."pipelineId" = 'pipe1'
AND a."key1" = '2-1-third'
AND a."date" >= timestamp '2023-01-10 07:00:00'
AND a."date" <= timestamp '2023-01-12 07:00:00'
GROUP BY t."activityId", t."name"
) b ON (a."activityId" = b."activityId" AND a."name" = b."name" AND a."createdAt" = b."createdAt")
UNION
SELECT b."activityId", b."name", b."createdAt", cast(a."val" as varchar), a."executionId"
FROM "ActivityBooleanValue" a
JOIN (SELECT t."activityId", t."name", max(t."createdAt") as "createdAt"
FROM "Activity" a
JOIN "ActivityBooleanValue" t ON a."activityId" = t."activityId"
WHERE a."groupId" = '/a' AND a."type" = 'raw'
AND a."pipelineId" = 'pipe1'
AND a."key1" = '2-1-third'
AND a."date" >= timestamp '2023-01-10 07:00:00'
AND a."date" <= timestamp '2023-01-12 07:00:00'
GROUP BY t."activityId", t."name"
) b ON (a."activityId" = b."activityId" AND a."name" = b."name" AND a."createdAt" = b."createdAt")
) as x ON a1."activityId" = x."activityId"
WHERE a1."type" = 'raw'
GROUP BY a1."date", a1."pipelineId", x."executionId", x."createdAt"
HAVING max(CASE WHEN name='stringOutput' THEN val ELSE NULL END) = '2-1-third'
AND max(CASE WHEN name='numericOutput' THEN val ELSE NULL END) = '400'
) as y
WHERE "stringOutput" IS NOT NULL OR "numericOutput" IS NOT NULL OR "booleanOutput" IS NOT NULL
LIMIT 100 OFFSET 0`;

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
			],
			nextToken: 100,
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
			],
			nextToken: 100,
		});
		const expectedQuery = `SELECT * from (
SELECT a1."date", a1."pipelineId", x."executionId", x."createdAt", max(CASE WHEN name='stringOutput' THEN val ELSE NULL END) "stringOutput",
max(CASE WHEN name='numericOutput' THEN val ELSE NULL END) "numericOutput",
max(CASE WHEN name='booleanOutput' THEN val ELSE NULL END) "booleanOutput"
FROM "Activity" a1
JOIN (SELECT b."activityId", b."name", b."createdAt", cast(a."val" as varchar), a."executionId"
FROM "ActivityStringValue" a
JOIN (SELECT t."activityId", t."name", max(t."createdAt") as "createdAt"
FROM "Activity" a
JOIN "ActivityStringValue" t ON a."activityId" = t."activityId"
WHERE a."groupId" = '/a' AND a."type" = 'raw'
AND t."executionId" = 'pipe1-exec1'
AND a."key1" = '2-1-first'
AND a."date" >= timestamp '2023-01-10 07:00:00'
AND a."date" <= timestamp '2023-01-11 07:00:00'
GROUP BY t."activityId", t."name"
) b ON (a."activityId" = b."activityId" AND a."name" = b."name" AND a."createdAt" = b."createdAt")
UNION
SELECT b."activityId", b."name", b."createdAt", cast(a."val"::REAL as varchar), a."executionId"
FROM "ActivityNumberValue" a
JOIN (SELECT t."activityId", t."name", max(t."createdAt") as "createdAt"
FROM "Activity" a
JOIN "ActivityNumberValue" t ON a."activityId" = t."activityId"
WHERE a."groupId" = '/a' AND a."type" = 'raw'
AND t."executionId" = 'pipe1-exec1'
AND a."key1" = '2-1-first'
AND a."date" >= timestamp '2023-01-10 07:00:00'
AND a."date" <= timestamp '2023-01-11 07:00:00'
GROUP BY t."activityId", t."name"
) b ON (a."activityId" = b."activityId" AND a."name" = b."name" AND a."createdAt" = b."createdAt")
UNION
SELECT b."activityId", b."name", b."createdAt", cast(a."val" as varchar), a."executionId"
FROM "ActivityBooleanValue" a
JOIN (SELECT t."activityId", t."name", max(t."createdAt") as "createdAt"
FROM "Activity" a
JOIN "ActivityBooleanValue" t ON a."activityId" = t."activityId"
WHERE a."groupId" = '/a' AND a."type" = 'raw'
AND t."executionId" = 'pipe1-exec1'
AND a."key1" = '2-1-first'
AND a."date" >= timestamp '2023-01-10 07:00:00'
AND a."date" <= timestamp '2023-01-11 07:00:00'
GROUP BY t."activityId", t."name"
) b ON (a."activityId" = b."activityId" AND a."name" = b."name" AND a."createdAt" = b."createdAt")
) as x ON a1."activityId" = x."activityId"
WHERE a1."type" = 'raw'
GROUP BY a1."date", a1."pipelineId", x."executionId", x."createdAt"
HAVING max(CASE WHEN name='stringOutput' THEN val ELSE NULL END) = '2-1-first'
AND max(CASE WHEN name='numericOutput' THEN val ELSE NULL END) = '400'
) as y
WHERE "stringOutput" IS NOT NULL OR "numericOutput" IS NOT NULL OR "booleanOutput" IS NOT NULL
LIMIT 100 OFFSET 0`;

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
			],
			nextToken: 100,
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
			],
			nextToken: 100,
		});
		const expectedQuery = `SELECT * from (
SELECT a1."date", a1."pipelineId", x."executionId", x."createdAt", max(CASE WHEN name='stringOutput' THEN val ELSE NULL END) "stringOutput",
max(CASE WHEN name='numericOutput' THEN val ELSE NULL END) "numericOutput",
max(CASE WHEN name='booleanOutput' THEN val ELSE NULL END) "booleanOutput"
FROM "Activity" a1
JOIN (SELECT t."activityId", t."name", t."createdAt", cast(t."val" as varchar), t."executionId"
FROM "Activity" a
JOIN "ActivityStringValue" t ON (a."activityId"=t."activityId")
WHERE a."groupId" = '/a'
AND t."executionId" = 'pipe1-exec1'
AND a."key1" = '2-1-first'
AND a."date" = timestamp '2023-01-10 07:00:00'
UNION
SELECT t."activityId", t."name", t."createdAt", cast(t."val"::REAL as varchar), t."executionId"
FROM "Activity" a
JOIN "ActivityNumberValue" t ON (a."activityId"=t."activityId")
WHERE a."groupId" = '/a'
AND t."executionId" = 'pipe1-exec1'
AND a."key1" = '2-1-first'
AND a."date" = timestamp '2023-01-10 07:00:00'
UNION
SELECT t."activityId", t."name", t."createdAt", cast(t."val" as varchar), t."executionId"
FROM "Activity" a
JOIN "ActivityBooleanValue" t ON (a."activityId"=t."activityId")
WHERE a."groupId" = '/a'
AND t."executionId" = 'pipe1-exec1'
AND a."key1" = '2-1-first'
AND a."date" = timestamp '2023-01-10 07:00:00'
) as x ON a1."activityId" = x."activityId"
WHERE a1."type" = 'raw'
GROUP BY a1."date", a1."pipelineId", x."executionId", x."createdAt"
HAVING (max(CASE WHEN name='stringOutput' THEN val ELSE NULL END) = '2-1-first' OR max(CASE WHEN name='stringOutput' THEN val ELSE NULL END) IS NULL)
AND (max(CASE WHEN name='numericOutput' THEN val ELSE NULL END) = '400' OR max(CASE WHEN name='numericOutput' THEN val ELSE NULL END) IS NULL)
) as y

LIMIT 100 OFFSET 0`;

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
			],
			nextToken: 100,
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
				rows: [],
				nextToken: 100,
			});

			const expectedQuery = `SELECT * from (
SELECT a1."date", a1."pipelineId", x."executionId", x."createdAt", max(CASE WHEN name='stringOutput' THEN val ELSE NULL END) "stringOutput",
max(CASE WHEN name='numericOutput' THEN val ELSE NULL END) "numericOutput",
max(CASE WHEN name='booleanOutput' THEN val ELSE NULL END) "booleanOutput"
FROM "Activity" a1
JOIN (SELECT b."activityId", b."name", b."createdAt", cast(a."val" as varchar), a."executionId"
FROM "ActivityStringValue" a
JOIN (SELECT t."activityId", t."name", max(t."createdAt") as "createdAt"
FROM "Activity" a
JOIN "ActivityStringValue" t ON a."activityId" = t."activityId"
WHERE a."groupId" = '/a' AND a."type" = 'aggregated'
AND t."executionId" = 'pipe1-exec1'
AND a."key1" = '2-1-first'
AND a."date" = timestamp '2023-01-10 07:00:00'
GROUP BY t."activityId", t."name"
) b ON (a."activityId" = b."activityId" AND a."name" = b."name" AND a."createdAt" = b."createdAt")
UNION
SELECT b."activityId", b."name", b."createdAt", cast(a."val"::REAL as varchar), a."executionId"
FROM "ActivityNumberValue" a
JOIN (SELECT t."activityId", t."name", max(t."createdAt") as "createdAt"
FROM "Activity" a
JOIN "ActivityNumberValue" t ON a."activityId" = t."activityId"
WHERE a."groupId" = '/a' AND a."type" = 'aggregated'
AND t."executionId" = 'pipe1-exec1'
AND a."key1" = '2-1-first'
AND a."date" = timestamp '2023-01-10 07:00:00'
GROUP BY t."activityId", t."name"
) b ON (a."activityId" = b."activityId" AND a."name" = b."name" AND a."createdAt" = b."createdAt")
UNION
SELECT b."activityId", b."name", b."createdAt", cast(a."val" as varchar), a."executionId"
FROM "ActivityBooleanValue" a
JOIN (SELECT t."activityId", t."name", max(t."createdAt") as "createdAt"
FROM "Activity" a
JOIN "ActivityBooleanValue" t ON a."activityId" = t."activityId"
WHERE a."groupId" = '/a' AND a."type" = 'aggregated'
AND t."executionId" = 'pipe1-exec1'
AND a."key1" = '2-1-first'
AND a."date" = timestamp '2023-01-10 07:00:00'
GROUP BY t."activityId", t."name"
) b ON (a."activityId" = b."activityId" AND a."name" = b."name" AND a."createdAt" = b."createdAt")
) as x ON a1."activityId" = x."activityId"
WHERE a1."type" = 'aggregated'
GROUP BY a1."date", a1."pipelineId", x."executionId", x."createdAt"
HAVING max(CASE WHEN name='stringOutput' THEN val ELSE NULL END) = '2-1-first'
AND max(CASE WHEN name='numericOutput' THEN val ELSE NULL END) = '400'
) as y
WHERE "stringOutput" IS NOT NULL OR "numericOutput" IS NOT NULL OR "booleanOutput" IS NOT NULL
LIMIT 100 OFFSET 0`;

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
				}];
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

			const firstActivityInsertStatement = `with "id-1" as (
INSERT INTO "Activity"
("groupId", "pipelineId", "date", "type", "key1", "key2", "key3", "key4", "key5")
VALUES
(
'/tests',
'pipeline1',
to_timestamp(1640966400),
'aggregated',
'Row1',
'___NULL___',
'___NULL___',
'___NULL___',
'___NULL___'
)
ON CONFLICT  ("groupId", "pipelineId", "date", "type", "key1", "key2", "key3", "key4", "key5")
DO UPDATE SET "groupId" = EXCLUDED."groupId" Returning "activityId"
),"id-2" as (
INSERT INTO "ActivityNumberValue"
("activityId", "name", "createdAt","executionId", "val", "error", "errorMessage")
VALUES (
( SELECT "activityId" from "id-1"),
'numericOutput', to_timestamp('1640966400'), 'execution1', 100, false, null)
)
INSERT INTO "ActivityStringValue"
("activityId", "name", "createdAt","executionId", "val", "error", "errorMessage")
VALUES (
( SELECT "activityId" from "id-1"),
'stringOutput', to_timestamp('1640966400'), 'execution1', 'Row1', false, null)
`;

			const secondActivityInsertStatement = `with "id-3" as (
INSERT INTO "Activity"
("groupId", "pipelineId", "date", "type", "key1", "key2", "key3", "key4", "key5")
VALUES
(
'/tests',
'pipeline1',
to_timestamp(1640966400),
'aggregated',
'Row2',
'___NULL___',
'___NULL___',
'___NULL___',
'___NULL___'
)
ON CONFLICT  ("groupId", "pipelineId", "date", "type", "key1", "key2", "key3", "key4", "key5")
DO UPDATE SET "groupId" = EXCLUDED."groupId" Returning "activityId"
),"id-4" as (
INSERT INTO "ActivityNumberValue"
("activityId", "name", "createdAt","executionId", "val", "error", "errorMessage")
VALUES (
( SELECT "activityId" from "id-3"),
'numericOutput', to_timestamp('1640966400'), 'execution1', 200, false, null)
)
INSERT INTO "ActivityStringValue"
("activityId", "name", "createdAt","executionId", "val", "error", "errorMessage")
VALUES (
( SELECT "activityId" from "id-3"),
'stringOutput', to_timestamp('1640966400'), 'execution1', 'Row2', false, null)
`;

			expect(mockPostgresClient.query).toBeCalledWith('BEGIN');
			expect(mockPostgresClient.query).toBeCalledWith(firstActivityInsertStatement);
			expect(mockPostgresClient.query).toBeCalledWith(secondActivityInsertStatement);
			expect(mockPostgresClient.query).toBeCalledWith('COMMIT');
		});

	});


});
