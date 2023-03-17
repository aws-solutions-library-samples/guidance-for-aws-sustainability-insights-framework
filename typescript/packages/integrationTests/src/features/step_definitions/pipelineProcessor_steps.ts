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

import { Then } from '@cucumber/cucumber';
import assert from 'assert';

Then(/^the latest execution status should be (.*)$/, async function (status: string) {
	const latestResponseBody = JSON.parse(this['apickli'].getResponseObject().body);

	const sortedExecutions = latestResponseBody.executions.sort((e1: any, e2: any) => {
		return Date.parse(e2.createdAt) - Date.parse(e1.createdAt);
	});

	assert(sortedExecutions[0].status, status);
});

Then(/^I store the id of the latest execution in variable (.*) in global scope$/, async function (executionIdVariable: string) {
	const latestResponseBody = JSON.parse(this['apickli'].getResponseObject().body);

	const sortedExecutions = latestResponseBody.executions.sort((e1: any, e2: any) => {
		return Date.parse(e2.createdAt) - Date.parse(e1.createdAt);
	});

	this['apickli'].setGlobalVariable(executionIdVariable, sortedExecutions[0].id);
});
