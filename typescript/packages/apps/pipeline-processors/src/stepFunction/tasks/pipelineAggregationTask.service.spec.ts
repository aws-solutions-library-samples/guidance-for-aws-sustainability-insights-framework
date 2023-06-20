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

import type { Pipeline, PipelineClient } from '@sif/clients';
import pino from 'pino';
import { beforeEach, describe, expect, it } from 'vitest';
import { MockProxy, mock } from 'vitest-mock-extended';
import type { ActivitiesRepository } from '../../api/activities/repository';
import type { PipelineProcessorsRepository } from '../../api/executions/repository';
import type { PipelineExecution } from '../../api/executions/schemas';
import type { ProcessedTaskEvent } from './model.js';
import { PipelineAggregationTaskService } from './pipelineAggregationTask.service';
import type { AggregationUtil } from '../../utils/aggregation.util.js';

describe('PipelineAggregationTaskService', () => {
	let mockedPipelineRepo: MockProxy<PipelineProcessorsRepository>;
	let mockedActivitiesRepository: MockProxy<ActivitiesRepository>;
	let mockedPipelineClient: MockProxy<PipelineClient>;
	let mockedAggregationUtil: MockProxy<AggregationUtil>;
	let underTest: PipelineAggregationTaskService;

	beforeEach(() => {
		const logger = pino(
			pino.destination({
				sync: true, // test frameworks must use pino logger in sync mode!
			})
		);
		logger.level = 'info';

		mockedPipelineRepo = mock<PipelineProcessorsRepository>();
		mockedPipelineClient = mock<PipelineClient>();
		mockedActivitiesRepository = mock<ActivitiesRepository>();
		mockedAggregationUtil = mock<AggregationUtil>();

		underTest = new PipelineAggregationTaskService(logger, mockedActivitiesRepository, mockedPipelineRepo, mockedPipelineClient, mockedAggregationUtil);

		mockedPipelineRepo.get.mockResolvedValueOnce({ pipelineVersion: 1 } as unknown as PipelineExecution);
		mockedPipelineClient.get.mockResolvedValueOnce({
			_aggregatedOutputKeyAndTypeMap: {},
			transformer: {
				transforms: [],
				parameters: [],
			},
		} as unknown as Pipeline);
		mockedActivitiesRepository.getAffectedTimeRange.mockResolvedValue({ from: new Date(), to: new Date() });
	});

	it('Should paginate through all results from aggregated query and insert aggregated result back to Activity table', async () => {
		mockedActivitiesRepository.aggregateRaw.mockResolvedValueOnce({
			data: Array.from({ length: 1000 }, (value: string) => {
				return { id: value };
			}),
			nextToken: 10,
		});

		mockedActivitiesRepository.aggregateRaw.mockResolvedValueOnce({ data: [], nextToken: undefined });
		mockedAggregationUtil.getExecutionGroups.mockResolvedValueOnce(['/group/subgroup1']);

		const testEvent: ProcessedTaskEvent = {
			groupContextId: '/tests',
			executionId: 'execution-1',
			pipelineId: 'pipeline-1',
			requiresAggregation: true,
			sequence: 0,
			metricQueue: []
		};

		await underTest.process(testEvent);
		expect(mockedActivitiesRepository.aggregateRaw).toBeCalledTimes(2);
		expect(mockedActivitiesRepository.createAggregatedActivities).toBeCalledTimes(1);
	});

	it('All activities results fits in first result page', async () => {
		mockedActivitiesRepository.aggregateRaw.mockResolvedValueOnce({
			data: Array.from({ length: 1000 }, (value: string) => {
				return { id: value };
			}),
			nextToken: undefined,
		});
		mockedActivitiesRepository.get.mockResolvedValueOnce({ data: [], nextToken: undefined });
		mockedAggregationUtil.getExecutionGroups.mockResolvedValueOnce(['/group/subgroup1']);

		const testEvent: ProcessedTaskEvent = {
			groupContextId: '/tests',
			executionId: 'execution-1',
			pipelineId: 'pipeline-1',
			requiresAggregation: true,
			sequence: 0,
			metricQueue: []
		};

		await underTest.process(testEvent);
		expect(mockedActivitiesRepository.aggregateRaw).toBeCalledTimes(1);
		expect(mockedActivitiesRepository.createAggregatedActivities).toBeCalledTimes(1);
	});

	it('All activities results fits in first result page, multiple groups', async () => {
		mockedActivitiesRepository.aggregateRaw.mockResolvedValue({
			data: Array.from({ length: 1000 }, (value: string) => {
				return { id: value };
			}),
			nextToken: undefined,
		});
		mockedActivitiesRepository.get.mockResolvedValue({ data: [], nextToken: undefined });
		mockedAggregationUtil.getExecutionGroups.mockResolvedValueOnce(['/group/subgroup1','/group/subgroup2']);

		const testEvent: ProcessedTaskEvent = {
			groupContextId: '/tests',
			executionId: 'execution-1',
			pipelineId: 'pipeline-1',
			requiresAggregation: true,
			sequence: 0,
			metricQueue: []
		};

		await underTest.process(testEvent);
		expect(mockedActivitiesRepository.aggregateRaw).toBeCalledTimes(2);
		expect(mockedActivitiesRepository.createAggregatedActivities).toBeCalledTimes(2);
	});

	it('Should skip aggregation if pipeline does not have aggregation configured', async () => {
		const testEvent: ProcessedTaskEvent = {
			groupContextId: '/tests',
			executionId: 'execution-1',
			pipelineId: 'pipeline-1',
			requiresAggregation: false,
			sequence: 0,
			metricQueue: []
		};

		await underTest.process(testEvent);
		expect(mockedActivitiesRepository.get).toBeCalledTimes(0);
		expect(mockedActivitiesRepository.createAggregatedActivities).toBeCalledTimes(0);
	});
});
