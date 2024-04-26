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

import { ClientServiceBase } from '../../common/common.js';
import { Invoker, LambdaApiGatewayEventBuilder } from '@sif/lambda-invoker';
import type { LambdaRequestContext } from '../../common/models.js';
import type { BaseLogger } from 'pino';
import type { Activity, ActivityList, BulkActivities, NewActivity, NewBulkActivities } from './impact.model.js';

export class ImpactClient extends ClientServiceBase {

	constructor(private log: BaseLogger, private lambdaInvoker: Invoker, private impactFunctionName: string) {
		super();
	}

	public async getByAlias(activityName: string, requestContext?: LambdaRequestContext, verbose = true): Promise<Activity | undefined> {
		this.log.info(`ImpactClient > getByAlias > in > activityId: ${activityName},verbose:${verbose}`);

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

		const result = await this.lambdaInvoker.invoke(this.impactFunctionName, event);
		this.log.info(`ImpactClient > getByAlias > exit > result: ${JSON.stringify(result)}`);
		const activityList = (result.body as ActivityList);
		return activityList.activities.length < 1 ? undefined : activityList.activities[0];
	}

	public async get(activityId: string, version?: number, requestContext?: LambdaRequestContext, verbose = true): Promise<Activity> {
		this.log.info(`ImpactClient > get > in > activityId: ${activityId}, version : ${version}, verbose:${verbose}`);

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

		const result = await this.lambdaInvoker.invoke(this.impactFunctionName, event);
		this.log.info(`ActivityClient > get > exit > result: ${JSON.stringify(result)}`);
		return result.body as Activity;
	}

	public async update(activityId: string, newActivity: NewActivity, requestContext?: LambdaRequestContext): Promise<Activity> {
		this.log.info(`ImpactClient> update> in> newActivity: ${newActivity}`);

		const additionalHeaders = {};

		if (requestContext.authorizer.claims.groupContextId) {
			additionalHeaders['x-groupcontextid'] = requestContext.authorizer.claims.groupContextId;
		}

		const event: LambdaApiGatewayEventBuilder = new LambdaApiGatewayEventBuilder()
			.setMethod('PATCH')
			.setRequestContext(requestContext)
			.setHeaders(super.buildHeaders(additionalHeaders))
			.setBody(newActivity)
			.setPath(`activities/${activityId}`);

		const result = await this.lambdaInvoker.invoke(this.impactFunctionName, event);
		this.log.info(`ImpactClient> update> exit> result: ${JSON.stringify(result)}`);
		return result.body as Activity;
	}

	public async createBulk(newBulkActivities: NewBulkActivities, requestContext?: LambdaRequestContext): Promise<BulkActivities> {
		this.log.info(`ImpactClient> createBulk> in> newBulkActivities: ${newBulkActivities}`);

		const additionalHeaders = {};

		if (requestContext.authorizer.claims.groupContextId) {
			additionalHeaders['x-groupcontextid'] = requestContext.authorizer.claims.groupContextId;
		}

		const event: LambdaApiGatewayEventBuilder = new LambdaApiGatewayEventBuilder()
			.setMethod('POST')
			.setRequestContext(requestContext)
			.setHeaders(super.buildHeaders(additionalHeaders))
			.setBody(newBulkActivities)
			.setPath(`activityTasks`);

		const result = await this.lambdaInvoker.invoke(this.impactFunctionName, event);
		this.log.info(`ImpactClient> createBulk> exit> result: ${JSON.stringify(result)}`);
		return result.body as BulkActivities;
	}

	public async create(newActivity: NewActivity, requestContext?: LambdaRequestContext): Promise<Activity> {
		this.log.info(`ImpactClient> create> in> newActivity: ${newActivity}`);

		const additionalHeaders = {};

		if (requestContext.authorizer.claims.groupContextId) {
			additionalHeaders['x-groupcontextid'] = requestContext.authorizer.claims.groupContextId;
		}

		const event: LambdaApiGatewayEventBuilder = new LambdaApiGatewayEventBuilder()
			.setMethod('POST')
			.setRequestContext(requestContext)
			.setHeaders(super.buildHeaders(additionalHeaders))
			.setBody(newActivity)
			.setPath(`activities`);

		const result = await this.lambdaInvoker.invoke(this.impactFunctionName, event);
		this.log.info(`ImpactClient> create> exit> result: ${JSON.stringify(result)}`);
		return result.body as Activity;
	}
}
