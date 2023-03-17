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

import { container } from '../plugins/awilix';
import type { Logger } from 'pino';
import type { PreTokenGenerationEvent } from './event';
import type { AccessManagementClient } from '../clients/accessManagement.client';

const logger = container.resolve<Logger>('logger');
const accessManagementClient = container.resolve<AccessManagementClient>('accessManagementClient');

const handler = async (event: PreTokenGenerationEvent, _context: any) => {
	logger.info(`preTokenGeneration > handler > in:`);

	const user = await accessManagementClient.getUser(event.request.userAttributes.email);
	const tenantId = process.env['TENANT_ID'] as string;

	if (user.defaultGroup)
		event.response = {
			claimsOverrideDetails: {
				claimsToAddOrOverride: { groupContextId: user.defaultGroup, tenantId },
			},
		};

	logger.info(`preTokenGeneration > handler > exit:`);
	return event;
};

export { handler };
