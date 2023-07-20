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

import { Static, Type } from '@sinclair/typebox';

export const pipelineId = Type.String({ description: 'pipelineId of the audit log' });
export const executionId = Type.String({ description: 'executionId of the audit log' });
export const auditId = Type.String({ description: 'Id of the audit log' });

export const outputs = Type.Array(
	Type.Unknown()
);

export const inputs = Type.Array(
	Type.Unknown()
);

export const auditResource = Type.Object(
	{
		pipelineId,
		executionId,
		auditId,
		inputs: Type.Optional(inputs),
		outputs: Type.Optional(outputs)
	},
	{$id: 'auditResource'}
);

export const auditList = Type.Object(
	{
		status : Type.Optional(Type.String()),
		exportUrl: Type.Optional(Type.String()),
		audits: Type.Array(Type.Ref(auditResource)),
	},
	{ $id: 'auditList' }
)
export type AuditResource = Static<typeof auditResource>;
export type AuditList = Static<typeof auditList>;
