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


export interface NewActivity {
	name: string;
	description: string;
	attributes: { [key: string]: string };
	tags: { [key: string]: string };
	impacts: { [key: string]: ImpactResource };
}

export interface ImpactResource {
	name: string;
	attributes: { [key: string]: any };
	components: { [key: string]: ComponentResource };
}

export interface ComponentResource {
	key: string;
	value: number;
	type: string;
	description: string;
	label: string;
}

export type Activity = NewActivity & { id: string }

export type ActivityList = { activities: Activity[] }
