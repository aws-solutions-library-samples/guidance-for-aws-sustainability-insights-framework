import type { GroupRoles } from './scopes.js';

export function convertGroupRolesToCognitoGroups (groupRoles: GroupRoles): string {
	return Object.entries(groupRoles).map((r)=> `${r[0]}|||${r[1]}`).join(',');
}
