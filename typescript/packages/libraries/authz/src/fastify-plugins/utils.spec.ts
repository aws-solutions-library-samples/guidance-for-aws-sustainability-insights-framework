import { describe, it, expect } from 'vitest';
import { convertGroupRolesToCognitoGroups } from '../utils.js';
import { SecurityContext, SecurityScope } from '../scopes.js';


describe('utils', () => {
	it('should convert group roles within a security context to cognito groups', () => {
		const securityContext: SecurityContext = {
			email: 'sif-pipeline-execution',
			groupId: '/',
			groupRoles: { '/': SecurityScope.contributor, '/a': SecurityScope.contributor, '/a/b': SecurityScope.reader },
		}

		const expected = '/|||contributor,/a|||contributor,/a/b|||reader'

		const actual = convertGroupRolesToCognitoGroups(securityContext.groupRoles);

		expect(actual).toEqual(expected);

	})
})
