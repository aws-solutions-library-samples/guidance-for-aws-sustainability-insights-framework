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

import type { FastifyBaseLogger, FastifyRequest } from 'fastify';
import { LambdaApiGatewayEventBuilder, Invoker, Dictionary, LambdaApiGatewayEventResponse } from '@sif/lambda-invoker';
import type { HttpError } from '@fastify/sensible/lib/httpError';
import type { IncomingHttpHeaders } from 'http2';
import jwt_decode from 'jwt-decode';
import jwt_encode from 'jwt-encode';

export class UnauthorizedError extends Error {
	public constructor(message: string) {
		super(message);
		this.name = 'UnauthorizedError';
	}
}

export class NotFoundError extends Error {
	public constructor(message: string) {
		super(message);
		this.name = 'NotFoundError';
	}
}

export type CognitoAuthToken = {
	email: string;
	'cognito:groups': string;
	groupContextId?: string;
	tenantId?: string;
};

export class ProxyClient {
	private readonly log: FastifyBaseLogger;
	private readonly lambdaInvoker: Invoker;
	private readonly tenantId: string;
	private readonly permittedTenantPaths: string[];

	constructor(log: FastifyBaseLogger, lambdaInvoker: Invoker) {
		this.lambdaInvoker = lambdaInvoker;
		this.log = log;
		this.tenantId = process.env['TENANT_ID'] as string;
		this.permittedTenantPaths = (process.env['PERMITTED_OUTGOING_TENANT_PATHS'] as string)?.split(',');
	}

	public async send(functionName: string, groupId: string, req: FastifyRequest): Promise<LambdaApiGatewayEventResponse> {
		this.log.debug(`ProxyClient > send > in > request: ${req}`);
		let result: LambdaApiGatewayEventResponse = {};

		/**
		 * Create a new proxy token for the target tenant's authz plugin to validate.
		 */
		req.headers.authorization = this.buildTargetTenantToken(req.headers.authorization, groupId);

		/**
		 * update the authz property with the correct group and claims
		 */
		req.headers['x-apigateway-event'] = this.updateApiGatewayEvent(req, groupId);

		/**
		 * override the x-groupcontextid to represent the target tenant group. Access to this (when a
		 * proxy token is provided) will be validated by the target tenant's authz plugin.
		 */
		req.headers['x-groupcontextid'] = groupId;

		if (req?.method === 'GET') {
			result = await this.performGet(functionName, req);
		} else if (req?.method === 'OPTIONS') {
			result = await this.performOptions(functionName, req);
		}

		return result;
	}

	private async performGet(functionName: string, req: FastifyRequest): Promise<LambdaApiGatewayEventResponse> {
		this.log.debug(`ProxyClient > performGet > in > request: ${JSON.stringify(req)}`);

		const event = JSON.parse(decodeURIComponent(req?.headers['x-apigateway-event'] as string));
		const lambdaApiGWevent: LambdaApiGatewayEventBuilder = new LambdaApiGatewayEventBuilder()
			.setMethod('GET')
			.setRequestContext(event?.requestContext)
			.setHeaders(this.buildHeaders(req?.headers))
			.setBody(req?.body)
			.setPath(req?.url as string)
			.setQueryStringParameters(req?.query as Dictionary);
		const result = await this.lambdaInvoker.invoke(functionName, lambdaApiGWevent);
		this.log.info(`ProxyClient > performGet> exit > result: ${JSON.stringify(result)}`);
		return result;
	}

	// TODO: Placeholder function at the moment
	private async performOptions(functionName: string, req: FastifyRequest): Promise<LambdaApiGatewayEventResponse> {
		this.log.debug(`ProxyClient > performOptions > in > request: ${req}`);

		const event = JSON.parse(decodeURIComponent(req?.headers['x-apigateway-event'] as string));

		const lambdaApiGWevent: LambdaApiGatewayEventBuilder = new LambdaApiGatewayEventBuilder()
			.setMethod('GET')
			.setRequestContext(event?.requestContext)
			.setHeaders(this.buildHeaders(req?.headers))
			.setBody(req?.body)
			.setPath(req?.url as string)
			.setQueryStringParameters(req?.query as Dictionary);

		const result = await this.lambdaInvoker.invoke(functionName, lambdaApiGWevent);
		this.log.info(`ProxyClient > performOptions> exit > result: ${JSON.stringify(result)}`);
		return result;
	}

	public buildErrorResponse(err: HttpError) {
		this.log.debug(`ProxyClient > buildErrorResponse > in > Lambda response: ${JSON.stringify(err)}`);
		let newError;
		if (err.statusCode === 403) {
			newError = new UnauthorizedError(err.message);
		} else if (err.statusCode === 404) {
			newError = new NotFoundError(err.message);
		}
		this.log.debug(`ProxyClient > buildErrorResponse > exit`);
		return newError;
	}

	public buildHeaders(incomingHeaders?: IncomingHttpHeaders): Dictionary {
		this.log.debug(`ProxyClient > buildHeaders > in > headers: ${JSON.stringify(incomingHeaders)}`);
		let headers: Dictionary = {};

		if (incomingHeaders !== null && incomingHeaders !== undefined) {
			const keys = Object.keys(incomingHeaders);
			keys.forEach((k) => {
				if (incomingHeaders[k] !== undefined || incomingHeaders[k] !== null) {
					headers[k] = incomingHeaders[k] as string;
				}
			});
		}

		// we need to delete this header before passing the request on to the proxied tenant. If we dont do this,
		// the request will evaulate against the claims and not get resolved properly.
		delete headers['x-tenant'];

		this.log.debug(`ProxyClient > buildHeaders > exit`);

		return headers;
	}

