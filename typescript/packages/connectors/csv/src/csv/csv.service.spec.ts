import { beforeEach, describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';
import pino from 'pino';
import type { ConnectorEvents } from '@sif/connector-utils';
import { CsvService } from './csv.service.js';

describe('csvService', () => {
	let csvService: CsvService;
	let mockedConnectorEvents: ConnectorEvents;

	beforeEach(() => {
		const logger = pino(
			pino.destination({
				sync: true, // test frameworks must use pino logger in sync mode!
			})
		);
		logger.level = 'debug';
		mockedConnectorEvents = mock<ConnectorEvents>();
		csvService = new CsvService(logger, mockedConnectorEvents);
	});


	it('should initialize the default options based on the parameters passed through the event', () => {
		const parameters = {
			delimiter: '|'
		};
		const options = csvService['initializeDefaultOptions'](parameters);

		// testing if it got overrided properly
		expect(options.delimiter).toEqual('|');
		// automatic default if we didnt specify one
		expect(options.handleEmptyCells).toEqual('setToEmptyString');
	});


});
