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
import { authorizeUser} from './util';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import * as fg from 'fast-glob';
import axios from 'axios';
import fs from 'fs';

enum ResourceType {
	Group = 'groups',
	User = 'users',
	Impact = 'impacts',
	Calculation = 'calculations',
	Pipeline = 'pipelines',
	ReferenceDataset = 'referenceDatasets',
	Metric = 'metrics'
}

enum SortType {
	Root = 'root',		// sort root to leaves
	Leaves = 'leaves'	// sort leaves to root
}

enum MetricSortType {
	Outgoing = 'out',	// sort with no dependencies to dependent (root or no dependencies first)
	Incoming = 'in'		// sort with dependent to no dependencies (leaf or dependent first)
}

interface SeedEntry {
	resourceType: ResourceType,
	resourceName: string;
	groupContext: string;
	filePath: string;
}

interface MetricEntry {
	se: SeedEntry;
	definition: string;
}

interface ApiResponse {
	status: number;
	response: string;
}

async function cognitoInit(tenantId: string, environment: string): Promise<void> {
	global.jwts = {};
	process.env.COGNITO_CLIENT_ID = (await getSSMParameter(`/sif/${tenantId}/${environment}/shared/userPoolClientId`, '')).value;
	process.env.COGNITO_USER_POOL_ID = (await getSSMParameter(`/sif/${tenantId}/${environment}/shared/userPoolId`, '')).value;
}

async function getSSMParameter(path: string, context: string): Promise<{context: string, value:string}> {
	const ssm = new SSMClient({});
	const response = await ssm.send(
		new GetParameterCommand({
			Name: path,
		})
	);
	return {
		context,
		value: response.Parameter?.Value as string
	};
}

async function getApiEndpoints(tenantId: string, environment: string): Promise<{[key: string]: string}> {
	// Get the url for the api endpoints
	const accessManagementUrlPath = `/sif/${tenantId}/${environment}/accessManagement/apiUrl`;
	const impactsUrlPath = `/sif/${tenantId}/${environment}/impacts/apiUrl`;
	const calculationsUrlPath = `/sif/${tenantId}/${environment}/calculations/apiUrl`;
	const pipelinesUrlPath = `/sif/${tenantId}/${environment}/pipelines/apiUrl`;
	const pipelineProcessorsUrlPath = `/sif/${tenantId}/${environment}/pipeline-processor/apiUrl`;
	const referenceDatasetsUrlPath = `/sif/${tenantId}/${environment}/referenceDatasets/apiUrl`;

	const apiEndpointsPromises = await Promise.all([
		getSSMParameter(accessManagementUrlPath, 'accessManagement'),
		getSSMParameter(impactsUrlPath, 'impacts'),
		getSSMParameter(calculationsUrlPath, 'calculations'),
		getSSMParameter(pipelinesUrlPath, 'pipelines'),
		getSSMParameter(pipelineProcessorsUrlPath, 'pipelineProcessor'),
		getSSMParameter(referenceDatasetsUrlPath, 'referenceDatasets'),
	]);

	// const endpoints: ApiEndpoints = apiEndpointsPromises.reduce((obj, item) => {
	// 	obj[item.context] = item.value.endsWith('/') ? item.value.slice(0, -1) : item.value;
	// 	return obj;
	// }, {} as { ApiEndpoints });

	const apiEndpoints: {[key: string]: string} = {};
	apiEndpointsPromises.forEach((e) => {
		const endpoint = e.value.endsWith('/') ? e.value.slice(0, -1) : e.value;
		apiEndpoints[e.context] = endpoint;
	});

	return apiEndpoints;
}

async function listSeedEntries(path: string): Promise<SeedEntry[]> {
	const seedFiles = await fg.default([`**/*.json`], {cwd: path, absolute: false, objectMode: true});

	const seedEntries: SeedEntry[] = seedFiles.map((sf) => {
		return {
			resourceType: sf.path.split('/')[0] as ResourceType,
			resourceName: sf.name.split('.')[0],	// myresource.json --> myresource
			groupContext: groupContext(sf.path),
			filePath: `${path}/${sf.path}`
		};
	});

	return seedEntries;
}

function groupContext(resourcePath: string): string {
	const tokens = resourcePath.split('/');
	return `/${tokens.slice(1,tokens.length-1).join('/')}`;
}

