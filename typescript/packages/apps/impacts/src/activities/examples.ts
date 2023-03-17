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

import type { Activity, ActivityList, ActivityVersionsList, NewActivity } from './schemas.js';

export const createActivityRequestBodyExample: NewActivity = {
	name: 'emissions:something:Air',
	description: 'excludes carbon sequestration',
	// additional metadata related attributes
	attributes: {
		ref_unit: 'therm'
	},
	tags: {
		level1Hierarchy: 'emissions',
		source: 'emissions',
	},
	// impacts associated with activity second level grouping i.e. type of activity
	impacts: {
		co2e: {
			name: 'CO2e',
			attributes: {
				unit: 'kg',
			},
			// components of the factor i.e. pollutant, activity method
			components: {
				co2: {
					// key is unqiue part
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
	},
};

export const activityResourceExample: Activity = {
	id: 'some-id',
	version: 1,
	state: 'enabled',
	groups: ['/account1'],
	createdAt: '2022-08-17T16:02:54',
	createdBy: 'someone@somewhere',
	...createActivityRequestBodyExample,
};

export const activityVersionResourceExample: Activity = {
	...activityResourceExample,
	version: 2,
	updatedAt: '2022-08-17T16:02:54',
	updatedBy: 'someone@somewhere',
};

export const activitiesListExample: ActivityList = {
	activities: [
		activityResourceExample,
		{
			id: 'some-id2',
			name: 'air',
			description: 'excludes carbon sequestration',
			version: 3,
			state: 'enabled',
			groups: ['/admin'],
			createdAt: '2022-08-17T16:02:54',
			createdBy: 'someone@somewhere',
			updatedAt: '2022-08-17T16:02:54',
			attributes: {
				referenceUnits: 'therms',
			},
			tags: {
				level1Hierarchy: 'emissions',
				source: 'emissions',
			},
			// impacts associated with activity second level grouping i.e. type of impact
			impacts: {
				co2e: {
					name: 'CO2e',
					attributes: {
						unit: 'kg',
					},

					// components of the factor i.e. pollutant, impact method
					components: {
						co2: {
							// key is unqiue part
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
			},
		},
	],
	pagination: {
		count: 2,
		lastEvaluatedToken: 'xxxxx',
	},
};

export const activitiesListVersionsExample: ActivityVersionsList = {
	activities: [activityResourceExample, activityVersionResourceExample],
	pagination: {
		lastEvaluatedVersion: 2,
	},
};
