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
import { ClientServiceBase } from '../common/common.js';
import type { LambdaRequestContext } from '../common/models.js';
import type { Execution, ExecutionList, NewExecution } from './execution.models.js';

export class ExecutionClient extends ClientServiceBase {
	private readonly pipelineProcessorFunctionName: string;
	private readonly log: BaseLogger;
	private readonly lambdaInvoker: Invoker;

	constructor(log: BaseLogger, lambdaInvoker: Invoker, pipelineProcessorFunctionName: string) {
		super();
		this.lambdaInvoker = lambdaInvoker;
		this.pipelineProcessorFunctionName = pipelineProcessorFunctionName;
		this.log = log;
	}

	public async get(pipelineId: string, executionId: string, requestContext?: LambdaRequestContext, verbose = true): Promise<Execution> {
		this.log.info(`ExecutionClient > get > in > pipelineId:${pipelineId}, executionId: ${executionId}`);

		const additionalHeaders = {};

		if (requestContext.authorizer.claims.groupContextId) {
			additionalHeaders['x-groupcontextid'] = requestContext.authorizer.claims.groupContextId;
		}

		const event: LambdaApiGatewayEventBuilder = new LambdaApiGatewayEventBuilder()
			.setMethod('GET')
			.setRequestContext(requestContext)
			.setHeaders(super.buildHeaders(additionalHeaders))
			.setPath(`pipelines/${pipelineId}/executions/${executionId}`)
			.setQueryStringParameters({
				verbose: verbose.toString(),
			});

		const result = await this.lambdaInvoker.invoke(this.pipelineProcessorFunctionName, event);
		this.log.info(`ExecutionClient > get > exit`);
		return result.body as Execution;
	}

	public async list(pipelineId: string, requestContext?: LambdaRequestContext, options?: { tags: { key: string, value: string } }): Promise<ExecutionList> {
		this.log.info(`ExecutionClient > list > in > pipelineId:${pipelineId} `);

		const additionalHeaders = {};

		if (requestContext.authorizer.claims.groupContextId) {
			additionalHeaders['x-groupcontextid'] = requestContext.authorizer.claims.groupContextId;
		}

		let event: LambdaApiGatewayEventBuilder = new LambdaApiGatewayEventBuilder()
			.setMethod('GET')
			.setRequestContext(requestContext)
			.setHeaders(super.buildHeaders(additionalHeaders))
			.setPath(`pipelines/${pipelineId}/executions`)
			.setQueryStringParameters({});

		if (options?.tags) {
			event = event.setQueryStringParameters({
				tags: `${options.tags.key}:${options.tags.value}`
			});
		}

		const result = await this.lambdaInvoker.invoke(this.pipelineProcessorFunctionName, event);
		this.log.info(`ExecutionClient > list > exit`);
		return result.body as ExecutionList;
	}

	public async create(pipelineId: string, newExecution: NewExecution, requestContext?: LambdaRequestContext): Promise<Execution> {
		this.log.info(`ExecutionClient> create> in> pipelineId:${pipelineId}, newExecution: ${JSON.stringify(newExecution)}`);

		const additionalHeaders = {};

		if (requestContext.authorizer.claims.groupContextId) {
			additionalHeaders['x-groupcontextid'] = requestContext.authorizer.claims.groupContextId;
		}

		const event: LambdaApiGatewayEventBuilder = new LambdaApiGatewayEventBuilder()
			.setMethod('POST')
			.setRequestContext(requestContext)
			.setHeaders(super.buildHeaders(additionalHeaders))
			.setBody(newExecution)
			.setPath(`pipelines/${pipelineId}/executions`);
		const result = await this.lambdaInvoker.invoke(this.pipelineProcessorFunctionName, event);
		this.log.info(`ExecutionClient> create> exit`);
		return result.body as Execution;
	}
}
