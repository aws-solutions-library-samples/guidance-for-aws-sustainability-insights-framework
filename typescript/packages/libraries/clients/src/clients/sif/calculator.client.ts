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

import type { BaseLogger } from 'pino';
import { InvokeCommand, InvokeCommandInput, LambdaClient } from '@aws-sdk/client-lambda';
import { Buffer } from 'buffer';
import { ClientServiceBase } from '../../common/common.js';
import { CalculatorDryRunError, CalculatorInlineTransformResponse, CalculatorRequest, CalculatorS3TransformResponse } from './calculator.models.js';

export class CalculatorClient extends ClientServiceBase {
	private readonly lambdaClient: LambdaClient;
	private readonly calculatorFunctionName: string;
	private readonly log: BaseLogger;

	constructor(log: BaseLogger, lambdaClient: LambdaClient, calculatorFunctionName: string) {
		super();
		this.calculatorFunctionName = calculatorFunctionName;
		this.lambdaClient = lambdaClient;
		this.log = log;
	}

	public async process(transformRequest: CalculatorRequest): Promise<CalculatorInlineTransformResponse | CalculatorS3TransformResponse> {
		this.log.info(`CalculatorClient > process > in: ${JSON.stringify(transformRequest)}`);

		const input: InvokeCommandInput = {
			FunctionName: this.calculatorFunctionName,
			Payload: Buffer.from(JSON.stringify(transformRequest)),
		};

		const result = await this.lambdaClient.send(new InvokeCommand(input));
		const payload = JSON.parse(Buffer.from(result.Payload as Uint8Array).toString());

		if (transformRequest.dryRun && payload.errors && payload.errors.length > 0) {
			this.log.error(`CalculatorClient > process > error : ${JSON.stringify(payload)}`);
			throw new CalculatorDryRunError(payload.errors);
		}

		this.log.info(`CalculatorClient > process > exit >`);
		return payload;
	}
}
