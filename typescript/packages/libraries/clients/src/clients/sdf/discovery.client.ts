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
import axios from 'axios';
import type { Authenticator } from './authenticator.js';
import type { AssetMetadataResource } from './discovery.model.js';

export class DiscoveryClient {

	constructor(private readonly log: BaseLogger, private readonly discoveryUrl: string, private readonly authenticator: Authenticator) {
	}

	public async getAssetDetail(domainId: string, assetListingId: string): Promise<AssetMetadataResource> {
		this.log.info(`DiscoveryClient > getAssetDetail > in > domainId: ${domainId}, assetListingId: ${assetListingId}`);

		const authToken = await this.authenticator.getAuthenticationResult();

		const response = await axios.get(`${this.discoveryUrl}/domains/${domainId}/assets/${assetListingId}`, {
			headers: {
				'Accept-Version': '1.0.0',
				'Content-Type': 'application/json',
				Authorization: `Bearer ${authToken}`
			},
		});

		this.log.info(`DiscoveryClient > getAssetDetail > exit > response: ${JSON.parse(response.data)}`);

		return response.data as AssetMetadataResource;
	}

}
