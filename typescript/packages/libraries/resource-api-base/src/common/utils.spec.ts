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

import { beforeEach, describe, test, expect } from 'vitest';
import { Utils } from './utils';
import pino from 'pino';

describe('Utils', () => {
	let underTest: Utils;

	beforeEach(() => {
		const logger = pino(
			pino.destination({
				sync: true, // test frameworks must use pino logger in sync mode!
			})
		);
		let partitionNumber = 3;
		underTest = new Utils(logger, partitionNumber);
	});

	test.each([
		['/', '/a/b/c', false],
		['/', '/', false],
		['/a/b', '/a/b/c', false],
		['/a/b/c', '/a/b/c', false],
		['/a/b/c/d', '/a/b/c', true],
		['/a/b/c', '/', true],
		['/a/b/c/d', '/a/b/c/', true],
		['/a/b/c/d/', '/a/b/c', true],
		['/a/b/c/d/', '/a/b/c/', true],
	])('%s is child of %s : %s', (group, parentGroup, expected) => {
		expect(underTest.isChildOf(group, parentGroup)).toBe(expected);
	});

	test.each([
		['/', ['/']],
		['/a', ['/', '/a']],
		['/a/b/c', ['/', '/a', '/a/b', '/a/b/c']],
		['/a/b/c/', ['/', '/a', '/a/b', '/a/b/c']],
	])('%s exploded into %s', (group, expected) => {
		expect(underTest.explodeGroupId(group)).toEqual(expected);
	});

	test.each([
		['/', '/'],
		['/group1', '/group1'],
		['/group1/', '/group1'],
		['/group1/group2/', '/group1/group2'],
	])('%s trimmed into %s', (group, expected) => {
		expect(underTest.trimDelimiter(group)).toEqual(expected);
	});

	test.each([
		['/group1', { includeChildGroups: true, includeParentGroups: true }, ['/group1'], true],
		['/group1', { includeChildGroups: false, includeParentGroups: true }, ['/group1/group2'], false],
		['/group1', { includeChildGroups: true, includeParentGroups: false }, ['/group1', '/group1/group2'], true],
		['/group1', { includeChildGroups: true, includeParentGroups: false }, ['/group2', '/group1/group2/group3'], true],
		['/group1/group2', { includeChildGroups: false, includeParentGroups: true }, ['/group1'], true],
		['/group1', { includeChildGroups: false, includeParentGroups: false }, ['/group2'], false],
	])('With current group %s and options %s, resource shared in this groups %s is included %s', (currentGroup: string, options: { includeChildGroups: boolean; includeParentGroups: boolean }, groups: string[], expected: boolean) => {
		const filterFunction = underTest.createFilterGroupsFunction(currentGroup, options);
		expect(filterFunction(groups)).toBe(expected);
	});
});
