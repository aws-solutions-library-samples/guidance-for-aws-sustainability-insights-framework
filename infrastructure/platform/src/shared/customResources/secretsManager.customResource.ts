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

import { DescribeDBProxiesCommand, ModifyDBProxyCommand, RDSClient } from '@aws-sdk/client-rds';
import { ListSecretsCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';


const rdsClient = new RDSClient({});
const secretsManagerClient = new SecretsManagerClient({});

const { RDS_PROXY_NAME, SIF_ENVIRONMENT } = process.env;

const attachTenantSecrets = async () => {

	const proxy = await rdsClient.send(new DescribeDBProxiesCommand({ DBProxyName: RDS_PROXY_NAME }));
	const currentProxy = proxy?.DBProxies?.[0];

	if (!currentProxy) {
		console.log(`secretManager.customResource > attachSecretToRdsProxy > error: there is no RDS proxy`);
		return;
	}

	// retrieve all secrets for specific SIF environment
	const listSecretsResponse = await secretsManagerClient.send(new ListSecretsCommand({
		Filters: [
			{
				Key: 'tag-key', Values: [`sif:environment`],
			},
			{
				Key: 'tag-value', Values: [SIF_ENVIRONMENT!],
			}]
	}));

	console.log(`secretManager.customResource > attachSecretToRdsProxy > listSecretsResponse: ${JSON.stringify(listSecretsResponse)}`);

	const tenantSecrets = listSecretsResponse.SecretList?.filter(existingSecret =>
		// filter to only tenant secrets that are not attached
		currentProxy.Auth?.find(attachedSecret => attachedSecret.SecretArn === existingSecret.ARN) === undefined &&
		existingSecret.Name?.endsWith(`${SIF_ENVIRONMENT}-database-secret`))
		.map(newSecret => {
			return {
				AuthScheme: 'SECRETS',
				SecretArn: newSecret.ARN,
				IAMAuth: 'REQUIRED',
			};
		}) ?? [];

	console.log(`secretManager.customResource > attachSecretToRdsProxy > tenantSecrets: ${JSON.stringify(tenantSecrets)}`);

	if (tenantSecrets.length > 0) {
		const modifyProxyResponse = await rdsClient.send(
			new ModifyDBProxyCommand({
				DBProxyName: RDS_PROXY_NAME,
				Auth: [
					...currentProxy.Auth!,
					...tenantSecrets,
				],
			})
		);
		console.log(`secretManager.customResource > attachSecretToRdsProxy > modifyProxyResponse: ${JSON.stringify(modifyProxyResponse)}`);
	}
};

export const handler = async (event: any): Promise<any> => {
	console.log(`secretManager.customResource > handler > in : ${JSON.stringify(event)}`);
	try {
		switch (event.RequestType) {
			case 'Create': {
				await attachTenantSecrets();
				return;
			}
			case 'Update': {
				await attachTenantSecrets();
				return;
			}
			case 'Delete': {
				console.log(`nothing to do on delete`);
				return;
			}
			default: {
				console.log(`secretManager.customResource > unknown request type`);
			}
		}
	} catch (Exception) {
		console.log(`secretManager.customResource > error : ${Exception}`);
	}
	console.log(`secretManager.customResource > exit`);
};
