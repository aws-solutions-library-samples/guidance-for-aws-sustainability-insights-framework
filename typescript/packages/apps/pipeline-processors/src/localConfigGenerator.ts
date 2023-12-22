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

import * as fs from 'fs';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

const { TENANT_ID, ENVIRONMENT, AWS_REGION } = process.env;

if (!TENANT_ID || !ENVIRONMENT || !AWS_REGION) {
	throw new Error(`Environment Variable TENANT_ID or ENVIRONMENT or AWS_REGION is not being specified`);
}

const ssm = new SSMClient({ region: process.env['AWS_REGION'] });
const secretsManager = new SecretsManagerClient({ region: process.env['AWS_REGION'] });

const getDbPassword = async (): Promise<void> => {
	const secret = await secretsManager.send(
		new GetSecretValueCommand({
			SecretId: `sif-${ENVIRONMENT}-credentials`
		})
	);
	const { username, password } = JSON.parse(secret.SecretString);
	outputFile += `TENANT_USERNAME=${username}\r\n`;
	outputFile += `DB_USER_PASSWORD=${password}\r\n`;
};

const getSharedEnvironmentValues = async (module: string, mapping: Record<string, string>) => {
	for (const key in mapping) {
		const prefix = `/sif/shared/${ENVIRONMENT}/${module}/`;
		const name = `${prefix}${mapping[key]}`;
		try {
			const response = await ssm.send(
				new GetParameterCommand({
					Name: name,
					WithDecryption: false,
				})
			);
			if (response) {
				outputFile += `${key}=${response.Parameter?.Value}\r\n`;
			}
		} catch (e) {
			throw new Error(`Parameter ${name} NOT Found !!!`);
		}
	}
};

const getTenantValues = async (tenantId: string, module: string, mapping: Record<string, string>) => {
	for (const key in mapping) {
		const prefix = `/sif/${tenantId}/${ENVIRONMENT}/${module}/`;
		const name = `${prefix}${mapping[key]}`;
		try {
			const response = await ssm.send(
				new GetParameterCommand({
					Name: name,
					WithDecryption: false,
				})
			);
			if (response) {
				outputFile += `${key}=${response.Parameter?.Value}\r\n`;
			}
		} catch (e) {
			throw new Error(`Parameter ${name} NOT Found !!!`);
		}
	}
};

let outputFile = `NODE_ENV=local\r\n`;
outputFile += 'AUDIT_VERSION=1\r\n';
outputFile += 'ENABLE_DELETE_RESOURCE=true\r\n';
outputFile += 'TASK_PARALLEL_LIMIT=10\r\n';

await getDbPassword();

await getTenantValues(TENANT_ID, 'shared', {
	EVENT_BUS_NAME: 'eventBusName',
	BUCKET_NAME: 'bucketName',
	TENANT_DATABASE_NAME: 'tenantDatabaseName'
});

await getSharedEnvironmentValues('aurora', {
	RDS_PROXY_ENDPOINT: 'rdsWriterEndpoint'
});

await getTenantValues(TENANT_ID, 'accessManagement', {
	ACCESS_MANAGEMENT_FUNCTION_NAME: 'apiFunctionName',
});

await getTenantValues(TENANT_ID, 'pipelines', {
	PIPELINES_FUNCTION_NAME: 'apiFunctionName',
});

await getTenantValues(TENANT_ID, 'calculator', {
	CALCULATOR_FUNCTION_NAME: 'functionName',
});

await getTenantValues(TENANT_ID, 'pipeline-processor', {
	TABLE_NAME: 'configTableName',
	BUCKET_PREFIX: 'bucketPrefix',
	ACTIVITIES_PIPELINE_JOB_STATE_MACHINE_ARN: 'activityPipelineStateMachineArn',
	DATA_PIPELINE_JOB_STATE_MACHINE_ARN: 'dataPipelineStateMachineArn',
	METRICS_TABLE_NAME: 'metricsTableName',
	TASK_QUEUE_URL: 'taskQueueUrl',
});

await getTenantValues(TENANT_ID, 'pipelineProcessorsV2', {
	WORKER_QUEUE_URL: 'workerQueueUrl',
});

fs.writeFileSync('.env', outputFile);
