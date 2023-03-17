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

import { toUtf8 } from '@aws-sdk/util-utf8-node';
export interface LambdaApiGatewayEvent {
	resource: string;
	path?: string;
	httpMethod?: LambdaApiGatewayEventMethodTypes;
	headers?: Dictionary;
	multiValueHeaders?: { [key: string]: string[] };
	queryStringParameters?: Dictionary;
	multiValueQueryStringParameters?: { [key: string]: string[] };
	pathParameters?: Dictionary;
	stageVariables?: Dictionary;
	requestContext?: unknown;
	body?: string;
	isBase64Encoded?: boolean;
}

export class LambdaApiGatewayEventBuilder implements LambdaApiGatewayEvent {
	resource: string;
	path?: string;
	httpMethod?: LambdaApiGatewayEventMethodTypes;
	headers?: Dictionary;
	multiValueHeaders?: { [key: string]: string[] };
	queryStringParameters?: Dictionary;
	multiValueQueryStringParameters?: { [key: string]: string[] };
	pathParameters?: Dictionary;
	stageVariables?: Dictionary;
	requestContext?: unknown;
	body?: string;
	isBase64Encoded?: boolean;

	constructor() {
		this.resource = '/{proxy+}';
		return this;
	}

	public setHeaders(headers: Dictionary) {
		this.headers = headers;
		return this;
	}

	public setQueryStringParameters(value: Dictionary) {
		this.queryStringParameters = value;
		return this;
	}

	public setRequestContext(value: unknown) {
		this.requestContext = value;
		return this;
	}

	public setMultiValueQueryStringParameters(value: DictionaryArray) {
		this.multiValueQueryStringParameters = value;
		return this;
	}

	public setBody(body: any) {
		this.body = JSON.stringify(body);
		return this;
	}

	public setMethod(method: LambdaApiGatewayEventMethodTypes) {
		this.httpMethod = method;
		return this;
	}

	public setPath(path: string) {
		this.path = path;
		this.pathParameters = {
			path,
		};
		return this;
	}
}

export type LambdaApiGatewayEventMethodTypes = 'GET' | 'PUT' | 'POST' | 'DELETE' | 'PATCH';

export interface ApiGatewayInvokeResponsePayload {
	statusCode?: number;
	body?: unknown;
	headers?: Dictionary;
}

export class LambdaApiGatewayEventResponse implements ApiGatewayInvokeResponsePayload {
	public statusCode?: number;
	public body?: unknown;
	public headers?: Dictionary;

	constructor(payload?: Uint8Array) {
		if (payload === undefined) {
			return;
		}
		const parsedPayload: Payload = JSON.parse(toUtf8(payload));
		this.statusCode = parsedPayload?.statusCode;
		try {
			this.body = JSON.parse(parsedPayload?.body);
		} catch (error) {
			if (error instanceof SyntaxError) {
				// silently ignore as not all successful requests, such as a 204, return a json body
			} else {
				throw error;
			}
		}
		this.headers = parsedPayload?.headers;
	}
}

interface Payload {
	statusCode?: number;
	body?: string;
	headers?: Dictionary;
}

export class Dictionary {
	[key: string]: string;
}
export class DictionaryArray {
	[key: string]: string[];
}
