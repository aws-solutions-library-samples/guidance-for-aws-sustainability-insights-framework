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

import { beforeEach, describe, expect, it, test } from 'vitest';
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

	it('impact pipeline transformer Happy path', () => {
		const transformer: Transformer = {
			'transforms': [
				{
					'index': 0,
					'formula': 'CONCAT(\'useeio:supply_chain_naics_by_ghg:\', :NAICS Code 2017, \':\', :GHG)',
					'outputs': [
						{
							'description': 'Activity name.',
							'index': 0,
							'key': 'activity:name',
							'type': 'string'
						}
					]
				},
				{
					'index': 1,
					'formula': 'CONCAT(\'Supply Chain GHG EmissionFactors v1.2 NAICS by GHG USD 2021 for \', :NAICS Code 2017, \' (\', :GHG, \').\')',
					'outputs': [
						{
							'description': 'Activity description.',
							'index': 0,
							'key': 'activity:description',
							'type': 'string'
						}
					]
				},
				{
					'index': 2,
					'formula': '\'USEEIO\'',
					'outputs': [
						{
							'description': 'Activity provider tag.',
							'index': 0,
							'key': 'activity:tag:provider',
							'type': 'string'
						}
					]
				},
				{
					'index': 3,
					'formula': '\'SupplyChainGHGEmissionFactors_v1.2_NAICS_byGHG_USD2021\'',
					'outputs': [
						{
							'description': 'Activity dataset tag.',
							'index': 0,
							'key': 'activity:tag:dataset',
							'type': 'string'
						}
					]
				},
				{
					'index': 4,
					'formula': ':NAICS Code 2017',
					'outputs': [
						{
							'description': 'Activity NAICS Code 2017 tag.',
							'index': 0,
							'key': 'activity:tag:naics_code_2017',
							'type': 'string'
						}
					]
				},
				{
					'index': 5,
					'formula': ':NAICS Title 2017',
					'outputs': [
						{
							'description': 'Activity NAICS Title 2017 tag.',
							'index': 0,
							'key': 'activity:tag:naics_title_2017',
							'type': 'string'
						}
					]
				},
				{
					'index': 6,
					'formula': ':GHG',
					'outputs': [
						{
							'description': 'Activity GHG tag.',
							'index': 0,
							'key': 'activity:tag:ghg',
							'type': 'string'
						}
					]
				},

				{
					'index': 7,
					'formula': '\'GHG emission factors\'',
					'outputs': [
						{
							'description': 'GHG emission factors.',
							'index': 0,
							'key': 'impact:ghg_emissions:name',
							'type': 'string'
						}
					]
				},
				{
					'index': 8,
					'formula': ':Unit',
					'outputs': [
						{
							'description': 'Emission factor unit.',
							'index': 0,
							'key': 'impact:ghg_emissions:attribute:unit',
							'type': 'string'
						}
					]
				},

				{
					'index': 9,
					'formula': '\'Without Margins\'',
					'outputs': [
						{
							'description': 'Supply Chain Emission Factors without Margins.',
							'index': 0,
							'key': 'impact:ghg_emissions:component:without_margins:key',
							'type': 'string'
						}
					]
				},
				{
					'index': 10,
					'formula': ':Without Margins',
					'outputs': [
						{
							'description': 'Supply Chain Emission Factors without Margins.',
							'index': 0,
							'key': 'impact:ghg_emissions:component:without_margins:value',
							'type': 'number'
						}
					]
				},
				{
					'index': 11,
					'formula': '\'pollutant\'',
					'outputs': [
						{
							'description': 'Supply Chain Emission Factors without Margins type.',
							'index': 0,
							'key': 'impact:ghg_emissions:component:without_margins:type',
							'type': 'string'
						}
					]
				},

				{
					'index': 12,
					'formula': '\'Margins\'',
					'outputs': [
						{
							'description': 'Margins of Supply Chain Emission Factors.',
							'index': 0,
							'key': 'impact:ghg_emissions:component:margins:key',
							'type': 'string'
						}
					]
				},
				{
					'index': 13,
					'formula': ':Margins',
					'outputs': [
						{
							'description': 'Margins of Supply Chain Emission Factors.',
							'index': 0,
							'key': 'impact:ghg_emissions:component:margins:value',
							'type': 'number'
						}
					]
				},
				{
					'index': 14,
					'formula': '\'pollutant\'',
					'outputs': [
						{
							'description': 'Margins of Supply Chain Emission Factors type.',
							'index': 0,
							'key': 'impact:ghg_emissions:component:margins:type',
							'type': 'string'
						}
					]
				},

				{
					'index': 15,
					'formula': '\'With Margins\'',
					'outputs': [
						{
							'description': 'Supply Chain Emission Factors with Margins.',
							'index': 0,
							'key': 'impact:ghg_emissions:component:with_margins:key',
							'type': 'string'
						}
					]
				},
				{
					'index': 16,
					'formula': ':With Margins',
					'outputs': [
						{
							'description': 'Supply Chain Emission Factors with Margins.',
							'index': 0,
							'key': 'impact:ghg_emissions:component:with_margins:value',
							'type': 'number'
						}
					]
				},
				{
					'index': 17,
					'formula': '\'pollutant\'',
					'outputs': [
						{
							'description': 'Supply Chain Emission Factors with Margins type.',
							'index': 0,
							'key': 'impact:ghg_emissions:component:with_margins:type',
							'type': 'string'
						}
					]
				}
			],
			'parameters': [
				{
					'index': 0,
					'key': 'NAICS Code 2017',
					'label': 'NAICS Code 2017',
					'type': 'string'
				},
				{
					'index': 1,
					'key': 'NAICS Title 2017',
					'label': 'NAICS Title 2017',
					'type': 'string'
				},
				{
					'index': 2,
					'key': 'GHG',
					'label': 'GHG',
					'type': 'string'
				},
				{
					'index': 3,
					'key': 'Unit',
					'label': 'Unit',
					'type': 'string'
				},
				{
					'index': 4,
					'key': 'Without Margins',
					'label': 'Supply Chain Emission Factors without Margins',
					'type': 'number'
				},
				{
					'index': 5,
					'key': 'Margins',
					'label': 'Margins of Supply Chain Emission Factors',
					'type': 'number'
				},
				{
					'index': 6,
					'key': 'With Margins',
					'label': 'Supply Chain Emission Factors with Margins',
					'type': 'number'
				},
				{
					'index': 7,
					'key': 'Reference USEEIO Code',
					'label': 'Reference USEEIO Code',
					'type': 'string'
				}
			]
		};

		validator.validateImpactPipelineTransformer(transformer);
	});

	it('impact pipeline transformer Component missing property', () => {
		const transformer: Transformer = {
			'transforms': [
				{
					'index': 0,
					'formula': 'CONCAT(\'useeio:supply_chain_naics_by_ghg:\', :NAICS Code 2017, \':\', :GHG)',
					'outputs': [
						{
							'description': 'Activity name.',
							'index': 0,
							'key': 'activity:name',
							'type': 'string'
						}
					]
				},
				{
					'index': 1,
					'formula': 'CONCAT(\'Supply Chain GHG EmissionFactors v1.2 NAICS by GHG USD 2021 for \', :NAICS Code 2017, \' (\', :GHG, \').\')',
					'outputs': [
						{
							'description': 'Activity description.',
							'index': 0,
							'key': 'activity:description',
							'type': 'string'
						}
					]
				},
				{
					'index': 2,
					'formula': '\'USEEIO\'',
					'outputs': [
						{
							'description': 'Activity provider tag.',
							'index': 0,
							'key': 'activity:tag:provider',
							'type': 'string'
						}
					]
				},
				{
					'index': 3,
					'formula': '\'SupplyChainGHGEmissionFactors_v1.2_NAICS_byGHG_USD2021\'',
					'outputs': [
						{
							'description': 'Activity dataset tag.',
							'index': 0,
							'key': 'activity:tag:dataset',
							'type': 'string'
						}
					]
				},
				{
					'index': 4,
					'formula': ':NAICS Code 2017',
					'outputs': [
						{
							'description': 'Activity NAICS Code 2017 tag.',
							'index': 0,
							'key': 'activity:tag:naics_code_2017',
							'type': 'string'
						}
					]
				},
				{
					'index': 5,
					'formula': ':NAICS Title 2017',
					'outputs': [
						{
							'description': 'Activity NAICS Title 2017 tag.',
							'index': 0,
							'key': 'activity:tag:naics_title_2017',
							'type': 'string'
						}
					]
				},
				{
					'index': 6,
					'formula': ':GHG',
					'outputs': [
						{
							'description': 'Activity GHG tag.',
							'index': 0,
							'key': 'activity:tag:ghg',
							'type': 'string'
						}
					]
				},

				{
					'index': 7,
					'formula': '\'GHG emission factors\'',
					'outputs': [
						{
							'description': 'GHG emission factors.',
							'index': 0,
							'key': 'impact:ghg_emissions:name',
							'type': 'string'
						}
					]
				},
				{
					'index': 8,
					'formula': ':Unit',
					'outputs': [
						{
							'description': 'Emission factor unit.',
							'index': 0,
							'key': 'impact:ghg_emissions:attribute:unit',
							'type': 'string'
						}
					]
				},

				{
					'index': 9,
					'formula': '\'Without Margins\'',
					'outputs': [
						{
							'description': 'Supply Chain Emission Factors without Margins.',
							'index': 0,
							'key': 'impact:ghg_emissions:component:without_margins:key',
							'type': 'string'
						}
					]
				},
				{
					'index': 10,
					'formula': ':Without Margins',
					'outputs': [
						{
							'description': 'Supply Chain Emission Factors without Margins.',
							'index': 0,
							'key': 'impact:ghg_emissions:component:without_margins:value',
							'type': 'number'
						}
					]
				},
				{
					'index': 11,
					'formula': '\'pollutant\'',
					'outputs': [
						{
							'description': 'Supply Chain Emission Factors without Margins type.',
							'index': 0,
							'key': 'impact:ghg_emissions:component:without_margins:type',
							'type': 'string'
						}
					]
				},

				{
					'index': 12,
					'formula': '\'Margins\'',
					'outputs': [
						{
							'description': 'Margins of Supply Chain Emission Factors.',
							'index': 0,
							'key': 'impact:ghg_emissions:component:margins:key',
							'type': 'string'
						}
					]
				},
				{
					'index': 13,
					'formula': ':Margins',
					'outputs': [
						{
							'description': 'Margins of Supply Chain Emission Factors.',
							'index': 0,
							'key': 'impact:ghg_emissions:component:margins:value',
							'type': 'number'
						}
					]
				},
				{
					'index': 14,
					'formula': '\'pollutant\'',
					'outputs': [
						{
							'description': 'Margins of Supply Chain Emission Factors type.',
							'index': 0,
							'key': 'impact:ghg_emissions:component:margins:type',
							'type': 'string'
						}
					]
				},

				{
					'index': 15,
					'formula': '\'With Margins\'',
					'outputs': [
						{
							'description': 'Supply Chain Emission Factors with Margins.',
							'index': 0,
							'key': 'impact:ghg_emissions:component:with_margins:key',
							'type': 'string'
						}
					]
				},
				{
					'index': 16,
					'formula': ':With Margins',
					'outputs': [
						{
							'description': 'Supply Chain Emission Factors with Margins.',
							'index': 0,
							'key': 'impact:ghg_emissions:component:with_margins:value',
							'type': 'number'
						}
					]
				}

			],
			'parameters': [
				{
					'index': 0,
					'key': 'NAICS Code 2017',
					'label': 'NAICS Code 2017',
					'type': 'string'
				},
				{
					'index': 1,
					'key': 'NAICS Title 2017',
					'label': 'NAICS Title 2017',
					'type': 'string'
				},
				{
					'index': 2,
					'key': 'GHG',
					'label': 'GHG',
					'type': 'string'
				},
				{
					'index': 3,
					'key': 'Unit',
					'label': 'Unit',
					'type': 'string'
				},
				{
					'index': 4,
					'key': 'Without Margins',
					'label': 'Supply Chain Emission Factors without Margins',
					'type': 'number'
				},
				{
					'index': 5,
					'key': 'Margins',
					'label': 'Margins of Supply Chain Emission Factors',
					'type': 'number'
				},
				{
					'index': 6,
					'key': 'With Margins',
					'label': 'Supply Chain Emission Factors with Margins',
					'type': 'number'
				},
				{
					'index': 7,
					'key': 'Reference USEEIO Code',
					'label': 'Reference USEEIO Code',
					'type': 'string'
				}
			]
		};

		expect( ()=> validator.validateImpactPipelineTransformer(transformer)).toThrow(new Error(`Missing mandatory output column for component 'with_margins' under impact 'ghg_emissions' . The output keys should be 'impact:<impact name>:component:<component name>:key', 'impact:<impact name>:component:<component name>:type', 'impact:<impact name>:component:<component name>:value'`));
	});

	it('impact pipeline transformer missing components', () => {
		const transformer: Transformer = {
			'transforms': [
				{
					'index': 0,
					'formula': 'CONCAT(\'useeio:supply_chain_naics_by_ghg:\', :NAICS Code 2017, \':\', :GHG)',
					'outputs': [
						{
							'description': 'Activity name.',
							'index': 0,
							'key': 'activity:name',
							'type': 'string'
						}
					]
				},
				{
					'index': 1,
					'formula': 'CONCAT(\'Supply Chain GHG EmissionFactors v1.2 NAICS by GHG USD 2021 for \', :NAICS Code 2017, \' (\', :GHG, \').\')',
					'outputs': [
						{
							'description': 'Activity description.',
							'index': 0,
							'key': 'activity:description',
							'type': 'string'
						}
					]
				},
				{
					'index': 2,
					'formula': '\'USEEIO\'',
					'outputs': [
						{
							'description': 'Activity provider tag.',
							'index': 0,
							'key': 'activity:tag:provider',
							'type': 'string'
						}
					]
				},
				{
					'index': 3,
					'formula': '\'SupplyChainGHGEmissionFactors_v1.2_NAICS_byGHG_USD2021\'',
					'outputs': [
						{
							'description': 'Activity dataset tag.',
							'index': 0,
							'key': 'activity:tag:dataset',
							'type': 'string'
						}
					]
				},
				{
					'index': 4,
					'formula': ':NAICS Code 2017',
					'outputs': [
						{
							'description': 'Activity NAICS Code 2017 tag.',
							'index': 0,
							'key': 'activity:tag:naics_code_2017',
							'type': 'string'
						}
					]
				},
				{
					'index': 5,
					'formula': ':NAICS Title 2017',
					'outputs': [
						{
							'description': 'Activity NAICS Title 2017 tag.',
							'index': 0,
							'key': 'activity:tag:naics_title_2017',
							'type': 'string'
						}
					]
				},
				{
					'index': 6,
					'formula': ':GHG',
					'outputs': [
						{
							'description': 'Activity GHG tag.',
							'index': 0,
							'key': 'activity:tag:ghg',
							'type': 'string'
						}
					]
				},

				{
					'index': 7,
					'formula': '\'GHG emission factors\'',
					'outputs': [
						{
							'description': 'GHG emission factors.',
							'index': 0,
							'key': 'impact:ghg_emissions:name',
							'type': 'string'
						}
					]
				},
				{
					'index': 8,
					'formula': ':Unit',
					'outputs': [
						{
							'description': 'Emission factor unit.',
							'index': 0,
							'key': 'impact:ghg_emissions:attribute:unit',
							'type': 'string'
						}
					]
				},
			],
			'parameters': [
				{
					'index': 0,
					'key': 'NAICS Code 2017',
					'label': 'NAICS Code 2017',
					'type': 'string'
				},
				{
					'index': 1,
					'key': 'NAICS Title 2017',
					'label': 'NAICS Title 2017',
					'type': 'string'
				},
				{
					'index': 2,
					'key': 'GHG',
					'label': 'GHG',
					'type': 'string'
				},
				{
					'index': 3,
					'key': 'Unit',
					'label': 'Unit',
					'type': 'string'
				},
				{
					'index': 4,
					'key': 'Without Margins',
					'label': 'Supply Chain Emission Factors without Margins',
					'type': 'number'
				},
				{
					'index': 5,
					'key': 'Margins',
					'label': 'Margins of Supply Chain Emission Factors',
					'type': 'number'
				},
				{
					'index': 6,
					'key': 'With Margins',
					'label': 'Supply Chain Emission Factors with Margins',
					'type': 'number'
				},
				{
					'index': 7,
					'key': 'Reference USEEIO Code',
					'label': 'Reference USEEIO Code',
					'type': 'string'
				}
			]
		};

		expect(() => validator.validateImpactPipelineTransformer(transformer)).toThrow(new Error(`Missing mandatory output column for components. You have to specify at least one component per impacts. The output keys should be 'impact:<impact name>:component:<component name>:key', 'impact:<impact name>:component:<component name>:type', 'impact:<impact name>:component:<component name>:value'`));
	});


	it('impact pipeline transformer Missing impacts', () => {
		const transformer: Transformer = {
			'transforms': [
				{
					'index': 0,
					'formula': 'CONCAT(\'useeio:supply_chain_naics_by_ghg:\', :NAICS Code 2017, \':\', :GHG)',
					'outputs': [
						{
							'description': 'Activity name.',
							'index': 0,
							'key': 'activity:name',
							'type': 'string'
						}
					]
				},
				{
					'index': 1,
					'formula': 'CONCAT(\'Supply Chain GHG EmissionFactors v1.2 NAICS by GHG USD 2021 for \', :NAICS Code 2017, \' (\', :GHG, \').\')',
					'outputs': [
						{
							'description': 'Activity description.',
							'index': 0,
							'key': 'activity:description',
							'type': 'string'
						}
					]
				},
				{
					'index': 2,
					'formula': '\'USEEIO\'',
					'outputs': [
						{
							'description': 'Activity provider tag.',
							'index': 0,
							'key': 'activity:tag:provider',
							'type': 'string'
						}
					]
				},
				{
					'index': 3,
					'formula': '\'SupplyChainGHGEmissionFactors_v1.2_NAICS_byGHG_USD2021\'',
					'outputs': [
						{
							'description': 'Activity dataset tag.',
							'index': 0,
							'key': 'activity:tag:dataset',
							'type': 'string'
						}
					]
				},
				{
					'index': 4,
					'formula': ':NAICS Code 2017',
					'outputs': [
						{
							'description': 'Activity NAICS Code 2017 tag.',
							'index': 0,
							'key': 'activity:tag:naics_code_2017',
							'type': 'string'
						}
					]
				},
				{
					'index': 5,
					'formula': ':NAICS Title 2017',
					'outputs': [
						{
							'description': 'Activity NAICS Title 2017 tag.',
							'index': 0,
							'key': 'activity:tag:naics_title_2017',
							'type': 'string'
						}
					]
				},
				{
					'index': 6,
					'formula': ':GHG',
					'outputs': [
						{
							'description': 'Activity GHG tag.',
							'index': 0,
							'key': 'activity:tag:ghg',
							'type': 'string'
						}
					]
				},

			],
			'parameters': [
				{
					'index': 0,
					'key': 'NAICS Code 2017',
					'label': 'NAICS Code 2017',
					'type': 'string'
				},
				{
					'index': 1,
					'key': 'NAICS Title 2017',
					'label': 'NAICS Title 2017',
					'type': 'string'
				},
				{
					'index': 2,
					'key': 'GHG',
					'label': 'GHG',
					'type': 'string'
				},
				{
					'index': 3,
					'key': 'Unit',
					'label': 'Unit',
					'type': 'string'
				},
				{
					'index': 4,
					'key': 'Without Margins',
					'label': 'Supply Chain Emission Factors without Margins',
					'type': 'number'
				},
				{
					'index': 5,
					'key': 'Margins',
					'label': 'Margins of Supply Chain Emission Factors',
					'type': 'number'
				},
				{
					'index': 6,
					'key': 'With Margins',
					'label': 'Supply Chain Emission Factors with Margins',
					'type': 'number'
				},
				{
					'index': 7,
					'key': 'Reference USEEIO Code',
					'label': 'Reference USEEIO Code',
					'type': 'string'
				}
			]
		};

		expect(() => validator.validateImpactPipelineTransformer(transformer)).toThrow(new Error(`Missing mandatory output columns. There are no impact columns specified. You have to specify at least the column 'impacts:<impact name>:name'.`));
	});

	it('activities pipeline transformer Happy path', () => {
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

		validator.validateActivitiesPipelineTransformer(transformer);
	});

	// transformer object has no parameters
	it('activities pipeline should throw an error if no parameters are specified', () => {
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
			validator.validateActivitiesPipelineTransformer(transformer);
		}).toThrow('');
	});

	// transformer object has no transforms
	it('activities pipeline should throw an error if no transforms are specified', () => {
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
			validator.validateActivitiesPipelineTransformer(transformer);
		}).toThrow('The position of the transforms (their `index`) must begin from 0.');
	});

	// transforms index doesn't start with 0
	it('activities pipeline should throw an error if transforms sequenced index doesn\'t start from 0 i.e. 3,4,5', () => {
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
			validator.validateActivitiesPipelineTransformer(transformer);
		}).toThrow('The order of the transforms (their \'index\') must not be skipping or missing a position.');
	});

	// transform index skips a number in the sequence
	it('activities pipeline should throw an error if transforms sequence skips an index i.e. 0,1,3', () => {
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
			validator.validateActivitiesPipelineTransformer(transformer);
		}).toThrow('The order of the transforms (their \'index\') must not be skipping or missing a position.');
	});

	// transforms doesnt have output defined
	it('activities pipeline should throw an error if any transform doesn\'t have output defined', () => {
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
			validator.validateActivitiesPipelineTransformer(transformer);
		}).toThrow('Transform must have an output defined.');
	});

	// transforms have more than 1 output
	it('activities pipeline should throw an error if there are more then one outputs defined for any transform', () => {
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
			validator.validateActivitiesPipelineTransformer(transformer);
		}).toThrow('Only 1 output per transform is supported.');
	});

	it('activities pipeline transformer defines more than 5 key values', () => {
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
			validator.validateActivitiesPipelineTransformer(transformer);
		}).toThrow('Only up to 5 outputs (other than timestamp) can be defined as keys. 6 are defined as keys.');
	});

	it('activities pipeline should throw an error if the transform output keys are not unique', () => {
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
			validator.validateActivitiesPipelineTransformer(transformer);
		}).toThrow('Transform output key needs to be unique.');
	});

	it('activities pipeline should throw an error if all transforms are marked as unique', () => {
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
			validator.validateActivitiesPipelineTransformer(transformer);
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
	])('activities pipeline configuring type %s with aggregation function %s should throws exception', (type: any, aggregate: any) => {

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
			validator.validateActivitiesPipelineTransformer(transformerToTest);
		}).toThrow('Only fields with number type can be aggregated using aggregation functions other than groupBy.');
	});

	it('activities pipeline should throw an error if more than one timestamp fields are being aggregated', () => {
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
			validator.validateActivitiesPipelineTransformer(transformer);
		}).toThrow('Only 1 timestamp field can be aggregated, the field will be used as date field for the aggregated output.');

	});

	it('activities pipeline should throw an error if more than one transform tries to use ASSIGN_TO_GROUP', () => {
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
			validator.validateActivitiesPipelineTransformer(transformer);
		}).toThrow('Only 1 transform can use the ASSIGN_TO_GROUP() function.');
	});

	// data pipeline first transform doesnt need to be timestamp
	it('should validate a data type pipeline which doesnt require the first column to be timestamp', () => {
		const transformer: Transformer = {
			'transforms':
				[
					{
						'index': 0,
						'formula': ':product',
						'outputs':
							[
								{
									'index': 0,
									'key': 'product',
									'type': 'string'
								}
							]
					},
					{
						'index': 1,
						'formula': '1',
						'outputs':
							[
								{
									'index': 0,
									'key': 'chosen_result',
									'type': 'string'
								}
							]
					},
					{
						'index': 2,
						'formula': 'GETVALUE(CAML(:product),\'[0].naicsCode.2012\')',
						'outputs':
							[
								{
									'index': 0,
									'key': 'naicsCode_1',
									'type': 'number'
								}
							]
					},
					{
						'index': 3,
						'formula': 'GETVALUE(CAML(:product),\'[0].bea_code\')',
						'outputs':
							[
								{
									'index': 0,
									'key': 'beaCode_1',
									'type': 'string'
								}
							]
					},
					{
						'index': 4,
						'formula': 'GETVALUE(CAML(:product),\'[0].Title\')',
						'outputs':
							[
								{
									'index': 0,
									'key': 'title_1',
									'type': 'string'
								}
							]
					},
					{
						'index': 5,
						'formula': 'GETVALUE(CAML(:product),\'[0].eio_co2\')',
						'outputs':
							[
								{
									'index': 0,
									'key': 'co2ePerDollar_1',
									'type': 'number'
								}
							]
					},
					{
						'index': 6,
						'formula': 'GETVALUE(CAML(:product),\'[0].cosine_score\')',
						'outputs':
							[
								{
									'index': 0,
									'key': 'confidence_1',
									'type': 'number'
								}
							]
					}
				],
			'parameters':
				[
					{
						'index': 0,
						'key': ':product',
						'type': 'string'
					}
				]
		};
		validator.validateDataPipelineTransformer(transformer);
	});

	// data pipeline if there is an aggregation or metric configuration we get an error
	it('should throw an error if the pipeline type is data and metric or aggregation has been configured on it', () => {
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
							includeAsUnique: true,
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
							metrics: [
								'int:ghg:scope1:mobile'
							]
						},
					],
				},
			],
			parameters: [
				{
					index: 0,
					key: 'one',
					type: 'number',
				},
				{
					index: 1,
					key: 'two',
					type: 'number'
				}
			]
		};

		expect(() => {
			validator.validateDataPipelineTransformer(transformer);
		}).toThrow('Metrics and Aggregations are not supported for pipeline types: data and impacts');
	});

	// impact pipeline throws an error if all mandatory transforms arent defined
	it('should throw an error if the pipeline type is impact and metric or aggregation has been configured on it', () => {
		const transformer: Transformer = {
			'transforms':
				[
					{
						'index': 0,
						'formula': 'CONCAT(\'eiolca\',:product)',
						'outputs':
							[
								{
									'index': 0,
									'key': 'activityName',
									'type': 'string',
									metrics: [
										'somemetric'
									]
								}
							]
					},
					{
						'index': 1,
						'formula': '\'ghg_emissions\'',
						'outputs':
							[
								{
									'index': 0,
									'key': 'impactName',
									'type': 'string'
								}
							]
					},
					{
						'index': 2,
						'formula': '\'co2e\'',
						'outputs':
							[
								{
									'index': 0,
									'key': 'componentKey',
									'type': 'string'
								}
							]
					},
					{
						'index': 3,
						'formula': 'SWITCH(:chosen_value,1,:co2ePerDollar_1,2,co2ePerDollar_2,3,co2ePerDollar_3,4,co2ePerDollar_4,5,co2ePerDollar_5)',
						'outputs':
							[
								{
									'index': 0,
									'key': 'componentValue',
									'type': 'number'
								}
							]
					},
					{
						'index': 4,
						'formula': '\'pollutant\'',
						'outputs':
							[
								{
									'index': 0,
									'key': 'componentType',
									'type': 'string'
								}
							]
					},
				],
			'parameters':
				[
					{
						'index': 0,
						'key': 'product',
						'type': 'string'
					},
					{
						'index': 0,
						'key': 'chosen_value',
						'type': 'number'
					},
					{
						'index': 0,
						'key': 'co2ePerDollar_1',
						'type': 'number'
					},
					{
						'index': 0,
						'key': 'co2ePerDollar_2',
						'type': 'number'
					},
					{
						'index': 0,
						'key': 'co2ePerDollar_3',
						'type': 'number'
					},
					{
						'index': 0,
						'key': 'co2ePerDollar_4',
						'type': 'number'
					},
					{
						'index': 0,
						'key': 'co2ePerDollar_5',
						'type': 'number'
					}
				]
		};

		expect(() => {
			validator.validateImpactPipelineTransformer(transformer);
		}).toThrow('Metrics and Aggregations are not supported for pipeline types: data and impacts');
	});

	it('activities pipeline should throw an error if no number fields are being aggregated', () => {
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
							type: 'timestamp'
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
			validator.validateActivitiesPipelineTransformer(transformer);
		}).toThrow('There should be at least 1 number field that is being aggregated using aggregation functions.');

	});

});
