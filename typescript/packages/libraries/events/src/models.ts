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

import { Type, Static } from '@sinclair/typebox';

export type EventSource = typeof ACCESS_MANAGEMENT_EVENT_SOURCE;

export type EventType = 'created' | 'updated' | 'deleted' | 'request' | 'response';

export const status = Type.Enum({
	success: 'success',
	fail: 'fail'
}, { description: 'Status of the connector execution.' });

export interface PlatformEvent<T> {
	resourceType: string;
	eventType: EventType;
	id: string;
	old?: T;
	new?: T;
	error?: Error;
}

export const inputConnectorEvent = Type.Object(
	{
		Id: Type.String(),
		EventBusName: Type.String(),
		Source: Type.String(),
		DetailType: Type.String(),
		Detail: Type.String(),
		Account: Type.String(),
		Region: Type.String()
	},
	{
		$id: 'inputConnectorEvent',
	}
);

export const inputConnectorEventDetail = Type.Object(
	{
		pipelineId: Type.String(),
		executionId: Type.String(),
		groupContextId: Type.String(),
		inputUploadUrl: Type.String()
	}
);

export const inputConnectorResponseEvent = Type.Object(
	{
		EventBusName: Type.String(),
		Source: Type.String(),
		DetailType: Type.String(),
		Detail: Type.String(),
	},
	{
		$id: 'inputConnectorEventDetail',
	}
);

export const inputConnectorResponseEventDetail = Type.Object(
	{
		status,
		statusMessage: Type.Optional(Type.String())
	},
	{
		$id: 'inputConnectorResponseEventDetail',
	}
);

export const ACCESS_MANAGEMENT_EVENT_SOURCE: string = 'com.aws.sif.accessManagement';
export const PIPELINE_PROCESSOR_EVENT_SOURCE: string = 'com.aws.sif.pipelineProcessor';
export const REFERENCE_DATASET_EVENT_SOURCE: string = 'com.aws.sif.referenceDataset';

export const PIPELINE_PROCESSOR_CONNECTOR_REQUEST_EVENT = `SIF>${PIPELINE_PROCESSOR_EVENT_SOURCE}>connectorIntegration>request`;
export const PIPELINE_PROCESSOR_CONNECTOR_RESPONSE_EVENT = `SIF>${PIPELINE_PROCESSOR_EVENT_SOURCE}>connectorIntegration>response`;

export type Status = Static<typeof status>;
export type InputConnectorEvent = Static<typeof inputConnectorEvent>;
export type InputConnectorEventDetail = Static<typeof inputConnectorEventDetail>;
export type InputConnectorResponseEvent = Static<typeof inputConnectorResponseEvent>;
export type InputConnectorResponseEventDetail = Static<typeof inputConnectorResponseEventDetail>;

