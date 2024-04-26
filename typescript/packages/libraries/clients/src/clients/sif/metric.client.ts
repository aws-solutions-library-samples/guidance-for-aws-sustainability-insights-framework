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

import { ClientServiceBase } from '../../common/common.js';
import type { Metric, MetricList, MetricQueue } from './metric.models.js';
import type { LambdaRequestContext } from '../../common/models.js';
import type { BaseLogger } from 'pino';

export class MetricClient extends ClientServiceBase {
	private readonly metricFunctionName: string;
	private readonly log: BaseLogger;
	private readonly lambdaInvoker: Invoker;

	constructor(log: BaseLogger, lambdaInvoker: Invoker, metricFunctionName: string) {
		super();
		this.lambdaInvoker = lambdaInvoker;
		this.metricFunctionName = metricFunctionName;
		this.log = log;
	}

	public async getById(metricId: string, version?: number, requestContext?: LambdaRequestContext): Promise<Metric> {
		this.log.info(`MetricClient > getById > in > metricId: ${metricId}, version: ${version}`);

		const additionalHeaders = {};

		if (requestContext?.authorizer?.claims?.groupContextId) {
			additionalHeaders['x-groupcontextid'] = requestContext.authorizer.claims.groupContextId;
		}

		const event: LambdaApiGatewayEventBuilder = new LambdaApiGatewayEventBuilder()
			.setMethod('GET')
			.setRequestContext(requestContext)
			.setHeaders(super.buildHeaders(additionalHeaders))
			.setPath(version ? `metrics/${metricId}/versions/${version}` : `metrics/${metricId}`);

		const result = await this.lambdaInvoker.invoke(this.metricFunctionName, event);
		this.log.info(`MetricClient > getById > exit > result: ${JSON.stringify(result)}`);
		return result.body as Metric;
	}

	public async sortMetricsByDependencyOrder(metricNames: string[], requestContext?: LambdaRequestContext): Promise<MetricQueue> {
		this.log.trace(`MetricClient> sortMetricsByDependencyOrder> metricNames: ${metricNames}, requestContext: ${JSON.stringify(requestContext)}`);
		let order = 1;
		const metrics: Metric[] = [];

		for (const name of metricNames) {
			metrics.push(await this.getByName(name, undefined, requestContext));
		}

		const metricQueue: MetricQueue = [];
		metricQueue.push(...metrics.map((k) => {
			return {
				order: order++,
				metric: k.name
			};
		}));

		let parentMetricNames = Array.from(new Set<string>(Object.values(metrics).flatMap((k) => k.outputMetrics)));
		while ((parentMetricNames?.length ?? 0) > 0) {
			const parentMetrics: Metric[] = [];
			for (const name of parentMetricNames) {
				if (name === null || name === undefined) {
					continue;
				}
				parentMetrics.push(await this.getByName(name, undefined, requestContext));
			}

			for (const parentMetric of parentMetrics) {
				if (metricQueue.find(o => o.metric === parentMetric.name) !== undefined) {
					throw new Error(`Metric ${parentMetric.name} already referenced but discovered in Metric dependency path.`);
				}
				metricQueue.push({
					order: order++,
					metric: parentMetric.name
				});
			}

			// let see if the parent metrics have any parents of their own
			parentMetricNames = Array.from(new Set<string>(Object.values(parentMetrics)
				?.filter((k) => k !== null)
				?.flatMap((k) => k.outputMetrics)));
		}
		this.log.trace(`MetricClient> sortMetricsByDependencyOrder> exit>  metricQueue: ${metricQueue}`);
		return metricQueue;
	}

	public async getByName(metricName: string, version?: number, requestContext?: LambdaRequestContext): Promise<Metric> {
		this.log.info(`MetricClient > getByName > in > metricName: ${metricName}, version: ${version}`);

		const additionalHeaders = {};

		if (requestContext?.authorizer?.claims?.groupContextId) {
			additionalHeaders['x-groupcontextid'] = requestContext.authorizer.claims.groupContextId;
		}

		// 1st find ID
		const event: LambdaApiGatewayEventBuilder = new LambdaApiGatewayEventBuilder()
			.setMethod('GET')
			.setPath('/metrics')
			.setQueryStringParameters({
				name: metricName,
				includeParentGroups: 'true',
			})
			.setRequestContext(requestContext)
			.setHeaders(super.buildHeaders(additionalHeaders));

		const result = (await this.lambdaInvoker.invoke(this.metricFunctionName, event))?.body as MetricList;
		const metric = result?.metrics?.[0];
		this.log.info(`MetricClient > getByName > exit: ${JSON.stringify(metric)}`);
		return metric;
	}
}
