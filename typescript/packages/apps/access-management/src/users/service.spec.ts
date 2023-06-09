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

import { mock } from 'vitest-mock-extended';
import pino from 'pino';
import type { EventPublisher } from '@sif/events';
import type { MergeUtils, ResourceService, TagService, TagRepository } from '@sif/resource-api-base';
import type { GroupPermissions } from '@sif/authz';
import type { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { UserService } from './service.js';
import type { GroupModuleService } from '../groups/service.js';
import type { UserRepository } from './repository.js';
import { describe, expect, beforeEach, test } from 'vitest';

describe('UserService', () => {
	let mockGroupPermissions = mock<GroupPermissions>();
	let mockGroupModuleService = mock<GroupModuleService>();
	let mockUserRepository = mock<UserRepository>();
	let mockEventPublisher = mock<EventPublisher>();
	let mockTagRepository = mock<TagRepository>();
	let mockTagService = mock<TagService>();
	let mockResourceService = mock<ResourceService>();
	let mockMergeUtils = mock<MergeUtils>();
	let mockCognitoIdentityClientProvider = mock<CognitoIdentityProviderClient>();

	let userService: UserService;

	beforeEach(async () => {
		const logger = pino(
			pino.destination({
				sync: true, // test frameworks must use pino logger in sync mode!
			})
		);
		logger.level = 'debug';

		userService = new UserService(
			logger,
			mockGroupPermissions,
			mockCognitoIdentityClientProvider,
			'some-user-pool-id',
			mockGroupModuleService,
			mockUserRepository,
			mockEventPublisher,
			mockTagRepository,
			mockTagService,
			mockResourceService,
			mockMergeUtils
		);
	});

	test.each([
		[
			'/corp/tenants/acme',
			{
				'/corp/shared': 'admin',
				'/corp/tenants/acme': 'contributor',
			},
			true,
		],
		[
			'/CORP/TENANTS/ACME',
			{
				'/corp/shared': 'admin',
				'/corp/tenants/acme': 'contributor',
			},
			true,
		],
		[
			'/corp/tenants/acme',
			{
				'/corp/shared': 'admin',
				'/CORP/TENANTS/ACME': 'contributor',
			},
			true,
		],
		[
			'/corp/tenants/acme',
			{
				'/corp/shared': 'admin',
				'/corp/tenants': 'contributor',
			},
			true,
		],
		[
			'/corp/tenants/acme',
			{
				'/corp/shared': 'admin',
				'/corp/tenants/acme_123': 'contributor',
			},
			false,
		],
		[
			undefined,
			{
				'/corp/shared': 'admin',
				'/corp/tenants/acme_123': 'contributor',
			},
			false,
		],

		['corps/tenant/acme', {}, false],
		[undefined, {}, false],
	])('should evaluate if %i is the child of %i', (defaultGroup, groups, isChildGroup) => {
		// @ts-ignore
		expect(userService.isChildGroup(groups, defaultGroup)).toEqual(isChildGroup);
	});
});
