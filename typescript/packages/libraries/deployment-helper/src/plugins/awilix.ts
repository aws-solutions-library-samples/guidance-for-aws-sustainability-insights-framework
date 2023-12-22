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
import pgPkg from 'pg';
import os from 'os';
import path from 'path';

const { Client } = pgPkg;

import pkg from 'aws-xray-sdk';

const { captureAWSv3Client } = pkg;
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { ECSClient } from '@aws-sdk/client-ecs';
import { GlueClient } from '@aws-sdk/client-glue';
import pretty from 'pino-pretty';
import { DatabaseSeederCustomResource } from '../customResources/databaseSeeder.customResource';
import { CustomResourceManager } from '../customResources/customResource.manager';
import { Signer } from '@aws-sdk/rds-signer';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import nodePgMigrate from 'node-pg-migrate';
import { DatabaseSeederRepository } from '../customResources/databaseSeeder.repository';
import { RDSClient } from '@aws-sdk/client-rds';
import { IAMClient } from '@aws-sdk/client-iam';
import { ConnectorClient } from '@sif/clients';
import { Invoker } from '@sif/lambda-invoker';
import { LambdaClient } from '@aws-sdk/client-lambda';
import { ConnectorSeederCustomResource } from '../customResources/connectorSeederCustomResource';
import { sdkStreamMixin } from '@aws-sdk/util-stream-node';
import fs from 'fs';
import StreamZip from 'node-stream-zip';
import { DatabaseSeederContainer } from '../customResources/databaseSeeder.container';
import { GlueSeederCustomResource } from '../customResources/glueSeederCustomResource';
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

class ECSClientFactory {
	public static create(region: string | undefined): ECSClient {
		const ecsClient = captureAWSv3Client(new ECSClient({ region }));
		return ecsClient;
	}
}

class GlueClientFactory {
	public static create(region: string | undefined): GlueClient {
		const glueClient = captureAWSv3Client(new GlueClient({ region }));
		return glueClient;
	}
}


class SecretsManagerClientFactory {
	public static create(region: string | undefined): SecretsManagerClient {
		const secretsManagerClient = captureAWSv3Client(new SecretsManagerClient({ region }));
		return secretsManagerClient;
	}
}


class LambdaClientFactory {
	public static create(region: string): LambdaClient {
		return captureAWSv3Client(new LambdaClient({ region }));
	}
}

const defaultPort = 5432;
const awsRegion = process.env['AWS_REGION'];
const platformUsername = process.env['PLATFORM_USERNAME'];
const host = process.env['RDS_PROXY_ENDPOINT'];
const assetFolder = `/tmp/sqlAssets`;
const rdsProxyName = process.env['RDS_PROXY_NAME'];
const pipelineFunctionName = process.env['PIPELINES_FUNCTION_NAME'];
const ecsTaskDefinitionArn = process.env['ECS_TASK_DEFINITION_ARN'];
const ecsClusterArn = process.env['ECS_CLUSTER_ARN'];
const ecsTaskRoleArn = process.env['ECS_TASK_ROLE_ARN'];
const containerSecurityGroup = process.env['CONTAINER_SECURITY_GROUP'];
const containerSubnets = process.env['CONTAINER_SUBNETS'].split(',');
const caCertificate = process.env['CA_CERTIFICATE'];

export type ExtractCustomResourceArtifacts = (assetBucket: string, assetKey: string) => Promise<string>

export type GetSqlClient = (databaseName?: string) => Promise<pgPkg.Client>

const extractCustomResourceArtifacts: ExtractCustomResourceArtifacts = async (assetBucket: string, assetKey: string) => {

	const s3Client = S3ClientFactory.create(awsRegion);
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

	return assetFolder;
};

const getPostgresqlClient: GetSqlClient = async (databaseName = 'postgres'): Promise<pgPkg.Client> => {
	logger.debug(`awilix > getPostgresqlClient > in:`);

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
			rejectUnauthorized: true,
			ca: caCertificate,
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
	ecsClient: asFunction(() => ECSClientFactory.create(awsRegion), {
		...commonInjectionOptions,
	}),
	lambdaClient: asFunction(() => LambdaClientFactory.create(awsRegion), {
		...commonInjectionOptions
	}),
	glueClient: asFunction(() => GlueClientFactory.create(awsRegion), {
		...commonInjectionOptions,
	}),
	invoker: asFunction((container) => new Invoker(logger, container.lambdaClient), {
		...commonInjectionOptions
	}),
	secretsManagerClient: asFunction(() => SecretsManagerClientFactory.create(awsRegion), {
		...commonInjectionOptions,
	}),
	databaseSeederRepository: asFunction(() => new DatabaseSeederRepository(logger, getPostgresqlClient, migrate), {
		...commonInjectionOptions,
	}),
	databaseSeederContainer: asFunction((container) => new DatabaseSeederContainer(logger, container.ecsClient, ecsClusterArn, ecsTaskRoleArn, ecsTaskDefinitionArn, containerSubnets, containerSecurityGroup, host, platformUsername, caCertificate), {
		...commonInjectionOptions,
	}),
	connectorClient: asFunction((container) => new ConnectorClient(logger, container.invoker, pipelineFunctionName), {
		...commonInjectionOptions,
	}),
	databaseSeederCustomResource: asFunction((container) => new DatabaseSeederCustomResource(
		logger, container.databaseSeederRepository, container.rdsClient,
		container.secretsManagerClient, rdsProxyName, extractCustomResourceArtifacts, container.databaseSeederContainer), {
		...commonInjectionOptions,
	}),
	connectorSeederCustomResource: asFunction((container) => new ConnectorSeederCustomResource(
		logger, container.connectorClient), {
		...commonInjectionOptions,
	}),
	glueSeederCustomResource: asFunction((container) => new GlueSeederCustomResource(
		logger, container.glueClient), {
		...commonInjectionOptions,
	}),
	customResourceManager: asFunction((container) => new CustomResourceManager(logger, container.databaseSeederCustomResource, container.connectorSeederCustomResource, container.glueSeederCustomResource), {
		...commonInjectionOptions,
	})
});

export {
	container
};
