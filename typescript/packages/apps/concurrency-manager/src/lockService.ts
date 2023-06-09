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

import { DynamoDBDocumentClient, GetCommand, UpdateCommand, UpdateCommandInput } from '@aws-sdk/lib-dynamodb';
import { ReturnValue } from '@aws-sdk/client-dynamodb';
import type { Logger } from 'pino';
import { createDelimitedAttribute } from '@sif/dynamodb-utils';
import { Lock, NotFoundError, PkType, StateMachineExecution } from './model';

export class LockService {

	public constructor(
		private log: Logger,
		private documentClient: DynamoDBDocumentClient,
		private lockTable: string,
		private concurrencyLimit: number,
		private lockName: string) {
	}

	public async getLock(): Promise<Lock> {
		this.log.trace(`SemaphoreLockAgent > getLock > in >`);

		const response = await this.documentClient.send(new GetCommand({
			TableName: this.lockTable,
			Key: {
				pk: createDelimitedAttribute(PkType.Lock, this.lockName),
			},
		}));

		if (response.Item === undefined) {
			throw new NotFoundError(`Lock with name: ${this.lockName}  not found`);
		}

		const { pk, currentLockCount, ...rest } = response.Item;

		const lock: Lock = {
			currentLockCount,
			executionLocks: Object.entries(rest).map(([key, value]) => {
				const { at, tenantId, taskName, metadata } = value;
				const name = key.split(':')?.[0];
				return ({
					name,
					at,
					tenantId,
					taskName,
					metadata
				});

			})
		};

		this.log.trace(`SemaphoreLockAgent > getLock > lock: ${lock}`);
		return lock;
	}

	private createDelimitedLockOwnerId(executionName: string, taskName: string) {
		return `${executionName}:${taskName.toLocaleLowerCase()}`;
	}

	public async releaseLock(executionName: string, taskName: string): Promise<number> {
		this.log.trace(`SemaphoreLockAgent > releaseLock > executionName: ${executionName}`);

		const request: UpdateCommandInput = {
			TableName: this.lockTable,
			Key: {
				pk: createDelimitedAttribute(PkType.Lock, this.lockName),
			},
			ExpressionAttributeValues: {
				':decrease': 1,
			},
			ExpressionAttributeNames: {
				'#currentLockCount': 'currentLockCount',
				'#lockOwnerId': this.createDelimitedLockOwnerId(executionName, taskName),
			},
			ConditionExpression: 'attribute_exists(#lockOwnerId)',
			UpdateExpression: 'SET #currentLockCount = #currentLockCount - :decrease REMOVE #lockOwnerId',
			ReturnValues: ReturnValue.UPDATED_NEW
		};

		let currentLockCount:number;
		try {
			const { Attributes } = await this.documentClient.send(new UpdateCommand(request));
			currentLockCount = Attributes?.['currentLockCount'];
		} catch (e) {
			this.log.warn(`SemaphoreLockAgent > releaseLock > err: ${e}`);
			const lock = await this.getLock();
			currentLockCount = lock.currentLockCount;
		}

		this.log.trace(`SemaphoreLockAgent > releaseLock > exit> ${currentLockCount}`);

		return currentLockCount;
	};

	public async acquireLock(execution: StateMachineExecution, tenantId: string, taskName: string): Promise<number> {
		this.log.trace(`SemaphoreLockAgent > acquireLock > execution: ${execution}, tenantId: ${tenantId}, taskName: ${taskName}`);

		const { pipelineId, executionId } = Array.isArray(execution.Input) ? execution.Input[0] : execution.Input;

		const request: UpdateCommandInput = {
			TableName: this.lockTable,
			Key: {
				pk: createDelimitedAttribute(PkType.Lock, this.lockName),
			},
			ExpressionAttributeValues: {
				':increase': 1,
				':limit': this.concurrencyLimit,
				':executionMetadata': {
					at: (new Date()).toISOString(),
					tenantId: tenantId,
					taskName: taskName,
					metadata: {
						pipelineId,
						executionId
					}
				}
			},
			ExpressionAttributeNames: {
				'#currentLockCount': 'currentLockCount',
				'#lockOwnerId': this.createDelimitedLockOwnerId(execution.Name, taskName)
			},
			ConditionExpression: '#currentLockCount <> :limit and attribute_not_exists(#lockOwnerId)',
			UpdateExpression: 'SET #currentLockCount = #currentLockCount + :increase, #lockOwnerId = :executionMetadata',
			ReturnValues: ReturnValue.UPDATED_NEW
		};

		const { Attributes } = await this.documentClient.send(new UpdateCommand(request));

		this.log.trace(`SemaphoreLockAgent > acquireLock > exit>`);

		return Attributes?.['currentLockCount'];
	};
}
