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

import { DataTable, Then, When } from '@cucumber/cucumber';
import assert, { fail } from 'assert';
import axios from 'axios';
import fs from 'fs';
import { createApi } from '../support/util.js';

global.localUserClaims = {
	integrationtests: '/|||admin',
};

async function clonePipelineProcessorsApi() {
	const nodeEnv = process.env.NODE_ENV as string;
	const endpoint = await createApi(nodeEnv, process.env.PIPELINE_PROCESSOR_BASE_URL as string, {});
	endpoint.removeRequestHeader('x-groupcontextid');
	endpoint.removeRequestHeader('Authorization');
	endpoint.addRequestHeader('Authorization', global.apicklis['pipelineProcessor'].headers['Authorization']);
	endpoint.addRequestHeader('x-groupcontextid', global.apicklis['pipelineProcessor'].headers['x-groupcontextid']);
	return endpoint;
}

Then(/^no aggregation jobs exist$/, async function() {
	const pipelineProcessorsUrl = `aggregations`;
	await this['apickli'].sendWithAxios('GET', pipelineProcessorsUrl);
	if (this['apickli'].httpResponse?.statusCode !== 404) {
		const { jobs } = JSON.parse(this['apickli'].httpResponse.body);
		for (const { id } of jobs) {
			const endpoint = await clonePipelineProcessorsApi();
			endpoint.removeRequestHeader('Content-Type');
			await endpoint.sendWithAxios('DELETE', `aggregations/${id}`);
			const statusCode = endpoint?.httpResponse?.statusCode ?? 0;
			if (statusCode !== 204 && statusCode !== 404) {
				fail(`Invalid response code ${statusCode} for ${pipelineProcessorsUrl}`);
			}
		}
	}
});

Then(/^the latest execution status should be (.*)$/, async function(status: string) {
	const latestResponseBody = JSON.parse(this['apickli'].getResponseObject().body);

	const sortedExecutions = latestResponseBody.executions.sort((e1: any, e2: any) => {
		return Date.parse(e2.createdAt) - Date.parse(e1.createdAt);
	});

	assert.equal(sortedExecutions[0].status, status);
});

Then(/^I store the id of the latest execution in variable (.*) in global scope$/, async function(executionIdVariable: string) {
	const latestResponseBody = JSON.parse(this['apickli'].getResponseObject().body);

	const sortedExecutions = latestResponseBody.executions.sort((e1: any, e2: any) => {
		return Date.parse(e2.createdAt) - Date.parse(e1.createdAt);
	});

	this['apickli'].setGlobalVariable(executionIdVariable, sortedExecutions[0].id);
});

const executePipelineWithContent = async (blob: string | Buffer, groupsIdsArray: string[], pipelineId: string) => {
	const createExecutionUrlsFutures = groupsIdsArray.map(async (groupId: string) => {
		const endpoint = await clonePipelineProcessorsApi();
		endpoint.removeRequestHeader('x-groupcontextid');
		endpoint.addRequestHeader('x-groupcontextid', groupId);
		endpoint.setRequestBody(JSON.stringify({ 'expiration': 300 }));
		await endpoint.sendWithAxios('POST', `pipelines/${pipelineId}/executions`);
		return JSON.parse(endpoint.httpResponse.body).inputUploadUrl;
	});

	const uploadUrls = await Promise.all(createExecutionUrlsFutures);

	const uploads = uploadUrls.map(async (url) => {
		try {
			const response = await axios.put(url, blob, {
				headers: {
					'Content-Type': 'text/csv',
				},
			});
			assert.equal(response.status, 200);
		} catch (e) {
			console.log(`error: ${e}`);
			fail('Failed uploading input file to S3');
		}
	});
	await Promise.all(uploads);
};

When(/^I upload to pipeline (.*) across groups (.*) concurrently with this file (.*)$/, async function(pipelineId: string, groupsIds: string, fileLocation: string) {
	const groupsIdsArray = groupsIds.split(',');
	const blob = fs.readFileSync(fileLocation, 'utf-8');
	await executePipelineWithContent(blob, groupsIdsArray, pipelineId);
});

