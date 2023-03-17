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

import { When, Given, Then, DataTable } from '@cucumber/cucumber';
import { getAuthToken } from '../support/util';
import axios from 'axios';
import FormData from 'form-data';
import assert from 'assert';

Then(
	/^groups response stored in global variable (.*) should contain group (.*) with name (.*) created by (.*)$/,
	async function (groupVariable: string, group: string, groupName: string, createdBy: string) {
		const groups = this['apickli'].getGlobalVariable(groupVariable);

		const e2eGroups = groups.filter((g: any) => {
			return g.id === group;
		});

		assert(e2eGroups[0].id, group);
		assert(e2eGroups[0].name, groupName);
		assert(e2eGroups[0].createdBy, createdBy);
	}
);

Given(
	/^I create a reference dataset in group context (.*) with name (.*) tags (.*) and rows$/,
	async function (groupContext: string, datasetName: string, tags: string, table: DataTable) {
		const { REFERENCE_DATASETS_BASE_URL } = process.env;

		let csvString: string = '';
		table.raw().forEach((r) => {
			csvString += `${r.join(',')}\r\n`;
		});

		const token = await getAuthToken('e2e_tests_admin@amazon.com','p@ssword1');

		const blob = Buffer.from(csvString);
		// append the correct file to formData

		const formData = new FormData();
		formData.append('description', 'Zipcode to State mapping');
		formData.append('datasetHeaders', JSON.stringify(table.raw()[0]), { contentType: 'application/json' });
		formData.append('name', `${datasetName}`);
		formData.append('tags', tags, { contentType: 'application/json' });
		formData.append('data', blob, { contentType: 'text/csv' });

		try {
			const response = await axios.post(`${REFERENCE_DATASETS_BASE_URL}referenceDatasets` as string, formData, {
				headers: {
					'Accept-Version': '1.0.0',
					'Content-Type': 'multipart/form-data',
					Authorization: `Bearer ${token}`,
					'x-groupcontextid': groupContext,
				},
			});
			assert.equal(response.status, 201);
		} catch (e) {
			throw new Error('Failed creating reference dataset');
		}
	}
);
