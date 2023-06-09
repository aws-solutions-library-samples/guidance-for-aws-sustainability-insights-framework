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

import type { ConnectorCreateParams, Connector, ConnectorList, ConnectorUpdateParams } from './schemas.js';

const id = 'ajcuhek13ks';
const name = 'sif-csv-pipeline-input-connector'
const createdAt = '2022-08-10T23:55:20.322Z';
const createdBy = 'someone@somewhere.com';
const groups = ['/'];
const description = 'this connector transforms a csv pipeline input as a file upload into SIF compatible pipeline format';
const parameters = [{
	name: 'apiKey',
	description: 'some api key which my connector will need to utilize',
	required: true,
}, {
	name: 'endpoint',
	description: 'some endpoint which my connector will need to utilize',
	required: true,
	defaultValue: 'https://....'
}];

export const connectorCreateParamsExample: ConnectorCreateParams = {
	description,
	requiresFileUpload: true,
	name,
	parameters,
	type: 'input',
}

export const connectorUpdateParamsExample: ConnectorUpdateParams = {
	name: 'some-new-name',
	parameters
}

export const connectorExample: Connector = {
	createdAt,
	createdBy,
	description,
	groups,
	id,
	isManaged: true,
	name,
	parameters,
	requiresFileUpload: true,
	type: 'input',
	updatedAt: createdAt,
	updatedBy: createdBy,
}

export const connectorListExample: ConnectorList = {
	connectors: [{...connectorExample}],
	pagination: {
		count: 2,
		lastEvaluatedToken: id,
	},
};