When(/^I upload to pipeline (.*) across groups (.*) concurrently with these rows$/, async function(pipelineId: string, groupsIds: string, table: DataTable) {
	const groupsIdsArray = groupsIds.split(',');
	let csvString: string = '';
	table.raw().forEach((r) => {
		csvString += `${r.join(',')}\r\n`;
	});
	const blob = Buffer.from(csvString);
	await executePipelineWithContent(blob, groupsIdsArray, pipelineId);
});

When(/^I upload pipeline execution concurrently using this urls$/, async function(table: DataTable) {
	const uploadFutures = table.rows().map((r) => {
		console.log(`\n***** uploading ${r[1]}\n`);
		const url = this['apickli'].replaceVariables(r[0]);
		const location = r[1];
		return uploadFileToUrl(url, location);
	});
	await Promise.all(uploadFutures);
	console.log(`\n***** finished uploading\n`);
});

When(/^Using directory stored at global variable (.*), I upload pipeline execution concurrently using this urls$/, async function(directoryVariable: string, table: DataTable) {
	const directory = this['apickli'].getGlobalVariable(directoryVariable);
	const uploadFutures = table.rows().map((r) => {
		console.log(`\n***** uploading ${r[1]}\n`);
		const url = this['apickli'].replaceVariables(r[0]);
		const location = `${directory}/${r[1]}`;
		return uploadFileToUrl(url, location);
	});
	await Promise.all(uploadFutures);
	console.log(`\n***** finished uploading\n`);
});

Then(/^I wait until pipeline executions are complete with (.*)s timeout$/, { timeout: -1 }, async function(timeout: number, table: DataTable) {

	const checkStatus = async (): Promise<boolean> => {
		const futures = table.rows().map(async (r) => {
			const nodeEnv = process.env.NODE_ENV as string;
			const endpoint = await createApi(nodeEnv, process.env.PIPELINE_PROCESSOR_BASE_URL as string, {});

			const groupId = endpoint.replaceVariables(r[0]);
			const pipelineId = endpoint.replaceVariables(r[1]);
			const executionId = endpoint.replaceVariables(r[2]);

			endpoint.removeRequestHeader('x-groupcontextid');
			endpoint.addRequestHeader('x-groupcontextid', groupId);
			endpoint.removeRequestHeader('Authorization');
			endpoint.addRequestHeader('Authorization', global.apicklis['pipelineProcessor'].headers['Authorization']);

			const url = `pipelines/${pipelineId}/executions/${executionId}`;
			console.log(`\n***** retrieving status from url: ${url}`);
			await endpoint.sendWithAxios('GET', url);

			const response = endpoint.httpResponse;
			const statusCode = response?.statusCode ?? 0;

			if (statusCode < 200 || statusCode >= 300) {
				fail(`Invalid response code ${response?.statusCode} for ${url}`);
			}

			const body = JSON.parse(response?.body);

			if (body.status === 'failed') {
				fail(response?.body?.status?.statusMessage);
			}
			console.log(`\n***** pipelineId:${pipelineId}, executionId:${executionId}, status: ${body.status}`);
			return body.status === 'success';
		});
		const allComplete = await Promise.all(futures).then((results) => results.every((r) => r));
		return allComplete;
	};

	const toEndAt = Date.now() + (timeout * 1000);
	console.log(`\n***** setting interval`);
	return new Promise((resolve, reject) => {
		const t = setInterval(async () => {
			if (Date.now() > toEndAt) {
				clearInterval(t);
				reject();
			}
			const allComplete = await checkStatus();
			if (allComplete) {
				console.log(`\n***** all complete!`);
				clearInterval(t);
				resolve(null);
			}
		}, 5000);
	});
});

async function uploadFileToUrl(url: string, fileLocation: string): Promise<void> {
	const data = fs.readFileSync(fileLocation, 'utf-8');
	await axios.put(url, data, {
		headers: {
			'Content-Type': 'text/csv',
		},
	});
}
