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
import { beforeEach, describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { MockProxy } from 'vitest-mock-extended';

import { ProxyClient } from './proxy.client';
import type { Invoker } from '@sif/lambda-invoker';
import type { FastifyRequest } from 'fastify';

describe('proxyClient', () => {
	let mockInvoker: MockProxy<Invoker>;
	let mockFastifyRequest: MockProxy<FastifyRequest>;
	let underTest: ProxyClient;

	beforeEach(() => {
		const logger = pino(
			pino.destination({
				sync: true, // test frameworks must use pino logger in sync mode!
			})
		);
		logger.level = 'debug';
		mockInvoker = mock<Invoker>();
		mockFastifyRequest = mock<FastifyRequest>();
		process.env['PERMITTED_OUTGOING_TENANT_PATHS'] = 'shared-tenant:/shared';
		underTest = new ProxyClient(logger, mockInvoker);
	});

	it('no x-tenant header return false', async () => {
		//mocks
		mockFastifyRequest.headers = {
			authorization:
				'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJDYWxjdWxhdGlvbkVuZ2luZSIsInRlbmFudElkIjoic2hhcmVkVGVuYW50IiwiZW1haWwiOiJDYWxjdWxhdGlvbkVuZ2luZSIsImNvZ25pdG86Z3JvdXBzIjoiL3NoYXJlZHx8fHJlYWRlciJ9.OK1nPLulHFdDJ7QLjerikHN7DW_8zmyn4ifiLDjVgpE',
			accept: 'application/json',
			'x-groupcontextid': '/shared',
			'accept-version': '1.0.0',
			'content-type': 'application/json',
			'x-apigateway-event':
				'%7B%22path%22%3A%22%2Factivities%22%2C%22httpMethod%22%3A%22GET%22%2C%22headers%22%3A%7B%22Authorization%22%3A%22Bearer%20eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJDYWxjdWxhdGlvbkVuZ2luZSIsInRlbmFudElkIjoicG91eWEiLCJlbWFpbCI6IkNhbGN1bGF0aW9uRW5naW5lIiwiY29nbml0bzpncm91cHMiOiIvc2hhcmVkfHx8cmVhZGVyIn0.RWzxa7kaOcAXIkV9U3EkCMBWSW7_QljVZ_XlKrvANT8%22%2C%22Accept%22%3A%22application%2Fjson%22%2C%22x-groupcontextid%22%3A%22%2Fshared%22%2C%22x-tenant%22%3A%22pouya2%3A%2Fshared%22%2C%22Accept-Version%22%3A%221.0.0%22%2C%22Content-Type%22%3A%22application%2Fjson%22%7D%2C%22queryStringParameters%22%3A%7B%22name%22%3A%22us%3Aelectricity%3Acoal%22%7D%2C%22requestContext%22%3A%7B%22authorizer%22%3A%7B%22claims%22%3A%7B%22groupContextId%22%3A%22%2Fshared%22%2C%22email%22%3A%22Calculator%22%2C%22cognito%3Agroups%22%3A%22%2Fshared%7C%7C%7Creader%22%7D%7D%7D%7D',
			'x-apigateway-context':
				'%7B%22callbackWaitsForEmptyEventLoop%22%3Atrue%2C%22functionVersion%22%3A%22%24LATEST%22%2C%22functionName%22%3A%22sif-pouya-dev-activitiesApi%22%2C%22memoryLimitInMB%22%3A%22256%22%2C%22logGroupName%22%3A%22%2Faws%2Flambda%2Fsif-pouya-dev-activitiesApi%22%2C%22logStreamName%22%3A%222022%2F12%2F18%2F%5B%24LATEST%5Db9e265b27edb45a69285e05ffafe55a0%22%2C%22invokedFunctionArn%22%3A%22arn%3Aaws%3Alambda%3Aap-southeast-2%3A354851405923%3Afunction%3Asif-pouya-dev-activitiesApi%22%2C%22awsRequestId%22%3A%22a915d2a0-2df5-4ebd-97f9-932ee3884cb5%22%7D',
			'user-agent': 'lightMyRequest',
			host: 'localhost:80',
			'content-length': '0',
		};

		// execute
		const actual = await underTest.isProxied('shared-tenant', mockFastifyRequest);

		// verify
		expect(actual).toEqual(false);
	});

	it('request originated from the same tenant should return false', async () => {
		//mocks
		mockFastifyRequest.headers = {
			authorization:
				'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJDYWxjdWxhdGlvbkVuZ2luZSIsInRlbmFudElkIjoic2hhcmVkLXRlbmFudCIsImVtYWlsIjoiQ2FsY3VsYXRpb25FbmdpbmUiLCJjb2duaXRvOmdyb3VwcyI6Ii9zaGFyZWR8fHxyZWFkZXIifQ.nfWwKKD29BZ42pvm-ceTkVaP5j1H0K1XkmCHGx8EhTo',
			accept: 'application/json',
			'x-groupcontextid': '/shared',
			'x-tenant': 'shared-tenant',
			'accept-version': '1.0.0',
			'content-type': 'application/json',
			'x-apigateway-event':
				'%7B%22path%22%3A%22%2Factivities%22%2C%22httpMethod%22%3A%22GET%22%2C%22headers%22%3A%7B%22Authorization%22%3A%22Bearer%20eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJDYWxjdWxhdGlvbkVuZ2luZSIsInRlbmFudElkIjoicG91eWEiLCJlbWFpbCI6IkNhbGN1bGF0aW9uRW5naW5lIiwiY29nbml0bzpncm91cHMiOiIvc2hhcmVkfHx8cmVhZGVyIn0.RWzxa7kaOcAXIkV9U3EkCMBWSW7_QljVZ_XlKrvANT8%22%2C%22Accept%22%3A%22application%2Fjson%22%2C%22x-groupcontextid%22%3A%22%2Fshared%22%2C%22x-tenant%22%3A%22pouya2%3A%2Fshared%22%2C%22Accept-Version%22%3A%221.0.0%22%2C%22Content-Type%22%3A%22application%2Fjson%22%7D%2C%22queryStringParameters%22%3A%7B%22name%22%3A%22us%3Aelectricity%3Acoal%22%7D%2C%22requestContext%22%3A%7B%22authorizer%22%3A%7B%22claims%22%3A%7B%22groupContextId%22%3A%22%2Fshared%22%2C%22email%22%3A%22Calculator%22%2C%22cognito%3Agroups%22%3A%22%2Fshared%7C%7C%7Creader%22%7D%7D%7D%7D',
			'x-apigateway-context':
				'%7B%22callbackWaitsForEmptyEventLoop%22%3Atrue%2C%22functionVersion%22%3A%22%24LATEST%22%2C%22functionName%22%3A%22sif-pouya-dev-activitiesApi%22%2C%22memoryLimitInMB%22%3A%22256%22%2C%22logGroupName%22%3A%22%2Faws%2Flambda%2Fsif-pouya-dev-activitiesApi%22%2C%22logStreamName%22%3A%222022%2F12%2F18%2F%5B%24LATEST%5Db9e265b27edb45a69285e05ffafe55a0%22%2C%22invokedFunctionArn%22%3A%22arn%3Aaws%3Alambda%3Aap-southeast-2%3A354851405923%3Afunction%3Asif-pouya-dev-activitiesApi%22%2C%22awsRequestId%22%3A%22a915d2a0-2df5-4ebd-97f9-932ee3884cb5%22%7D',
			'user-agent': 'lightMyRequest',
			host: 'localhost:80',
			'content-length': '0',
		};

		// execute
		const actual = await underTest.isProxied('shared-tenant', mockFastifyRequest);

		// verify
		expect(actual).toEqual(false);
	});

	it('request originated from a different tenant return true', async () => {
		//mocks
		mockFastifyRequest.headers = {
			authorization:
				'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJDYWxjdWxhdGlvbkVuZ2luZSIsInRlbmFudElkIjoicmVxdWVzdC10ZW5hbnQiLCJlbWFpbCI6IkNhbGN1bGF0aW9uRW5naW5lIiwiY29nbml0bzpncm91cHMiOiIvc2hhcmVkfHx8cmVhZGVyIn0.DxUYgqdsR06E6txLRXYbp2JOFUsoA_5blehgYE1BtAw',
			accept: 'application/json',
			'x-groupcontextid': '/shared',
			'x-tenant': 'request-tenant:/shared',
			'accept-version': '1.0.0',
			'content-type': 'application/json',
			'x-apigateway-event':
				'%7B%22path%22%3A%22%2Factivities%22%2C%22httpMethod%22%3A%22GET%22%2C%22headers%22%3A%7B%22Authorization%22%3A%22Bearer%20eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJDYWxjdWxhdGlvbkVuZ2luZSIsInRlbmFudElkIjoicG91eWEiLCJlbWFpbCI6IkNhbGN1bGF0aW9uRW5naW5lIiwiY29nbml0bzpncm91cHMiOiIvc2hhcmVkfHx8cmVhZGVyIn0.RWzxa7kaOcAXIkV9U3EkCMBWSW7_QljVZ_XlKrvANT8%22%2C%22Accept%22%3A%22application%2Fjson%22%2C%22x-groupcontextid%22%3A%22%2Fshared%22%2C%22x-tenant%22%3A%22pouya2%3A%2Fshared%22%2C%22Accept-Version%22%3A%221.0.0%22%2C%22Content-Type%22%3A%22application%2Fjson%22%7D%2C%22queryStringParameters%22%3A%7B%22name%22%3A%22us%3Aelectricity%3Acoal%22%7D%2C%22requestContext%22%3A%7B%22authorizer%22%3A%7B%22claims%22%3A%7B%22groupContextId%22%3A%22%2Fshared%22%2C%22email%22%3A%22Calculator%22%2C%22cognito%3Agroups%22%3A%22%2Fshared%7C%7C%7Creader%22%7D%7D%7D%7D',
			'x-apigateway-context':
				'%7B%22callbackWaitsForEmptyEventLoop%22%3Atrue%2C%22functionVersion%22%3A%22%24LATEST%22%2C%22functionName%22%3A%22sif-pouya-dev-activitiesApi%22%2C%22memoryLimitInMB%22%3A%22256%22%2C%22logGroupName%22%3A%22%2Faws%2Flambda%2Fsif-pouya-dev-activitiesApi%22%2C%22logStreamName%22%3A%222022%2F12%2F18%2F%5B%24LATEST%5Db9e265b27edb45a69285e05ffafe55a0%22%2C%22invokedFunctionArn%22%3A%22arn%3Aaws%3Alambda%3Aap-southeast-2%3A354851405923%3Afunction%3Asif-pouya-dev-activitiesApi%22%2C%22awsRequestId%22%3A%22a915d2a0-2df5-4ebd-97f9-932ee3884cb5%22%7D',
			'user-agent': 'lightMyRequest',
			host: 'localhost:80',
			'content-length': '0',
		};

		// execute
		const actual = await underTest.isProxied('shared-tenant', mockFastifyRequest);

		// verify
		expect(actual).toEqual(true);
	});

	it('no authorization header throw erros', async () => {
		//mocks
		mockFastifyRequest.raw.method = 'GET';
		mockFastifyRequest.headers = {
			accept: 'application/json',
			'x-groupcontextid': '/shared',
			'x-tenant': 'shared-tenant:/shared',
			'accept-version': '1.0.0',
			'content-type': 'application/json',
			'x-apigateway-event':
				'%7B%22path%22%3A%22%2Factivities%22%2C%22httpMethod%22%3A%22GET%22%2C%22headers%22%3A%7B%22Authorization%22%3A%22Bearer%20eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJDYWxjdWxhdGlvbkVuZ2luZSIsInRlbmFudElkIjoicG91eWEiLCJlbWFpbCI6IkNhbGN1bGF0aW9uRW5naW5lIiwiY29nbml0bzpncm91cHMiOiIvc2hhcmVkfHx8cmVhZGVyIn0.RWzxa7kaOcAXIkV9U3EkCMBWSW7_QljVZ_XlKrvANT8%22%2C%22Accept%22%3A%22application%2Fjson%22%2C%22x-groupcontextid%22%3A%22%2Fshared%22%2C%22x-tenant%22%3A%22pouya2%3A%2Fshared%22%2C%22Accept-Version%22%3A%221.0.0%22%2C%22Content-Type%22%3A%22application%2Fjson%22%7D%2C%22queryStringParameters%22%3A%7B%22name%22%3A%22us%3Aelectricity%3Acoal%22%7D%2C%22requestContext%22%3A%7B%22authorizer%22%3A%7B%22claims%22%3A%7B%22groupContextId%22%3A%22%2Fshared%22%2C%22email%22%3A%22Calculator%22%2C%22cognito%3Agroups%22%3A%22%2Fshared%7C%7C%7Creader%22%7D%7D%7D%7D',
			'x-apigateway-context':
				'%7B%22callbackWaitsForEmptyEventLoop%22%3Atrue%2C%22functionVersion%22%3A%22%24LATEST%22%2C%22functionName%22%3A%22sif-pouya-dev-activitiesApi%22%2C%22memoryLimitInMB%22%3A%22256%22%2C%22logGroupName%22%3A%22%2Faws%2Flambda%2Fsif-pouya-dev-activitiesApi%22%2C%22logStreamName%22%3A%222022%2F12%2F18%2F%5B%24LATEST%5Db9e265b27edb45a69285e05ffafe55a0%22%2C%22invokedFunctionArn%22%3A%22arn%3Aaws%3Alambda%3Aap-southeast-2%3A354851405923%3Afunction%3Asif-pouya-dev-activitiesApi%22%2C%22awsRequestId%22%3A%22a915d2a0-2df5-4ebd-97f9-932ee3884cb5%22%7D',
			'user-agent': 'lightMyRequest',
			host: 'localhost:80',
			'content-length': '0',
		};

		// verify
		await expect(underTest.isAuthorized(mockFastifyRequest)).rejects.toThrow('Missing or malformed authorization token');
	});

	it('the requested groupId is not shared by the tenant return false', async () => {
		//mocks
		mockFastifyRequest.raw.method = 'GET';
		mockFastifyRequest.headers = {
			authorization:
				'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJDYWxjdWxhdGlvbkVuZ2luZSIsInRlbmFudElkIjoicmVxdWVzdC10ZW5hbnQiLCJlbWFpbCI6IkNhbGN1bGF0aW9uRW5naW5lIiwiY29nbml0bzpncm91cHMiOiIvc2hhcmVkfHx8cmVhZGVyIn0.DxUYgqdsR06E6txLRXYbp2JOFUsoA_5blehgYE1BtAw',
			accept: 'application/json',
			'x-groupcontextid': '/shared',
			'x-tenant': 'shared-tenant:/not-shared',
			'accept-version': '1.0.0',
			'content-type': 'application/json',
			'x-apigateway-event':
				'%7B%22path%22%3A%22%2Factivities%22%2C%22httpMethod%22%3A%22GET%22%2C%22headers%22%3A%7B%22Authorization%22%3A%22Bearer%20eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJDYWxjdWxhdGlvbkVuZ2luZSIsInRlbmFudElkIjoicG91eWEiLCJlbWFpbCI6IkNhbGN1bGF0aW9uRW5naW5lIiwiY29nbml0bzpncm91cHMiOiIvc2hhcmVkfHx8cmVhZGVyIn0.RWzxa7kaOcAXIkV9U3EkCMBWSW7_QljVZ_XlKrvANT8%22%2C%22Accept%22%3A%22application%2Fjson%22%2C%22x-groupcontextid%22%3A%22%2Fshared%22%2C%22x-tenant%22%3A%22pouya2%3A%2Fshared%22%2C%22Accept-Version%22%3A%221.0.0%22%2C%22Content-Type%22%3A%22application%2Fjson%22%7D%2C%22queryStringParameters%22%3A%7B%22name%22%3A%22us%3Aelectricity%3Acoal%22%7D%2C%22requestContext%22%3A%7B%22authorizer%22%3A%7B%22claims%22%3A%7B%22groupContextId%22%3A%22%2Fshared%22%2C%22email%22%3A%22Calculator%22%2C%22cognito%3Agroups%22%3A%22%2Fshared%7C%7C%7Creader%22%7D%7D%7D%7D',
			'x-apigateway-context':
				'%7B%22callbackWaitsForEmptyEventLoop%22%3Atrue%2C%22functionVersion%22%3A%22%24LATEST%22%2C%22functionName%22%3A%22sif-pouya-dev-activitiesApi%22%2C%22memoryLimitInMB%22%3A%22256%22%2C%22logGroupName%22%3A%22%2Faws%2Flambda%2Fsif-pouya-dev-activitiesApi%22%2C%22logStreamName%22%3A%222022%2F12%2F18%2F%5B%24LATEST%5Db9e265b27edb45a69285e05ffafe55a0%22%2C%22invokedFunctionArn%22%3A%22arn%3Aaws%3Alambda%3Aap-southeast-2%3A354851405923%3Afunction%3Asif-pouya-dev-activitiesApi%22%2C%22awsRequestId%22%3A%22a915d2a0-2df5-4ebd-97f9-932ee3884cb5%22%7D',
			'user-agent': 'lightMyRequest',
			host: 'localhost:80',
			'content-length': '0',
		};

		// verify
		await expect(underTest.isAuthorized(mockFastifyRequest)).rejects.toThrow('Not authorized to access tenant path shared-tenant:/not-shared');
	});

	it('the requested outgoing tenantId:groupId is not permitted return false', async () => {
		//mocks
		mockFastifyRequest.raw.method = 'GET';
		mockFastifyRequest.headers = {
			authorization:
				'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJDYWxjdWxhdGlvbkVuZ2luZSIsInRlbmFudElkIjoicmVxdWVzdC10ZW5hbnQiLCJlbWFpbCI6IkNhbGN1bGF0aW9uRW5naW5lIiwiY29nbml0bzpncm91cHMiOiIvc2hhcmVkfHx8cmVhZGVyIn0.DxUYgqdsR06E6txLRXYbp2JOFUsoA_5blehgYE1BtAw',
			accept: 'application/json',
			'x-groupcontextid': '/shared',
			'x-tenant': 'not-shared-tenant:/shared',
			'accept-version': '1.0.0',
			'content-type': 'application/json',
			'x-apigateway-event':
				'%7B%22path%22%3A%22%2Factivities%22%2C%22httpMethod%22%3A%22GET%22%2C%22headers%22%3A%7B%22Authorization%22%3A%22Bearer%20eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJDYWxjdWxhdGlvbkVuZ2luZSIsInRlbmFudElkIjoicG91eWEiLCJlbWFpbCI6IkNhbGN1bGF0aW9uRW5naW5lIiwiY29nbml0bzpncm91cHMiOiIvc2hhcmVkfHx8cmVhZGVyIn0.RWzxa7kaOcAXIkV9U3EkCMBWSW7_QljVZ_XlKrvANT8%22%2C%22Accept%22%3A%22application%2Fjson%22%2C%22x-groupcontextid%22%3A%22%2Fshared%22%2C%22x-tenant%22%3A%22pouya2%3A%2Fshared%22%2C%22Accept-Version%22%3A%221.0.0%22%2C%22Content-Type%22%3A%22application%2Fjson%22%7D%2C%22queryStringParameters%22%3A%7B%22name%22%3A%22us%3Aelectricity%3Acoal%22%7D%2C%22requestContext%22%3A%7B%22authorizer%22%3A%7B%22claims%22%3A%7B%22groupContextId%22%3A%22%2Fshared%22%2C%22email%22%3A%22Calculator%22%2C%22cognito%3Agroups%22%3A%22%2Fshared%7C%7C%7Creader%22%7D%7D%7D%7D',
			'x-apigateway-context':
				'%7B%22callbackWaitsForEmptyEventLoop%22%3Atrue%2C%22functionVersion%22%3A%22%24LATEST%22%2C%22functionName%22%3A%22sif-pouya-dev-activitiesApi%22%2C%22memoryLimitInMB%22%3A%22256%22%2C%22logGroupName%22%3A%22%2Faws%2Flambda%2Fsif-pouya-dev-activitiesApi%22%2C%22logStreamName%22%3A%222022%2F12%2F18%2F%5B%24LATEST%5Db9e265b27edb45a69285e05ffafe55a0%22%2C%22invokedFunctionArn%22%3A%22arn%3Aaws%3Alambda%3Aap-southeast-2%3A354851405923%3Afunction%3Asif-pouya-dev-activitiesApi%22%2C%22awsRequestId%22%3A%22a915d2a0-2df5-4ebd-97f9-932ee3884cb5%22%7D',
			'user-agent': 'lightMyRequest',
			host: 'localhost:80',
			'content-length': '0',
		};

		// verify
		await expect(underTest.isAuthorized(mockFastifyRequest)).rejects.toThrow('Not authorized to access tenant path not-shared-tenant:/shared');
	});

	it('PUT method is not permitted return false', async () => {
		//mocks
		mockFastifyRequest.raw.method = 'PUT';
		mockFastifyRequest.headers = {
			authorization:
				'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJDYWxjdWxhdGlvbkVuZ2luZSIsInRlbmFudElkIjoicmVxdWVzdC10ZW5hbnQiLCJlbWFpbCI6IkNhbGN1bGF0aW9uRW5naW5lIiwiY29nbml0bzpncm91cHMiOiIvc2hhcmVkfHx8cmVhZGVyIn0.DxUYgqdsR06E6txLRXYbp2JOFUsoA_5blehgYE1BtAw',
			accept: 'application/json',
			'x-groupcontextid': '/shared',
			'x-tenant': 'shared-tenant:/shared',
			'accept-version': '1.0.0',
			'content-type': 'application/json',
			'x-apigateway-event':
				'%7B%22path%22%3A%22%2Factivities%22%2C%22httpMethod%22%3A%22GET%22%2C%22headers%22%3A%7B%22Authorization%22%3A%22Bearer%20eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJDYWxjdWxhdGlvbkVuZ2luZSIsInRlbmFudElkIjoicG91eWEiLCJlbWFpbCI6IkNhbGN1bGF0aW9uRW5naW5lIiwiY29nbml0bzpncm91cHMiOiIvc2hhcmVkfHx8cmVhZGVyIn0.RWzxa7kaOcAXIkV9U3EkCMBWSW7_QljVZ_XlKrvANT8%22%2C%22Accept%22%3A%22application%2Fjson%22%2C%22x-groupcontextid%22%3A%22%2Fshared%22%2C%22x-tenant%22%3A%22pouya2%3A%2Fshared%22%2C%22Accept-Version%22%3A%221.0.0%22%2C%22Content-Type%22%3A%22application%2Fjson%22%7D%2C%22queryStringParameters%22%3A%7B%22name%22%3A%22us%3Aelectricity%3Acoal%22%7D%2C%22requestContext%22%3A%7B%22authorizer%22%3A%7B%22claims%22%3A%7B%22groupContextId%22%3A%22%2Fshared%22%2C%22email%22%3A%22Calculator%22%2C%22cognito%3Agroups%22%3A%22%2Fshared%7C%7C%7Creader%22%7D%7D%7D%7D',
			'x-apigateway-context':
				'%7B%22callbackWaitsForEmptyEventLoop%22%3Atrue%2C%22functionVersion%22%3A%22%24LATEST%22%2C%22functionName%22%3A%22sif-pouya-dev-activitiesApi%22%2C%22memoryLimitInMB%22%3A%22256%22%2C%22logGroupName%22%3A%22%2Faws%2Flambda%2Fsif-pouya-dev-activitiesApi%22%2C%22logStreamName%22%3A%222022%2F12%2F18%2F%5B%24LATEST%5Db9e265b27edb45a69285e05ffafe55a0%22%2C%22invokedFunctionArn%22%3A%22arn%3Aaws%3Alambda%3Aap-southeast-2%3A354851405923%3Afunction%3Asif-pouya-dev-activitiesApi%22%2C%22awsRequestId%22%3A%22a915d2a0-2df5-4ebd-97f9-932ee3884cb5%22%7D',
			'user-agent': 'lightMyRequest',
			host: 'localhost:80',
			'content-length': '0',
		};

		// verify
		await expect(underTest.isAuthorized(mockFastifyRequest)).rejects.toThrow('Only GET and OPTIONS requests are supported');
	});

	it('PATCH method is not permitted return false', async () => {
		//mocks
		mockFastifyRequest.raw.method = 'PATCH';
		mockFastifyRequest.headers = {
			authorization:
				'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJDYWxjdWxhdGlvbkVuZ2luZSIsInRlbmFudElkIjoicmVxdWVzdC10ZW5hbnQiLCJlbWFpbCI6IkNhbGN1bGF0aW9uRW5naW5lIiwiY29nbml0bzpncm91cHMiOiIvc2hhcmVkfHx8cmVhZGVyIn0.DxUYgqdsR06E6txLRXYbp2JOFUsoA_5blehgYE1BtAw',
			accept: 'application/json',
			'x-groupcontextid': '/shared',
			'x-tenant': 'shared-tenant:/shared',
			'accept-version': '1.0.0',
			'content-type': 'application/json',
			'x-apigateway-event':
				'%7B%22path%22%3A%22%2Factivities%22%2C%22httpMethod%22%3A%22GET%22%2C%22headers%22%3A%7B%22Authorization%22%3A%22Bearer%20eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJDYWxjdWxhdGlvbkVuZ2luZSIsInRlbmFudElkIjoicG91eWEiLCJlbWFpbCI6IkNhbGN1bGF0aW9uRW5naW5lIiwiY29nbml0bzpncm91cHMiOiIvc2hhcmVkfHx8cmVhZGVyIn0.RWzxa7kaOcAXIkV9U3EkCMBWSW7_QljVZ_XlKrvANT8%22%2C%22Accept%22%3A%22application%2Fjson%22%2C%22x-groupcontextid%22%3A%22%2Fshared%22%2C%22x-tenant%22%3A%22pouya2%3A%2Fshared%22%2C%22Accept-Version%22%3A%221.0.0%22%2C%22Content-Type%22%3A%22application%2Fjson%22%7D%2C%22queryStringParameters%22%3A%7B%22name%22%3A%22us%3Aelectricity%3Acoal%22%7D%2C%22requestContext%22%3A%7B%22authorizer%22%3A%7B%22claims%22%3A%7B%22groupContextId%22%3A%22%2Fshared%22%2C%22email%22%3A%22Calculator%22%2C%22cognito%3Agroups%22%3A%22%2Fshared%7C%7C%7Creader%22%7D%7D%7D%7D',
			'x-apigateway-context':
				'%7B%22callbackWaitsForEmptyEventLoop%22%3Atrue%2C%22functionVersion%22%3A%22%24LATEST%22%2C%22functionName%22%3A%22sif-pouya-dev-activitiesApi%22%2C%22memoryLimitInMB%22%3A%22256%22%2C%22logGroupName%22%3A%22%2Faws%2Flambda%2Fsif-pouya-dev-activitiesApi%22%2C%22logStreamName%22%3A%222022%2F12%2F18%2F%5B%24LATEST%5Db9e265b27edb45a69285e05ffafe55a0%22%2C%22invokedFunctionArn%22%3A%22arn%3Aaws%3Alambda%3Aap-southeast-2%3A354851405923%3Afunction%3Asif-pouya-dev-activitiesApi%22%2C%22awsRequestId%22%3A%22a915d2a0-2df5-4ebd-97f9-932ee3884cb5%22%7D',
			'user-agent': 'lightMyRequest',
			host: 'localhost:80',
			'content-length': '0',
		};

		// verify
		await expect(underTest.isAuthorized(mockFastifyRequest)).rejects.toThrow('Only GET and OPTIONS requests are supported');
	});

	it('DELETE method is not permitted throw error', async () => {
		// mock
		mockFastifyRequest.raw.method = 'DELETE';
		mockFastifyRequest.headers = {
			authorization:
				'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJDYWxjdWxhdGlvbkVuZ2luZSIsInRlbmFudElkIjoicmVxdWVzdC10ZW5hbnQiLCJlbWFpbCI6IkNhbGN1bGF0aW9uRW5naW5lIiwiY29nbml0bzpncm91cHMiOiIvc2hhcmVkfHx8cmVhZGVyIn0.DxUYgqdsR06E6txLRXYbp2JOFUsoA_5blehgYE1BtAw',
			accept: 'application/json',
			'x-groupcontextid': '/shared',
			'x-tenant': 'shared-tenant:/shared',
			'accept-version': '1.0.0',
			'content-type': 'application/json',
			'x-apigateway-event':
				'%7B%22path%22%3A%22%2Factivities%22%2C%22httpMethod%22%3A%22GET%22%2C%22headers%22%3A%7B%22Authorization%22%3A%22Bearer%20eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJDYWxjdWxhdGlvbkVuZ2luZSIsInRlbmFudElkIjoicG91eWEiLCJlbWFpbCI6IkNhbGN1bGF0aW9uRW5naW5lIiwiY29nbml0bzpncm91cHMiOiIvc2hhcmVkfHx8cmVhZGVyIn0.RWzxa7kaOcAXIkV9U3EkCMBWSW7_QljVZ_XlKrvANT8%22%2C%22Accept%22%3A%22application%2Fjson%22%2C%22x-groupcontextid%22%3A%22%2Fshared%22%2C%22x-tenant%22%3A%22pouya2%3A%2Fshared%22%2C%22Accept-Version%22%3A%221.0.0%22%2C%22Content-Type%22%3A%22application%2Fjson%22%7D%2C%22queryStringParameters%22%3A%7B%22name%22%3A%22us%3Aelectricity%3Acoal%22%7D%2C%22requestContext%22%3A%7B%22authorizer%22%3A%7B%22claims%22%3A%7B%22groupContextId%22%3A%22%2Fshared%22%2C%22email%22%3A%22Calculator%22%2C%22cognito%3Agroups%22%3A%22%2Fshared%7C%7C%7Creader%22%7D%7D%7D%7D',
			'x-apigateway-context':
				'%7B%22callbackWaitsForEmptyEventLoop%22%3Atrue%2C%22functionVersion%22%3A%22%24LATEST%22%2C%22functionName%22%3A%22sif-pouya-dev-activitiesApi%22%2C%22memoryLimitInMB%22%3A%22256%22%2C%22logGroupName%22%3A%22%2Faws%2Flambda%2Fsif-pouya-dev-activitiesApi%22%2C%22logStreamName%22%3A%222022%2F12%2F18%2F%5B%24LATEST%5Db9e265b27edb45a69285e05ffafe55a0%22%2C%22invokedFunctionArn%22%3A%22arn%3Aaws%3Alambda%3Aap-southeast-2%3A354851405923%3Afunction%3Asif-pouya-dev-activitiesApi%22%2C%22awsRequestId%22%3A%22a915d2a0-2df5-4ebd-97f9-932ee3884cb5%22%7D',
			'user-agent': 'lightMyRequest',
			host: 'localhost:80',
			'content-length': '0',
		};

		// verify
		await expect(underTest.isAuthorized(mockFastifyRequest)).rejects.toThrow('Only GET and OPTIONS requests are supported');
	});

	it('valid request should  return true', async () => {
		//mocks
		mockFastifyRequest.raw.method = 'GET';
		mockFastifyRequest.headers = {
			authorization:
				'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJDYWxjdWxhdGlvbkVuZ2luZSIsInRlbmFudElkIjoicmVxdWVzdC10ZW5hbnQiLCJlbWFpbCI6IkNhbGN1bGF0aW9uRW5naW5lIiwiY29nbml0bzpncm91cHMiOiIvc2hhcmVkfHx8cmVhZGVyIn0.DxUYgqdsR06E6txLRXYbp2JOFUsoA_5blehgYE1BtAw',
			accept: 'application/json',
			'x-groupcontextid': '/shared',
			'x-tenant': 'shared-tenant',
			'accept-version': '1.0.0',
			'content-type': 'application/json',
			'x-apigateway-event':
				'%7B%22path%22%3A%22%2Factivities%22%2C%22httpMethod%22%3A%22GET%22%2C%22headers%22%3A%7B%22Authorization%22%3A%22Bearer%20eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJDYWxjdWxhdGlvbkVuZ2luZSIsInRlbmFudElkIjoicG91eWEiLCJlbWFpbCI6IkNhbGN1bGF0aW9uRW5naW5lIiwiY29nbml0bzpncm91cHMiOiIvc2hhcmVkfHx8cmVhZGVyIn0.RWzxa7kaOcAXIkV9U3EkCMBWSW7_QljVZ_XlKrvANT8%22%2C%22Accept%22%3A%22application%2Fjson%22%2C%22x-groupcontextid%22%3A%22%2Fshared%22%2C%22x-tenant%22%3A%22pouya2%3A%2Fshared%22%2C%22Accept-Version%22%3A%221.0.0%22%2C%22Content-Type%22%3A%22application%2Fjson%22%7D%2C%22queryStringParameters%22%3A%7B%22name%22%3A%22us%3Aelectricity%3Acoal%22%7D%2C%22requestContext%22%3A%7B%22authorizer%22%3A%7B%22claims%22%3A%7B%22groupContextId%22%3A%22%2Fshared%22%2C%22email%22%3A%22Calculator%22%2C%22cognito%3Agroups%22%3A%22%2Fshared%7C%7C%7Creader%22%7D%7D%7D%7D',
			'x-apigateway-context':
				'%7B%22callbackWaitsForEmptyEventLoop%22%3Atrue%2C%22functionVersion%22%3A%22%24LATEST%22%2C%22functionName%22%3A%22sif-pouya-dev-activitiesApi%22%2C%22memoryLimitInMB%22%3A%22256%22%2C%22logGroupName%22%3A%22%2Faws%2Flambda%2Fsif-pouya-dev-activitiesApi%22%2C%22logStreamName%22%3A%222022%2F12%2F18%2F%5B%24LATEST%5Db9e265b27edb45a69285e05ffafe55a0%22%2C%22invokedFunctionArn%22%3A%22arn%3Aaws%3Alambda%3Aap-southeast-2%3A354851405923%3Afunction%3Asif-pouya-dev-activitiesApi%22%2C%22awsRequestId%22%3A%22a915d2a0-2df5-4ebd-97f9-932ee3884cb5%22%7D',
			'user-agent': 'lightMyRequest',
			host: 'localhost:80',
			'content-length': '0',
		};
		// execute
		await underTest.isAuthorized(mockFastifyRequest);
	});
});
