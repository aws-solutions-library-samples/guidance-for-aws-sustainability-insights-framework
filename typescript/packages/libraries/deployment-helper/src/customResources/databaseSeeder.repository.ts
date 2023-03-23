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

import type { Logger } from 'pino';
import type { Client } from 'pg';
import fs from 'fs';

const activityTable = 'Activity';
const activityStringValueTable = 'ActivityStringValue';
const activityNumberValueTable = 'ActivityNumberValue';
const activityDateTimeValueTable = 'ActivityDateTimeValue';
const activityBooleanValueTable = 'ActivityBooleanValue';

export type GetSqlClient =
	(databaseName?: string) => Promise<Client>

export class DatabaseSeederRepository {
	private readonly logger: Logger;
	private readonly getSqlClient: GetSqlClient;
	private readonly migrate: (options: any) => Promise<any[]>;

	constructor(logger: Logger, getSqlClient: GetSqlClient, migrate: (options: any) => Promise<any[]>) {
		this.logger = logger;
		this.getSqlClient = getSqlClient;
		this.migrate = migrate;
	}

	public async isUserExists(username: string): Promise<boolean> {
		this.logger.info(`databaseSeeder.customResource > isUserExists > in : username: ${username}`);
		const sqlClient = await this.getSqlClient();

		let exist = false;
		try {
			const response = await sqlClient.query(`select exists(SELECT 1 FROM pg_roles WHERE rolname='${username}');`);
			this.logger.info(`databaseSeeder.customResource > isUserExists > in : response: ${response}`);
			exist = response.rows[0]['exists'];
		} catch (Exception) {
			this.logger.error(`databaseSeeder.customResource > isUserExists > error: ${Exception}`);
		} finally {
			await sqlClient.end();
		}
		this.logger.debug(`databaseSeeder.customResource > isUserExists > exit`);
		return exist;
	};

	public async isDatabaseExist(tenantDatabaseName: string): Promise<boolean> {
		this.logger.info(`databaseSeeder.customResource > isDatabaseExist > in : tenantDatabaseName: ${tenantDatabaseName}`);
		const sqlClient = await this.getSqlClient(tenantDatabaseName);

		let exist = false;
		try {
			const response = await sqlClient.query(`select exists(SELECT datname FROM pg_catalog.pg_database WHERE lower(datname) = lower('${tenantDatabaseName}'));`);
			this.logger.info(`databaseSeeder.customResource > isDatabaseExist > in : response: ${response}`);
			exist = response.rows[0]['exists'];
		} catch (Exception) {
			this.logger.error(`databaseSeeder.customResource > isDatabaseExist > error: ${Exception}`);
		} finally {
			await sqlClient.end();
		}
		this.logger.debug(`databaseSeeder.customResource > isDatabaseExist > exit`);
		return exist;
	};


	public async upgradeDatabaseVersion(tenantDatabaseName: string, migrationFolder: string): Promise<void> {
		this.logger.info(`databaseSeeder.customResource > upgradeDatabaseVersion > in : tenantDatabaseName: ${tenantDatabaseName}, migrationFolder: ${migrationFolder}`);
		const sqlClient = await this.getSqlClient(tenantDatabaseName);
		try {
			const migrationResults = await this.migrate({
				dbClient: sqlClient,
				migrationsTable: 'ActivityMigration',
				direction: 'up',
				dir: migrationFolder
			});
			this.logger.info(`databaseSeeder.customResource > upgradeDatabaseVersion > in : migrationResults: ${migrationResults}`);
		} catch (Exception) {
			this.logger.error(`databaseSeeder.customResource > upgradeDatabaseVersion > error: ${Exception}`);
		} finally {
			await sqlClient.end();
		}
		this.logger.debug(`databaseSeeder.customResource > upgradeDatabaseVersion > exit`);
	};

	public async executeScripts(tenantUsername: string, tenantDatabaseName: string, scripFilePath: string) {
		this.logger.info(`databaseSeeder.customResource > executeScripts > in : tenantUsername: ${tenantUsername}`);
		const sqlClient = await this.getSqlClient(tenantDatabaseName);
		try {
			let bootstrapScript = fs.readFileSync(scripFilePath, 'utf-8');
			bootstrapScript = bootstrapScript.replaceAll('#tenantUser', tenantUsername);
			bootstrapScript = bootstrapScript.replaceAll('#activityTable', activityTable);
			bootstrapScript = bootstrapScript.replaceAll('#activityStringValueTable', activityStringValueTable);
			bootstrapScript = bootstrapScript.replaceAll('#activityNumberValueTable', activityNumberValueTable);
			bootstrapScript = bootstrapScript.replaceAll('#activityDateTimeValueTable', activityDateTimeValueTable);
			bootstrapScript = bootstrapScript.replaceAll('#activityBooleanValueTable', activityBooleanValueTable);
			const seedResults = await sqlClient.query(bootstrapScript);
			this.logger.info(`databaseSeeder.customResource > executeScripts > in : seedResults: ${seedResults}`);
		} catch (Exception) {
			this.logger.error(`databaseSeeder.customResource > executeScripts > error: ${Exception}`);
		} finally {
			await sqlClient.end();
		}
		this.logger.debug(`databaseSeeder.customResource > executeScripts > exit`);
	}

