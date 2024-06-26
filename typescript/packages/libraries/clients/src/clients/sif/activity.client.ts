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

import { Invoker, LambdaApiGatewayEventBuilder, LambdaApiGatewayEventResponse } from '@sif/lambda-invoker';

import { ClientServiceBase } from '../../common/common.js';
import type { ActivitiesList, ActivityQS, ActivityResource } from './activity.models.js';
import type { LambdaRequestContext } from '../../common/models.js';
import type { BaseLogger } from 'pino';

export class ActivityClient extends ClientServiceBase {
	private readonly activityFunctionName: string;
	private readonly log: BaseLogger;
	private readonly lambdaInvoker: Invoker;

	constructor(log: BaseLogger, lambdaInvoker: Invoker, activityFunctionName: string) {
		super();
		this.lambdaInvoker = lambdaInvoker;
		this.activityFunctionName = activityFunctionName;
		this.log = log;
	}

	public async get(activityId: string, version?: number, requestContext?: LambdaRequestContext, verbose = true): Promise<ActivityResource> {
		this.log.info(`ActivityClient > get > in > activityId: ${activityId}, version : ${version}, verbose:${verbose}`);

		const additionalHeaders = {};

		if (requestContext.authorizer.claims.groupContextId) {
			additionalHeaders['x-groupcontextid'] = requestContext.authorizer.claims.groupContextId;
		}

		const event: LambdaApiGatewayEventBuilder = new LambdaApiGatewayEventBuilder()
			.setMethod('GET')
			.setRequestContext(requestContext)
			.setHeaders(super.buildHeaders(additionalHeaders))
			.setPath(version ? `activities/${activityId}/versions/${version}` : `activities/${activityId}`)
			.setQueryStringParameters({
				verbose: verbose.toString(),
			});

		const result = await this.lambdaInvoker.invoke(this.activityFunctionName, event);
		this.log.info(`ActivityClient > get > exit > result: ${JSON.stringify(result)}`);
		return result.body as ActivityResource;
	}

	public async getByAlias(activityName: string, requestContext?: LambdaRequestContext, verbose = true): Promise<ActivityResource | undefined> {
		this.log.info(`ActivityClient > getByAlias > in > activityName: ${activityName},verbose:${verbose}`);

		const additionalHeaders = {};

		if (requestContext.authorizer.claims.groupContextId) {
			additionalHeaders['x-groupcontextid'] = requestContext.authorizer.claims.groupContextId;
		}

		const event: LambdaApiGatewayEventBuilder = new LambdaApiGatewayEventBuilder()
			.setMethod('GET')
			.setRequestContext(requestContext)
			.setHeaders(super.buildHeaders(additionalHeaders))
			.setPath(`activities?name=${activityName}`)
			.setQueryStringParameters({
				verbose: verbose.toString(),
			});

		const result = await this.lambdaInvoker.invoke(this.activityFunctionName, event);
		this.log.info(`ActivityClient > getByAlias > exit > result: ${JSON.stringify(result)}`);
		const activityList = (result.body as ActivitiesList);

		return activityList.activities.length < 1 ? undefined : activityList.activities[0];
	}

	public async listActivities(req: ActivityQS, requestContext?: LambdaRequestContext): Promise<ActivitiesList> {
		this.log.info(`ActivityClient > list > in > request: ${JSON.stringify(req)}`);

		const additionalHeaders = {};

		if (requestContext?.authorizer?.claims?.groupContextId) {
			additionalHeaders['x-groupcontextid'] = requestContext.authorizer.claims.groupContextId;
		}


		const event: LambdaApiGatewayEventBuilder = new LambdaApiGatewayEventBuilder()
			.setMethod('GET')
			.setRequestContext(requestContext)
			.setHeaders(super.buildHeaders(additionalHeaders))
			.setPath(`activities`)
			.setQueryStringParameters(req);

		let result: LambdaApiGatewayEventResponse = {};
		try {
			result = await this.lambdaInvoker.invoke(this.activityFunctionName, event);
		} catch (err) {
			this.log.error(`ActivityClient > list > exit > error: ${err}`);
			result.body['activities'] = [];
		}
		this.log.info(`ActivityClient > list > exit}`);
		return result.body as ActivitiesList;
	}

}
