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
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';

const { ENVIRONMENT, AWS_REGION } = process.env;

const ssm = new SSMClient({ region: process.env['AWS_REGION'] });

const getSharedEnvironmentValues = async (module: string, mapping: Record<string, string>) => {
	for (const key in mapping) {
		const prefix = `/sif/shared/${ENVIRONMENT}/${module}/`;
		const name = `${prefix}${mapping[key]}`;
		try {
			const response = await ssm.send(
				new GetParameterCommand({
					Name: name,
					WithDecryption: false
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

if (!ENVIRONMENT || !AWS_REGION) {
	throw new Error(`Environment Variable TENANT_ID or ENVIRONMENT or AWS_REGION is not being specified`);
}

let outputFile = `NODE_ENV=local\r\n`;
outputFile += `CLUSTER_IDENTIFIER=sif-${ENVIRONMENT}-aurora-cluster\r\n`;
outputFile += `RESOURCE_STATUS_PARAMETER_PREFIX=/sif/shared/${ENVIRONMENT}\r\n`;

await getSharedEnvironmentValues('semaphore', {
	EVENT_BUS_NAME: 'eventBusName'
});

fs.writeFileSync('.env', outputFile);
