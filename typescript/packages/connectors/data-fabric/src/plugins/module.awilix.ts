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
import { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import { EventPublisher } from '@sif/events';
import pino, { Logger } from 'pino';
import pretty from 'pino-pretty';
import pkg from 'aws-xray-sdk';
import { ConnectorEvents } from '@sif/connector-utils';
import { S3Client } from '@aws-sdk/client-s3';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { SFNClient } from '@aws-sdk/client-sfn';
import { ImportService } from '../services/import.service.js';
import { ExportService } from '../services/export.service.js';
import { GlueImportService } from '../services/import/glueImportService.js';
import { RedshiftImportService } from '../services/import/redshiftImportService';
import { ActivityExportService } from '../services/export/activityExportService.js';
import { MetricExportService } from '../services/export/metricExportService.js';
import { STSClient } from '@aws-sdk/client-sts';
import { DataFabricHelper } from './dataFabricHelper.js';

const { captureAWSv3Client } = pkg;

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


// Clients
class EventBridgeClientFactory {
	public static create(region: string | undefined): EventBridgeClient {
		return captureAWSv3Client(new EventBridgeClient({ region }));
	}
}

class STSClientFactory {
	public static create(region: string | undefined): STSClient {
		const stsClient = captureAWSv3Client(new STSClient({ region }));
		return stsClient;
	}
}


class S3ClientFactory {
	public static create(region: string | undefined): S3Client {
		return captureAWSv3Client(new S3Client({ region }));
	}
}

class StepFunctionClientFactory {
	public static create(region: string | undefined): SFNClient {
		return captureAWSv3Client(new SFNClient({ region }));
	}
}


class SecretsManagerClientFactory {
	public static create(region: string | undefined): SecretsManagerClient {
		return captureAWSv3Client(new SecretsManagerClient({ region }));
	}
}

class CognitoIdentityProviderClientFactory {
	public static create(region: string | undefined): CognitoIdentityProviderClient {
		return captureAWSv3Client(new CognitoIdentityProviderClient({ region }));
	}
}

// Parameters
const eventBusName = process.env['EVENT_BUS_NAME'];
const region = process.env['AWS_REGION'];
const accountId = process.env['AWS_ACCOUNT_ID'];
const dataFabricRegion = process.env['DATA_FABRIC_REGION'];
const idcEmail = process.env['IDENTITY_CENTER_EMAIL'];
const idcUserId = process.env['IDENTITY_CENTER_USER_ID'];
const dataFabricEventBusArn = process.env['DATA_FABRIC_EVENT_BUS_ARN'];
const bucketName = process.env['BUCKET_NAME'];
const dataFabricObjectPrefix = process.env['DATA_FABRIC_OBJECT_PREFIX'];
const taskParallelLimit = parseInt(process.env['TASK_PARALLEL_LIMIT'] ?? '10');
const dfSustainabilityRoleArn = process.env['DF_SUSTAINABILITY_ROLE_ARN'];

const source = 'com.sif.connectors.input.dataZone';

const commonInjectionOptions = {
	lifetime: Lifetime.SINGLETON,
};

container.register({

	logger: asFunction(() => logger, {
		...commonInjectionOptions
	}),

	eventBridgeClient: asFunction(() => EventBridgeClientFactory.create(region), {
		...commonInjectionOptions,
	}),

	stepFunctionClient: asFunction(() => StepFunctionClientFactory.create(region), {
		...commonInjectionOptions
	}),

	s3Client: asFunction(() => S3ClientFactory.create(region), {
		...commonInjectionOptions,
	}),

	stsClient: asFunction(() => STSClientFactory.create(region), {
		...commonInjectionOptions,
	}),

	secretsManagerClient: asFunction(() => SecretsManagerClientFactory.create(region), {
		...commonInjectionOptions,
	}),

	cognitoIdentityProviderClient: asFunction(() => CognitoIdentityProviderClientFactory.create(region), {
		...commonInjectionOptions,
	}),

	dataFabricHelper: asFunction((container) =>
			new DataFabricHelper(
				logger,
				region,
				container.stsClient,
				dfSustainabilityRoleArn
			),
		{
			...commonInjectionOptions,
		}
	),

	activityExportService: asFunction((container) =>
			new ActivityExportService(
				logger,
				bucketName,
				dataFabricObjectPrefix,
				container.s3Client,
				container.eventBridgeClient,
				dataFabricEventBusArn,
				accountId,
				region,
				idcEmail,
				idcUserId,
				container.dataFabricHelper
			),
		{
			...commonInjectionOptions,
		}
	),

	glueImportService: asFunction((container) =>
			new GlueImportService(
				logger,
				container.dataFabricHelper,
			),
		{
			...commonInjectionOptions,
		}
	),

	redshiftImportService: asFunction((container) =>
			new RedshiftImportService(
				logger,
				container.dataFabricHelper,
			),
		{
			...commonInjectionOptions,
		}
	),

	metricExportService: asFunction((container) =>
			new MetricExportService(
				logger,
				bucketName,
				dataFabricObjectPrefix,
				container.s3Client,
				container.eventBridgeClient,
				dataFabricEventBusArn,
				accountId,
				region,
				idcEmail,
				idcUserId,
				container.dataFabricHelper
			),
		{
			...commonInjectionOptions,
		}
	),

	exportService: asFunction((container) =>
			new ExportService(
				logger,
				bucketName,
				dataFabricObjectPrefix,
				container.s3Client,
				taskParallelLimit,
				container.activityExportService,
				container.metricExportService,
			),
		{
			...commonInjectionOptions,
		}
	),

	eventPublisher: asFunction((container) =>
			new EventPublisher(
				logger,
				container.eventBridgeClient,
				eventBusName,
				source
			),
		{
			...commonInjectionOptions,
		}
	),

	connectorEvents: asFunction((container) =>
			new ConnectorEvents(
				logger,
				container.eventPublisher,
				eventBusName,
				region,
				source
			),
		{
			...commonInjectionOptions,
		}
	),

	importService: asFunction((container) =>
			new ImportService(
				logger,
				container.connectorEvents,
				dataFabricRegion,
				container.glueImportService,
				container.redshiftImportService,
				container.dataFabricHelper
			),
		{
			...commonInjectionOptions,
		}
	),
});


export {
	container
};
