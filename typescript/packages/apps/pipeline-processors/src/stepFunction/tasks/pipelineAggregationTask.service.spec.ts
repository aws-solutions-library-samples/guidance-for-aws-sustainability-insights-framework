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

import { beforeEach, it, describe, expect } from 'vitest';
import pino from 'pino';
import { mock, MockProxy } from 'vitest-mock-extended';
import { PipelineAggregationTaskService } from './pipelineAggregationTask.service';
import type { PipelineClient, Transformer, Pipeline } from '@sif/clients';
import type { ActivitiesRepository } from '../../api/activities/repository';
import type { PipelineProcessorsRepository } from '../../api/executions/repository';
import type { AggregationTaskEvent } from './model';
import type { PipelineExecution } from '../../api/executions/schemas';

describe('PipelineAggregationTaskService', () => {
	let mockedPipelineRepo: MockProxy<PipelineProcessorsRepository>;
	let mockedActivitiesRepository: MockProxy<ActivitiesRepository>;
	let mockedPipelineClient: MockProxy<PipelineClient>;
	let underTest: PipelineAggregationTaskService;

	const transformerWithAggregation = {
		'transforms': [
			{
				'index': 0,
				'formula': 'AS_TIMESTAMP(:date,\'M/d/yy\')',
				'outputs': [
					{
						'description': 'Timestamp of business activity.',
						'index': 0,
						'key': 'time',
						'label': 'Time',
						'type': 'timestamp'
					}
				]
			},
			{
				'index': 1,
				'formula': 'AS_TIMESTAMP(:date,\'M/d/yy\', roundDownTo=\'month\')',
				'outputs': [
					{
						'description': 'Transform date to beginning of month.',
						'index': 0,
						'key': 'month',
						'label': 'Month',
						'type': 'timestamp',
						'aggregate': 'groupBy'
					}
				]
			},
			{
				'index': 2,
				'formula': ':a',
				'outputs': [
					{
						'description': 'Column A',
						'index': 0,
						'key': 'a',
						'label': 'Column A',
						'type': 'string',
						'includeAsUnique': true
					}
				]
			},
			{
				'index': 3,
				'formula': ':b*:c',
				'outputs': [
					{
						'description': 'Column B multiplied by Column C',
						'index': 0,
						'key': 'b*c',
						'label': 'B x C',
						'type': 'number',
						'aggregate': 'sum'
					}
				]
			}
		],
		'parameters': [
			{
				'index': 0,
				'key': 'date',
				'type': 'string'
			},
			{
				'index': 1,
				'key': 'a',
				'label': 'A',
				'description': 'Column A',
				'type': 'string'
			},
			{
				'index': 2,
				'key': 'b',
				'label': 'Column B',
				'description': 'Column B',
				'type': 'number'
			},
			{
				'index': 3,
				'key': 'c',
				'label': 'Column C',
				'description': 'Column C',
				'type': 'number'
			}
		]
	} as unknown as Transformer;

	const transformerWithNoAggregation = {
		'transforms': [
			{
				'index': 0,
				'formula': 'AS_TIMESTAMP(:date,\'M/d/yy\')',
				'outputs': [
					{
						'description': 'Timestamp of business activity.',
						'index': 0,
						'key': 'time',
						'label': 'Time',
						'type': 'timestamp'
					}
				]
			},
			{
				'index': 1,
				'formula': ':a',
				'outputs': [
					{
						'description': 'Column A',
						'index': 0,
						'key': 'a',
						'label': 'Column A',
						'type': 'string',
						'includeAsUnique': true
					}
				]
			},
			{
				'index': 2,
				'formula': ':b*:c',
				'outputs': [
					{
						'description': 'Column B multiplied by Column C',
						'index': 0,
						'key': 'b*c',
						'label': 'B x C',
						'type': 'number'
					}
				]
			}
		],
		'parameters': [
			{
				'index': 0,
				'key': 'date',
				'type': 'string'
			},
			{
				'index': 1,
				'key': 'a',
				'label': 'A',
				'description': 'Column A',
				'type': 'string'
			},
			{
				'index': 2,
				'key': 'b',
				'label': 'Column B',
				'description': 'Column B',
				'type': 'number'
			},
			{
				'index': 3,
				'key': 'c',
				'label': 'Column C',
				'description': 'Column C',
				'type': 'number'
			}
		]
	} as unknown as Transformer;

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

		underTest = new PipelineAggregationTaskService(logger, mockedActivitiesRepository, mockedPipelineRepo, mockedPipelineClient);

		mockedPipelineRepo.get.mockResolvedValueOnce({ pipelineVersion: 1 } as unknown as PipelineExecution);
		mockedPipelineClient.get.mockResolvedValueOnce({
			'_aggregatedOutputKeyAndTypeMap': {}, transformer: {
				transforms: [],
				parameters: []
			}
		} as unknown as Pipeline);
		mockedActivitiesRepository.getAffectedTimeRange.mockResolvedValueOnce({ from: new Date(), to: new Date() });
	});

	it('Should paginate through all results from aggregated query and insert aggregated result back to Activity table', async () => {
		mockedActivitiesRepository.get.mockResolvedValueOnce({
			data: Array.from({ length: 1000 }, (value: string) => {
				return { id: value };
			}), nextToken: 10
		});

		mockedActivitiesRepository.get.mockResolvedValueOnce({ data: [], nextToken: undefined });

		const testEvent: AggregationTaskEvent = {
			groupContextId: '/tests', pipelineExecutionId: 'execution-1', pipelineId: 'pipeline-1', transformer: transformerWithAggregation
		};

		await underTest.process(testEvent);
		expect(mockedActivitiesRepository.get).toBeCalledTimes(2);
		expect(mockedActivitiesRepository.createAggregatedActivities).toBeCalledTimes(1);
	});

	it('All activities results fits in first result page', async () => {
		mockedActivitiesRepository.get.mockResolvedValueOnce({
			data: Array.from({ length: 1000 }, (value: string) => {
				return { id: value };
			}), nextToken: undefined
		});
		mockedActivitiesRepository.get.mockResolvedValueOnce({ data: [], nextToken: undefined });

		const testEvent: AggregationTaskEvent = {
			groupContextId: '/tests', pipelineExecutionId: 'execution-1', pipelineId: 'pipeline-1', transformer: transformerWithAggregation
		};

		await underTest.process(testEvent);
		expect(mockedActivitiesRepository.get).toBeCalledTimes(1);
		expect(mockedActivitiesRepository.createAggregatedActivities).toBeCalledTimes(1);
	});

	it('Should skip aggregation if pipeline does not have aggregation configured', async () => {
		const testEvent: AggregationTaskEvent = {
			groupContextId: '/tests', pipelineExecutionId: 'execution-1', pipelineId: 'pipeline-1', transformer: transformerWithNoAggregation
		};

		await underTest.process(testEvent);
		expect(mockedActivitiesRepository.get).toBeCalledTimes(0);
		expect(mockedActivitiesRepository.createAggregatedActivities).toBeCalledTimes(0);
	});
});
