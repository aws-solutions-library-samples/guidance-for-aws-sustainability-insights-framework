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

import { Before } from '@cucumber/cucumber';
import { createApi } from './util';

Before({ tags: '@setup_referenceDatasets' }, async function () {
	global.forceCognitoUsage = true;
	const baseUrl = process.env.REFERENCE_DATASETS_BASE_URL as string;

	if (!baseUrl) {
		throw new Error('ENV VAR: REFERENCE_DATASETS_BASE_URL not defined');
	}

	this['apickli'] = await createApi(process.env.NODE_ENV as string, baseUrl, {});
});
