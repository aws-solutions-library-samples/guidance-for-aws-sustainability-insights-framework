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

import type { FastifyBaseLogger } from 'fastify';
import type { Client, ClientConfig, PoolConfig, Pool } from 'pg';
import pkg from 'pg';
import { Signer } from '@aws-sdk/rds-signer';

export class BaseRepositoryClient {
	private readonly log: FastifyBaseLogger;
	private readonly rdsProxyEndpoint: string;
	private readonly rdsTenantUsername: string;
	private readonly tenantDatabase: string;
	private readonly environment: string;
	private readonly caCert: string;

	constructor(log: FastifyBaseLogger, rdsProxyEndpoint: string, rdsTenantUsername: string, tenantDatabaseName: string, environment: string, caCert: string) {
		this.caCert = caCert;
		this.log = log;
		this.rdsProxyEndpoint = rdsProxyEndpoint;
		this.rdsTenantUsername = rdsTenantUsername;
		this.tenantDatabase = tenantDatabaseName;
		this.environment = environment;
	}

	public async getConnectionPool(numOfConnection: number): Promise<Pool> {
		this.log.debug(`BaseRepository> getPool> in>`);

		let poolConfig: PoolConfig = {
			database: this.tenantDatabase,
			max: numOfConnection
		};

		// check if environment is local or anything else
		if (this.environment === 'local') {
			const password = process.env['DB_USER_PASSWORD'];

			if (!password) {
				throw new Error(`Environment: ${this.environment} requires DB_USER_PASSWORD for local DB connection"`);
			}

			poolConfig.user = this.rdsTenantUsername;
			poolConfig.password = password;
			poolConfig.host = this.rdsProxyEndpoint;
		} else {
			// if the environment is anything else then local, we have to load credentials from secrets manager
			const signer = new Signer({
				hostname: this.rdsProxyEndpoint,
				port: 5432,
				username: this.rdsTenantUsername,
			});
			const token = await signer.getAuthToken();

			poolConfig.user = this.rdsTenantUsername;
			poolConfig.database = this.tenantDatabase;
			poolConfig.password = token;
			poolConfig.host = this.rdsProxyEndpoint;
			poolConfig.ssl = {
				rejectUnauthorized: true,
				ca: this.caCert,
			};
		}
		const { Pool } = pkg;
		const pool = new Pool(poolConfig);
		this.log.info(`BaseRepository> getPool> out>`);
		return pool;
	}


	public async getConnection(): Promise<Client> {
		this.log.debug(`BaseRepository> getConnection> in>`);

		let dbConfig: ClientConfig = {
			database: this.tenantDatabase,
		};

		// check if environment is local or anything else
		if (this.environment === 'local') {
			const password = process.env['DB_USER_PASSWORD'];

			if (!password) {
				throw new Error(`Environment: ${this.environment} requires DB_USER_PASSWORD for local DB connection"`);
			}

			dbConfig.user = this.rdsTenantUsername;
			dbConfig.password = password;
			dbConfig.host = this.rdsProxyEndpoint;
		} else {
			// if the environment is anything else then local, we have to load credentials from secrets manager
			const signer = new Signer({
				hostname: this.rdsProxyEndpoint,
				port: 5432,
				username: this.rdsTenantUsername,
			});
			const token = await signer.getAuthToken();

			dbConfig.user = this.rdsTenantUsername;
			dbConfig.database = this.tenantDatabase;
			dbConfig.password = token;
			dbConfig.host = this.rdsProxyEndpoint;
			dbConfig.ssl = {
				rejectUnauthorized: true,
				ca: this.caCert,
			};
		}
		const { Client } = pkg;
		const client = new Client(dbConfig);

		try {
			await client.connect();
		} catch (e) {
			this.log.error('unable to establish DB connection', e);
			throw e;
		}

		this.log.info(`BaseRepository> getConnection> out>`);
		return client;
	}
}
