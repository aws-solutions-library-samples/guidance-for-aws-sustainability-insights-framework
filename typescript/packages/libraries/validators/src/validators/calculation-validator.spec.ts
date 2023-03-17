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

import { describe, expect, it, beforeEach } from 'vitest';
import pino from 'pino';
import { CalculationValidator } from './calculation-validator.js';
import type { CalculationOutput, CalculationParameter } from '../common/models.js';

describe('calculation validator', () => {
	let underTest: CalculationValidator;

	beforeEach(async () => {
		const logger = pino(
			pino.destination({
				sync: true, // test frameworks must use pino logger in sync mode!
			})
		);
		logger.level = 'debug';
		underTest = new CalculationValidator(logger);
	});

	it('parameters happy path', async () => {
		const formula = 'IF(:one,:two,:three)';
		const parameters: CalculationParameter[] = [
			{
				index: 0,
				key: 'one',
				type: 'string',
			},
			{
				index: 1,
				key: 'two',
				type: 'string',
			},
			{
				index: 2,
				key: 'three',
				type: 'string',
			},
		];

		underTest.validateParameters(formula, parameters);
	});

	it('parameters happy path colon first character', async () => {
		const formula = ':one+:two';
		const parameters: CalculationParameter[] = [
			{
				index: 0,
				key: 'one',
				type: 'string',
			},
			{
				index: 1,
				key: 'two',
				type: 'string',
			},
		];

		underTest.validateParameters(formula, parameters);
	});

	it('parameters happy path with spaces', async () => {
		const formula = 'IF(:a, :b, :c)';
		const parameters: CalculationParameter[] = [
			{
				index: 0,
				key: 'a',
				type: 'string',
			},
			{
				index: 1,
				key: 'b',
				type: 'string',
			},
			{
				index: 2,
				key: 'c',
				type: 'string',
			},
		];

		underTest.validateParameters(formula, parameters);
	});

	it('parameters happy path with parameter names with colons', async () => {
		const formula = 'IF(:a:b:c, :b:c:d, :c:d:e)';
		const parameters: CalculationParameter[] = [
			{
				index: 0,
				key: 'a:b:c',
				type: 'string',
			},
			{
				index: 1,
				key: 'b:c:d',
				type: 'string',
			},
			{
				index: 2,
				key: 'c:d:e',
				type: 'string',
			},
		];

		underTest.validateParameters(formula, parameters);
	});

	it('parameters happy path with parameter names with double colons', async () => {
		const formula = 'IF(:a::b::c, :b::c::d, :c::d::e)';
		const parameters: CalculationParameter[] = [
			{
				index: 0,
				key: 'a::b::c',
				type: 'string',
			},
			{
				index: 1,
				key: 'b::c::d',
				type: 'string',
			},
			{
				index: 2,
				key: 'c::d::e',
				type: 'string',
			},
		];

		underTest.validateParameters(formula, parameters);
	});

	it('parameters happy path with arithmetic before parameter', async () => {
		const formula = '5+:a';
		const parameters: CalculationParameter[] = [
			{
				index: 0,
				key: 'a',
				type: 'string',
			},
		];

		underTest.validateParameters(formula, parameters);
	});

	it('parameters happy path with arithmetic before parameter with space', async () => {
		const formula = '5 - :c';
		const parameters: CalculationParameter[] = [
			{
				index: 0,
				key: 'c',
				type: 'string',
			},
		];

		underTest.validateParameters(formula, parameters);
	});

	it('parameters happy path with arithmetic after parameter', async () => {
		const formula = ':a/5';
		const parameters: CalculationParameter[] = [
			{
				index: 0,
				key: 'a',
				type: 'string',
			},
		];

		underTest.validateParameters(formula, parameters);
	});

	it('parameters happy path with arithmetic after parameter with space', async () => {
		const formula = ':c * 5';
		const parameters: CalculationParameter[] = [
			{
				index: 0,
				key: 'c',
				type: 'string',
			},
		];

		underTest.validateParameters(formula, parameters);
	});

	it('strings with colons are not parameters', async () => {
		const formula = 'IF(one:two:three,:a,:b)';
		const parameters: CalculationParameter[] = [
			{
				index: 0,
				key: 'a',
				type: 'string',
			},
			{
				index: 1,
				key: 'b',
				type: 'string',
			},
		];

		underTest.validateParameters(formula, parameters);
	});

	it('strings with double colons are not parameters', async () => {
		const formula = 'IF(one::two::three,:a,:b)';
		const parameters: CalculationParameter[] = [
			{
				index: 0,
				key: 'a',
				type: 'string',
			},
			{
				index: 1,
				key: 'b',
				type: 'string',
			},
		];

		underTest.validateParameters(formula, parameters);
	});

	it('no parameters in formula', async () => {
		const formula = 'IF(a,b,c)';
		const parameters: CalculationParameter[] = [];

		underTest.validateParameters(formula, parameters);
	});

	it('parameter index does not start at 0', async () => {
		const formula = 'IF(:one,:two,:three)';
		const parameters: CalculationParameter[] = [
			{
				index: 1,
				key: 'one',
				type: 'string',
			},
			{
				index: 2,
				key: 'two',
				type: 'string',
			},
			{
				index: 3,
				key: 'three',
				type: 'string',
			},
		];

		expect(() => {
			underTest.validateParameters(formula, parameters);
		}).toThrow('The position of the parameters (their `index`) must begin from 0.');
	});

	it('parameters provided out of order but in sequence if sorted is still acceptable', async () => {
		const formula = 'IF(:one,:two,:three)';
		const parameters: CalculationParameter[] = [
			{
				index: 1,
				key: 'two',
				type: 'string',
			},
			{
				index: 0,
				key: 'one',
				type: 'string',
			},
			{
				index: 2,
				key: 'three',
				type: 'string',
			},
		];

		underTest.validateParameters(formula, parameters);
	});

	it('parameter index sequence must not be skipping or missing a position', async () => {
		const formula = 'IF(:one,:two,:three)';
		const parameters: CalculationParameter[] = [
			{
				index: 0,
				key: 'one',
				type: 'string',
			},
			{
				index: 2,
				key: 'two',
				type: 'string',
			},
			{
				index: 3,
				key: 'three',
				type: 'string',
			},
		];

		expect(() => {
			underTest.validateParameters(formula, parameters);
		}).toThrow(`The order of the parameters (their 'index') must not be skipping or missing a position.`);
	});

	it('must have an output defined', async () => {
		const outputs: CalculationOutput[] = [];

		expect(() => {
			underTest.validateOutputs(outputs);
		}).toThrow(`Calculation must have an output defined.`);
	});

	it('must have an output defined', async () => {
		const outputs: CalculationOutput[] = [];

		expect(() => {
			underTest.validateOutputs(outputs);
		}).toThrow(`Calculation must have an output defined.`);
	});

	it('only 1 output per calculation is supported.', async () => {
		const outputs: CalculationOutput[] = [
			{ name: 'one' },
			{
				name: 'two',
			},
		];

		expect(() => {
			underTest.validateOutputs(outputs);
		}).toThrow(`Only 1 output per calculation is supported.`);
	});

});
