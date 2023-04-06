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

const { TENANT_ID, ENVIRONMENT, AWS_REGION } = process.env;

if (!TENANT_ID || !ENVIRONMENT || !AWS_REGION) {
	throw new Error(`Environment Variable TENANT_ID or ENVIRONMENT or AWS_REGION is not being specified`);
}

const ssm = new SSMClient({ region: process.env['AWS_REGION'] });

const getValues = async (tenantId: string, module: string, mapping: Record<string, string>) => {
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
outputFile += 'ENABLE_DELETE_RESOURCE=true\r\n';

await getValues(TENANT_ID, 'shared', {
	EVENT_BUS_NAME: 'eventBusName',
	BUCKET_NAME: 'bucketName',
	ACTIVITIES_TABLE_NAME: 'activityTable',
	ACTIVITIES_NUMBER_VALUE_TABLE_NAME: 'activityNumberValueTable',
	ACTIVITIES_STRING_VALUE_TABLE_NAME: 'activityStringValueTable',
	ACTIVITIES_BOOLEAN_VALUE_TABLE_NAME: 'activityBooleanValueTable',
	ACTIVITIES_DATETIME_VALUE_TABLE_NAME: 'activityDateTimeValueTable',
});

await getValues(TENANT_ID, 'accessManagement', {
	ACCESS_MANAGEMENT_FUNCTION_NAME: 'apiFunctionName',
});

await getValues(TENANT_ID, 'pipelines', {
	PIPELINES_FUNCTION_NAME: 'apiFunctionName',
});

await getValues(TENANT_ID, 'calculator', {
	CALCULATOR_FUNCTION_NAME: 'functionName',
});

await getValues(TENANT_ID, 'pipeline-processor', {
	TABLE_NAME: 'configTableName',
	BUCKET_PREFIX: 'bucketPrefix',
	PIPELINE_JOB_STATE_MACHINE_ARN: 'workflowStateMachineArn',
	PIPELINE_INLINE_STATE_MACHINE_ARN: 'inlineStateMachineArn',
	METRICS_TABLE_NAME: 'metricsTableName',
});

fs.writeFileSync('.env', outputFile);
