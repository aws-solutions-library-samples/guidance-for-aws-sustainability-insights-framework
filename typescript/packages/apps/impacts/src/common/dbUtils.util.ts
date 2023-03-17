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

import { createDelimitedAttribute } from '@sif/dynamodb-utils';
import { PkType } from './pkTypes.js';
import type { TransactWriteItemsCommandInput } from '@aws-sdk/client-dynamodb';
import type { TransactWriteCommandInput } from '@aws-sdk/lib-dynamodb';
import type { Activity } from '../activities/schemas.js';
import clone from 'just-clone';
import type { TaskItemResource } from '../taskItems/schemas.js';
import dayjs from 'dayjs';

export function getActivityTransactionWriteCommandInput(tableName: string, activity: Activity): TransactWriteItemsCommandInput {
	const activityDbId = createDelimitedAttribute(PkType.Activity, activity.id);
	const activityVersionDbId = createDelimitedAttribute(PkType.ActivityVersion, activity.version);
	const activityActivationTimeStamp = createDelimitedAttribute(PkType.ActivityActivationTime, dayjs(activity.activeAt ?? activity.updatedAt ?? activity.createdAt).unix());

	const transaction: TransactWriteCommandInput = {
		TransactItems: [
			{
				// The activity item (current version)
				Put: {
					TableName: tableName,
					Item: {
						pk: activityDbId,
						sk: activityDbId,
						...activity,
					},
				},
			},
		],
	};

	// The activity item (versioned by id)
	const versionedStatement = clone(transaction.TransactItems[0]);
	versionedStatement.Put.Item['sk'] = activityVersionDbId;
	transaction.TransactItems.push(versionedStatement);
	// The activity item (versioned by activation time)
	const activationStatement = clone(transaction.TransactItems[0]);
	activationStatement.Put.Item['sk'] = activityActivationTimeStamp;
	transaction.TransactItems.push(activationStatement);

	return transaction;
}

export function getTaskItemTransactionWriteCommandInput(tableName: string, added: TaskItemResource[] = []): TransactWriteItemsCommandInput {
	const command: TransactWriteCommandInput = {
		TransactItems: [],
	};
	// First add the task items that need to be added
	for (const taskItem of added) {
		const { name, taskId, ...rest } = taskItem;
		const activityTaskDbId = createDelimitedAttribute(PkType.ActivityTask, taskId);
		const taskItemDbId = createDelimitedAttribute(PkType.TaskItem, name);
		const siKey2 = createDelimitedAttribute(PkType.TaskItem, taskItem.status, taskId);

		command.TransactItems.push({
			// The Impact item
			Put: {
				TableName: tableName,
				Item: {
					pk: activityTaskDbId,
					sk: taskItemDbId,
					siKey2,
					name,
					...rest,
				},
			},
		});
	}

	return command;
}
