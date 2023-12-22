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

import { Given, Then } from '@cucumber/cucumber';
import { getCloudformationStackStatus, streamData, uploadToS3 } from '../support/util';
import fs from 'fs';
import path from 'path';
import assert from 'assert';

Given(/^I upload cloudformation template from (.*) to (.*)$/, async function(sourceFile: string, s3Destination: string) {
	try {
		/*
		* semgrep issue https://sg.run/l2lo
		* Ignore reason: there is no risk of path traversal vulnerability in this context
		*/
		// nosemgrep
		const sourcePath = path.join(__dirname, '../../..', sourceFile);
		const buffer = await fs.readFileSync(sourcePath, 'utf-8');
		const resp = await uploadToS3(s3Destination, buffer);
		assert.equal(resp.$metadata.httpStatusCode, 200);
		console.log(`\n ******* Finished uploading cloudformation template to S3`);
	} catch (e) {
		console.error(e);
		throw new Error('Failed uploading input file to S3');
	}
});


Given(/^I upload handlebars template (.*) for global variable (.*)$/, async function(template: string, pipelineIdVariable: string) {
	const pipelineId = this['apickli'].getGlobalVariable(pipelineIdVariable);
	try {
		const resp = await uploadToS3(`pipelines/${pipelineId}/template.hbs`, template);
		assert.equal(resp.$metadata.httpStatusCode, 200);
		console.log(`\n ******* Finished uploading handlebars template to S3`);
	} catch (e) {
		console.error(e);
		throw new Error('Failed uploading input file to S3');
	}
});
Then(/^I wait until cloudformation stack for pipeline (.*) status (.*) with (.*)s timeout$/, { timeout: -1 }, async function(pipelineId: string, expectedStatus: string, timeout: number) {
	pipelineId = this['apickli'].replaceVariables(pipelineId);
	const stackName = `sif-${process.env.TENANT_ID}-${process.env.ENVIRONMENT}-kinesis-${pipelineId}`;
	const toEndAt = Date.now() + (timeout * 1000);
	console.log(`\n***** setting interval`);
	return new Promise((resolve, reject) => {
		const t = setInterval(async () => {
			if (Date.now() > toEndAt) {
				clearInterval(t);
				reject('timeout when waiting for platform resource state update');
			}

			let matchExpectedStatus = false;
			try {
				const resp = await getCloudformationStackStatus(stackName);
				matchExpectedStatus = expectedStatus === resp.Stacks[0].StackStatus;
			} catch (e) {
				if (expectedStatus === 'DELETE_COMPLETE' && e.message === `Stack with id ${stackName} does not exist`) {
					matchExpectedStatus = true;
				}
				if (!matchExpectedStatus) {
					throw new Error('Failed to get cloudformation stack status');
				}
			}

			if (matchExpectedStatus) {
				console.log(`\n***** all complete!`);
				clearInterval(t);
				resolve(null);
			}
		}, 5000);
	});
});

Given(/^I stream data for pipeline (.*) from (.*)$/, async function(pipelineId: string, data: any) {
	pipelineId = this['apickli'].replaceVariables(pipelineId);
	const streamName = `sif-${process.env.TENANT_ID}-${process.env.ENVIRONMENT}-connectors-kinesis-${pipelineId}`;
	try {
		await streamData(streamName, JSON.parse(data), 1);
	} catch (e) {
		console.error(e);
		throw new Error('Failed to stream the data');
	}
});
