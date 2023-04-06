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

import type { Pipeline } from './pipeline.models.js';
export interface ConnectorParameter {
	name: string;
	description?: string;
	required?: boolean;
	defaultValue?: string | number | boolean;
}

export interface NewConnector {
	name: string;
	parameters?: ConnectorParameter[];
	requiresFileUpload?: boolean;
	type: ConnectorType
}

export enum ConnectorType {
	input='input',
	output='output'
}

export type Connector = NewConnector & {
	id: string;
	createdAt: string;
	createdBy: string;
	isManaged?: boolean;
	description?: string;
	updatedBy?: string;
	updatedAt?: string;
}

export interface Connectors {
	connectors: Connector[];
}

export interface ConnectorIntegrationRequestEvent {
	executionId: string;
	pipeline: Pipeline;
	connector: {
		name: string,
		parameters: Record<string, any>;
	}
	rawInputDownloadUrl?: string;
	transformedInputUploadUrl: string;
	securityContext?: SecurityContext;
}

export interface ConnectorIntegrationResponseEvent {
	executionId: string,
	pipelineId: string,
	status: 'success' | 'error',
	statusMessage: string,
	securityContext?: SecurityContext;
}

export enum SecurityScope {
	superAdmin = 'superAdmin',
	admin = 'admin',
	contributor = 'contributor',
	reader = 'reader',
}

export interface GroupRoles {
	[name: string]: SecurityScope;
}

export interface SecurityContext {
	email: string;
	groupId: string;
	groupRoles: GroupRoles;
}