function groupContextLevel(groupContext: string): number {
	const levels = (groupContext.match(/\//g) || []).length;
	if (levels < 1) {
		throw new Error('INVALID GROUP CONTEXT');
	}
	
	return groupContext === '/' ? 0 : levels;
}

function filterAndSortEntries(entryList: SeedEntry[], type: ResourceType, sortType: SortType): SeedEntry[] {
	
	// find seed entries for resource and sort by hierarchy depth
	const filteredEntries = entryList.filter(e => e.resourceType === type);

	if (sortType === SortType.Root) {
		return filteredEntries.sort((a,b) => (groupContextLevel(a.groupContext) - groupContextLevel(b.groupContext)));
	} else {
		return filteredEntries.sort((a,b) => (groupContextLevel(b.groupContext) - groupContextLevel(a.groupContext)));
	}
}

function sortMetricEntriesByDependency(metricEntries: MetricEntry[], sortType: MetricSortType): MetricEntry[] {

	const sortedEntries: MetricEntry[] = [];
	while (sortedEntries.length < metricEntries.length) {
		sortedEntries.push(...findMetricsWithDependenciesFulfilled(metricEntries, sortedEntries));
	}

	return (sortType === MetricSortType.Outgoing ? sortedEntries : sortedEntries.reverse());
}

function findMetricsWithDependenciesFulfilled(metricEntries: MetricEntry[], existingMetrics: MetricEntry[]): MetricEntry[] {

	return metricEntries.filter((me) => {
		const existingMetricNames: string[] = existingMetrics.map((m) => JSON.parse(m.definition).name);

		// don't include this metric if it already exists in the existing array
		if (existingMetricNames.includes(JSON.parse(me.definition).name)) {
			return false;
		}

		// if metric has no output metrics it can be added
		const meJson = JSON.parse(me.definition);
		if ((meJson.outputMetrics?.length ?? 0) === 0) {
			return true;
		}
		
		// if all of the output metrics for this metric are in the existing array then this metric can be added
		return (meJson.outputMetrics.every((om: string) => existingMetricNames.includes(om)));
	});
}

async function delaySec(s: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, s*1000));
}

// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// http - axios
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

async function apiGet(url: string, path: string, groupContext: string, authToken: string): Promise<ApiResponse> {
	try {
		const response = await axios.get(`${url}/${path}`, {
			headers: {
				'Accept-Version': '1.0.0',
				'Content-Type': 'application/json',
				Authorization: `Bearer ${authToken}`,
				'x-groupcontextid': groupContext,
			},
		});

		return {
			status: response.status,
			response: JSON.stringify(response.data)
		};
	} catch (e) {
		if (axios.isAxiosError(e)) {
			if (e.response?.status === 404) {
				return ({status: 404, response: 'NOT_FOUND'});
			} else if (e.response?.status === 409) {
				return ({status: 409, response: 'RESOURCE_EXISTS'});
			}
		}
		
		console.error(e);
		throw new Error('GET API call failed');
	}
}

async function apiPost(url: string, path: string, groupContext: string, authToken: string, data: string): Promise<ApiResponse> {
	try {
		const response = await axios.post(`${url}/${path}`, data, {
			headers: {
				'Accept-Version': '1.0.0',
				'Content-Type': 'application/json',
				Authorization: `Bearer ${authToken}`,
				'x-groupcontextid': groupContext,
			},
		});

		return {
			status: response.status,
			response: JSON.stringify(response.data)
		};
	} catch (e) {
		if (axios.isAxiosError(e)) {
			if (e.response?.status === 409) {
				return ({status: 409, response: 'RESOURCE_EXISTS'});
			}
		}
		
		console.error(e);
		throw new Error('POST API call failed');
	}
}

async function apiPatch(url: string, path: string, groupContext: string, authToken: string, data: string): Promise<ApiResponse> {
	try {
		const response = await axios.patch(`${url}/${path}`, data, {
			headers: {
				'Accept-Version': '1.0.0',
				'Content-Type': 'application/json',
				Authorization: `Bearer ${authToken}`,
				'x-groupcontextid': groupContext,
			},
		});

		return {
			status: response.status,
			response: JSON.stringify(response.data)
		};
	} catch (e) {
		if (axios.isAxiosError(e)) {
			if (e.response?.status === 404) {
				return ({status: 404, response: 'NOT_FOUND'});
			}
		}
		
		console.error(e);
		throw new Error('PATCH API call failed');
	}
}

