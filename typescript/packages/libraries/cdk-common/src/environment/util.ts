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

import { STS } from '@aws-sdk/client-sts';

export interface SifAwsEnvironment {
	accountId?: string;
	region?: string;
}

const getSifAwsEnvironment = async (): Promise<SifAwsEnvironment> => {
	const sts = new STS({});
	
	let accountId, region;
	try {
		const callerIdentity = await sts.getCallerIdentity({});
		accountId = callerIdentity.Account;
		region = await sts.config.region();
	} catch (Exception) {
		console.log(`Could not retrieve caller identity when fetching environment`);
	}

	return {
		accountId, region
	};
};

export {
	getSifAwsEnvironment
};
