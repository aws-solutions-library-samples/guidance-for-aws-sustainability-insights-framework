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

import type { Calculation, NewCalculation, CalculationsList, EditCalculation, CalculationVersionsList } from './schemas.js';

export const calculationPostRequestExample: NewCalculation = {
	name: 'vehicle_emissions',
	summary: 'Calculates vehicle CO2eq emissions using the GHG Protocol.',
	description:
		"If the no. of passengers is provided, the CO2 emissions are calculated by looking up the requested pollutant for the provided 'vehicle_type' from the 'passenger_vehicles' emission factor data and multiplied by the provided distance and passengers. If not, the CO2 emissions are calculated by looking up the requested pollutant for the provided 'vehicle_type' from the 'vehicles' emission factor data and multiplied by the provided distance.",
	formula: "IF(COALESCE(:passengers,0)>0,EMISSION_FACTOR('passenger_vehicles',:vehicleType,:pollutant)*:distance*:passengers,EMISSION_FACTOR('vehicles',:vehicleType,:pollutant)*:distance)",
	parameters: [
		{
			index: 0,
			key: 'vehicleType',
			label: 'Vehicle Type',
			description: 'Type of vehicle',
			type: 'string',
		},
		{
			index: 1,
			key: 'pollutant',
			label: 'CO2eq pollutant',
			description: 'The CO2eq pollutant to lookup from the emission factor',
			type: 'string',
		},
		{
			index: 2,
			key: 'distance',
			label: 'Distance (Miles)',
			description: 'Distance (in miles)',
			type: 'number',
		},
		{
			index: 3,
			key: 'passengers',
			label: 'Passengers',
			description: 'No. of passengers',
			type: 'number',
		},
	],
	outputs: [
		{
			name: 'result',
			description: 'The calculated CO2eq pollutant.',
			type: 'number',
		},
	],
	tags: {
		datasource: 'GHG Protocol',
		type: 'material/metal/steel',
	},
};

export const calculationDryRunRequestExample = {
	...calculationPostRequestExample,
	dryRunOptions: {
		data: ['10,10'],
	},
};

export const calculationDryRunResponseExample = {
	csvData: ['100'],
	csvHeaders: ['sum'],
};

export const calculationPatchRequestExample1: EditCalculation = calculationPostRequestExample;

export const calculationPatchRequestExample2: EditCalculation = {
	tags: {
		datasource: 'GHG Protocol',
		type: 'material/metal/iron',
	},
};

/**
 * Example after initial creation
 */
export const calculationResourceExample1: Calculation = {
	id: '03d66e78d',
	...calculationPostRequestExample,
	version: 1,
	groups: ['/usa/northwest'],
	state: 'enabled',
	createdAt: '2022-08-10T23:55:20.322Z',
	createdBy: 'someone@somewhere.com',
};

/**
 * Example after an update
 */
export const calculationResourceExample2: Calculation = {
	...calculationResourceExample1,
	version: 2,
	updatedAt: '2022-08-12T07:34:23.132Z',
	updatedBy: 'someoneelse@somewhere.com',
};

export const calculationListResource: CalculationsList = {
	calculations: [calculationResourceExample1],
	pagination: {
		lastEvaluatedToken: calculationResourceExample1.id,
	},
};

export const calculationVersionListResource: CalculationVersionsList = {
	calculations: [calculationResourceExample1, calculationResourceExample2],
	pagination: {
		lastEvaluatedVersion: calculationResourceExample2.version,
	},
};
