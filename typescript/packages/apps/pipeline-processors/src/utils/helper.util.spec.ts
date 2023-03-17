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

import * as util from './helper.utils.js';
import { describe, it, expect } from 'vitest';
import type { Pipeline } from '@sif/clients';

describe('HelperUtil', () => {
	const pipeline: Pipeline = {
		'createdBy': 'e2e_tests_admin@amazon.com',
		'transformer': {
			'transforms': [
				{
					'index': 0,
					'formula': 'AS_TIMESTAMP(:reading date,\'M/d/yy\')',
					'outputs': [
						{
							'index': 0,
							'key': 'time',
							'type': 'timestamp'
						}
					]
				},
				{
					'index': 1,
					'formula': ':zipcode',
					'outputs': [
						{
							'index': 0,
							'key': 'zipcode',
							'type': 'string',
							'aggregate': 'groupBy'
						}
					]
				},
				{
					'index': 2,
					'formula': ':month',
					'outputs': [
						{
							'index': 0,
							'key': 'month',
							'type': 'string'
						}
					]
				},
				{
					'index': 3,
					'formula': ':kwh',
					'outputs': [
						{
							'index': 0,
							'key': 'kwh',
							'type': 'number'
						}
					]
				},
				{
					'index': 4,
					'formula': '#electricity_emissions(:kwh,IMPACT(LOOKUP(LOOKUP(LOOKUP(:zipcode, \'ZipcodeToState\', \'zipcode\', \'state\'), \'StatePrimaryGen\', \'state\', \'primary_gen\'), \'GenToImpact\', \'gen\', \'if\'), \'co2e\', \'co2\'))',
					'outputs': [
						{
							'index': 0,
							'key': 'co2e',
							'type': 'number',
							'aggregate': 'sum'
						}
					]
				},
				{
					'index': 5,
					'formula': 'AS_TIMESTAMP(:reading date,\'M/d/yy\',roundDownTo=\'year\')',
					'outputs': [
						{
							'index': 0,
							'key': 'aggregatedDate',
							'type': 'timestamp',
							'aggregate': 'groupBy'
						}
					]
				}
			],
			'parameters': [
				{
					'key': 'reading date',
					'type': 'string'
				},
				{
					'key': 'zipcode',
					'label': 'Zipcode',
					'type': 'string'
				},
				{
					'key': 'month',
					'label': 'Month',
					'type': 'string'
				},
				{
					'key': 'kwh',
					'label': 'kWh',
					'type': 'number'
				}
			]
		},
		'version': 1,
		'_aggregatedOutputKeyAndTypeMap': {
			'zipcode': 'string',
			'co2e': 'number',
			'month': 'string',
			'kwh': 'number',
			'aggregatedDate': 'timestamp'
		}
	};

	it('should get the appropriate pipeline metadata for building query', () => {
		const pipelineMetadata = util.getPipelineMetadata(pipeline);
		console.log(pipelineMetadata);
		expect(pipelineMetadata.outputKeys).toEqual(['zipcode', 'co2e', 'month', 'kwh', 'aggregatedDate']);
		expect(pipelineMetadata.outputTypes).toEqual(['string', 'number', 'timestamp']);
		expect(pipelineMetadata.aggregate).toEqual({
			timestampField: 'aggregatedDate',
			fields: [
				{ key: 'zipcode', aggregate: 'groupBy', type: 'string' },
				{ key: 'co2e', aggregate: 'sum', type: 'number' },
				{ key: 'aggregatedDate', aggregate: 'groupBy', type: 'timestamp' }
			]
		});
	});
});

