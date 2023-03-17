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

import { Invoker, LambdaApiGatewayEventBuilder } from '@sif/lambda-invoker';
import type { BaseLogger } from 'pino';

export interface User {
	email: string;
	defaultGroup: string;
}

export class AccessManagementClient {
	private readonly log: BaseLogger;
	private readonly invoker: Invoker;

	public constructor(log: BaseLogger, invoker: Invoker) {
		this.log = log;
		this.invoker = invoker;
	}

	public async getUser(email: string): Promise<User> {
		this.log.debug(`AccessManagementClient> getUser> in> email:${email}`);
		const event = new LambdaApiGatewayEventBuilder()
			.setMethod('GET')
			.setPath(`/users/${email}`)
			.setHeaders({
				Accept: 'application/json',
				'Accept-Version': '1.0.0',
				'Content-Type': 'application/json',
				'x-groupcontextid': `/`,
			})
			.setRequestContext({
				authorizer: {
					claims: {
						email: 'preTokenGenerationLambda',
						'cognito:groups': '/|||admin',
					},
				},
			});

		this.log.debug(`AccessManagementClient> getUser> event:${JSON.stringify(event)}`);
		const response = await this.invoker.invoke(process.env['ACCESS_MANAGEMENT_FUNCTION_NAME'] as string, event);
		this.log.debug(`AccessManagementClient> getUser> exit:${JSON.stringify(response)}`);
		return response.body as User;
	}
}
