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

import { describe, it, expect, beforeAll } from 'vitest';
import pino from 'pino';

import { GroupPermissions } from './fgac';
import { SecurityScope } from './scopes';

describe('GroupPermissions', () => {
	let underTest: GroupPermissions;

	beforeAll(async () => {
		underTest = new GroupPermissions(pino());
	});

	it('no source groups should return false', async () => {
		const actual = underTest.isAuthorized([], { global: SecurityScope.admin }, [SecurityScope.admin], 'any');
		expect(actual).toEqual(false);
	});

	it('no caller permissions should return false', async () => {
		const actual = underTest.isAuthorized(['global'], {}, [SecurityScope.admin], 'any');
		expect(actual).toEqual(false);
	});

	it('same group access with required role should return true', async () => {
		const sourceGroups = ['/usa'];
		const callerPermissions = { '/usa': SecurityScope.admin };
		const allowedRoles = [SecurityScope.admin];
		const mode = 'any';
		const actual = underTest.isAuthorized(sourceGroups, callerPermissions, allowedRoles, mode);
		expect(actual).toEqual(true);
	});

	it('group access via ancestor with required role should return true', async () => {
		const sourceGroups = ['/usa/colorado/denver'];
		const callerPermissions = { '/usa': SecurityScope.admin };
		const allowedRoles = [SecurityScope.admin];
		const mode = 'any';
		const actual = underTest.isAuthorized(sourceGroups, callerPermissions, allowedRoles, mode);
		expect(actual).toEqual(true);
	});

	it('same group access with any matching and required role should return true', async () => {
		const sourceGroups = ['/usa/colorado', '/uk/yorkshire'];
		const callerPermissions = { '/usa/colorado': SecurityScope.admin };
		const allowedRoles = [SecurityScope.admin];
		const mode = 'any';
		const actual = underTest.isAuthorized(sourceGroups, callerPermissions, allowedRoles, mode);
		expect(actual).toEqual(true);
	});

	it('group access via ancestor with any matching and required role should return true', async () => {
		const sourceGroups = ['/usa/colorado', '/uk/yorkshire'];
		const callerPermissions = { '/usa': SecurityScope.admin };
		const allowedRoles = [SecurityScope.admin];
		const mode = 'any';
		const actual = underTest.isAuthorized(sourceGroups, callerPermissions, allowedRoles, mode);
		expect(actual).toEqual(true);
	});

	it('same group access with all matching and required role should return true', async () => {
		const sourceGroups = ['/usa/colorado', '/uk/yorkshire'];
		const callerPermissions = { '/usa/colorado': SecurityScope.admin, '/uk/yorkshire': SecurityScope.admin };
		const allowedRoles = [SecurityScope.admin];
		const mode = 'all';
		const actual = underTest.isAuthorized(sourceGroups, callerPermissions, allowedRoles, mode);
		expect(actual).toEqual(true);
	});

	it('same group access with not all matching and required role should return false', async () => {
		const sourceGroups = ['/usa/colorado', '/uk/yorkshire'];
		const callerPermissions = { '/usa/colorado': SecurityScope.admin };
		const allowedRoles = [SecurityScope.admin];
		const mode = 'all';
		const actual = underTest.isAuthorized(sourceGroups, callerPermissions, allowedRoles, mode);
		expect(actual).toEqual(false);
	});

	it('same group access with all matching via ancestor and required role should return true', async () => {
		const sourceGroups = ['/usa/colorado', '/usa/california'];
		const callerPermissions = { '/usa': SecurityScope.admin };
		const allowedRoles = [SecurityScope.admin];
		const mode = 'all';
		const actual = underTest.isAuthorized(sourceGroups, callerPermissions, allowedRoles, mode);
		expect(actual).toEqual(true);
	});

	it('same group access with all matching but missing required role should return false', async () => {
		const sourceGroups = ['/usa/colorado', '/uk/yorkshire'];
		const callerPermissions = { '/usa/colorado': SecurityScope.admin, '/uk/yorkshire': SecurityScope.contributor };
		const allowedRoles = [SecurityScope.admin];
		const mode = 'all';
		const actual = underTest.isAuthorized(sourceGroups, callerPermissions, allowedRoles, mode);
		expect(actual).toEqual(false);
	});

	it('same group access with all matching via ancestor but missing required role should return false', async () => {
		const sourceGroups = ['/usa/colorado', '/usa/california'];
		const callerPermissions = { '/usa': SecurityScope.contributor };
		const allowedRoles = [SecurityScope.admin];
		const mode = 'all';
		const actual = underTest.isAuthorized(sourceGroups, callerPermissions, allowedRoles, mode);
		expect(actual).toEqual(false);
	});
});