	public async isAuthorized(req: FastifyRequest): Promise<void> {
		this.log.debug(`proxyClient> isAuthorized> in`);

		// 1- Validate the http method is authorized
		const httpMethod: string = req.raw.method ?? req.method;
		if (!['GET', 'OPTIONS'].includes(httpMethod)) {
			const message = 'Only GET and OPTIONS requests are supported.';
			this.log.warn(`proxyClient> isAuthorized> ${message}`);
			throw new UnauthorizedError(message);
		}

		// 2- Validate that the authorization header exists
		if (!req.headers.authorization) {
			const message = 'Missing or malformed authorization token.';
			this.log.warn(`proxyClient> isAuthorized> ${message}`);
			throw new UnauthorizedError(message);
		}

		/**
		 * 3 - Verify the requesting tenant is allowed to call the target tenant path
		 */
		let targetTenant = this.getTargetTenant(req);

		const targetGroup = req.headers['x-groupcontextid'] as string;
		const targetTenantPath = `${targetTenant}:${targetGroup}`;

		// Requesting tenant validates that the requested tenantId:groupId is permitted
		if (targetTenant !== this.tenantId && !this.permittedTenantPaths?.includes(targetTenantPath)) {
			this.log.warn(`proxyClient> isAuthorized> Not authorized to access tenant path ${targetTenantPath}`);
			throw new UnauthorizedError(`Not authorized to access tenant path ${targetTenantPath}`);
		}

		this.log.debug('proxyClient> isAuthorized> exit');
	}

	/**
	 *
	 * Verifies is the request should be proxied or not
	 */
	public isProxied(tenantId: string, req: FastifyRequest): boolean {
		this.log.debug(`proxyClient> isProxied> in`);

		let targetTenant = this.getTargetTenant(req);

		if (!targetTenant) {
			this.log.debug('proxyClient> isProxied> exit> x-tenant header not provided');
			return false;
		}

		if (targetTenant === tenantId) {
			this.log.debug(`proxyClient> isProxied> x-tenant header matches current tenant`);
			return false;
		}

		const targetGroup = req?.headers['x-groupcontextid'] as string;

		if (!targetGroup) {
			throw new UnauthorizedError(`x-groupcontextid header needs to be specified for cross tenant referencing`);
		}

		this.log.debug(`proxyClient> isProxied> exit`);
		return true;
	}

	public buildTargetTenantToken(currentTenantToken: string | undefined, groupId: string) {
		this.log.debug(`ProxyClient > buildTargetTenantToken > in `);

		if ((currentTenantToken?.length ?? 0) === 0) {
			const message = 'Missing authorization token.';
			this.log.warn(`proxyClient> buildTargetTenantToken> ${message}`);
			throw new UnauthorizedError(message);
		}

		const jws = currentTenantToken?.replace('Bearer ', '') as string;
		const decodedToken: CognitoAuthToken = jwt_decode<CognitoAuthToken>(jws);

		/*
		 * replace the cognito:groups for the requested target tenant. The target tenant (authz plugin)
		 * is accountable for verifying that the requested group is public
		 * Semgrep issue :  https://sg.run/wx8x
		 * ignore reason : JWT token is verified by APIGW in a prior step and this issue is invalid
		*/

		if (decodedToken.tenantId == this.tenantId) {  // nosemgrep
			decodedToken['cognito:groups'] = `${groupId}|||reader`;
			decodedToken['groupContextId'] = groupId;
		}
		const newToken = `Bearer ${jwt_encode(decodedToken, 'proxy-plugin')}`;

		this.log.debug(`ProxyClient > buildTargetTenantToken > exit newToken:${newToken}`);
		return newToken;
	}

	/**
	 * Retrieve the target tenant from the request headers
	 */
	private getTargetTenant(req: FastifyRequest): string {
		this.log.debug(`proxyClient> getTargetTenant> in`);
		let targetTenant = req?.headers['x-tenant'] as string;
		if (!targetTenant) {
			const event = this.extractApiGatewayEventFromHeaders(req?.headers);
			const proxiedEvent = this.extractApiGatewayEventFromHeaders(event?.headers);
			if (proxiedEvent?.headers?.['x-tenant']) {
				targetTenant = proxiedEvent.headers?.['x-tenant'];
			}
		}
		this.log.debug(`proxyClient> getTargetTenant> exit`);
		return targetTenant;
	}

	public extractApiGatewayEventFromHeaders(headers: { [key: string]: string | string[] | undefined }): any | undefined {
		this.log.debug(`proxyClient> extractApiGatewayEventFromHeaders> in`);
		if (!headers?.['x-apigateway-event']) return undefined;
		return JSON.parse(decodeURIComponent(headers?.['x-apigateway-event'] as string));
	}

	public updateApiGatewayEvent(req: FastifyRequest, groupId: string): string {
		this.log.debug(`proxyClient> isAuthorized> in`);
		const event = JSON.parse(decodeURIComponent(req?.headers['x-apigateway-event'] as string));
		event.requestContext.authorizer.claims['groupContextId'] = groupId;
		event.requestContext.authorizer.claims['cognito:groups'] = `${groupId}|||reader`;

		return JSON.stringify(event);
	}
}
