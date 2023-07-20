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

import pino from 'pino';
import { LambdaClient } from '@aws-sdk/client-lambda';
import { DataTable, Given, Then, When } from '@cucumber/cucumber';
import { Invoker, LambdaApiGatewayEventBuilder } from '@sif/lambda-invoker';
import { getAuthToken } from '../support/util.js';
import assert, { fail } from 'assert';
import axios from 'axios';
import fs from 'fs';
import FormData from 'form-data';
import { JSONPath } from 'jsonpath-plus';

global.jwts = {};
global.localUserClaims = {
	integrationtests: '/|||admin',
};

const evaluateJsonPath = function(path: string, content: any) {
	const contentJson = JSON.parse(content);
	const evalResult = JSONPath({ path, json: contentJson });
	return (evalResult.length > 0) ? evalResult[0] : null;
};

Given(/^I authenticate using email (.*) and password (.*)$/, async function(email: string, password: string) {
	const token = await getAuthToken(email.toLowerCase(), password);
	this['apickli'].setRequestHeader('Authorization', `Bearer ${token}`);
});

Given(/^Using tenant (.*) I authenticate with email (.*) and password (.*)$/, async function(sharedTenantId: string, email: string, password: string) {
	const token = await getAuthToken(email.toLowerCase(), password, sharedTenantId);
	this['apickli'].setRequestHeader('Authorization', `Bearer ${token}`);
});

Given(/^(.*) should be unauthorized in group (.*)$/, async function(email: string, group: string) {
	const token = global.jwts[email.toLowerCase()];
	assert.equal(token, 'NotAuthorizedException');
});

Given(/^I store the environment variable (.*) as (.*) in global scope$/, async function(variableName, variable) {
	this['apickli'].setGlobalVariable(variable, process.env[variableName]);
});

Given(/^I set form data to$/, async function(table: DataTable) {
	this.apickli.removeRequestHeader('Content-Type');
	this.apickli.addRequestHeader('Content-Type', 'multipart/form-data');
	const formData = new FormData();
	table.hashes().forEach((o) => {
		let formValue;
		const { name, value, type } = o;
		switch (type) {
			case 'text/csv':
				formValue = fs.readFileSync(value);
				break;
			case 'application/json':
				formValue = JSON.stringify(JSON.parse(o['value']));
				break;
			default:
				formValue = o['value'];
				break;
		}
		formData.append(name, formValue, type ? { contentType: type } : undefined);
	});
	this.apickli.httpRequestOptions.formData = formData;
});

Given(/^I clear authorization token for email (.*)$/, async function(email: string) {
	delete global.jwts[email.toLowerCase()];
	this['apickli'].removeRequestHeader('Authorization');
});

When(/^Using axios I POST to (.*)$/, async function(resource) {
	await this['apickli'].sendWithAxios('post', resource);
});

When(/^Using axios I PATCH (.*)$/, async function(resource) {
	await this['apickli'].sendWithAxios('patch', resource);
});

Then(/^I save cognito group (.*) for user (.*)$/, async function(cognitoGroup: string, email: string) {
	global.localUserClaims[email.toLowerCase()] = cognitoGroup;
});

Given(/^group (.*) has user (.*) with role (.*) and password (.*)$/, async function(groupId: string, email: string, role: string, password: string) {
	await createUser(groupId, email, role, password);
});

Given(/^tenant (.*) group (.*) has user (.*) with role (.*) and password (.*)$/, async function(sharedTenantId: string, groupId: string, email: string, role: string, password: string) {
	await createUser(groupId, email, role, password, true, sharedTenantId);
});

Given(/^group (.*) has user (.*) granted access with role (.*)$/, async function(groupId: string, email: string, role: string) {
	await createUser(groupId, email, role, undefined, false);
});

Given(/^group (.*) has user (.*) revoked$/, async function(groupId: string, email: string) {
	await deleteUser(groupId, email);
});

Given(/^group (.*) has user (.*) revoked in tenant (.*)$/, async function(groupId: string, email: string, sharedTenantId: string) {
	await deleteUser(groupId, email, sharedTenantId);
});

Given(/^group (.*) exists$/, async function(groupId: string) {
	await createGroup(groupId);
});

Given(/^group (.*) exists in tenant (.*)$/, async function(groupId: string, sharedTenantId: string) {
	await createGroup(groupId, sharedTenantId);
});

Given(/^group (.*) has been removed$/, async function(groupId: string) {
	await deleteGroup(groupId);
});

Given(/^group (.*) has been removed from tenant (.*)$/, async function(groupId: string, sharedTenantId: string) {
	await deleteGroup(groupId, sharedTenantId);
});

When(/^I'm using the (.*) api$/, async function(module: string) {
	this['apickli'] = global.apicklis[module];
});

When(/^I remove header (.*)$/, async function(header: string) {
	this['apickli'].removeRequestHeader(header);
});

When('I pause for {int}ms', { timeout: -1 }, async function(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
});

