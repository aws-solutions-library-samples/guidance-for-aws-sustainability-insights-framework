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

import { AssumeRoleCommand, STSClient } from '@aws-sdk/client-sts';
import { AssetListing, DataZoneClient, GetEnvironmentCommand, GetListingCommand, GetListingOutput, GetSubscriptionTargetCommand, ListSubscriptionGrantsCommand } from '@aws-sdk/client-datazone';
import type { AwsCredentialIdentity } from '@aws-sdk/types';
import { HttpRequest } from '@aws-sdk/protocol-http';
import { SignatureV4 } from '@aws-sdk/signature-v4';
import { Sha256 } from '@aws-crypto/sha256-js';
import type { BaseLogger } from 'pino';
import { captureAWSv3Client } from 'aws-xray-sdk';
import type { GlueAssetDetail } from '../services/import/glueImportService';
import type { RedshiftAssetDetail } from '../services/import/redshiftImportService';

export type Asset = {
	domainId: string,
	assetListingId: string,
	environmentId: string
}

export interface GetEnvironmentCredentialsCommandInput {
	domainIdentifier: string;
	environmentIdentifier: string;
	region: string;
}

export type AssetDetail = GlueAssetDetail | RedshiftAssetDetail;

export type AssetType = 'Glue' | 'Redshift';

export class DataFabricHelper {
	constructor(private readonly log: BaseLogger,
				private readonly region: string,
				private readonly stsClient: STSClient,
				private readonly dfSustainabilityRoleArn: string) {
	}


	public async getAssetMetadata(assetListingId: string, domainId: string): Promise<[AssetType, AssetDetail]> {
		this.log.debug(`DataFabricHelper> getAssetMetadata> in> assetListingId: ${assetListingId}, domainId: ${domainId}`);
		const dataZoneClient = await this.getDataZoneClient();
		const listing: GetListingOutput = await dataZoneClient.send(new GetListingCommand({ domainIdentifier: domainId, identifier: assetListingId }));
		this.log.debug(`DataFabricHelper> getAssetMetadata> exit>`);
		return this.getTypeFromMetadataForms(listing.item.assetListing);
	}

	public async getAthenaDatabaseDetail(domainId: string, environmentId: string): Promise<{ workgroup: string }> {
		this.log.debug(`DataFabricHelper> getAthenaDatabaseDetail> in> environmentId: ${environmentId}, domainId: ${domainId}`);
		const dataZoneClient = await this.getDataZoneClient();
		const environment = await dataZoneClient.send(new GetEnvironmentCommand({ domainIdentifier: domainId, identifier: environmentId }));
		this.log.debug(`DataFabricHelper> getAthenaDatabaseDetail> exit`);
		return { workgroup: environment.provisionedResources.find(o => o.name === 'athenaWorkGroupName')?.value };
	}

	public async getRedshiftDatabaseDetail(domainId: string, environmentId: string, assetListingId: string): Promise<{ databaseName: string, workgroupName: string, targetName: string }> {
		this.log.debug(`DataFabricHelper> getRedshiftDatabaseDetail> in> environmentId: ${environmentId}, domainId: ${domainId}, assetListingId: ${assetListingId}`);
		const dataZoneClient = await this.getDataZoneClient();
		const listSubscriptionsResponse = await dataZoneClient.send(new ListSubscriptionGrantsCommand({ domainIdentifier: domainId, environmentId: environmentId, subscribedListingId: assetListingId }));
		const subscriptionTargetResponse = await dataZoneClient.send(new GetSubscriptionTargetCommand({
			domainIdentifier: domainId,
			environmentIdentifier: environmentId,
			identifier: listSubscriptionsResponse.items?.[0]?.subscriptionTargetId
		}));

		const { databaseName, workgroupName } = JSON.parse(subscriptionTargetResponse.subscriptionTargetConfig?.[0]?.content);
		this.log.debug(`DataFabricHelper> getRedshiftDatabaseDetail> exit>`);
		return {
			databaseName, workgroupName, targetName: listSubscriptionsResponse.items?.[0]?.assets?.[0]?.targetName
		};
	}

	public async getEnvironmentCredentials(props: GetEnvironmentCredentialsCommandInput): Promise<AwsCredentialIdentity> {
		this.log.debug(`DataFabricHelper> getEnvironmentCredentials> in> props: ${JSON.stringify(props)}`);
		const credentials = await this.getCredentials();
		const region = props.region;
		const service = 'datazone';
		const endpoint = `https://${service}.${region}.api.aws`;

		const url = new URL(endpoint);
		const request = new HttpRequest({
			hostname: url.host,
			method: 'GET',
			path: `/v2/domains/${props.domainIdentifier}/environments/${props.environmentIdentifier}/credentials`,
			headers: {
				'Content-Type': 'application/json',
				host: url.host,
			},
		});

		const signer = new SignatureV4({
			credentials,
			region,
			service,
			sha256: Sha256,
		});

		const signedRequest = await signer.sign(request);

		const options = {
			method: signedRequest.method,
			headers: signedRequest.headers,
		};

		try {
			const response = await fetch(endpoint + signedRequest.path, options);
			const json = await response.json() as any;
			this.log.debug(`DataFabricHelper> getEnvironmentCredentials> exit>`);
			return {
				...json,
				expiration: new Date(json.expiration),
			};

		} catch (error) {
			this.log.error(`DataFabricHelper> getEnvironmentCredentials> error: ${error}`);
			console.error(error);
			throw error;
		}
	}

	private async getDataZoneClient(): Promise<DataZoneClient> {
		this.log.debug(`DataFabricHelper> getDataZoneClient> in>`);
		const credentials = await this.getCredentials();
		this.log.debug(`DataFabricHelper> getDataZoneClient> exit>`);
		return captureAWSv3Client(new DataZoneClient({ region: this.region, credentials }));
	}

	private getTypeFromMetadataForms(assetListing: AssetListing): [AssetType, AssetDetail] {
		this.log.debug(`DataFabricHelper> getTypeFromMetadataForms> in> assetListing: ${assetListing}`);
		switch (assetListing.assetType) {
			case 'GlueTableAssetType':
				return ['Glue', JSON.parse(assetListing.forms)];
			case 'RedshiftTableAssetType':
				return ['Redshift', JSON.parse(assetListing.forms)];
		}
		this.log.info(`DataFabricHelper> getTypeFromMetadataForms> exit>`);
		throw new Error('Asset type is not supported');
	}

	private async getCredentials(): Promise<AwsCredentialIdentity> {
		this.log.debug(`DataFabricHelper> getCredentials> in>`);

		const data = await this.stsClient.send(new AssumeRoleCommand({ RoleArn: this.dfSustainabilityRoleArn, RoleSessionName: `sdf-spoke-search-listings` }));
		this.log.debug(`DataFabricHelper> getCredentials> exit>`);
		return {
			accessKeyId: data?.Credentials?.AccessKeyId!,
			secretAccessKey: data?.Credentials?.SecretAccessKey!,
			sessionToken: data?.Credentials?.SessionToken!
		};
	}
}
