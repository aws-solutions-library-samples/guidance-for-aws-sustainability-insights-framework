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
import type { EditPipeline, Pipeline, PipelineVersionList } from './pipeline.models.js';

export class PipelineClient extends ClientServiceBase {
	private readonly pipelineFunctionName: string;
	private readonly log: BaseLogger;
	private readonly lambdaInvoker: Invoker;

	constructor(log: BaseLogger, lambdaInvoker: Invoker, pipelineFunctionName: string) {
		super();
		this.lambdaInvoker = lambdaInvoker;
		this.pipelineFunctionName = pipelineFunctionName;
		this.log = log;
	}

	public async get(pipelineId: string, version?: number, requestContext?: LambdaRequestContext, verbose = true): Promise<Pipeline> {
		this.log.info(`PipelineClient > getConfiguration > in > pipelineId: ${pipelineId}, version : ${version}, verbose:${verbose}`);

		const additionalHeaders = {};

		if (requestContext.authorizer.claims.groupContextId) {
			additionalHeaders['x-groupcontextid'] = requestContext.authorizer.claims.groupContextId;
		}

		const event: LambdaApiGatewayEventBuilder = new LambdaApiGatewayEventBuilder()
			.setMethod('GET')
			.setRequestContext(requestContext)
			.setHeaders(super.buildHeaders(additionalHeaders))
			.setPath(version ? `pipelines/${pipelineId}/versions/${version}` : `pipelines/${pipelineId}`)
			.setQueryStringParameters({
				verbose: verbose.toString(),
			});

		const result = await this.lambdaInvoker.invoke(this.pipelineFunctionName, event);
		this.log.info(`PipelineClient > getConfiguration > exit > result: ${JSON.stringify(result)}`);
		return result.body as Pipeline;
	}

	public async listAllVersions(pipelineId: string, requestContext?: LambdaRequestContext, verbose = true): Promise<PipelineVersionList> {
		this.log.info(`PipelineClient > getConfiguration > in > pipelineId: ${pipelineId},  verbose:${verbose}`);

		const additionalHeaders = {};

		if (requestContext.authorizer.claims.groupContextId) {
			additionalHeaders['x-groupcontextid'] = requestContext.authorizer.claims.groupContextId;
		}

		const event: LambdaApiGatewayEventBuilder = new LambdaApiGatewayEventBuilder()
			.setMethod('GET')
			.setRequestContext(requestContext)
			.setHeaders(super.buildHeaders(additionalHeaders))
			.setPath(`pipelines/${pipelineId}/versions`)
			.setQueryStringParameters({
				verbose: verbose.toString(),
			});

		const result = await this.lambdaInvoker.invoke(this.pipelineFunctionName, event);
		this.log.info(`PipelineClient > getConfiguration > exit > result: ${JSON.stringify(result)}`);
		return result.body as PipelineVersionList;
	}

	public async update(pipelineId: string, pipeline:EditPipeline, requestContext?: LambdaRequestContext): Promise<Pipeline> {
		this.log.info(`PipelineClient > updateConfiguration > in > pipelineId: ${pipelineId}, pipeline:${pipeline}`);

		const additionalHeaders = {};

		if (requestContext.authorizer.claims.groupContextId) {
			additionalHeaders['x-groupcontextid'] = requestContext.authorizer.claims.groupContextId;
		}

		const event: LambdaApiGatewayEventBuilder = new LambdaApiGatewayEventBuilder()
			.setMethod('PATCH')
			.setRequestContext(requestContext)
			.setHeaders(super.buildHeaders(additionalHeaders))
			.setPath(`pipelines/${pipelineId}`)
			.setBody(
				pipeline
			);

		const result = await this.lambdaInvoker.invoke(this.pipelineFunctionName, event);
		this.log.info(`PipelineClient > updateConfiguration > exit > result: ${JSON.stringify(result)}`);
		return result.body as Pipeline;
	}
}
