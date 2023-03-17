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
import { createApi } from './util.js';

Before({ tags: '@setup_accessManagement' }, async function () {
	/**
	 * 	TODO: Ideally we should create the required users using the access management module, then use them here
	 * 	Currently it will use the admin user which is created at the time of deployment. That user should be confirmed before
	 * 	running the tests. This probably needs changing and users should really be created here using the access management module
	 * 	and then referenced in the scenarios. The created user would require to go through the cognito change password flow and
	 * 	storing the password in SSM or may be changing the password everytime the test runs.
	 */

	// for access management tests we always want to make sure we creating users via cognito
	global.forceCognitoUsage = true;

	const baseUrl = process.env.ACCESS_MANAGEMENT_BASE_URL as string;

	if (!baseUrl) {
		throw new Error('ENV VAR: ACCESS_MANAGEMENT_BASE_URL not defined');
	}

	this['apickli'] = await createApi(process.env.NODE_ENV as string, baseUrl, {});
});
