import { beforeEach, describe, expect, it } from 'vitest';
import pino from 'pino';
import { Readable } from 'stream';
import * as fs from 'fs';
import type { Pipeline } from '@sif/clients';
import { convertCsvReadableStreamToSifFormat, HandleEmptyCellTypes, Options, validateParameters } from './connector.formatter';

describe('csvService', () => {
	const pipeline: Pipeline = {
		updatedAt: new Date(),
		createdAt: new Date(),
		type: 'activities',
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
		name: "pipelineName",
		version: 1,
		transformer: {
			transforms: [],
			parameters: [{
				key: 'Index',
				type: 'number'
			}, {
				key: 'Website',
				type: 'string'
			}, {
				key: 'Industry',
				type: 'string'
			}]
		},
		createdBy: 'someone@somewhere.com',
		_aggregatedOutputKeyAndTypeMap: {}
	};

	beforeEach(() => {
		const logger = pino(
			pino.destination({
				sync: true, // test frameworks must use pino logger in sync mode!
			})
		);
		logger.level = 'debug';
	});

	it('happy path', async () => {
		const data = 'Index,Organization Id,Name,Website,Country,Description,Founded,Industry,Number of employees\n' +
			'1,E84A904909dF528,Liu-Hoover,http://www.day-hartman.org/,Western Sahara,Ergonomic zero administration knowledge user,1980,Online Publishing,6852\n' +
			'2,AAC4f9aBF86EAeF,Orr-Armstrong,https://www.chapman.net/,Algeria,Ergonomic radical budgetary management,1970,Import / Export,7994\n' +
			'3,ad2eb3C8C24DB87,Gill-Lamb,http://lin.com/,Cote d\'Ivoire,Programmable intermediate conglomeration,2005,Apparel / Fashion,5105\n' +
			'4,D76BB12E5eE165B,Bauer-Weiss,https://gillespie-stout.com/,OR,Synergistic maximized definition,2015,Dairy,9069\n' +
			'5,2F31EddF2Db9aAE,Love-Palmer,https://kramer.com/,Denmark,Optimized optimizing moderator,2010,Management Consulting,6991\n' +
			'6,6774DC1dB00BD11,"Farmer, Edwards and Andrade",http://wolfe-boyd.com/,Norfolk Island,Virtual leadingedge benchmark,2003,Mental Health Care,3503\n' +
			'7,116B5cD4eE1fAAc,"Bass, Hester and Mcclain",https://meza-smith.com/,Uzbekistan,Multi-tiered system-worthy hub,1994,Computer Hardware,2762\n' +
			'8,AB2eA15d98b6BD4,"Strickland, Gray and Jensen",http://kerr.info/,Israel,Team-oriented fresh-thinking knowledge user,1987,Performing Arts,7020\n' +
			'9,0c6D831e8DceCfE,"Sparks, Decker and Powell",https://www.howe.net/,Israel,Down-sized content-based info-mediaries,1977,Marketing / Advertising / Sales,2709\n' +
			'10,9ABE0c8aee135d6,"Osborn, Ford and Macdonald",http://www.mcdonald-watts.biz/,Syrian Arab Republic,Optional coherent focus group,1990,Investment Banking / Venture,5731\n' +
			'1000,3ddb89ecD83B533,"Maddox, Owen and Shepherd",https://www.hamilton.com/,Guinea,Reactive bottom-line pricing structure,2019,Animation,4467\n';

		const headers = ['Index', 'Organization Id', 'Name', 'Website', 'Country', 'Description', 'Founded', 'Industry', 'Number of employees'];

		const stream = Readable.from(data);
		const options: Options = {
			delimiter: ','
		};

		const filePath = await convertCsvReadableStreamToSifFormat(stream, pipeline.transformer.parameters, options);
		const convertedFile = fs.readFileSync(filePath, 'utf8');
		// lets convert the contents to actual json objects
		const objects = convertedFile.trim().split(`\r\n`).map((obj) => JSON.parse(obj));

		// there are 12 lines in the above dataset 11 rows + 1 header total, parsed output should have 11
		expect(objects.length).toEqual(11);
		// lets validate if the number of keys match
		expect(Object.keys(objects[0]).length).toEqual(headers.length);
		// lets validate if it has all the keys
		expect(objects[0]).toHaveProperty('Index');
		expect(objects[0]).toHaveProperty('Organization Id');
		expect(objects[0]).toHaveProperty('Name');
		expect(objects[0]).toHaveProperty('Website');
		expect(objects[0]).toHaveProperty('Country');
		expect(objects[0]).toHaveProperty('Description');
		expect(objects[0]).toHaveProperty('Founded');
		expect(objects[0]).toHaveProperty('Industry');
		expect(objects[0]).toHaveProperty('Number of employees');

	});

	it('should throw an error if there is bad csv data', async () => {
		const data = 'Index,Organization Id,Name,Website,Country,Description,Founded,Industry,Number of employees\n' +
			'1,E84A904909dF528,Liu-Hoover,http://www.day-hartman.org/,Western Sahara,Ergonomic zero administration knowledge user,1980,Online Publishing,6852\n' +
			'2,AAC4f9aBF86EAeF,Orr-Armstrong,https://www.chapman.net/,Algeria,Ergonomic radical budgetary management,1970,Import / Export,7994\n' +
			'3,ad2eb3C8C24DB87,http://lin.com/,Cote d\'Ivoire,Programmable intermediate conglomeration,2005,Apparel / Fashion,5105\n';

		const stream = Readable.from(data);
		const options: Options = {
			delimiter: ','
		};

		try {
			await convertCsvReadableStreamToSifFormat(stream, pipeline.transformer.parameters, options);
		} catch (e) {
			expect(e.message).toEqual('Failed to parse row: Invalid Record Length: expect 9, got 8 on line 4');
		}
	});

	it('should be able to handle empty cells within a csv based on the default options supplied which is to set it to empty string', async () => {
		const data = 'Index,Organization Id,Name,Website,Country,Description,Founded,Industry,Number of employees\n' +
			'1,E84A904909dF528,Liu-Hoover,http://www.day-hartman.org/,Western Sahara,Ergonomic zero administration knowledge user,1980,Online Publishing,6852\n' +
			'2,AAC4f9aBF86EAeF,Orr-Armstrong,https://www.chapman.net/,Algeria,Ergonomic radical budgetary management,1970,Import / Export,7994\n' +
			'3,,,http://lin.com/,Cote d\'Ivoire,Programmable intermediate conglomeration,2005,Apparel / Fashion,5105\n';

		const headers = ['Index', 'Organization Id', 'Name', 'Website', 'Country', 'Description', 'Founded', 'Industry', 'Number of employees'];

		const stream = Readable.from(data);
		const options: Options = {
			delimiter: ','
		};

		const filePath = await convertCsvReadableStreamToSifFormat(stream, pipeline.transformer.parameters, options);
		const convertedFile = fs.readFileSync(filePath, 'utf8');
		// let's convert the contents to actual json objects
		const objects = convertedFile.trim().split(`\r\n`).map((obj) => JSON.parse(obj));

		// there are 12 lines in the above dataset 11 rows + 1 header total, parsed output should have 11
		expect(objects.length).toEqual(3);
		// lets validate if the number of keys match
		expect(Object.keys(objects[0]).length).toEqual(headers.length);
		// the third row in the csv data above has second and third cells empty we need to validate if by default the value for those cells were set to empty strings
		expect(objects[2]['Organization Id']).toEqual('');
		expect(objects[2]['Name']).toEqual('');
	});

	it('should be able to handle empty cells within a csv if options override is set to "setToNull" for empty cells', async () => {
		const data = 'Index,Organization Id,Name,Website,Country,Description,Founded,Industry,Number of employees\n' +
			'1,E84A904909dF528,Liu-Hoover,http://www.day-hartman.org/,Western Sahara,Ergonomic zero administration knowledge user,1980,Online Publishing,6852\n' +
			'2,AAC4f9aBF86EAeF,Orr-Armstrong,https://www.chapman.net/,Algeria,Ergonomic radical budgetary management,1970,Import / Export,7994\n' +
			'3,,,http://lin.com/,Cote d\'Ivoire,Programmable intermediate conglomeration,2005,Apparel / Fashion,5105\n';

		const headers = ['Index', 'Organization Id', 'Name', 'Website', 'Country', 'Description', 'Founded', 'Industry', 'Number of employees'];

		const stream = Readable.from(data);
		const options: Options = {
			delimiter: ',',
			handleEmptyCells: HandleEmptyCellTypes.setToNull
		};

		const filePath = await convertCsvReadableStreamToSifFormat(stream, pipeline.transformer.parameters, options);
		const convertedFile = fs.readFileSync(filePath, 'utf8');
		// let's convert the contents to actual json objects
		const objects = convertedFile.trim().split(`\r\n`).map((obj) => JSON.parse(obj));

		// there are 12 lines in the above dataset 11 rows + 1 header total, parsed output should have 11
		expect(objects.length).toEqual(3);
		// lets validate if the number of keys match
		expect(Object.keys(objects[0]).length).toEqual(headers.length);
		// the third row in the csv data above has second and third cells empty we need to validate if by default the value for those cells were set to nulls
		expect(objects[2]['Organization Id']).toEqual(null);
		expect(objects[2]['Name']).toEqual(null);
	});


	it('should not throw an error if the pipeline parameters have keys which are not found in the csv', () => {

		const headers = ['Index', 'Organization Id', 'Name', 'Website', 'Country', 'Description', 'Founded', 'Industry', 'Number of employees'];

		validateParameters(pipeline.transformer.parameters, headers);

	});

	it('should throw an error if the headers dont contain the defined parameters', async () => {
		pipeline.transformer.parameters = [{
			key: 'A',
			type: 'number'
		}, {
			key: 'B',
			type: 'string'
		}, {
			key: 'C',
			type: 'string'
		}];

		const data = 'Index,Organization Id,Name,Website,Country,Description,Founded,Industry,Number of employees\n' +
			'1,E84A904909dF528,Liu-Hoover,http://www.day-hartman.org/,Western Sahara,Ergonomic zero administration knowledge user,1980,Online Publishing,6852\n' +
			'2,AAC4f9aBF86EAeF,Orr-Armstrong,https://www.chapman.net/,Algeria,Ergonomic radical budgetary management,1970,Import / Export,7994\n' +
			'3,,,http://lin.com/,Cote d\'Ivoire,Programmable intermediate conglomeration,2005,Apparel / Fashion,5105\n';

		const stream = Readable.from(data);
		const options: Options = {
			delimiter: ','
		};

		try {
			await convertCsvReadableStreamToSifFormat(stream, pipeline.transformer.parameters, options);
		} catch (e) {
			expect(e.message).toEqual('Failed to parse row: csv file headers columns doesnt include all the specified in the pipeline transform parameters. transformParameterKeys: A,B,C, fileHeaders:Index,Organization Id,Name,Website,Country,Description,Founded,Industry,Number of employees');
		}

	});

	it('should throw an error if the pipeline parameters have keys which are not found in the csv', () => {
		pipeline.transformer.parameters = [{
			key: 'A',
			type: 'number'
		}, {
			key: 'B',
			type: 'string'
		}, {
			key: 'C',
			type: 'string'
		}];

		const headers = ['Index', 'Organization Id', 'Name', 'Website', 'Country', 'Description', 'Founded', 'Industry', 'Number of employees'];
		try {
			validateParameters(pipeline.transformer.parameters, headers);
		} catch (e) {
			expect(e.message).toEqual('csv file headers columns doesnt include all the specified in the pipeline transform parameters. transformParameterKeys: A,B,C, fileHeaders:Index,Organization Id,Name,Website,Country,Description,Founded,Industry,Number of employees');
		}

	});

});
