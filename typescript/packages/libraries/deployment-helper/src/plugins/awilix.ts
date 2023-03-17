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

import { asFunction, createContainer, Lifetime } from 'awilix';
import pino, { Logger } from 'pino';
import axios from 'axios';
import pgPkg from 'pg';

const { Client } = pgPkg;

import pkg from 'aws-xray-sdk';

const { captureAWSv3Client } = pkg;
import { S3Client } from '@aws-sdk/client-s3';
import pretty from 'pino-pretty';
import { DatabaseSeederCustomResource } from '../customResources/databaseSeeder.customResource';
import { CustomResourceManager } from '../customResources/customResource.manager';
import { Signer } from '@aws-sdk/rds-signer';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import nodePgMigrate from 'node-pg-migrate';
import { DatabaseSeederRepository } from '../customResources/databaseSeeder.repository';
import { RDSClient } from '@aws-sdk/client-rds';
import { IAMClient } from '@aws-sdk/client-iam';
// @ts-ignore
const migrate = nodePgMigrate.default;
const container = createContainer({
	injectionMode: 'PROXY'
});

const logger: Logger = pino(
	pretty({
		colorize: true,
		translateTime: 'HH:MM:ss Z',
		ignore: 'pid,hostname',
	})
);

const commonInjectionOptions = {
	lifetime: Lifetime.SINGLETON
};

class S3ClientFactory {
	public static create(region: string | undefined): S3Client {
		const s3 = captureAWSv3Client(new S3Client({ region }));
		return s3;
	}
}

class IAMClientFactory {
	public static create(region: string | undefined): IAMClient {
		const iamClient = captureAWSv3Client(new IAMClient({ region }));
		return iamClient;
	}
}

class RDSClientFactory {
	public static create(region: string | undefined): RDSClient {
		const rdsClient = captureAWSv3Client(new RDSClient({ region }));
		return rdsClient;
	}
}

class SecretsManagerClientFactory {
	public static create(region: string | undefined): SecretsManagerClient {
		const secretsManagerClient = captureAWSv3Client(new SecretsManagerClient({ region }));
		return secretsManagerClient;
	}
}

const defaultPort = 5432;
const awsRegion = process.env['AWS_REGION'];
const platformUsername = process.env['PLATFORM_USERNAME'];
const host = process.env['RDS_PROXY_ENDPOINT'];
const assetFolder = `/tmp/sqlAssets`;
const tenantId = process.env['TENANT_ID'];
const rdsProxyName = process.env['RDS_PROXY_NAME'];
const environment = process.env['NODE_ENV'];

const getPostgresqlClient = async (databaseName = 'postgres'): Promise<pgPkg.Client> => {
	logger.debug(`awilix > getPostgresqlClient > in:`);

	const { data: caCert } = await axios.get('https://www.amazontrust.com/repository/AmazonRootCA1.pem');

	const signer = new Signer({
		hostname: host,
		port: defaultPort,
		username: platformUsername,
	});

	const token = await signer.getAuthToken();

	const postgresqlClient = new Client({
		user: platformUsername,
		password: token,
		host: host,
		database: databaseName,
		ssl: {
			rejectUnauthorized: false,
			ca: caCert,
		},
	});
	await postgresqlClient.connect();
	logger.debug(`awilix > getPostgresqlClient > exit :`);
	return postgresqlClient;
};

container.register({
	logger: asFunction(() => logger, {
		...commonInjectionOptions
	}),
	s3Client: asFunction(() => S3ClientFactory.create(awsRegion), {
		...commonInjectionOptions,
	}),
	rdsClient: asFunction(() => RDSClientFactory.create(awsRegion), {
		...commonInjectionOptions,
	}),
	iamClient: asFunction(() => IAMClientFactory.create(awsRegion), {
		...commonInjectionOptions,
	}),
	secretsManagerClient: asFunction(() => SecretsManagerClientFactory.create(awsRegion), {
		...commonInjectionOptions,
	}),
	databaseSeederRepository: asFunction(() => new DatabaseSeederRepository(logger, getPostgresqlClient, migrate), {
		...commonInjectionOptions,
	}),
	databaseSeederCustomResource: asFunction((container) => new DatabaseSeederCustomResource(
		logger, container.databaseSeederRepository, container.rdsClient, container.iamClient, container.s3Client, container.secretsManagerClient,
		rdsProxyName, tenantId, environment, assetFolder), {
		...commonInjectionOptions,
	}),
	customResourceManager: asFunction((container) => new CustomResourceManager(logger, container.databaseSeederCustomResource), {
		...commonInjectionOptions,
	}),
});

export {
	container
};
