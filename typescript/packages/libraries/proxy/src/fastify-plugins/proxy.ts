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

import type { FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import type { LambdaClient } from '@aws-sdk/client-lambda';
import type { LambdaApiGatewayEvent, LambdaApiGatewayEventResponse } from '@sif/lambda-invoker';
import { ProxyClient, UnauthorizedError, NotFoundError } from '../proxy.client.js';
import type { BaseLogger } from 'pino';
import type { HttpError } from '@fastify/sensible/lib/httpError.js';

export interface ProxyOptions {
	skipProxyCheck?: boolean;
}

/**
 * Map of module to the module name used when naming the API lambda functions
 */
enum ServiceMap {
	impacts = 'impactsApi',
	referenceDatasets = 'referenceDatasetsApi',
	calculations = 'calculationsApi',
}

declare module 'fastify' {
	interface FastifyRequest {
		proxyToken: string;
	}
}

// The IInvoker interface will be implemented by Invoker in @sif/lambda-invoker module
export interface IInvoker {
	invoke(functionName: string, event: LambdaApiGatewayEvent): Promise<LambdaApiGatewayEventResponse>;

	readonly log: BaseLogger;
	readonly client: LambdaClient;
}

// Plugin config
const region = process.env['AWS_REGION'] as string;
const tenantId = process.env['TENANT_ID'] as string;
const env = process.env['NODE_ENV'] as string;
const moduleName = process.env['MODULE_NAME'] as string;

/**
 * Extracts the destination tenant from x-tenant header.
 * Extracts the source tenant from x-source-tenant header
 * Proxies the request based on the supplied tenant
 */
export default fp<ProxyOptions>(async (app, opts): Promise<void> => {
	app.log.debug(`proxy> onRequest> in> Module: ${moduleName} Region: ${region}, TenantId: ${tenantId}, Environment: ${env}`);

	/**
	 * Resets the `proxy` attributes per request.
	 */
	app.decorateRequest('proxy', null);
	app.decorateRequest('proxyToken', '');

	/**
	 * performs the extraction per request.
	 */
	app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {

		// @ts-ignore
		const proxyClient: ProxyClient = req.diScope.resolve('proxyClient');

		const event = proxyClient.extractApiGatewayEventFromHeaders(req.headers);
		app.log.debug(`proxy> onRequest> in> event ${JSON.stringify(event)}`);

		/**
		 * Do not proxy if skipProxyCheck is true
		 */
		if (opts.skipProxyCheck) {
			return;
		}


		// Validate if the request should be proxied
		if (!proxyClient.isProxied(tenantId, req)) {
			return;
		}

		// Validate if request is authorized to call the target tenant
		await proxyClient.isAuthorized(req);

		// get reference to the target lambda
		const targetTenant = req.headers['x-tenant'] as string;
		const targetGroup = req.headers['x-groupcontextid'] as string;

		/**
		 * Transform request into an APIGW Event and invoke the lambda
		 * Note: since this is a OnRequest hook body will always be empty
		 */

		const targetPath = { tenantId: targetTenant, groupId: targetGroup };

		const moduleNameTyped = ServiceMap[moduleName as keyof typeof ServiceMap];
		const functionName = `sif-${targetPath.tenantId}-${env}-${moduleNameTyped.valueOf()}`;
		try {
			const responsePayload = await proxyClient.send(functionName, targetPath.groupId as string, req);
			app.log.debug(`proxy> onRequest> result: ${JSON.stringify(responsePayload)}`);
			reply.status(responsePayload.statusCode as number).send(responsePayload.body);
		} catch (err) {
			app.log.warn(`proxy> onRequest> error: ${JSON.stringify(err)}`);
			if (err instanceof Error) {
				if (err.name === 'ResourceNotFoundException') {
					throw new NotFoundError(`Requested resource from tenant ${targetPath.tenantId} not found.`);
				} else if (err.name === 'AccessDeniedException') {
					throw new UnauthorizedError(`Not authorized to access tenant ${targetPath.tenantId}.`);
				} else {
					// Catching invoker errors
					const httpErr = err as HttpError;
					throw proxyClient.buildErrorResponse(httpErr);
				}
			}
		}
	});
});