async function apiDelete(url: string, path: string, groupContext: string, authToken: string): Promise<ApiResponse> {
	try {
		const response = await axios.delete(`${url}/${path}`, {
			headers: {
				'Accept-Version': '1.0.0',
				Authorization: `Bearer ${authToken}`,
				'x-groupcontextid': groupContext,
			},
		});

		return {
			status: response.status,
			response: JSON.stringify(response.data)
		};
	} catch (e) {
		if (axios.isAxiosError(e)) {
			if (e.response?.status === 404) {
				return ({status: 404, response: 'NOT_FOUND'});
			}
		}
		
		console.error(e);
		throw new Error('DELETE API call failed');
	}
}

async function uploadCsvDataset(se: SeedEntry, uploadUrl: string): Promise<void> {
	// get dataset file (csv) from input file path
	const csvFilePath = se.filePath.replaceAll(/\.json/g, '.csv');
	const datasetData = fs.readFileSync(`${csvFilePath}`, 'utf-8');
	console.log(`uploading dataset to S3`);
	await s3Upload(uploadUrl, datasetData);
}

async function s3Upload(url: string, data: string): Promise<ApiResponse> {
	try {
		const response = await axios.put(url, data);
		return {
			status: response.status,
			response: JSON.stringify(response.data)
		};
	} catch (e) {
		if (axios.isAxiosError(e)) {
			if (e.response?.status === 404) {
				return ({status: 404, response: 'INVALID_URL'});
			}
		}
		
		console.error(e);
		throw new Error('S3 Upload failed');
	}
}

// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// seed
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

async function seedGroups(entries: SeedEntry[], endpoint: string, token: string): Promise<void> {

	const seedEntries = filterAndSortEntries(entries, ResourceType.Group, SortType.Root);

	for (const se of seedEntries) {
		console.log(`group: ${se.resourceName}, groupContext: ${se.groupContext}`);

		const groupData = fs.readFileSync(se.filePath, 'utf-8');

		// get group - create if doesn't exist, update if does exist
		const groupPath = se.groupContext === '/' ? '%2F' : encodeURIComponent(se.groupContext) + '%2F'
		const getGroupResponse = await apiGet(endpoint, `/groups/${groupPath}${se.resourceName}`, se.groupContext, token);

		if (getGroupResponse.status === 200) {
			console.log(`group ${se.resourceName} exists, updating`);
			await apiPatch(endpoint, `/groups/${groupPath}${se.resourceName}`, se.groupContext, token, groupData);
		} else if (getGroupResponse.status === 404) {
			console.log(`group ${se.resourceName} does not exist, creating`);
			await apiPost(endpoint, `/groups`, se.groupContext, token, groupData);
		}
	}
}

async function deleteGroups(entries: SeedEntry[], endpoint: string, token: string): Promise<void> {

	const deleteEntries = filterAndSortEntries(entries, ResourceType.Group, SortType.Leaves);

	for (const de of deleteEntries) {
		console.log(`group: ${de.resourceName}, groupContext: ${de.groupContext}`);

		// disable group, then delete, skip delete if not found
		const groupPath = de.groupContext === '/' ? '%2F' : encodeURIComponent(de.groupContext) + '%2F';
		console.log(`disabling group ${de.resourceName}`);
		const patchGroupResponse = await apiPatch(endpoint, `/groups/${groupPath}${de.resourceName}`, de.groupContext, token, '{"state":"disabled"}');
		if (patchGroupResponse.status === 404) {
			console.log(`group ${de.resourceName} doesn't exist, skipping delete`);
		} else if (patchGroupResponse.status === 200) {
			console.log(`deleting group ${de.resourceName}`);
			await apiDelete(endpoint, `/groups/${groupPath}${de.resourceName}`, de.groupContext, token);
		}
	}
}

// ----

