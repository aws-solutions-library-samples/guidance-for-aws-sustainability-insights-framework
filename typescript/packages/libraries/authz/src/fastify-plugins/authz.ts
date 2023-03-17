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
import type { GroupRoles, SecurityScope, SecurityContext } from '../scopes.js';
import jwt_decode from 'jwt-decode';

export type CognitoAuthToken = {
	email: string;
	'cognito:groups': string[];
	groupContextId?: string;
	tenantId: string;
};

// The IGroupService interface will be implemented by GroupService in @sif/resource-api-base module
export interface IGroupService {
	isGroupExists(groupContextId: string): Promise<boolean>;
}

export interface AuthzOptions {
	skipGroupCheck?: boolean;
}

/**
 * Extracts the users groups, associated roles, and email, from the Cognito ID token.
 *
 * If running in `development` mode, the groups, roles, and email, are extracted from the `x-email` and `x-groups` headers.
 */
export default fp<AuthzOptions>(async (app, opts): Promise<void> => {
	const externallySharedGroupIds = (process.env['EXTERNALLY_SHARED_GROUP_IDS'] as string)?.split(',');

	/**
	 * Resets the `authz` attributes per request.
	 */
	app.decorateRequest('authz', null);

	/**
	 * performs the extraction per request.
	 */
	app.addHook('onRequest', async (req: FastifyRequest, _reply: FastifyReply) => {
		// @ts-ignore
		const groupService: IGroupService = req.diScope.resolve('groupService');

		app.log.debug('authz> onRequest> in>');

		let groupRoles: GroupRoles = {};
		let email: string | undefined, cognitoGroups: string[], groupContextId: string | undefined;

		if (req.url.startsWith('/static')) {
			return;
		} else if (req.url.startsWith('/swagger-docs')) {
			return;
		}

		// when in anything but local mode we extract the user details from the cognito provided and validated id token
		if (process.env['NODE_ENV'] !== 'local') {
			// retrieve the original aws lambda event
			let lambdaEvent;
			try {
				lambdaEvent = JSON.parse(decodeURIComponent(req.headers['x-apigateway-event'] as string));
			} catch (e) {
				app.log.warn('authz> onRequest> missing or malformed authorization token.');
				return;
			}
			// extract the users claims from the ID token (provided by the COGNITO_USER_POOLS integration)
			email = lambdaEvent?.requestContext?.authorizer?.claims?.['email'] as string;

			// if the x-tenant header is specified on the request, then we need to the set groupcontextid from the claims (which is the default group set for the user, or one of the groups user has access to)
			// this is done to ensure the use is allowed to make the request.
			if (lambdaEvent?.headers?.['x-tenant']) {
				groupContextId = lambdaEvent?.requestContext?.authorizer?.claims?.['groupContextId'] as string;
			} else {
				if (lambdaEvent?.headers?.['x-groupcontextid']) {
					// Get context id from header
					groupContextId = lambdaEvent?.headers?.['x-groupcontextid'].toLowerCase() as string;
				} else {
					// Default to claims
					groupContextId = lambdaEvent?.requestContext?.authorizer?.claims?.['groupContextId'] as string;
				}
			}

			// if proxyToken is present (injected by the source tenant's proxy plugin) we use the proxy token instead of the user token
			if (app.hasRequestDecorator('proxyToken') && (req.proxyToken?.length ?? 0) > 0) {
				const decodedToken = jwt_decode<CognitoAuthToken>(req.proxyToken);
				cognitoGroups = decodedToken['cognito:groups'].toString()?.split(',');

				// if proxied we need to ensure that the requested group is accessible externally
				if (!cognitoGroups.includes(groupContextId)) {
					throw new UnauthorizedError(`Group '${groupContextId}' is not accessible by the external user.`);
				}
				if (!externallySharedGroupIds.includes(groupContextId)) {
					throw new UnauthorizedError(`Group '${groupContextId}' is not defined as public.`);
				}
			} else {
				cognitoGroups = (lambdaEvent?.requestContext?.authorizer?.claims?.['cognito:groups'] as string)?.split(',');
			}
		} else {
			// if in local mode, to simplify local development we extract from user provided headers
			app.log.warn(`authz> onRequest> running in local development mode which means Cognito authorization is not enabled!!!`);

			if (!req.headers.authorization) {
				app.log.warn('authz> onRequest> missing or malformed authorization token.');
				throw new UnauthorizedError('Missing authorization token');
			}

			let jws = req.headers.authorization?.replace('Bearer ', '');
			const decodedToken = jwt_decode<CognitoAuthToken>(jws);
			cognitoGroups = decodedToken?.['cognito:groups'];
			/*
			 * Semgrep issue :  https://sg.run/wx8x
			 * ignore reason : JWT token is verified by APIGW in a prior step and this issue is invalid
		    */
			email = decodedToken.email;  // nosemgrep

			if (req?.headers?.['x-tenant']) {
				/*
				 * or default to claims
			 	 * Semgrep issue :  https://sg.run/wx8x
			 	 * ignore reason : JWT token is verified by APIGW in a prior step and this issue is invalid
		    	*/
				groupContextId = decodedToken.groupContextId;  // nosemgrep
			} else {
				if (req.headers?.['x-groupcontextid']) {
					// get from header
					groupContextId = (req.headers?.['x-groupcontextid'] as string).toLowerCase();
				} else {
					/*
					 * or default to claims
			 		 * Semgrep issue :  https://sg.run/wx8x
			 		 * ignore reason : JWT token is verified by APIGW in a prior step and this issue is invalid
		 			*/
					groupContextId = decodedToken.groupContextId;  // nosemgrep
				}
			}

			// When in running in local environment
			// This is needed when passing request context to other tenant
			req.headers['x-apigateway-event'] = JSON.stringify({
				requestContext: {
					authorizer: {
						claims: {
							email,
							'cognito:groups': cognitoGroups.join(','),
							groupContextId,
						},
					},
				},
			});
		}

		if (!groupContextId) {
			throw new UnauthorizedError(`groupContextId is not being set on claims or headers`);
		}

		let isChild = false;
		if ((cognitoGroups?.length ?? 0) > 0) {
			for (const cg of cognitoGroups) {
				const split = cg.split('|||');
				if (split.length !== 2) {
					app.log.warn(`authz> onRequest> user ${email} is member of group ${cg} which is not of the expected format, therefore ignored.`);
					continue;
				}
				const groupName = split[0] as string;
				const role = split[1] as SecurityScope;
				groupRoles[groupName] = role;

				// Validate that the group in context is a child of the cognito groups
				let parentId = groupName.substring(0, groupName.lastIndexOf('/')).toLocaleLowerCase();
				if (groupContextId.startsWith(parentId)) {
					isChild = true;
				}

				// ignore group check if its access management
				if (!opts.skipGroupCheck) {
					const groupExists = await groupService.isGroupExists(groupContextId);
					if (!groupExists) {
						throw new UnauthorizedError(`groupContextId : ${groupContextId} does not exist`);
					}
				}
			}
			if (!isChild) {
				throw new UnauthorizedError('groupContextId is not a child of the users assigned groups');
			}
		}

		// find the current path
		const groupId = groupContextId ? groupContextId.toLowerCase() : '';

		// place the group roles and email on the request in case a handler needs to perform finer grained access control
		req.authz = {
			email,
			groupId,
			groupRoles,
		};
		app.log.debug(`authz> onRequest> req.authz: ${JSON.stringify(req.authz)}`);
	});
});

class UnauthorizedError extends Error {
	public constructor(message: string) {
		super(message);
		this.name = 'UnauthorizedError';
	}
}

declare module 'fastify' {
	interface FastifyRequest {
		authz: SecurityContext;
		proxyToken: string;
	}
}
