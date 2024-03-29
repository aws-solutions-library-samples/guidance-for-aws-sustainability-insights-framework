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

import type { CustomResource } from './customResource';
import type { CustomResourceEvent } from './customResource.model';
import type { Logger } from 'pino';
import * as fs from 'fs';
import type { DatabaseSeederRepository } from './databaseSeeder.repository.js';
import type { RDSClient } from '@aws-sdk/client-rds';
import { DescribeDBProxiesCommand, ModifyDBProxyCommand } from '@aws-sdk/client-rds';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
// @ts-ignore
import ow from 'ow';
import type { ExtractCustomResourceArtifacts } from '../plugins/awilix.js';
import type { DatabaseSeederContainer } from './databaseSeeder.container.js';

export class DatabaseSeederCustomResource implements CustomResource {
	private readonly logger: Logger;
	private readonly extractCustomResourceArtifacts: ExtractCustomResourceArtifacts;
	private readonly secretsManagerClient: SecretsManagerClient;
	private readonly databaseSeederRepository: DatabaseSeederRepository;
	private readonly rdsClient: RDSClient;
	private readonly proxyName: string;
	private readonly databaseSeederContainer: DatabaseSeederContainer;

	constructor(logger: Logger, databaseSeederRepository: DatabaseSeederRepository,
				rdsClient: RDSClient, secretsManagerClient: SecretsManagerClient, proxyName: string,
				extractCustomResourceArtifacts: ExtractCustomResourceArtifacts, databaseSeederContainer: DatabaseSeederContainer) {
		this.extractCustomResourceArtifacts = extractCustomResourceArtifacts;
		this.logger = logger;
		this.secretsManagerClient = secretsManagerClient;
		this.rdsClient = rdsClient;
		this.databaseSeederRepository = databaseSeederRepository;
		this.proxyName = proxyName;
		this.databaseSeederContainer = databaseSeederContainer;
	}

	private async getUserNamePasswordFromSecretManager(secretArn: string): Promise<[string, string]> {
		this.logger.debug(`databaseSeeder.customResource > getUserNamePasswordFromSecretManager > secretArn : ${secretArn}`);
		const secret = await this.secretsManagerClient.send(
			new GetSecretValueCommand({
				SecretId: secretArn,
			})
		);
		let { username, password } = JSON.parse(secret.SecretString);
		this.logger.debug(`databaseSeeder.customResource > getUserNamePasswordFromSecretManager > exit:`);
		return [username, password];
	};

	public async attachSecretToRdsProxy(secretArn: string) {
		this.logger.debug(`databaseSeeder.customResource > attachSecretToRdsProxy > secretArn : ${secretArn}`);

		const proxy = await this.rdsClient.send(new DescribeDBProxiesCommand({ DBProxyName: this.proxyName }));
		const currentProxy = proxy?.DBProxies?.[0];

		if (!currentProxy) {
			this.logger.error(`databaseSeeder.customResource > attachSecretToRdsProxy > error: there is no RDS proxy`);
			return;
		}

		// Only add secret to RDS proxy if it does not exist
		if (!currentProxy.Auth.find((o) => o.SecretArn === secretArn)) {
			this.logger.debug(`databaseSeeder.customResource > attachSecretToRdsProxy > adding tenant secret ${secretArn} to proxy ${this.proxyName}`);
			const modifyProxyResponse = await this.rdsClient.send(
				new ModifyDBProxyCommand({
					DBProxyName: this.proxyName,
					Auth: [
						...currentProxy.Auth,
						{
							AuthScheme: 'SECRETS',
							SecretArn: secretArn,
							IAMAuth: 'REQUIRED',
						},
					],
				})
			);
			this.logger.debug(`databaseSeeder.customResource > attachSecretToRdsProxy > modifyProxyResponse : ${modifyProxyResponse}`);
		}
		this.logger.debug(`databaseSeeder.customResource > attachSecretToRdsProxy > exit :`);
	};

	public async detachSecretFromRdsProxy(secretArn: string) {
		this.logger.debug(`databaseSeeder.customResource > detachSecretFromRdsProxy > secretArn : ${secretArn}`);
		const proxy = await this.rdsClient.send(new DescribeDBProxiesCommand({ DBProxyName: this.proxyName }));
		const currentProxy = proxy?.DBProxies?.[0];
		// Remove the secret attachment from the RDS proxy
		const auth = currentProxy.Auth.filter((o) => o.SecretArn !== secretArn);
		await this.rdsClient.send(
			new ModifyDBProxyCommand({
				DBProxyName: this.proxyName,
				Auth: auth,
			})
		);
		this.logger.debug(`databaseSeeder.customResource > detachSecretFromRdsProxy > exit :`);
	};