async function seedUsers(entries: SeedEntry[], userEmail: string, userPassword: string, endpoint: string, token: string): Promise<void> {

	const userEmailBase = userEmail.split('@')[0];
	const userEmailDomain = userEmail.split('@')[1];

	const seedEntries = filterAndSortEntries(entries, ResourceType.User, SortType.Root);

	for (const se of seedEntries) {
		console.log(`user: ${se.resourceName}, groupContext: ${se.groupContext}`);

		const rawUserData = fs.readFileSync(se.filePath, 'utf-8');
		const userData = rawUserData
			.replaceAll(/\[EMAIL_BASE\]/g, userEmailBase)
			.replaceAll(/\[EMAIL_DOMAIN\]/g, userEmailDomain)
			.replaceAll(/\[PASSWORD\]/g, userPassword);
		
		const userDataJson = JSON.parse(userData);
		const userDataEmail = userDataJson.email;

		// get user - create if doesn't exist, update if does exist
		const getUserResponse = await apiGet(endpoint, `/users/${encodeURIComponent(userDataEmail)}`, se.groupContext, token);

		if (getUserResponse.status === 200) {
			console.log(`user ${userDataEmail} exists, updating`);
			// patch requests for passwords can only come from the user - remove the password if patching
			const userDataWithoutPassword = (({ password, ...o }) => o)(userDataJson);
			await apiPatch(endpoint, `/users/${encodeURIComponent(userDataEmail)}`, se.groupContext, token, userDataWithoutPassword);
		} else if (getUserResponse.status === 404) {
			console.log(`user ${userDataEmail} does not exist, creating`);
			await apiPost(endpoint, `/users`, se.groupContext, token, userData);
		}
	}
}

async function deleteUsers(entries: SeedEntry[], userEmail: string, userPassword: string, endpoint: string, token: string): Promise<void> {

	const userEmailBase = userEmail.split('@')[0];
	const userEmailDomain = userEmail.split('@')[1];

	const seedEntries = filterAndSortEntries(entries, ResourceType.User, SortType.Root);

	for (const se of seedEntries) {
		console.log(`user: ${se.resourceName}, groupContext: ${se.groupContext}`);

		const rawUserData = fs.readFileSync(se.filePath, 'utf-8');
		const userData = rawUserData
			.replaceAll(/\[EMAIL_BASE\]/g, userEmailBase)
			.replaceAll(/\[EMAIL_DOMAIN\]/g, userEmailDomain)
			.replaceAll(/\[PASSWORD\]/g, userPassword);
		
		const userDataJson = JSON.parse(userData);
		const userDataEmail = userDataJson.email;

		// delete user
		const deleteUserResponse = await apiDelete(endpoint, `/users/${encodeURIComponent(userDataEmail)}`, se.groupContext, token);

		if (deleteUserResponse.status === 404) {
			console.log(`user ${userDataEmail} does not exist, skipping delete`);
		} else if (deleteUserResponse.status === 204) {
			console.log(`user ${userDataEmail} deleted`);
		}
	}
}

// ----

async function seedDatasets(entries: SeedEntry[], endpoint: string, token: string): Promise<void> {

	const seedEntries = filterAndSortEntries(entries, ResourceType.ReferenceDataset, SortType.Root);

	for (const se of seedEntries) {
		console.log(`dataset: ${se.resourceName}, groupContext: ${se.groupContext}`);

		const datasetDefinition = fs.readFileSync(se.filePath, 'utf-8');
		const datasetDefinitionJson = JSON.parse(datasetDefinition);
		const datasetName = datasetDefinitionJson.name;
		const datasetS3 = datasetDefinitionJson.hasOwnProperty('datasetSource');

		// get dataset - create if doesn't exist, update if does exist
		const getDatasetResponse = await apiGet(endpoint, `/referenceDatasets?name=${encodeURIComponent(datasetName)}`, se.groupContext, token);

		if (getDatasetResponse.status === 200) {
			const datasetResponseJson = JSON.parse(getDatasetResponse.response);
			if (datasetResponseJson.referenceDatasets.length === 0) {
				console.log(`dataset ${datasetName} not found, creating`);
				const createDatasetResponse = await apiPost(endpoint, `/referenceDatasets`, se.groupContext, token, datasetDefinition);
				if (createDatasetResponse.status === 201 && datasetS3) {
					await uploadCsvDataset(se, JSON.parse(createDatasetResponse.response).uploadUrl);
				}
			} else {
				// for now assume ony 1 found, can update in the future to handle wider uses
				const datasetId = datasetResponseJson.referenceDatasets[0].id;
				console.log(`dataset ${datasetName} found (datasetId: ${datasetId}), updating`);
				const updateDatasetResponse = await apiPatch(endpoint, `/referenceDatasets/${datasetId}`, se.groupContext, token, datasetDefinition);
				if (updateDatasetResponse.status === 200 && datasetS3) {
					await uploadCsvDataset(se, JSON.parse(updateDatasetResponse.response).uploadUrl);
				}
			}
		} else {
			console.error(`API error checking to see if dataset ${datasetName} exists`);
		}
	}
}

