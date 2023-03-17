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

import type { Impact, ImpactMap, NewImpact } from './schemas.js';

export const createImpactRequestExample: NewImpact = {
	name: 'CO2e',
	attributes: {
		unit: 'kg',
	},
	// components of the impacts i.e. pollutant, impact method
	components: {
		co2: {
			// key is the unique part
			key: 'co2',
			value: 5.304733389,
			type: 'pollutant',
			description: '',
			label: '',
		},
		ch4: {
			key: 'ch4',
			value: 0.002799332,
			type: 'pollutant',
			description: '',
			label: '',
		},
		n2o: {
			key: 'n2o',
			value: 0.002649367,
			type: 'pollutant',
			description: '',
			label: '',
		},
		'ipcc 2013 ar5 gwp 100': {
			key: 'IPCC 2013 AR5 GWP 100',
			value: 5.310182088,
			type: 'impactFactor',
			description: '',
			label: '',
		},
		'ipcc 2016 ar4 gwp 100': {
			key: 'IPCC 2016 AR4 GWP 100',
			value: 4.310182088,
			type: 'impactFactor',
			description: '',
			label: '',
		},
	},
};

export const impactResponseExample: Impact = {
	name: 'CO2E',
	...createImpactRequestExample,
};

export const listImpactExample: ImpactMap = {
	co2e: impactResponseExample,
	watershed: {
		name: 'watershed',
		attributes: {
			unit: 'kg',
		},
		components: {
			co2: {
				// key is unique part
				key: 'co2',
				value: 5.304733389,
				type: 'pollutant',
				description: '',
				label: '',
			},
			ch4: {
				key: 'ch4',
				value: 0.002799332,
				type: 'pollutant',
				description: '',
				label: '',
			},
			n2o: {
				key: 'n2o',
				value: 0.002649367,
				type: 'pollutant',
				description: '',
				label: '',
			},
			'ipcc 2013 ar5 gwp 100': {
				key: 'IPCC 2013 AR5 GWP 100',
				value: 5.310182088,
				type: 'impactFactor',
				description: '',
				label: '',
			},
			'ipcc 2016 ar4 gwp 100': {
				key: 'IPCC 2016 AR4 GWP 100',
				value: 4.310182088,
				type: 'impactFactor',
				description: '',
				label: '',
			},
		},
	},
};
