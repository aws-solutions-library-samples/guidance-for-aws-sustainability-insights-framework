import { beforeEach, describe, expect, it } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';
import { SqlResultProcessorTask } from './sqlResultProcessorTask.js';
import pino from 'pino';
import type { LambdaRequestContext, MetricClient, Transformer } from '@sif/clients';
import type { ActivitiesRepository } from '../../api/activities/repository.js';
import type { Client } from 'pg';
import type { CalculationContext, CalculatorS3TransformResponseWithSequence } from './model.js';
import type { PipelineProcessorsRepository } from '../../api/executions/repository.js';
import type { EventPublisher } from '@sif/events';
import type { CalculatorResultUtil } from '../../utils/calculatorResult.util.js';

describe('SqlResultProcessorTaskService', () => {
		let underTest: SqlResultProcessorTask;
		let mockPipelineProcessorsRepository: MockProxy<PipelineProcessorsRepository>;
		let mockMetricClient: MockProxy<MetricClient>;
		let mockActivitiesRepository: MockProxy<ActivitiesRepository>;
		let mockEventPublisher: MockProxy<EventPublisher>;
		let mockedCalculatorUtil: MockProxy<CalculatorResultUtil>;

		// mock resource data
		const pipelineId = 'testPipelineId';
		const executionId = 'testExecutionId';
		const transformer: Transformer = {
			transforms: [{
				'index': 0, 'formula': 'AS_TIMESTAMP(:reading_date,\'M/d/yy\')',
				'outputs': [{ 'index': 0, 'key': 'time', 'type': 'timestamp' }]
			}, {
				'index': 1,
				'formula': 'AS_TIMESTAMP(:reading_date,\'M/d/yy\', roundDownTo=\'month\')',
				'outputs': [{ 'index': 0, 'key': 'month', 'type': 'timestamp', 'aggregate': 'groupBy' }]
			}, { 'index': 2, 'formula': ':a', 'outputs': [{ 'index': 0, 'key': 'a', 'type': 'string', 'includeAsUnique': true }] }, {
				'index': 3,
				'formula': ':b*:c',
				'outputs': [{ 'index': 0, 'key': 'b_times_c', 'type': 'number', 'aggregate': 'sum' }]
			}],
			'parameters': [
				{ 'key': 'reading_date', 'type': 'string' },
				{ 'key': 'a', 'label': 'A', 'type': 'string' },
				{ 'key': 'b', 'label': 'Column B', 'type': 'number' },
				{ 'key': 'c', 'label': 'Column C', 'type': 'number' }]
		};

		const mockSqlClient = {
			end: () => {
			}
		} as Client;

		beforeEach(() => {

			const logger = pino(
				pino.destination({
					sync: true // test frameworks must use pino logger in sync mode!
				})
			);
			logger.level = 'info';

			const getLambdaContext = (): LambdaRequestContext => {
				return {} as LambdaRequestContext;
			};

			mockActivitiesRepository = mock<ActivitiesRepository>();
			mockPipelineProcessorsRepository = mock<PipelineProcessorsRepository>();
			mockMetricClient = mock<MetricClient>();
			mockEventPublisher = mock<EventPublisher>();
			mockedCalculatorUtil = mock<CalculatorResultUtil>();
			mockMetricClient.sortMetricsByDependencyOrder.mockReset();
			mockActivitiesRepository.getConnection.mockReset();
			mockActivitiesRepository.cleanupTempTables.mockReset();

			mockActivitiesRepository.getConnection.mockResolvedValue(mockSqlClient);
			mockMetricClient.sortMetricsByDependencyOrder.mockResolvedValue([]);

			underTest = new SqlResultProcessorTask(logger, mockPipelineProcessorsRepository, mockMetricClient, getLambdaContext, mockActivitiesRepository, mockEventPublisher, mockedCalculatorUtil);
		});


		it('Should update status to calculating_metrics if all sql insertion is successful no error when processing the calculation', async () => {

			const processedTaskEvent = await underTest.process([
				{
					context: { pipelineId, executionId, transformer, security: { email: 'unit_test' } } as CalculationContext,
					calculatorTransformResponse: { sequence: 0 } as CalculatorS3TransformResponseWithSequence,
					sqlExecutionResult: {
						status: 'success'
					}
				},
				{
					context: { pipelineId, executionId, transformer } as CalculationContext,
					calculatorTransformResponse: { sequence: 1 } as CalculatorS3TransformResponseWithSequence,
					sqlExecutionResult: {
						status: 'success'
					}
				}]);

			expect(processedTaskEvent).toEqual({
					'pipelineId': 'testPipelineId',
					'executionId': 'testExecutionId',
					'security': {
						'email': 'unit_test',
					},
					transformer,
					'errorLocationList': [],
					'sequenceList': [0, 1],
					'metricQueue': [],
					'outputs': [{ 'name': 'month', 'type': 'timestamp' }, { 'name': 'b_times_c', 'type': 'number' }],
					'requiresAggregation': true,
					'status': 'SUCCEEDED',
					'activities': {},
					'referenceDatasets': {},
				}
			);
			expect(mockActivitiesRepository.cleanupTempTables).toBeCalledWith([{ executionId, sequence: 0 }, { executionId, sequence: 1 }], mockSqlClient, true);

			expect(mockEventPublisher.publishTenantEvent).toBeCalledWith({
				'eventType': 'updated',
				'id': 'testExecutionId',
				'resourceType': 'pipelineExecution',
			});
		});

		it('Should return failed one of more sql insertion has failed', async () => {
			const processedTaskEvent = await underTest.process([{
				context: { pipelineId, executionId, transformer } as CalculationContext,
				calculatorTransformResponse: { sequence: 0 } as CalculatorS3TransformResponseWithSequence,
				sqlExecutionResult: {
					status: 'success'
				}
			}, {
				context: { pipelineId, executionId, transformer } as CalculationContext,
				calculatorTransformResponse: { sequence: 1 } as CalculatorS3TransformResponseWithSequence,
				sqlExecutionResult: {
					status: 'failed'
				}
			}]);

			expect(processedTaskEvent).toEqual({
					transformer,
					'pipelineId': 'testPipelineId',
					'executionId': 'testExecutionId',
					'errorLocationList': [],
					'sequenceList': [0, 1],
					'metricQueue': [],
					'outputs': [{ 'name': 'month', 'type': 'timestamp' }, { 'name': 'b_times_c', 'type': 'number' }],
					'requiresAggregation': true,
					'status': 'FAILED',
					'activities': {},
					'referenceDatasets': {},
				}
			);

			expect(mockActivitiesRepository.cleanupTempTables).toBeCalledWith([{ executionId, sequence: 0 }, { executionId, sequence: 1 }], mockSqlClient, true);

			// The status is not changed, this will be updated later on by result processor task
			expect(mockEventPublisher.publishTenantEvent).not.toBeCalled();
		});


		it('should return failed when calculator set noActivitiesProcessed set to true', async () => {
			const processedTaskEvent = await underTest.process([
				{
					context: { pipelineId, executionId, transformer } as CalculationContext,
					calculatorTransformResponse: { noActivitiesProcessed: true, sequence: 0, errorLocation: { key: 'testKey', bucket: 'testBucket' } } as CalculatorS3TransformResponseWithSequence,
					sqlExecutionResult: {
						status: 'success'
					}
				},
				{
					context: { pipelineId, executionId, transformer } as CalculationContext,
					calculatorTransformResponse: { sequence: 1 } as CalculatorS3TransformResponseWithSequence,
					sqlExecutionResult: {
						status: 'success'
					}
				}]);

			expect(processedTaskEvent).toEqual({
					'pipelineId': 'testPipelineId',
					'executionId': 'testExecutionId',
					transformer,
					'errorLocationList': [{ key: 'testKey', bucket: 'testBucket' }],
					'sequenceList': [0, 1],
					'metricQueue': [],
					'outputs': [{ 'name': 'month', 'type': 'timestamp' }, { 'name': 'b_times_c', 'type': 'number' }],
					'requiresAggregation': true,
					'status': 'FAILED',
					'activities': {},
					'referenceDatasets': {},
				}
			);

			expect(mockActivitiesRepository.cleanupTempTables).toBeCalledWith([{ executionId, sequence: 0 }, { executionId, sequence: 1 }], mockSqlClient, true);

			// The status is not changed, this will be updated later on by result processor task
			expect(mockEventPublisher.publishTenantEvent).not.toBeCalled();
		});

	}
)
;