async function deleteDatasets(entries: SeedEntry[], endpoint: string, token: string): Promise<void> {

	const seedEntries = filterAndSortEntries(entries, ResourceType.ReferenceDataset, SortType.Leaves);

	for (const se of seedEntries) {
		console.log(`dataset: ${se.resourceName}, groupContext: ${se.groupContext}`);

		const datasetDefinition = fs.readFileSync(se.filePath, 'utf-8');
		const datasetDefinitionJson = JSON.parse(datasetDefinition);
		const datasetName = datasetDefinitionJson.name;

		// get dataset - if exists, delete, if not, skip delete
		const getDatasetResponse = await apiGet(endpoint, `/referenceDatasets?name=${encodeURIComponent(datasetName)}`, se.groupContext, token);

		if (getDatasetResponse.status === 200) {
			const datasetResponseJson = JSON.parse(getDatasetResponse.response);
			if (datasetResponseJson.referenceDatasets.length === 0) {
				console.log(`dataset ${datasetName} not found, skipping delete`);
			} else {
				// for now assume ony 1 found, can update in the future to handle wider uses
				const datasetId = datasetResponseJson.referenceDatasets[0].id;
				console.log(`dataset ${datasetName} found (datasetId: ${datasetId}), deleting`);
				await apiDelete(endpoint, `/referenceDatasets/${datasetId}`, se.groupContext, token);
			}
		} else {
			console.error(`API error checking to see if dataset ${datasetName} exists`);
		}
	}
}

// ----

async function seedImpacts(entries: SeedEntry[], endpoint: string, token: string): Promise<void> {

	const seedEntries = filterAndSortEntries(entries, ResourceType.Impact, SortType.Root);

	for (const se of seedEntries) {
		console.log(`impact: ${se.resourceName}, groupContext: ${se.groupContext}`);

		const bulkImpactsDefinition = fs.readFileSync(se.filePath, 'utf-8');
		const bulkImpactsDefinitionJson = JSON.parse(bulkImpactsDefinition);
		const impactTaskDefinition = JSON.stringify({type: "create", "activities": bulkImpactsDefinitionJson });

		// TODO: for now will not update impacts, only use create task to create, will need to delete then create to update
		const createImpactTaskResponse = await apiPost(endpoint, `/activityTasks`, se.groupContext, token, impactTaskDefinition);
		if (createImpactTaskResponse.status !== 201) {
			console.error(`API error creating impact task`);
		}
	}
}

async function deleteImpacts(entries: SeedEntry[], endpoint: string, token: string): Promise<void> {

	const seedEntries = filterAndSortEntries(entries, ResourceType.Impact, SortType.Leaves);

	for (const se of seedEntries) {
		console.log(`impact: ${se.resourceName}, groupContext: ${se.groupContext}`);

		const bulkDeleteImpactDefinition = fs.readFileSync(se.filePath, 'utf-8');
		const bulkDeleteImpactDefinitionJson = JSON.parse(bulkDeleteImpactDefinition);
		
		console.log(`impacts: ${bulkDeleteImpactDefinitionJson.length}`);

		// TODO: this is a brute force delete (one-by-one get, delete)
		// for now just do Promise.all of a single delete for each impact
		// immediate enhancement would be to break these into smaller delete batches
		
		const getImpactPromises: Promise<ApiResponse>[] = [];
		for (const impact of bulkDeleteImpactDefinitionJson) {
			getImpactPromises.push(apiGet(endpoint, `/activities?name=${encodeURIComponent(impact.name)}`, se.groupContext, token));
		}

		const getImpactResponses = await Promise.all(getImpactPromises);

		await delaySec(10);

		const deleteImpactPromises: Promise<ApiResponse>[] = [];
		for (const impactResponse of getImpactResponses) {
			const impactResponseJson = JSON.parse(impactResponse.response);
			if (impactResponseJson.activities.length > 0) {
				const impactId = JSON.parse(impactResponse.response).activities[0].id;
				deleteImpactPromises.push(apiDelete(endpoint, `/activities/${impactId}`, se.groupContext, token));
			}
		}

		await Promise.all(deleteImpactPromises);

		await delaySec(10);
	}
}