	public async modifyUserDetails(username: string, details: { password: string }) {
		this.logger.info(`databaseSeeder.customResource > modifyUserDetails > in : username: ${username}`);
		const sqlClient = await this.getSqlClient();
		try {
			await sqlClient.query(`ALTER USER ${username} WITH PASSWORD '${details.password}';`);
		} catch (Exception) {
			this.logger.error(`databaseSeeder.customResource > modifyUserDetails > error: ${Exception}`);
		} finally {
			await sqlClient.end();
		}
		this.logger.debug(`databaseSeeder.customResource > modifyUserDetails > exit`);
	};

	public async createUser(tenantUsername: string, tenantPassword: string) {
		this.logger.info(`databaseSeeder.customResource > createUser > in : tenantUsername: ${tenantUsername}`);
		const sqlClient = await this.getSqlClient();
		try {
			await sqlClient.query(`CREATE USER ${tenantUsername} WITH PASSWORD '${tenantPassword}';`);
		} catch (Exception) {
			this.logger.error(`databaseSeeder.customResource > createUser > error: ${Exception}`);
		} finally {
			await sqlClient.end();
		}
		this.logger.debug(`databaseSeeder.customResource > createUser > exit`);
	};

	public async revokeDatabaseAccessFromUser(tenantUsername: string, tenantDatabaseName: string) {
		this.logger.info(`databaseSeeder.customResource > revokeDatabaseAccessFromUser > in : tenantUsername: ${tenantUsername}, tenantDatabaseName: ${tenantDatabaseName}`);
		const sqlClient = await this.getSqlClient();
		try {
			await sqlClient.query(`DROP OWNED BY ${tenantUsername};`);
			await sqlClient.query(`REVOKE ALL ON DATABASE "${tenantDatabaseName}" FROM ${tenantUsername};`);
		} catch (Exception) {
			this.logger.error(`databaseSeeder.customResource > revokeDatabaseAccessFromUser > error: ${Exception}`);
		} finally {
			await sqlClient.end();
		}
		this.logger.debug(`databaseSeeder.customResource > revokeDatabaseAccessFromUser > exit`);
	};

	public async removeUser(tenantUsername: string) {
		this.logger.info(`databaseSeeder.customResource > removeUser > in : tenantUsername: ${tenantUsername}`);
		const sqlClient = await this.getSqlClient();
		try {
			await sqlClient.query(`DROP USER IF EXISTS ${tenantUsername};`);
		} catch (Exception) {
			this.logger.error(`databaseSeeder.customResource > removeUser > error: ${Exception}`);
		} finally {
			await sqlClient.end();
		}
		this.logger.debug(`databaseSeeder.customResource > removeUser > exit`);
	};

	public async grantDatabaseAccessToUser(tenantUsername: string, tenantDatabaseName: string) {
		this.logger.info(`databaseSeeder.customResource > grantDatabaseAccessToUser > in : tenantUsername: ${tenantUsername}, tenantDatabaseName: ${tenantDatabaseName}`);
		const sqlClient = await this.getSqlClient();
		try {
			await sqlClient.query(`GRANT CONNECT ON DATABASE ${tenantDatabaseName} TO ${tenantUsername};`);
		} catch (Exception) {
			this.logger.error(`databaseSeeder.customResource > grantDatabaseAccessToUser > error: ${Exception}`);
		} finally {
			await sqlClient.end();
		}
		this.logger.debug(`databaseSeeder.customResource > grantDatabaseAccessToUser > exit`);
	};

	public async createDatabaseSchema(tenantDatabaseName: string) {
		this.logger.info(`databaseSeeder.customResource > createDatabaseSchema > in : tenantDatabaseName: ${tenantDatabaseName}`);
		const sqlClient = await this.getSqlClient();
		try {
			await sqlClient.query(`CREATE DATABASE ${tenantDatabaseName}`);
		} catch (Exception) {
			this.logger.error(`databaseSeeder.customResource > createDatabaseSchema > error: ${Exception}`);
		} finally {
			await sqlClient.end();
		}
		this.logger.debug(`databaseSeeder.customResource > createDatabaseSchema > exit`);
	};

	public async removeDatabaseSchema(tenantDatabaseName: string) {
		this.logger.info(`databaseSeeder.customResource > removeDatabaseSchema > in : tenantDatabaseName: ${tenantDatabaseName}`);
		const sqlClient = await this.getSqlClient();
		try {
			await sqlClient.query(`REVOKE CONNECT ON DATABASE "${tenantDatabaseName}" FROM public`);
			await sqlClient.query(`SELECT pg_terminate_backend(pg_stat_activity.pid)
									  FROM pg_stat_activity
									  WHERE pg_stat_activity.datname = '${tenantDatabaseName}'`);

			// Drop the database
			await sqlClient.query(`DROP DATABASE IF EXISTS ${tenantDatabaseName};`);
		} catch (Exception) {
			this.logger.error(`databaseSeeder.customResource > removeDatabaseSchema > error: ${Exception}`);
		} finally {
			await sqlClient.end();
		}

		this.logger.debug(`databaseSeeder.customResource > removeDatabaseSchema > exit`);
	};
}
