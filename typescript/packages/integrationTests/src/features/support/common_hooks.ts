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

import { Before, setDefaultTimeout } from '@cucumber/cucumber';
import { createApi } from './util.js';
import apickli from 'apickli';
import axios from 'axios';

setDefaultTimeout(120 * 1000);

apickli.Apickli.prototype.sendWithAxios = async function (method: any, resource: any) {
	const self = this;
	const options = this.httpRequestOptions || {};
	resource = this.replaceVariables(resource);
	options.url = this.domain + resource;
	options.method = method;
	options.headers = this.headers;
	options.qs = this.queryParameters;

	if (this.requestBody.length > 0) {
		options.body = this.requestBody;
	} else if (Object.keys(this.formParameters).length > 0) {
		options.form = this.formParameters;
	}

	if (options.formData) {
		options.data = options.formData;
		options.headers = {
			...options.headers,
			...options.formData.getHeaders(),
		};
	}

	try {
		const response = await axios.request(options);
		self.httpResponse = {
			statusCode: response.status,
			body: JSON.stringify(response.data),
			headers: response.headers,
		};
	} catch (error: any) {
		self.httpResponse = {
			statusCode: error?.response?.status,
			headers: error?.response?.headers,
		};
	}
};

Before({ tags: '@setup_common' }, async function () {
	/**
	 * 	TODO: Ideally we should create the required users using the access management module, then use them here
	 * 	Currently it will use the admin user which is created at the time of deployment. That user should be confirmed before
	 * 	running the tests. This probably needs changing and users should really be created here using the access management module
	 * 	and then referenced in the scenarios. The created user would require to go through the cognito change password flow and
	 * 	storing the password in SSM or may be changing the password everytime the test runs.
	 */

	const nodeEnv = process.env.NODE_ENV as string;
	global.apicklis = {
		accessManagement: await createApi(nodeEnv, process.env.ACCESS_MANAGEMENT_BASE_URL as string, {}),
		impacts: await createApi(nodeEnv, process.env.impacts_BASE_URL as string, {}),
		calculations: await createApi(nodeEnv, process.env.CALCULATIONS_BASE_URL as string, {}),
		// pipelineProcessor: await createApi(nodeEnv, process.env.PIPELINE_PROCESSOR_BASE_URL as string, {}) ,
		pipelines: await createApi(nodeEnv, process.env.PIPELINES_BASE_URL as string, {}),
		referenceDatasets: await createApi(nodeEnv, process.env.REFERENCE_DATASETS_BASE_URL as string, {}),
	};
});