// ----

async function seedCalculations(entries: SeedEntry[], endpoint: string, token: string): Promise<void> {

	const seedEntries = filterAndSortEntries(entries, ResourceType.Calculation, SortType.Root);

	for (const se of seedEntries) {
		console.log(`calculation: ${se.resourceName}, groupContext: ${se.groupContext}`);

		const calculationDefinition = fs.readFileSync(se.filePath, 'utf-8');
		const calculationDefinitionJson = JSON.parse(calculationDefinition);
		const calculationName = calculationDefinitionJson.name;

		// get calculation - create if doesn't exist, update if does exist
		const getCalculationResponse = await apiGet(endpoint, `/calculations?name=${encodeURIComponent(calculationName)}`, se.groupContext, token);

		if (getCalculationResponse.status === 200) {
			const getCalculationResponseJson = JSON.parse(getCalculationResponse.response);
			if (getCalculationResponseJson.calculations.length === 0) {
				console.log(`calculation ${calculationName} not found, creating`);
				await apiPost(endpoint, `/calculations`, se.groupContext, token, calculationDefinition);
			} else {
				// for now assume ony 1 found, can update in the future to handle wider uses
				const calculationId = getCalculationResponseJson.calculations[0].id;
				console.log(`calculation ${calculationName} found (calculationId: ${calculationId}), updating`);
				await apiPatch(endpoint, `/calculations/${calculationId}`, se.groupContext, token, calculationDefinition);
			}
		} else {
			console.error(`API error checking to see if calculation ${calculationName} exists`);
		}
	}
}

async function deleteCalculations(entries: SeedEntry[], endpoint: string, token: string): Promise<void> {

	const seedEntries = filterAndSortEntries(entries, ResourceType.Calculation, SortType.Leaves);

	for (const se of seedEntries) {
		console.log(`calculation: ${se.resourceName}, groupContext: ${se.groupContext}`);

		const calculationDefinition = fs.readFileSync(se.filePath, 'utf-8');
		const calculationDefinitionJson = JSON.parse(calculationDefinition);
		const calculationName = calculationDefinitionJson.name;

		// get calculation - if exists, delete, if not, skip delete
		const getCalculationResponse = await apiGet(endpoint, `/calculations?name=${encodeURIComponent(calculationName)}`, se.groupContext, token);

		if (getCalculationResponse.status === 200) {
			const getCalculationResponseJson = JSON.parse(getCalculationResponse.response);
			if (getCalculationResponseJson.calculations.length === 0) {
				console.log(`calculation ${calculationName} not found, skipping delete`);
			} else {
				// for now assume ony 1 found, can update in the future to handle wider uses
				const calculationId = getCalculationResponseJson.calculations[0].id;
				console.log(`calculation ${calculationName} found (calculationId: ${calculationId}), deleting`);
				await apiDelete(endpoint, `/calculations/${calculationId}`, se.groupContext, token);
			}
		} else {
			console.error(`API error checking to see if calculation ${calculationName} exists`);
		}
	}
}

// ----

