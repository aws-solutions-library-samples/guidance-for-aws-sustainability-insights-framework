#!/usr/bin/env node
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
import { authorizeUser, getUrl } from './util';

if (require.main === module) {
	const [tenantId, environment, username, password, newPassword] = process.argv.slice(2);

	if (process.argv.length < 4) {
		throw new Error('Missing arguments\r\nHow to run the command: \r\n> npm run generate:token -- <tenantId> <environment> <username> <password> ');
	}
	(async () => {
		global.jwts = {};
		process.env.COGNITO_CLIENT_ID = (await getUrl(`/sif/${tenantId}/${environment}/shared/userPoolClientId`, '')).value;
		process.env.COGNITO_USER_POOL_ID = (await getUrl(`/sif/${tenantId}/${environment}/shared/userPoolId`, '')).value;
		const token = await authorizeUser(username, password, newPassword);
		console.log(`token: ${token}`);
	})().catch((e) => console.log(e));
}
