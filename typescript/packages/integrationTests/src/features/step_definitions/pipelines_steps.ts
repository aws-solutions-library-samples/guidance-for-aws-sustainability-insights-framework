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


import { Then, When } from '@cucumber/cucumber';
import assert, { fail } from 'assert';
import { createApi } from '../support/util';

async function cloneExistingApi(resourceName: string, baseUrl: string) {
	const nodeEnv = process.env.NODE_ENV as string;
	const endpoint = await createApi(nodeEnv, baseUrl, {});
	endpoint.removeRequestHeader('x-groupcontextid');
	endpoint.removeRequestHeader('Authorization');
	endpoint.addRequestHeader('Authorization', global.apicklis[resourceName].headers['Authorization']);
	endpoint.addRequestHeader('x-groupcontextid', global.apicklis[resourceName].headers['x-groupcontextid']);
	return endpoint;
}

async function clonePipelineApi() {
	return (await cloneExistingApi('pipelines', process.env.PIPELINES_BASE_URL as string));
}

async function cloneImpactsApi() {
	return (await cloneExistingApi('impacts', process.env.IMPACTS_BASE_URL as string));
}

When(/^I create (.*) metrics with prefix (.*) and tags (.*)$/, async function(numOfMetrics: string, prefix: string, tags: string) {

	const [tagKey, tagValue] = tags.split(':');
	const url = `metrics`;

	await Promise.all([...Array(parseInt(numOfMetrics)).keys()].map(async (k) => {
		const endpoint = await clonePipelineApi();
		const identifier = k + 1;
		endpoint.setRequestBody(
			JSON.stringify(
				{
					'name': `${prefix}${identifier}`,
					'summary': `Metric${identifier}`,
					'aggregationType': 'sum',
					tags: {
						[tagKey]: tagValue
					}
				}
			));

		await endpoint.sendWithAxios('POST', url);

		const response = endpoint.httpResponse;
		const statusCode = response?.statusCode ?? 0;

		if (statusCode < 200 || statusCode >= 300) {
			fail(`Invalid response code ${response?.statusCode} for ${url}`);
		}

		return response;
	}));
});

Then(/^no metric exists with tags (.*)$/, async function(tags: string) {

	const getMetrics = async (): Promise<void> => {
		const url = `metrics?tags=${encodeURIComponent(tags)}&count=50&includeParentGroups=true&includeChildGroups=true`;
		await this['apickli'].sendWithAxios('GET', url);
		const { metrics } = JSON.parse(this['apickli'].httpResponse.body);
		return metrics;
	};

	const deleteFunction = async (metrics: any): Promise<void> => {

		const deleteMetricsFutures = metrics?.map(async (m: any) => {
			const endpoint = await clonePipelineApi();
			endpoint.removeRequestHeader('Content-Type');
			await endpoint.sendWithAxios('DELETE', `metrics/${m.id}`);
		});
		await Promise.all(deleteMetricsFutures);
	};

	// may need to loop a few times as metrics with dependencies on other metrics cannot be deleted without dependencies removed
	for (let i = 0; i < 3; i++) {
		await deleteFunction(await getMetrics());
	}
});

Then(/^no activities exists with tags (.*)$/, async function(tags: string) {
	const url = `activities?tags=${tags}&count=50&includeChildGroups=true&includeParentGroups=true`;
	await this['apickli'].sendWithAxios('GET', url);
	const { activities } = JSON.parse(this['apickli'].httpResponse.body);
	for (const { id } of activities) {
		const endpoint = await cloneImpactsApi();
		endpoint.removeRequestHeader('Content-Type');
		await endpoint.sendWithAxios('DELETE', `activities/${id}`);
		const statusCode = endpoint?.httpResponse?.statusCode ?? 0;
		if (statusCode !== 204 && statusCode !== 404) {
			fail(`Invalid response code ${statusCode} for ${url}`);
		}
	}
});

Then(/^no pipeline exists with tags (.*)$/, async function(tags: string) {
	const url = `pipelines?tags=${tags}&count=50&includeChildGroups=true&includeParentGroups=true`;
	await this['apickli'].sendWithAxios('GET', url);
	const { pipelines } = JSON.parse(this['apickli'].httpResponse.body);
	for (const { id } of pipelines) {
		const endpoint = await clonePipelineApi();
		endpoint.removeRequestHeader('Content-Type');
		await endpoint.sendWithAxios('DELETE', `pipelines/${id}`);
		const statusCode = endpoint?.httpResponse?.statusCode ?? 0;
		if (statusCode !== 204 && statusCode !== 404) {
			fail(`Invalid response code ${statusCode} for ${url}`);
		}
	}
});

When(/^I create (.*) pipelines with prefix (.*) and definition (.*) and tags (.*)$/, async function(numOfPipelines: string, prefix: string, createPipelineRequest: string, tags: string) {

	const [tagKey, tagValue] = tags.split(':');
	const url = `pipelines`;

	for (const k of [...Array(parseInt(numOfPipelines)).keys()]) {
		const endpoint = await clonePipelineApi();
		const payload = JSON.parse(createPipelineRequest);
		endpoint.setRequestBody(
			JSON.stringify(
				{
					...payload,
					name: `${prefix}_${k}`,
					tags: {
						[tagKey]: tagValue
					}
				}));

		await endpoint.sendWithAxios('POST', url);

		const response = endpoint.httpResponse;
		const statusCode = response?.statusCode ?? 0;

		if (statusCode < 200 || statusCode >= 300) {
			fail(`Invalid response code ${response?.statusCode} for ${url}`);
		}
	}
});


Then(/^pipelines response should contain pipeline (.*)$/, async function(pipelineIdVariable: string) {
	const pipelinesResponse = JSON.parse(this['apickli'].getResponseObject().body);
	const pipelineId = this['apickli'].getGlobalVariable(pipelineIdVariable);

	const pipelineMatch = pipelinesResponse['pipelines'].filter((p: any) => {
		return p.id === pipelineId;
	});

	assert(pipelineMatch.length === 1);
	assert(pipelineMatch[0].id, pipelineId);
});
