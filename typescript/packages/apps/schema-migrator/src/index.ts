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

import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { sdkStreamMixin } from '@aws-sdk/util-stream-node';
import StreamZip from 'node-stream-zip';
import axios from 'axios';
import pretty from 'pino-pretty';
import { Signer } from '@aws-sdk/rds-signer';
import { randomUUID } from 'crypto';
import nodePgMigrate from 'node-pg-migrate';
import pgPkg from 'pg';
import pino, { Logger } from 'pino';
// @ts-ignore
import ow from 'ow';
// @ts-ignore
const migrate = nodePgMigrate.default;

const { Client } = pgPkg;
const { AWS_REGION } = process.env;
const s3Client = new S3Client({ region: AWS_REGION });

const logger: Logger = pino(
	pretty({
		colorize: true,
		translateTime: 'HH:MM:ss Z',
		ignore: 'pid,hostname',
	})
);

async function getSqlClient(databaseName: string, hostEndpoint: string, platformUsername: string): Promise<pgPkg.Client> {
	logger.trace(`schemaMigrator > getSqlClient > databaseName : ${databaseName}, hostEndpoint: ${hostEndpoint}, platformUsername: ${platformUsername}`);
	const { data: caCert } = await axios.get('https://www.amazontrust.com/repository/AmazonRootCA1.pem');
	const defaultPort = 5432;
	const signer = new Signer({
		hostname: hostEndpoint,
		username: platformUsername,
		port: defaultPort,
	});

	const token = await signer.getAuthToken();

	const client = new Client({
		user: platformUsername,
		host: hostEndpoint,
		database: databaseName,
		ssl: {
			rejectUnauthorized: false,
			ca: caCert,
		},
		password: token,
	});

	logger.trace(`schemaMigrator > getSqlClient > exit`);
	return client;
}

async function extractCustomResourceArtifacts(assetBucket: string, assetKey: string): Promise<string> {
	logger.trace(`schemaMigrator > extractCustomResourceArtifacts > assetBucket : ${assetBucket}, assetKey: ${assetKey}`);

	const assetFolder = `/tmp/sqlAssets`;
	const response = await s3Client.send(new GetObjectCommand({ Bucket: assetBucket, Key: assetKey }));
	const fileContent = await sdkStreamMixin(response.Body).transformToByteArray();
	const tmpZipFilePath = os.tmpdir() + path.sep + 'assets.zip';

	fs.writeFileSync(tmpZipFilePath, fileContent);

	const zip = new StreamZip.async({ file: tmpZipFilePath });

	if (!fs.existsSync(assetFolder)) {
		fs.mkdirSync(assetFolder);
	}
	await zip.extract(null, assetFolder);
	await zip.close();
	const migrationFolder = `${assetFolder}/migrations`;

	logger.trace(`schemaMigrator > extractCustomResourceArtifacts > migrationFolder: ${migrationFolder}`);
	return migrationFolder;
}

async function updateSchema() {
	logger.trace(`schemaMigrator > updateSchema > in`);

	const {
		ASSET_BUCKET: assetBucket,
		ASSET_KEY: assetKey,
		PLATFORM_USERNAME: platformUsername,
		RDS_PROXY_ENDPOINT: hostEndpoint,
		TENANT_DATABASE: tenantDatabaseName,
		CALLBACK_URL: callbackUrl,
		TENANT_USERNAME: tenantUsername
	} = process.env;

	ow(assetBucket, ow.string.nonEmpty);
	ow(assetKey, ow.string.nonEmpty);
	ow(platformUsername, ow.string.nonEmpty);
	ow(hostEndpoint, ow.string.nonEmpty);
	ow(tenantDatabaseName, ow.string.nonEmpty);
	ow(callbackUrl, ow.string.nonEmpty);
	// validating the TENANT_USERNAME is not empty as it will be used by the migration scripts to give ownership to table
	ow(tenantUsername, ow.string.nonEmpty);

	const migrationFolder = await extractCustomResourceArtifacts(assetBucket, assetKey);
	const sqlClient = await getSqlClient(tenantDatabaseName, hostEndpoint, platformUsername);

	let status, reason;
	try {
		await sqlClient.connect();
		const migrationResults = await migrate({ dbClient: sqlClient, migrationsTable: 'ActivityMigration', direction: 'up', dir: migrationFolder });
		logger.info(`schemaMigrator > updateSchema > migrationResults : ${migrationResults}`);
		status = 'SUCCESS';
		reason = 'Migration Complete';
	} catch (Exception) {
		logger.error(`schemaMigrator > updateSchema > error : ${Exception}`);
		status = 'FAILURE';
		reason = JSON.stringify(Exception);
	} finally {
		// callback to CloudFormation WaitCondition Resource
		await axios.put(callbackUrl, {
			'Status': status,
			'Reason': reason,
			'UniqueId': randomUUID()
		});
		await sqlClient.end();
	}
}

await updateSchema();
