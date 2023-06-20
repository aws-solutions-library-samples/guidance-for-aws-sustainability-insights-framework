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

import { describe, expect, it, beforeEach, test } from 'vitest';
import pino from 'pino';
import { TransformerValidator } from './tranformer-validator.js';
import type { Transformer } from '../common/models.js';

describe('transformer validator', () => {
	let validator: TransformerValidator;

	beforeEach(async () => {
		const logger = pino(
			pino.destination({
				sync: true, // test frameworks must use pino logger in sync mode!
			})
		);
		logger.level = 'debug';
		validator = new TransformerValidator(logger);
	});

	it('transformer Happy path', () => {
		const transformer: Transformer = {
			transforms: [
				{
					index: 0,
					formula: ':time',
					outputs: [
						{
							description: 'time stamp',
							index: 0,
							key: 'time',
							type: 'timestamp',
						},
					],
				},
				{
					index: 1,
					formula: 'if(:one==\'ok\',50,1)',
					outputs: [
						{
							description: 'some description about pin24',
							index: 0,
							key: 'sum',
							label: 'Vehicle',
							type: 'number',
							includeAsUnique: true,
						},
					],
				},
				{
					index: 2,
					formula: 'if(:two==10,50,1)',
					outputs: [
						{
							description: 'some description about pin24',
							index: 0,
							key: 'sumtwo',
							label: 'Vehicle',
							type: 'number',
						},
					],
				},
			],
			parameters: [
				{
					index: 0,
					key: 'time',
					type: 'timestamp',
				},
				{
					index: 1,
					key: 'one',
					label: 'pin 24',
					description: 'some description about pin24',
					type: 'string',
				},
				{
					index: 2,
					key: 'two',
					label: 'Distance',
					description: 'distance traveled',
					type: 'number',
				},
			],
		};

		validator.validateTransformer(transformer);
	});

	// transformer object has no parameters
	it('should throw an error if no parameters are specified', () => {
		const transformer: Transformer = {
			transforms: [
				{
					index: 0,
					formula: ':time',
					outputs: [
						{
							description: 'time stamp',
							index: 0,
							key: 'time',
							type: 'timestamp',
						},
					],
				},
				{
					index: 1,
					formula: 'if(:one==\'ok\',50,1)',
					outputs: [
						{
							description: 'some description about pin24',
							index: 0,
							key: 'sum',
							label: 'Vehicle',
							type: 'number',
						},
					],
				},
				{
					index: 2,
					formula: 'if(:two==10,50,1)',
					outputs: [
						{
							description: 'some description about pin24',
							index: 0,
							key: 'sumtwo',
							label: 'Vehicle',
							type: 'number',
						},
					],
				},
			],
		};

		expect(() => {
			validator.validateTransformer(transformer);
		}).toThrow('');
	});

	// transformer object has no transforms
	it('should throw an error if no transforms are specified', () => {
		const transformer: Transformer = {
			parameters: [
				{
					index: 0,
					key: 'one',
					label: 'pin 24',
					description: 'some description about pin24',
					type: 'string',
				},
				{
					index: 1,
					key: 'two',
					label: 'Distance',
					description: 'distance traveled',
					type: 'number',
				},
			],
		};

		expect(() => {
			validator.validateTransformer(transformer);
		}).toThrow('The position of the transforms (their `index`) must begin from 0.');
	});

	// transforms index doesn't start with 0
	it('should throw an error if transforms sequenced index doesn\'t start from 0 i.e. 3,4,5', () => {
		const transformer: Transformer = {
			transforms: [
				{
					index: 0,
					formula: ':time',
					outputs: [
						{
							description: 'time stamp',
							index: 0,
							key: 'time',
							type: 'timestamp',
						},
					],
				},
				{
					index: 2,
					formula: 'if(:one==\'ok\',50,1)',
					outputs: [
						{
							description: 'some description about pin24',
							index: 0,
							key: 'sum',
							label: 'Vehicle',
							type: 'number',
						},
					],
				},
				{
					index: 3,
					formula: 'if(:two==10,50,1)',
					outputs: [
						{
							description: 'some description about pin24',
							index: 0,
							key: 'sumtwo',
							label: 'Vehicle',
							type: 'number',
						},
					],
				},
			],
			parameters: [
				{
					index: 0,
					key: 'time',
					type: 'timestamp',
				},
				{
					index: 1,
					key: 'one',
					label: 'pin 24',
					description: 'some description about pin24',
					type: 'string',
				},
				{
					index: 2,
					key: 'two',
					label: 'Distance',
					description: 'distance travelled',
					type: 'number',
				},
			],
		};

		expect(() => {
			validator.validateTransformer(transformer);
		}).toThrow('The order of the transforms (their \'index\') must not be skipping or missing a position.');
	});

	// transform index skips a number in the sequence
	it('should throw an error if transforms sequence skips an index i.e. 0,1,3', () => {
		const transformer: Transformer = {
			transforms: [
				{
					index: 0,
					formula: 'if(:one==\'ok\',50,1)',
					outputs: [
						{
							description: 'some description about pin24',
							index: 0,
							key: 'sum',
							label: 'Vehicle',
							type: 'number',
						},
					],
				},
				{
					index: 2,
					formula: 'if(:two==10,50,1)',
					outputs: [
						{
							description: 'some description about pin24',
							index: 0,
							key: 'sumtwo',
							label: 'Vehicle',
							type: 'number',
						},
					],
				},
			],
			parameters: [
				{
					index: 0,
					key: 'one',
					label: 'pin 24',
					description: 'some description about pin24',
					type: 'string',
				},
				{
					index: 1,
					key: 'two',
					label: 'Distance',
					description: 'distance travelled',
					type: 'number',
				},
			],
		};

		expect(() => {
			validator.validateTransformer(transformer);
		}).toThrow('The order of the transforms (their \'index\') must not be skipping or missing a position.');
	});

	// transforms doesnt have output defined
	it('should throw an error if any transform doesn\'t have output defined', () => {
		const transformer: Transformer = {
			transforms: [
				{
					index: 0,
					formula: ':time',
					outputs: [
						{
							description: 'time stamp',
							index: 0,
							key: 'time',
							type: 'timestamp',
						},
					],
				},
				{
					index: 1,
					formula: 'if(:one==\'ok\',50,1)',
					outputs: [
						{
							description: 'some description about pin24',
							index: 0,
							key: 'sum',
							label: 'Vehicle',
							type: 'number',
						},
					],
				},
				{
					index: 2,
					formula: 'if(:two==10,50,1)',
				},
			],
			parameters: [
				{
					index: 0,
					key: 'time',
					type: 'timestamp',
				},
				{
					index: 1,
					key: 'one',
					label: 'pin 24',
					description: 'some description about pin24',
					type: 'string',
				},
				{
					index: 2,
					key: 'two',
					label: 'Distance',
					description: 'distance traveled',
					type: 'number',
				},
			],
		};

		expect(() => {
			validator.validateTransformer(transformer);
		}).toThrow('Transform must have an output defined.');
	});

	// transforms have more than 1 output
	it('should throw an error if there are more then one outputs defined for any transform', () => {
		const transformer: Transformer = {
			transforms: [
				{
					index: 0,
					formula: 'if(:one==\'ok\',50,1)',
					outputs: [
						{
							description: 'some description about pin24',
							index: 0,
							key: 'sum',
							label: 'Vehicle',
							type: 'number',
						},
						{
							description: 'some description about pin24',
							index: 1,
							key: 'sum2',
							label: 'Vehicle',
							type: 'number',
						},
					],
				},
				{
					index: 1,
					formula: 'if(:two==10,50,1)',
					outputs: [
						{
							description: 'some description about pin24',
							index: 0,
							key: 'sumtwo',
							label: 'Vehicle',
							type: 'number',
						},
					],
				},
			],
			parameters: [
				{
					index: 0,
					key: 'one',
					label: 'pin 24',
					description: 'some description about pin24',
					type: 'string',
				},
				{
					index: 1,
					key: 'two',
					label: 'Distance',
					description: 'distance travelled',
					type: 'number',
				},
			],
		};

		expect(() => {
			validator.validateTransformer(transformer);
		}).toThrow('Only 1 output per transform is supported.');
	});

	it('transformer defines more than 5 key values', () => {
		const transformer: Transformer = {
			transforms: [
				{
					index: 0,
					formula: ':time',
					outputs: [
						{
							description: 'time stamp',
							index: 0,
							key: 'time',
							type: 'timestamp',
						},
					],
				},
				{
					index: 1,
					formula: 'if(:one==\'ok\',50,1)',
					outputs: [
						{
							description: 'some description about pin24',
							index: 0,
							key: 'sum',
							label: 'Vehicle',
							type: 'number',
							includeAsUnique: true,
						},
					],
				},
				{
					index: 2,
					formula: 'if(:two==10,50,1)',
					outputs: [
						{
							description: 'some description about pin24',
							index: 0,
							key: 'sumtwo',
							label: 'Vehicle',
							type: 'number',
							includeAsUnique: true,
						},
					],
				},
				{
					index: 3,
					formula: ':two*3',
					outputs: [
						{
							description: 'times 3',
							index: 0,
							key: 'times3',
							label: 'Times3',
							type: 'number',
							includeAsUnique: true,
						},
					],
				},
				{
					index: 4,
					formula: ':two*4',
					outputs: [
						{
							description: 'times 4',
							index: 0,
							key: 'times4',
							label: 'Times4',
							type: 'number',
							includeAsUnique: true,
						},
					],
				},
				{
					index: 5,
					formula: ':two*5',
					outputs: [
						{
							description: 'times 5',
							index: 0,
							key: 'times5',
							label: 'Times5',
							type: 'number',
							includeAsUnique: true,
						},
					],
				},
				{
					index: 6,
					formula: ':two*6',
					outputs: [
						{
							description: 'times 6',
							index: 0,
							key: 'times6',
							label: 'Times6',
							type: 'number',
							includeAsUnique: true,
						},
					],
				},
			],
			parameters: [
				{
					index: 0,
					key: 'time',
					type: 'timestamp',
				},
				{
					index: 1,
					key: 'one',
					label: 'pin 24',
					description: 'some description about pin24',
					type: 'string',
				},
				{
					index: 2,
					key: 'two',
					label: 'Distance',
					description: 'distance traveled',
					type: 'number',
				},
			],
		};

		expect(() => {
			validator.validateTransformer(transformer);
		}).toThrow('Only up to 5 outputs (other than timestamp) can be defined as keys. 6 are defined as keys.');
	});

	it('should throw an error if the transform output keys are not unique', () => {
		const transformer: Transformer = {
			transforms: [
				{
					index: 0,
					formula: ':time',
					outputs: [
						{
							description: 'time stamp',
							index: 0,
							key: 'time',
							type: 'timestamp',
						},
					],
				},
				{
					index: 1,
					formula: 'if(:one==\'ok\',50,1)',
					outputs: [
						{
							description: 'some description about pin24',
							index: 0,
							key: 'sum',
							label: 'Vehicle',
							type: 'number',
							includeAsUnique: true,
						},
					],
				},
				{
					index: 2,
					formula: 'if(:two==10,50,1)',
					outputs: [
						{
							description: 'some description about pin24',
							index: 0,
							key: 'sum',
							label: 'Vehicle',
							type: 'number',
						},
					],
				}
			],
			parameters: [
				{
					index: 0,
					key: 'time',
					type: 'timestamp',
				},
				{
					index: 1,
					key: 'one',
					label: 'pin 24',
					description: 'some description about pin24',
					type: 'string',
				},
				{
					index: 2,
					key: 'two',
					label: 'Distance',
					description: 'distance traveled',
					type: 'number',
				},
			],
		};

		expect(() => {
			validator.validateTransformer(transformer);
		}).toThrow('Transform output key needs to be unique.');
	});

	it('should throw an error if all transforms are marked as unique', () => {
		const transformer: Transformer = {
			transforms: [
				{
					index: 0,
					formula: ':time',
					outputs: [
						{
							description: 'time stamp',
							index: 0,
							key: 'time',
							type: 'timestamp',
						},
					],
				},
				{
					index: 1,
					formula: 'if(:one==\'ok\',50,1)',
					outputs: [
						{
							description: 'some description about pin24',
							index: 0,
							key: 'sum',
							label: 'Vehicle',
							type: 'number',
							includeAsUnique: true,
						},
					],
				},
				{
					index: 2,
					formula: 'if(:two==10,50,1)',
					outputs: [
						{
							description: 'some description about pin24',
							index: 0,
							key: 'sumtwo',
							label: 'Vehicle',
							type: 'number',
							includeAsUnique: true,
						},
					],
				}
			],
			parameters: [
				{
					index: 0,
					key: 'time',
					type: 'timestamp',
				},
				{
					index: 1,
					key: 'one',
					label: 'pin 24',
					description: 'some description about pin24',
					type: 'string',
				},
				{
					index: 2,
					key: 'two',
					label: 'Distance',
					description: 'distance traveled',
					type: 'number',
				},
			],
		};

		expect(() => {
			validator.validateTransformer(transformer);
		}).toThrow('All transform outputs cannot be marked as unique. At-least one transform output needs to stay unmarked.');
	});

	test.each([
		['string', 'mean'],
		['string', 'sum'],
		['string', 'min'],
		['string', 'max'],
		['boolean', 'mean'],
		['boolean', 'sum'],
		['boolean', 'min'],
		['boolean', 'max'],
		['timestamp', 'mean'],
		['timestamp', 'sum'],
		['timestamp', 'min'],
		['timestamp', 'max'],
	])('configuring type %s with aggregation function %s should throws exception', (type: any, aggregate: any) => {

		const transformerToTest: Transformer = {
			transforms: [
				{
					index: 0,
					formula: ':time',
					outputs: [
						{
							description: 'time stamp',
							index: 0,
							key: 'time',
							type: 'timestamp',
							aggregate: 'groupBy'
						},
					],
				},
				{
					index: 1,
					formula: 'if(:one==\'ok\',50,1)',
					outputs: [
						{
							description: 'some description about pin24',
							index: 0,
							key: 'sum',
							label: 'Vehicle',
							type: 'number',
							includeAsUnique: true,
						},
					],
				},
				{
					index: 2,
					formula: ':one',
					outputs: [
						{
							description: 'some description about pin24',
							index: 0,
							key: 'one',
							label: 'Vehicle',
							type: type,
							aggregate: aggregate
						},
					],
				}
			],
			parameters: [
				{
					index: 0,
					key: 'time',
					type: 'timestamp',
				},
				{
					index: 1,
					key: 'one',
					label: 'pin 24',
					description: 'some description about pin24',
					type: 'string',
				},
				{
					index: 2,
					key: 'two',
					label: 'Distance',
					description: 'distance traveled',
					type: 'number',
				},
			],
		};
		expect(() => {
			validator.validateTransformer(transformerToTest);
		}).toThrow('Only fields with number type can be aggregated using aggregation functions other than groupBy.');
	});

	it('should throw an error if more than one timestamp fields are being aggregated', () => {
		const transformer: Transformer = {
			transforms: [
				{
					index: 0,
					formula: ':time',
					outputs: [
						{
							description: 'time stamp',
							index: 0,
							key: 'time',
							type: 'timestamp',
							aggregate: 'groupBy'
						},
					],
				},
				{
					index: 1,
					formula: 'AS_TIMESTAMP(:time,\'M/d/yy\', roundDownTo=\'month\')',
					outputs: [
						{
							description: 'time stamp',
							index: 0,
							key: 'month',
							type: 'timestamp',
							aggregate: 'groupBy'
						},
					],
				},
				{
					index: 2,
					formula: 'if(:one==\'ok\',50,1)',
					outputs: [
						{
							description: 'some description about pin24',
							index: 0,
							key: 'sum',
							label: 'Vehicle',
							type: 'number',
							aggregate: 'sum',
							includeAsUnique: true,
						},
					],
				},
				{
					index: 3,
					formula: ':one',
					outputs: [
						{
							description: 'some description about pin24',
							index: 0,
							key: 'one',
							label: 'Vehicle',
							type: 'string',
						},
					],
				}
			],
			parameters: [
				{
					index: 0,
					key: 'time',
					type: 'timestamp',
				},
				{
					index: 1,
					key: 'one',
					label: 'pin 24',
					description: 'some description about pin24',
					type: 'string',
				},
				{
					index: 2,
					key: 'two',
					label: 'Distance',
					description: 'distance traveled',
					type: 'number',
				},
			],
		};

		expect(() => {
			validator.validateTransformer(transformer);
		}).toThrow('Only 1 timestamp field can be aggregated, the field will be used as date field for the aggregated output.');

	});

	it('should throw an error if more than one transform tries to use ASSIGN_TO_GROUP', () => {
		const transformer: Transformer = {
			transforms: [
				{
					index: 0,
					formula: ':timestamp',
					outputs: [
						{
							description: 'timestamp of event',
							index: 0,
							key: 'ts',
							type: 'timestamp',
						},
					],
				},
				{
					index: 1,
					formula: 'ASSIGN_TO_GROUP(CONCAT("/","unittestgroup1"))',
					outputs: [
						{
							description: 'group 1',
							index: 1,
							key: 'group1',
							label: 'Group 1',
							type: 'string'
						},
					],
				},
				{
					index: 2,
					formula: 'ASSIGN_TO_GROUP(CONCAT("/","unittestgroup2"))',
					outputs: [
						{
							description: 'group 2',
							index: 1,
							key: 'group2',
							label: 'Group 2',
							type: 'string'
						},
					],
				},
			],
			parameters: [
				{
					index: 0,
					key: 'timestamp',
					type: 'timestamp',
				}
			],
		};

		expect(() => {
			validator.validateTransformer(transformer);
		}).toThrow('Only 1 transform can use the ASSIGN_TO_GROUP() function.');
	});
});
