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

import { AuthenticationResultType, AuthFlowType, CognitoIdentityProviderClient, InitiateAuthCommand } from '@aws-sdk/client-cognito-identity-provider';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import type { BaseLogger } from 'pino';

export class Authenticator {
	constructor(private log: BaseLogger, private secretsManagerClient: SecretsManagerClient, private cognitoClient: CognitoIdentityProviderClient, private clientId: string, private readonly secretsManagerArn: string) {
	}

	public async getAuthenticationResult(): Promise<AuthenticationResultType> {
		this.log.info(`Authenticator > getAuthenticationResult > in:`);

		const secretsManagerResponse = await this.secretsManagerClient.send(new GetSecretValueCommand({ SecretId: this.secretsManagerArn }));

		const { username, password } = JSON.parse(secretsManagerResponse.SecretString);

		const authResponse = await this.cognitoClient.send(new InitiateAuthCommand(
			{
				AuthFlow: AuthFlowType.USER_PASSWORD_AUTH,
				ClientId: this.clientId,
				AuthParameters: { USERNAME: username, PASSWORD: password }
			}
		));

		this.log.info(`Authenticator > getAuthenticationResult > exit:`);

		return authResponse.AuthenticationResult;
	}
}
