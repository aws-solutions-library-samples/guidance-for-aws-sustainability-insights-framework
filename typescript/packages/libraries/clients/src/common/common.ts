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

export interface RequestHeaders {
	[key: string]: string;
}

const { CLIENT_HEADERS } = process.env;

export abstract class ClientServiceBase {
	protected MIME_TYPE = 'application/json';
	protected VERSION = '1.0.0';

	private readonly _headers: RequestHeaders = {
		Accept: this.MIME_TYPE,
		'Accept-Version': this.VERSION,
		'Content-Type': this.MIME_TYPE,
	};

	protected buildHeaders(additionalHeaders?: RequestHeaders): RequestHeaders {
		let headers: RequestHeaders = Object.assign({}, this._headers);

		const customHeaders = CLIENT_HEADERS as string;
		if (customHeaders !== undefined) {
			try {
				const headersFromConfig: RequestHeaders = JSON.parse(customHeaders) as unknown as RequestHeaders;
				headers = { ...headers, ...headersFromConfig };
			} catch (err) {
				const wrappedErr = `Failed to parse configuration parameter CLIENT_HEADERS as JSON with error: ${err}`;
				throw new Error(wrappedErr);
			}
		}

		if (additionalHeaders !== null && additionalHeaders !== undefined) {
			headers = { ...headers, ...additionalHeaders };
		}

		const keys = Object.keys(headers);
		keys.forEach((k) => {
			if (headers[k] === undefined || headers[k] === null) {
				delete headers[k];
			}
		});

		return headers;
	}
}
