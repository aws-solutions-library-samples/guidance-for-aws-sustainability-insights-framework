import { Static, Type } from '@sinclair/typebox';
import { id } from '@sif/resource-api-base';

export const resource = Type.Object(
	{
		id,
		status: Type.String({ description: 'Status of the platform resource.' })
	},
	{ $id: 'resource' }
);

export const resourceList = Type.Object({
	resources: Type.Array(Type.Ref(resource))
}, { $id: 'resource_list' });

export type Resource = Static<typeof resource>;
export type ResourceList = Static<typeof resourceList>;
// Different platform resource will have different state
export type AuroraStatus = 'starting' | 'starting_failed' | 'available' | 'stopping' | 'stopping_failed' | 'stopped';