When(/^I upload an input CSV file to url stored at global variable (.*) with rows$/, async function(urlVariable: string, table: DataTable) {
	const url = this['apickli'].getGlobalVariable(urlVariable);

	let csvString: string = '';
	table.raw().forEach((r) => {
		csvString += `${r.join(',')}\r\n`;
	});

	const blob = Buffer.from(csvString);

	try {
		const response = await axios.put(url, blob, {
			headers: {
				'Content-Type': 'text/csv',
			},
		});
		assert.equal(response.status, 200);
	} catch (e) {
		console.error(e);
		throw new Error('Failed uploading input file to S3');
	}
});

When(/^I download the output CSV file from the url stored at global variable (.*) it will match rows$/, async function(urlVariable: string, table: DataTable) {
	const url = this['apickli'].getGlobalVariable(urlVariable);

	try {
		const response = await axios.get(url, {
			headers: {
				'Content-Type': 'text/csv',
			},
		});
		assert.equal(response.status, 200);
		const csvString: string = response.data as string;
		const csvRows = csvString.split(/\r*\n/);

		for (let rn = 0; rn < table.raw().length; ++rn) {
			assert.equal(csvRows[rn], table.raw()[rn].join(','));
		}
	} catch (e) {
		console.error(e);
		throw new Error('Failed validating output file from S3');
	}
});

When(/^I download the output audit file from the url stored at global variable (.*) it will match rows$/, async function(urlVariable: string, table: DataTable) {
	const url = this['apickli'].getGlobalVariable(urlVariable);
	try {
		const response = await axios.get(url, {
			headers: {
				'Content-Type': 'text/plain'
			}
		});
		assert.equal(response.status, 200);

		const textString: string = response.data as string;
		const textRows = textString.split(/\r*\n/);

		for (let rn = 0; rn < table.raw().length; ++rn) {
			const dataRow = this['apickli'].replaceVariables(table.raw()[rn][0]);
			assert.equal(JSON.stringify(JSON.parse(textRows[rn])), JSON.stringify(JSON.parse(dataRow)));
		}
	} catch (e) {
		console.error(e);
		throw new Error('Failed validating output file from S3');
	}
});

When(/^I download the output text file from the url stored at global variable (.*) it will match rows$/, async function(urlVariable: string, table: DataTable) {
	const url = this['apickli'].getGlobalVariable(urlVariable);

	try {
		const response = await axios.get(url, {
			headers: {
				'Content-Type': 'text/plain',
			},
		});
		assert.equal(response.status, 200);

		const textString: string = response.data as string;
		const textRows = textString.split(/\r*\n/);

		for (let rn = 0; rn < table.raw().length; ++rn) {
			assert.equal(textRows[rn], table.raw()[rn]);
		}
	} catch (e) {
		console.error(e);
		throw new Error('Failed validating output file from S3');
	}
});

Then(/^response body path (.*) should match stringified json (.*)$/, function(path, value) {
	path = this.apickli.replaceVariables(path);
	value = JSON.parse(this.apickli.replaceVariables(value));
	const evalValue = evaluateJsonPath(path, this.apickli.getResponseObject().body);
	assert.equal(evalValue, value);
});

function getAccessManagementInvoker(): Invoker {
	if (global.accessManagementInvoker === undefined) {
		const lamdbaClient = new LambdaClient({ region: process.env.AWS_REGION as string });
		global.accessManagementInvoker = new Invoker(pino(), lamdbaClient);
	}
	return global.accessManagementInvoker;
}

async function createUser(groupId: string, email: string, role: string, password: string | undefined, setGroupAsDefault = true, sharedTenantId?: string): Promise<void> {
	if (!process.env.ACCESS_MANAGEMENT_FUNCTION_NAME) {
		fail('Environment Variable: ACCESS_MANAGEMENT_FUNCTION_NAME undefined');
	}

	groupId = groupId.toLowerCase();
	email = email.toLowerCase();

	const cognitoGroup = `${groupId}|||${role}`;

	if (process.env.NODE_ENV === 'local' && !global.forceCognitoUsage) {
		global.localUserClaims[email] = cognitoGroup;
	} else {
		const invoker = getAccessManagementInvoker();
		const token = await getAuthToken('integrationtests');

		const payload: {
			email: string;
			role: string;
			password?: string;
			defaultGroup?: string;
		} = {
			email,
			role,
			password,
		};

		if (setGroupAsDefault) {
			payload.defaultGroup = groupId;
		}

		const event = new LambdaApiGatewayEventBuilder()
			.setMethod('POST')
			.setPath('/users')
			.setHeaders({
				Accept: 'application/json',
				'Accept-Version': '1.0.0',
				'Content-Type': 'application/json',
				'x-groupcontextid': `${groupId}`,
				Authorization: `Bearer ${token}`,
			})
			.setBody(payload)
			.setRequestContext({
				authorizer: {
					claims: {
						email: 'integrationtests',
						'cognito:groups': '/|||admin',
						groupContextId: groupId,
					},
				},
			});

		let accessManagementFunctionName: string;
		sharedTenantId ? (accessManagementFunctionName = process.env.SHARED_TENANT_ACCESS_MANAGEMENT_FUNCTION_NAME as string) : (accessManagementFunctionName = process.env.ACCESS_MANAGEMENT_FUNCTION_NAME as string);
		await invoker.invoke(accessManagementFunctionName, event);
	}
}

