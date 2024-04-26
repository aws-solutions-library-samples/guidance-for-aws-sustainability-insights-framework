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

import type { BaseLogger } from 'pino';
import type { CredentialsResource } from './accessManagement.model.js';
import axios from 'axios';
import type { Authenticator } from './authenticator.js';

export class AccessManagementClient {

	constructor(private readonly log: BaseLogger, private readonly accessManagementUrl: string, private authenticator: Authenticator) {
	}

	public async createCredentials(domainId: string, projectId: string, assetListingId: string): Promise<CredentialsResource> {
		this.log.info(`AccessManagementClient > createCredentials > in > domainId: ${domainId}, projectId: ${projectId}, assetListingId: ${assetListingId}`);

		const authToken = await this.authenticator.getAuthenticationResult();

		const response = await axios.post(`${this.accessManagementUrl}/domains/${domainId}/projects/${projectId}/assets/${assetListingId}credentials`, {}, {
			headers: {
				'Accept-Version': '1.0.0',
				'Content-Type': 'application/json',
				Authorization: `Bearer ${authToken}`
			},
		});

		this.log.info(`AccessManagementClient > createCredentials > exit`);
		return response.data as CredentialsResource;
	}

}
