#!/usr/bin/env node
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
import { authorizeUser, getUrl, PostmanEnvironmentVariable } from './util';
import fs from 'fs';

if (require.main === module) {
	(async () => {
		const [tenantId, environment, groupContext, username, password, newPassword] = process.argv.slice(2);

		if (process.argv.length < 7) {
			throw new Error('Missing arguments\r\nHow to run the command: \r\n> npm run generate:postman:environment -- <tenantId> <environment> <username> <password> <newPassword>');
		}

		process.env['COGNITO_CLIENT_ID'] = (await getUrl(`/sif/${tenantId}/${environment}/shared/userPoolClientId`, '')).value;
		process.env['COGNITO_USER_POOL_ID'] = (await getUrl(`/sif/${tenantId}/${environment}/shared/userPoolId`, '')).value;

		global.jwts = {};

		// Get the url for the api endpoints
		const accessManagementUrlPath = `/sif/${tenantId}/${environment}/accessManagement/apiUrl`;
		const impactsUrlPath = `/sif/${tenantId}/${environment}/impacts/apiUrl`;
		const calculationsUrlPath = `/sif/${tenantId}/${environment}/calculations/apiUrl`;
		const pipelinesUrlPath = `/sif/${tenantId}/${environment}/pipelines/apiUrl`;
		const pipelineProcessorsUrlPath = `/sif/${tenantId}/${environment}/pipeline-processor/apiUrl`;
		const referenceDatasetsUrlPath = `/sif/${tenantId}/${environment}/referenceDatasets/apiUrl`;

		const apiEndpoints = await Promise.all([
			getUrl(accessManagementUrlPath, 'access_management_base_url'),
			getUrl(impactsUrlPath, 'impacts_base_url'),
			getUrl(calculationsUrlPath, 'calculations_base_url'),
			getUrl(pipelinesUrlPath, 'pipelines_base_url'),
			getUrl(pipelineProcessorsUrlPath, 'pipeline_executions_base_url'),
			getUrl(referenceDatasetsUrlPath, 'referencedatasets_base_url'),
		]);
		for (const api of apiEndpoints) {
			if (api.value?.endsWith('/')) {
				api.value = api.value.slice(0, -1);
			}
		}

		const postmanEnvironment: PostmanEnvironment = {
			name: `SIF Core (${tenantId} - ${environment})`,
			values: [],
		};
		postmanEnvironment.values.push(...apiEndpoints);

		// Other referenced variables within the postman collection
		const token = await authorizeUser(username, password, newPassword);
		const otherVariables = {
			group_context_id: groupContext,
			access_management_version: '1.0.0',
			impacts_version: '1.0.0',
			calculations_version: '1.0.0',
			pipeline_processor_version: '1.0.0',
			pipelines_version: '1.0.0',
			reference_datasets_version: '1.0.0',
			pipeline_results_version: '1.0.0',
			content_type: 'application/json',
			authorization_token: token,
		};
		for (const [key, value] of Object.entries(otherVariables)) {
			postmanEnvironment.values.push({ key, value, type: 'default', enabled: true });
		}

		const environmentFilename = `sif_core.${tenantId}.${environment}.postman_environment.json`;
		fs.writeFileSync(environmentFilename, JSON.stringify(postmanEnvironment, null, 2));
	})().catch((e) => console.log(e));
}

interface PostmanEnvironment {
	name: string;
	values: PostmanEnvironmentVariable[];
}