	private async extractAssets(assetBucket: string, assetKey: string): Promise<[string, string]> {
		const assetFolder = await this.extractCustomResourceArtifacts(assetBucket, assetKey);

		const folders = await fs.promises.readdir(assetFolder);

		if (!folders.includes('migrations') || !folders.includes('seed')) {
			throw new Error('missing migrations or seed folder');
		}
		return [`${assetFolder}/seed`, `${assetFolder}/migrations`];
	}

	async create(customResourceEvent: CustomResourceEvent): Promise<unknown> {
		this.logger.info(`databaseSeeder.customResource > create > in > event: ${JSON.stringify(customResourceEvent)}`);

		ow(customResourceEvent.ResourceProperties, ow.object.nonEmpty);
		const { assetBucket, assetPath, tenantSecretArn, tenantDatabaseName, callbackUrl } = customResourceEvent.ResourceProperties;

		ow(assetBucket, ow.string.nonEmpty);
		ow(assetPath, ow.string.nonEmpty);
		ow(tenantSecretArn, ow.string.nonEmpty);
		ow(tenantDatabaseName, ow.string.nonEmpty);
		ow(callbackUrl, ow.string.nonEmpty);

		const [seedFolderPath, _migrationsFolderPath] = await this.extractAssets(assetBucket, assetPath);

		try {
			const [username, password] = await this.getUserNamePasswordFromSecretManager(tenantSecretArn);

			const userExists = await this.databaseSeederRepository.isUserExists(username);
			if (!userExists) {
				// CHECK IF DATABASE EXISTS, THIS IS TO HANDLE WHEN USER IS NOT BEING DELETED PROPERLY
				await this.databaseSeederRepository.createUser(username, password);
			} else {
				await this.databaseSeederRepository.modifyUserDetails(username, { password });
			}

			const databaseExists = await this.databaseSeederRepository.isDatabaseExist(tenantDatabaseName);
			// CHECK IF DATABASE EXISTS, THIS IS TO HANDLE DATABASE CREATED WITH OLD SCRIPTS
			if (!databaseExists) {
				await this.databaseSeederRepository.createDatabaseSchema(tenantDatabaseName);
				await this.databaseSeederRepository.executeScripts(username, tenantDatabaseName, `${seedFolderPath}/bootstrap.sql`);
				await this.databaseSeederRepository.grantDatabaseAccessToUser(username, tenantDatabaseName);
				await this.attachSecretToRdsProxy(tenantSecretArn);
			}
			// performing database migration if any
			await this.databaseSeederContainer.runTask(callbackUrl, username, tenantDatabaseName, assetBucket, assetPath);
		} catch (Exception) {
			this.logger.error(`databaseSeeder.customResource > create > error : ${Exception}`);
		}

		return Promise.resolve(undefined);
	}

	async update(customResourceEvent: CustomResourceEvent): Promise<unknown> {
		this.logger.info(`databaseSeeder.customResource > update > in > event: ${JSON.stringify(customResourceEvent)}`);

		ow(customResourceEvent.ResourceProperties, ow.object.nonEmpty);

		const { assetBucket, assetPath, tenantDatabaseName, tenantSecretArn, callbackUrl } = customResourceEvent.ResourceProperties;

		ow(assetBucket, ow.string.nonEmpty);
		ow(assetPath, ow.string.nonEmpty);
		ow(tenantDatabaseName, ow.string.nonEmpty);
		ow(tenantSecretArn, ow.string.nonEmpty);
		ow(callbackUrl, ow.string.nonEmpty);

		const [username, _password] = await this.getUserNamePasswordFromSecretManager(tenantSecretArn);

		await this.databaseSeederContainer.runTask(callbackUrl, username, tenantDatabaseName, assetBucket, assetPath);

		return Promise.resolve(undefined);
	}

	async delete(customResourceEvent: CustomResourceEvent): Promise<unknown> {
		this.logger.info(`databaseSeeder.customResource > delete > in > event: ${JSON.stringify(customResourceEvent)}`);

		ow(customResourceEvent.ResourceProperties, ow.object.nonEmpty);

		const { assetBucket, assetPath, tenantDatabaseName, tenantSecretArn } = customResourceEvent.ResourceProperties;

		ow(assetBucket, ow.string.nonEmpty);
		ow(assetPath, ow.string.nonEmpty);
		ow(tenantDatabaseName, ow.string.nonEmpty);

		const [username, _] = await this.getUserNamePasswordFromSecretManager(tenantSecretArn);

		try {
			await this.detachSecretFromRdsProxy(tenantSecretArn);
			await this.databaseSeederRepository.revokeDatabaseAccessFromUser(username, tenantDatabaseName);
			await this.databaseSeederRepository.removeDatabaseSchema(tenantDatabaseName);
			await this.databaseSeederRepository.removeUser(username);
		} catch (Exception) {
			this.logger.error(`databaseSeeder.customResource > delete > error : ${Exception}`);
		}

		return Promise.resolve(undefined);
	}
}
