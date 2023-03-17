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

export function handleError(error, _request, reply) {
	// Log error
	this.log.error(`***** error: ${JSON.stringify(error)}`);
	this.log.error(`***** error.code: ${error.code}`);
	this.log.error(`***** error.name: ${error.name}`);
	this.log.error(`***** error.message: ${error.message}`);

	if (error.statusCode === 400 || Array.isArray(error.validation)) {
		return reply.badRequest(error.message);
	} else {
		switch (error.name) {
			case 'AlternateIdInUseError':
				return reply.conflict(error.message);
			case 'CalculatorDryRunError':
			case 'CalculationDefinitionError':
			case 'QueryParameterError':
			case 'InvalidRequestError':
				return reply.badRequest(error.message);
			case 'NotFoundError':
				return reply.notFound(error.message);
			case 'UnauthorizedError':
			case 'InvalidTokenError':
			case 'ForbiddenError':
				return reply.forbidden(error.message);
			case 'NotImplementedError':
				return reply.notImplemented(error.message);
			case 'DatabaseTransactionError':
				return reply.serverError(error.message);
			default:
				return reply.imateapot('Unhandled error which needs wiring up in the error handler!');
		}
	}
}

export class CalculationDefinitionError extends Error {
	public constructor(message: string) {
		super(message);
		this.name = 'CalculationDefinitionError';
	}
}