async function seedMetrics(entries: SeedEntry[], endpoint: string, token: string): Promise<void> {

	const seedEntries = filterAndSortEntries(entries, ResourceType.Metric, SortType.Root);

	// read in metric definitions (to get outputMetrics)
	const metricEntries: MetricEntry[] = [];
	for (const se of seedEntries) {
		console.log(`metric: ${se.resourceName}, groupContext: ${se.groupContext}`);
		metricEntries.push({se, definition: fs.readFileSync(se.filePath, 'utf-8')});
	}

	// sort so metrics w/o dependencies are before metrics with outputMetric dependencies
	const sortedMetricEntries = sortMetricEntriesByDependency(metricEntries, MetricSortType.Outgoing);

	// create in order
	for (const sme of sortedMetricEntries) {

		const metricDefinition = fs.readFileSync(sme.se.filePath, 'utf-8');
		const metricDefinitionJson = JSON.parse(metricDefinition);
		const metricName = metricDefinitionJson.name;

		// get metric - create if doesn't exist, update if does exist
		const getMetricResponse = await apiGet(endpoint, `/metrics?name=${encodeURIComponent(metricName)}`, sme.se.groupContext, token);

		if (getMetricResponse.status === 200) {
			const getMetricResponseJson = JSON.parse(getMetricResponse.response);
			if (getMetricResponseJson.metrics.length === 0) {
				console.log(`metric ${metricName} not found, creating`);
				await apiPost(endpoint, `/metrics`, sme.se.groupContext, token, metricDefinition);
			} else {
				// for now assume ony 1 found, can update in the future to handle wider uses
				const metricId = getMetricResponseJson.metrics[0].id;
				console.log(`metric ${metricName} found (metricId: ${metricId}), updating`);
				await apiPatch(endpoint, `/metrics/${metricId}`, sme.se.groupContext, token, metricDefinition);
			}
		} else {
			console.error(`API error checking to see if metric ${metricName} exists`);
		}
	}
}

async function deleteMetrics(entries: SeedEntry[], endpoint: string, token: string): Promise<void> {

	const seedEntries = filterAndSortEntries(entries, ResourceType.Metric, SortType.Root);

	// read in metric definitions (to get outputMetrics)
	const metricEntries: MetricEntry[] = [];
	for (const se of seedEntries) {
		console.log(`metric: ${se.resourceName}, groupContext: ${se.groupContext}`);
		metricEntries.push({se, definition: fs.readFileSync(se.filePath, 'utf-8')});
	}

	// sort so metrics with dependencies are before metrics w/o outputMetric dependencies
	const sortedMetricEntries = sortMetricEntriesByDependency(metricEntries, MetricSortType.Incoming);

	// create in order
	for (const sme of sortedMetricEntries) {

		const metricDefinition = fs.readFileSync(sme.se.filePath, 'utf-8');
		const metricDefinitionJson = JSON.parse(metricDefinition);
		const metricName = metricDefinitionJson.name;

		// get metric - delete if exists, skip if doesn't exist
		const getMetricResponse = await apiGet(endpoint, `/metrics?name=${encodeURIComponent(metricName)}`, sme.se.groupContext, token);

		if (getMetricResponse.status === 200) {
			const getMetricResponseJson = JSON.parse(getMetricResponse.response);
			if (getMetricResponseJson.metrics.length === 0) {
				console.log(`metric ${metricName} not found, skipping delete`);
			} else {
				// for now assume ony 1 found, can update in the future to handle wider uses
				const metricId = getMetricResponseJson.metrics[0].id;
				console.log(`metric ${metricName} found (metricId: ${metricId}), deleting`);
				await apiDelete(endpoint, `/metrics/${metricId}`, sme.se.groupContext, token);
			}
		} else {
			console.error(`API error checking to see if metric ${metricName} exists`);
		}
	}
}

// ----

async function seedPipelines(entries: SeedEntry[], endpoint: string, token: string): Promise<void> {

	const seedEntries = filterAndSortEntries(entries, ResourceType.Pipeline, SortType.Root);

	for (const se of seedEntries) {
		console.log(`pipeline: ${se.resourceName}, groupContext: ${se.groupContext}`);

		const pipelineDefinition = fs.readFileSync(se.filePath, 'utf-8');
		const pipelineDefinitionJson = JSON.parse(pipelineDefinition);
		const pipelineName = pipelineDefinitionJson.name;

		// get pipeline - create if doesn't exist, update if does exist
		const getPipelineResponse = await apiGet(endpoint, `/pipelines?name=${encodeURIComponent(pipelineName)}`, se.groupContext, token);

		if (getPipelineResponse.status === 200) {
			const getPipelineResponseJson = JSON.parse(getPipelineResponse.response);
			if (getPipelineResponseJson.pipelines.length === 0) {
				console.log(`pipeline ${pipelineName} not found, creating`);
				await apiPost(endpoint, `/pipelines`, se.groupContext, token, pipelineDefinition);
			} else {
				// for now assume ony 1 found, can update in the future to handle wider uses
				const pipelineId = getPipelineResponseJson.pipelines[0].id;
				console.log(`pipeline ${pipelineName} found (pipelineId: ${pipelineId}), updating`);
				await apiPatch(endpoint, `/pipelines/${pipelineId}`, se.groupContext, token, pipelineDefinition);
			}
		} else {
			console.error(`API error checking to see if pipeline ${pipelineName} exists`);
		}
	}
}