async function deleteUser(groupId: string, email: string, sharedTenantId?: string): Promise<void> {
	groupId = groupId.toLowerCase();
	email = email.toLowerCase();

	if (process.env.NODE_ENV === 'local' && !global.forceCognitoUsage) {
		delete global.localUserClaims[email];
	} else {
		const invoker = getAccessManagementInvoker();
		const token = await getAuthToken('integrationtests');
		const event = new LambdaApiGatewayEventBuilder()
			.setMethod('DELETE')
			.setPath(`/users/${email}`)
			.setHeaders({
				Accept: 'application/json',
				'Accept-Version': '1.0.0',
				'x-groupcontextid': `${groupId}`,
				Authorization: `Bearer ${token}`,
			})
			.setRequestContext({
				authorizer: {
					claims: {
						email: 'integrationtests',
						'cognito:groups': `/|||admin`,
						groupContextId: groupId,
					},
				},
			});

		let accessManagementFunctionName: string;
		sharedTenantId ? (accessManagementFunctionName = process.env.SHARED_TENANT_ACCESS_MANAGEMENT_FUNCTION_NAME as string) : (accessManagementFunctionName = process.env.ACCESS_MANAGEMENT_FUNCTION_NAME as string);

		await invoker.invoke(accessManagementFunctionName, event);
	}
}

async function createGroup(groupId: string, sharedTenantId?: string): Promise<void> {
	groupId = groupId.toLowerCase();
	let groupContextId = groupId.substring(0, groupId.lastIndexOf('/'));
	if (groupContextId.length === 0) {
		groupContextId = '/';
	}
	const groupName = groupId.substring(groupId.lastIndexOf('/') + 1);
	const cognitoGroup = `${groupContextId}|||admin`;

	const invoker = getAccessManagementInvoker();
	const token = await getAuthToken('integrationtests');
	const event = new LambdaApiGatewayEventBuilder()
		.setMethod('POST')
		.setPath('/groups')
		.setHeaders({
			Accept: 'application/json',
			'Accept-Version': '1.0.0',
			'Content-Type': 'application/json',
			'x-groupcontextid': `${groupContextId}`,
			Authorization: `Bearer ${token}`,
		})
		.setBody({
			name: groupName,
		})
		.setRequestContext({
			authorizer: {
				claims: {
					email: 'integrationtests',
					'cognito:groups': cognitoGroup,
					groupContextId: groupContextId,
				},
			},
		});

	let accessManagementFunctionName: string;
	sharedTenantId ? (accessManagementFunctionName = process.env.SHARED_TENANT_ACCESS_MANAGEMENT_FUNCTION_NAME as string) : (accessManagementFunctionName = process.env.ACCESS_MANAGEMENT_FUNCTION_NAME as string);

	await invoker.invoke(accessManagementFunctionName, event);
}

async function deleteGroup(groupId: string, sharedTenantId?: string): Promise<void> {
	groupId = groupId.toLowerCase();
	let groupContextId = groupId.substring(0, groupId.lastIndexOf('/'));
	if (groupContextId === '') {
		groupContextId = '/';
	}
	const cognitoGroup = `${groupContextId}|||admin`;

	const invoker = getAccessManagementInvoker();
	const token = await getAuthToken('integrationtests');

	// 1st, disable group
	const disableEvent = new LambdaApiGatewayEventBuilder()
		.setMethod('PATCH')
		.setPath(`/groups/${encodeURIComponent(groupId)}`)
		.setHeaders({
			Accept: 'application/json',
			'Accept-Version': '1.0.0',
			'Content-Type': 'application/json',
			'x-groupcontextid': `${groupContextId}`,
			Authorization: `Bearer ${token}`,
		})
		.setBody({
			state: 'disabled',
		})
		.setRequestContext({
			authorizer: {
				claims: {
					email: 'integrationtests',
					'cognito:groups': cognitoGroup,
					groupContextId: groupContextId,
				},
			},
		});

	let accessManagementFunctionName: string;
	sharedTenantId ? (accessManagementFunctionName = process.env.SHARED_TENANT_ACCESS_MANAGEMENT_FUNCTION_NAME as string) : (accessManagementFunctionName = process.env.ACCESS_MANAGEMENT_FUNCTION_NAME as string);

	await invoker.invoke(accessManagementFunctionName, disableEvent);

	// 2nd, delete group
	const deleteEvent = new LambdaApiGatewayEventBuilder()
		.setMethod('DELETE')
		.setPath(`/groups/${encodeURIComponent(groupId)}`)
		.setHeaders({
			Accept: 'application/json',
			'Accept-Version': '1.0.0',
			'x-groupcontextid': `${groupContextId}`,
			Authorization: `Bearer ${token}`,
		})
		.setRequestContext({
			authorizer: {
				claims: {
					email: 'integrationtests',
					'cognito:groups': cognitoGroup,
					groupContextId: groupContextId,
				},
			},
		});

	await invoker.invoke(accessManagementFunctionName, deleteEvent);
}


