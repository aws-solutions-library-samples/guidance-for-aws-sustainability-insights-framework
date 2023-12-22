import { id } from '@sif/resource-api-base';
import { Static, Type } from '@sinclair/typebox';

export const actionResource = Type.Object(
	{
		id,
		action: Type.String({ description: 'action to be performed on the resource' })
	},
	{ $id: 'action_resource' }
);

export type ActionResource = Static<typeof actionResource>;

export interface ActionServiceBase {
	validateParameters: (actionResource: ActionResource) => void;
}

export const STOP_RESOURCE_EVENT_DETAIL_TYPE = 'SIF>com.aws.sif.platformResourceManager>stopResource';
export const EVENT_SOURCE = 'com.aws.sif.platformResourceManager';
