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
import axios from 'axios';
import assert from 'assert';
import fs from 'fs';

Then(/^content of signed url (.*) should match file (.*)$/, async function (signedUrl: string, filePath: string) {
	signedUrl = this['apickli'].replaceVariables(signedUrl);
	const referenceDatasetContent = await axios.get(signedUrl);
	const localFileContent = fs.readFileSync(filePath).toString();
	assert.equal(referenceDatasetContent.data, localFileContent);
});

Then(/^response body should match file (.*)$/, async function (filePath: string) {
	const localFileContent = fs.readFileSync(filePath).toString();
	assert.equal(this['apickli'].getResponseObject().body, localFileContent);
});
