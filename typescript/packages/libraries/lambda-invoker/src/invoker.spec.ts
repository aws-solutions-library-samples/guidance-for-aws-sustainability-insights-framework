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

import { describe, beforeEach, it, expect } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import pino from 'pino';

import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { fromUtf8 } from '@aws-sdk/util-utf8-node';

import { Invoker } from './invoker.js';
import { LambdaApiGatewayEventBuilder } from './models.js';

describe('Invoker', () => {
	const mockedLambda = mockClient(LambdaClient);
	let instance: Invoker;

	beforeEach(() => {
		mockedLambda.reset();
		instance = new Invoker(pino(), mockedLambda as unknown as LambdaClient);
	});

	it('should invoke a lambda function', async () => {
		const functionName: string = 'test-api-function';
		const lambdaApiGatewayEvent: LambdaApiGatewayEventBuilder = new LambdaApiGatewayEventBuilder();

		const expected = {
			statusCode: 201,
			body: {
				certificatePem: '-----BEGIN CERTIFICATE---',
				resourceArns: {
					certificate: 'arn:aws:iot:us-west-2:xxxxxxxxxxxx:cert/f9d865017f3ae942728d29333759c8e6a5299bb16d2d7dfa789cc175f5dd8412',
					thing: 'arn:aws:iot:us-west-2:xxxxxxxxxxxx:thing/test-core-150',
				},
			},
			headers: {
				'access-control-allow-origin': '*',
				'x-powered-by': 'Express',
			},
		};

		mockedLambda.on(InvokeCommand).resolves({
			StatusCode: 200,
			Payload: fromUtf8(
				'{"statusCode":201,"body":"{\\"certificatePem\\":\\"-----BEGIN CERTIFICATE---\\",\\"resourceArns\\":{\\"certificate\\":\\"arn:aws:iot:us-west-2:xxxxxxxxxxxx:cert/f9d865017f3ae942728d29333759c8e6a5299bb16d2d7dfa789cc175f5dd8412\\",\\"thing\\":\\"arn:aws:iot:us-west-2:xxxxxxxxxxxx:thing/test-core-150\\"}}","headers":{"x-powered-by":"Express","access-control-allow-origin":"*"}}'
			),
			ExecutedVersion: '$LATEST',
		} as any);

		const actual = await instance.invoke(functionName, lambdaApiGatewayEvent);

		expect(actual).toBeDefined();
		expect(mockedLambda.calls().length).toBe(1);
		expect(actual.body).toEqual(expected.body);
		expect(actual.statusCode).toEqual(expected.statusCode);
		expect(actual.headers).toEqual(expected.headers);
	});

	it('should throw an error if status code is greater than 300', async () => {
		const functionName: string = 'test-api-function';
		const lambdaApiGatewayEvent: LambdaApiGatewayEventBuilder = new LambdaApiGatewayEventBuilder();

		mockedLambda.on(InvokeCommand).resolves({
			StatusCode: 400,
			FunctionError: 'ERROR',
			ExecutedVersion: '$LATEST',
		});

		let actual;
		try {
			actual = await instance.invoke(functionName, lambdaApiGatewayEvent);
		} catch (err) {
			expect(err.message).toEqual('Bad Request');
		}

		expect(actual).toBeUndefined();
		expect(mockedLambda.calls().length).toBe(1);
	});
});
