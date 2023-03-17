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

import createHttpError from 'http-errors';
import type { BaseLogger } from 'pino';

import { InvokeCommand, InvokeCommandInput, LambdaClient } from '@aws-sdk/client-lambda';
import { fromUtf8 } from '@aws-sdk/util-utf8-node';

import { LambdaApiGatewayEvent, LambdaApiGatewayEventResponse } from './models.js';

export class Invoker {
	private readonly log: BaseLogger;
	private readonly client: LambdaClient;

	public constructor(log: BaseLogger, client: LambdaClient) {
		this.log = log;
		this.client = client;
	}

	public async invoke(functionName: string, event: LambdaApiGatewayEvent): Promise<LambdaApiGatewayEventResponse> {
		this.log.debug(`Invoker> invoke> in> functionName:${functionName}, event:${JSON.stringify(event)}`);

		const params: InvokeCommandInput = {
			FunctionName: functionName,
			InvocationType: 'RequestResponse',
			Payload: fromUtf8(JSON.stringify(event)),
		};

		const response = await this.client.send(new InvokeCommand(params));
		this.log.debug(`Invoker> invoke> response statusCode: ${response.StatusCode}`);

		const statusCode = response.StatusCode ?? -1;
		if (statusCode >= 200 && statusCode < 300) {
			const payload = new LambdaApiGatewayEventResponse(response.Payload);
			this.log.debug(`Invoker> invoke> response payload: ${JSON.stringify(payload)}`);

			if ((response.FunctionError?.length ?? 0) > 0) {
				const error = createHttpError(500);
				error['response'] = payload;
				throw error;
			}

			if (payload.statusCode >= 300) {
				const error = createHttpError(payload.statusCode);
				error.status = payload.statusCode;
				error.message = payload.body?.['message'];
				error['response'] = payload;
				throw error;
			}
			return payload;
		} else {
			const error = createHttpError(statusCode);
			error.status = statusCode;
			throw error;
		}
	}
}
