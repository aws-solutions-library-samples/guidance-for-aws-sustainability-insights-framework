import { beforeEach, describe, it, expect } from 'vitest';
import { mock } from 'vitest-mock-extended';
import pino from 'pino';
import type { S3Client } from '@aws-sdk/client-s3';
import type { EventPublisher } from '@sif/events';
import { ConnectorClient, Connector, Pipeline, ConnectorType } from '@sif/clients';
import type { PipelineExecution } from '../api/executions/schemas.js';
import { ConnectorUtility } from './connectorUtility';

describe('ConnectorUtility', () => {
	let connectorUtility: ConnectorUtility;
	let mockedS3Client: S3Client;
	let mockedEventPublisher: EventPublisher;
	let mockedConnectorClient: ConnectorClient;

	beforeEach(() => {
		const logger = pino(
			pino.destination({
				sync: true, // test frameworks must use pino logger in sync mode!
			})
		);
		logger.level = 'debug';
		mockedS3Client = mock<S3Client>();
		mockedEventPublisher = mock<EventPublisher>();
		mockedConnectorClient = mock<ConnectorClient>();
		connectorUtility = new ConnectorUtility(logger, mockedS3Client, undefined, mockedEventPublisher, mockedConnectorClient, 'bucket', 'key', 'eventbus', 'sif-csv-pipeline-input-connector');
	});

	it('happy path to compile all parameter chain from connector, pipeline and execution', () => {
		const connector: Connector = {
			parameters: [{
				name: 'connectorParam1',
				defaultValue: 'connectorParam1Val'
			}, {
				name: 'connectorParam2',
				defaultValue: 'connectorParam2Val'
			}, {
				name: 'connectorParam3'
			}, {
				name: 'pipelineParam1'
			}, {
				name: 'executionParam1'
			}],
			// ignore the rest below
			name: 'sif-csv-pipeline-input-connector',
			type: ConnectorType.input,
			id: 'connectorId',
			createdAt: 'timestamp',
			createdBy: 'someone@somewhere.com'
		};
		const pipeline: Pipeline = {
			connectorConfig: {
				input: [{
					name: 'sif-csv-pipeline-input-connector',
					parameters: {
						pipelineParam1: 'pipelineParam1',
						connectorParam2: 'connectorParam2ValPipeline'
					}
				}]
			},
			// ignore the rest below
			id: 'pipeId',
			version: 1,
			transformer: {
				transforms: [],
				parameters: []
			},
			createdBy: 'someone@somewhere.com',
			_aggregatedOutputKeyAndTypeMap: {}
		};
		const execution: PipelineExecution = {
			connectorOverrides: {
				'sif-csv-pipeline-input-connector': {
					parameters: {
						executionParam1: 'executionParam1Val1',
						connectorParam3: 'connectorParam3ValExecution',
						executionParam2: 'param not in connector config'
					}
				}
			},
			// ignore the rest below
			id: 'execid',
			pipelineId: 'pipeId',
			actionType: 'create',
			createdBy: 'someone@somewhere.com',
			createdAt: 'timestamp',
			pipelineVersion: 1,
			status: 'success',
			groupContextId: '/'
		};

		const expectedCompiledParameters = {
			connectorParam1: 'connectorParam1Val',
			connectorParam2: 'connectorParam2ValPipeline',
			connectorParam3: 'connectorParam3ValExecution',
			pipelineParam1: 'pipelineParam1',
			executionParam1: 'executionParam1Val1'
		};

		const compiledParameters = connectorUtility['compileConnectorParameters'](connector, pipeline, execution);
		// match the expected parameters with the actual
		expect(compiledParameters).toEqual(expectedCompiledParameters);
		// total should be 5, 3 from connector, 1 from pipeline and 1 from execution
		expect(Object.keys(compiledParameters).length).toEqual(5);
		// validate that the parameters got overridden correctly. "connectorParam2" gets overridden by pipeline
		expect(compiledParameters['connectorParam2']).toEqual('connectorParam2ValPipeline');
		// validate that the parameters got overridden correctly. "connectorParam3" gets overridden by execution
		expect(compiledParameters['connectorParam3']).toEqual('connectorParam3ValExecution');
		// validate the parameter from pipeline itself got in the response
		expect(compiledParameters['pipelineParam1']).toEqual('pipelineParam1');
		// validate the parameter from the execution itself got in the response
		expect(compiledParameters['executionParam1']).toEqual('executionParam1Val1');
		// a parameter which is defined on the execution isn't configured on the connector shouldn't be compiled in the result
		expect(compiledParameters['executionParam2']).toBeUndefined();

	});

	it('happy path to throw an error if connector has required parameters', () => {
		const connector: Connector = {
			// ignore the rest below
			name: 'sif-csv-pipeline-input-connector',
			type: ConnectorType.input,
			id: 'connectorId',
			createdAt: 'timestamp',
			createdBy: 'someone@somewhere.com'
		};
		const pipeline: Pipeline = {
			connectorConfig: {
				input: [{
					name: 'sif-csv-pipeline-input-connector'
				}]
			},
			// ignore the rest below
			id: 'pipeId',
			version: 1,
			transformer: {
				transforms: [],
				parameters: []
			},
			createdBy: 'someone@somewhere.com',
			_aggregatedOutputKeyAndTypeMap: {}
		};
		const execution: PipelineExecution = {
			// ignore the rest below
			id: 'execid',
			pipelineId: 'pipeId',
			actionType: 'create',
			createdBy: 'someone@somewhere.com',
			createdAt: 'timestamp',
			pipelineVersion: 1,
			status: 'success',
			groupContextId: '/'
		};

		const expectedCompiledParameters = {};

		const compiledParameters = connectorUtility['compileConnectorParameters'](connector, pipeline, execution);
		// match the expected parameters with the actual
		expect(compiledParameters).toEqual(expectedCompiledParameters);
		// total should be 0
		expect(Object.keys(compiledParameters).length).toEqual(0);

	});


	it('should throw an error, if the connector has required parameter constraint which hasnt been met at the time of the execution', () => {
		const connector: Connector = {
			parameters: [{
				name: 'connectorParam1',
				required: true,
				defaultValue: 'connectorParam1Val'
			}, {
				name: 'connectorParam2'
			}, {
				name: 'connectorParam3'
			}, {
				name: 'pipelineParam1',
				required: true
			}, {
				name: 'executionParam1',
				required: true
			}],
			// ignore the rest below
			name: 'sif-csv-pipeline-input-connector',
			type: ConnectorType.input,
			id: 'connectorId',
			createdAt: 'timestamp',
			createdBy: 'someone@somewhere.com'
		};
		const pipeline: Pipeline = {
			connectorConfig: {
				input: [{
					name: 'sif-csv-pipeline-input-connector',
				}]
			},
			// ignore the rest below
			id: 'pipeId',
			version: 1,
			transformer: {
				transforms: [],
				parameters: []
			},
			createdBy: 'someone@somewhere.com',
			_aggregatedOutputKeyAndTypeMap: {}
		};
		const execution: PipelineExecution = {
			// ignore the rest below
			id: 'execid',
			pipelineId: 'pipeId',
			actionType: 'create',
			createdBy: 'someone@somewhere.com',
			createdAt: 'timestamp',
			pipelineVersion: 1,
			status: 'success',
			groupContextId: '/'
		};

		try {
			connectorUtility['validateConnectorParameters'](connector, pipeline, execution);
			// match the expected parameters with the actual
		} catch (e) {
			expect(e.message).toEqual('Connector configured on the pipeline has required parameters requirement which has not been satisfied: requiredParameterKeys: ["connectorParam1","pipelineParam1","executionParam1"], compiledParameterKeys:["connectorParam1"]');
		}

	});

	it('should not throw an error, if the connector has required parameter constraint which has been met at the time of the execution', () => {
		const connector: Connector = {
			parameters: [{
				name: 'connectorParam1',
				required: true,
				defaultValue: 'connectorParam1Val'
			}, {
				name: 'connectorParam2'
			}, {
				name: 'connectorParam3'
			}, {
				name: 'pipelineParam1',
				required: true
			}, {
				name: 'executionParam1',
				required: true
			}],
			// ignore the rest below
			name: 'sif-csv-pipeline-input-connector',
			type: ConnectorType.input,
			id: 'connectorId',
			createdAt: 'timestamp',
			createdBy: 'someone@somewhere.com'
		};
		const pipeline: Pipeline = {
			connectorConfig: {
				input: [{
					name: 'sif-csv-pipeline-input-connector',
					parameters: {
						pipelineParam1: 'pipelineParam1',
						connectorParam2: 'connectorParam2ValPipeline'
					}
				}]
			},
			// ignore the rest below
			id: 'pipeId',
			version: 1,
			transformer: {
				transforms: [],
				parameters: []
			},
			createdBy: 'someone@somewhere.com',
			_aggregatedOutputKeyAndTypeMap: {}
		};
		const execution: PipelineExecution = {
			connectorOverrides: {
				'sif-csv-pipeline-input-connector': {
					parameters: {
						executionParam1: 'executionParam1Val1',
						connectorParam3: 'connectorParam3ValExecution'
					}
				}
			},
			// ignore the rest below
			id: 'execid',
			pipelineId: 'pipeId',
			actionType: 'create',
			createdBy: 'someone@somewhere.com',
			createdAt: 'timestamp',
			pipelineVersion: 1,
			status: 'success',
			groupContextId: '/'
		};

		connectorUtility['validateConnectorParameters'](connector, pipeline, execution);

	});


});