async function deletePipelines(entries: SeedEntry[], endpoint: string, token: string): Promise<void> {

	const seedEntries = filterAndSortEntries(entries, ResourceType.Pipeline, SortType.Leaves);

	for (const se of seedEntries) {
		console.log(`pipeline: ${se.resourceName}, groupContext: ${se.groupContext}`);

		const pipelineDefinition = fs.readFileSync(se.filePath, 'utf-8');
		const pipelineDefinitionJson = JSON.parse(pipelineDefinition);
		const pipelineName = pipelineDefinitionJson.name;

		// get pipeline - if exists, delete, if not, skip delete
		const getPipelineResponse = await apiGet(endpoint, `/pipelines?name=${encodeURIComponent(pipelineName)}`, se.groupContext, token);

		if (getPipelineResponse.status === 200) {
			const getPipelineResponseJson = JSON.parse(getPipelineResponse.response);
			if (getPipelineResponseJson.pipelines.length === 0) {
				console.log(`pipeline ${pipelineName} not found, skipping delete`);
			} else {
				// for now assume ony 1 found, can update in the future to handle wider uses
				const pipelineId = getPipelineResponseJson.pipelines[0].id;
				console.log(`pipeline ${pipelineName} found (pipelineId: ${pipelineId}), deleting`);
				await apiDelete(endpoint, `/pipelines/${pipelineId}`, se.groupContext, token);
			}
		} else {
			console.error(`API error checking to see if pipeline ${pipelineName} exists`);
		}
	}
}

// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// main
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
if (require.main === module) {
	const [tenantId, environment, seedDir, username, password, operation] = process.argv.slice(2);

	if (process.argv.length < 7) {
		throw new Error('Missing arguments\r\nHow to run the command: \r\n> npm run seed -- <tenantId> <environment> <seed directory> <username> <password> <operation (seed or delete)> ');
	}

	console.log(`SIF Data Seeder`);

	(async () => {
		await cognitoInit(tenantId, environment);

		const apiEndpoints = await getApiEndpoints(tenantId, environment);

		const token = await authorizeUser(username, password);

		const seedEntries = await listSeedEntries(seedDir);

		if (operation === 'seed') {
			await seedGroups(seedEntries, apiEndpoints.accessManagement, token);
			await seedUsers(seedEntries, username, password, apiEndpoints.accessManagement, token);
			// datasets
			await seedDatasets(seedEntries, apiEndpoints.referenceDatasets, token);
			// impacts
			await seedImpacts(seedEntries, apiEndpoints.impacts, token);
			// calculations
			await seedCalculations(seedEntries, apiEndpoints.calculations, token);
			// metrics
			await seedMetrics(seedEntries, apiEndpoints.pipelines, token);
			// pipelines
			await seedPipelines(seedEntries, apiEndpoints.pipelines, token);
		} else if (operation === 'delete') {
			console.log('\n\nDELETE requested...waiting 5 seconds before performing delete...\n');
			await delaySec(5);
			// pipelines
			await deletePipelines(seedEntries, apiEndpoints.pipelines, token);
			// metrics
			await deleteMetrics(seedEntries, apiEndpoints.pipelines, token);
			// calculations
			await deleteCalculations(seedEntries, apiEndpoints.calculations, token);
			// impacts
			await deleteImpacts(seedEntries, apiEndpoints.impacts, token);
			// datasets
			await deleteDatasets(seedEntries, apiEndpoints.referenceDatasets, token);
			await deleteUsers(seedEntries, username, password, apiEndpoints.accessManagement, token);
			await deleteGroups(seedEntries, apiEndpoints.accessManagement, token);
		} else {
			console.error(`Invalid operation requested: ${operation} (valid options: seed or delete)`);
		}

		console.log(`Done`);

	})().catch((e) => console.error(e));
}
