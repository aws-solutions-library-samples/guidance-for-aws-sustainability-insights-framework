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

import type { FastifyBaseLogger } from 'fastify';
import type { PipelineExecution } from './schemas.js';
import { BatchGetCommandInput, DynamoDBDocumentClient, GetCommand, GetCommandInput, TransactWriteCommand, TransactWriteCommandInput } from '@aws-sdk/lib-dynamodb';
import { createDelimitedAttribute, DynamoDbUtils, expandDelimitedAttribute } from '@sif/dynamodb-utils';
import { DatabaseTransactionError, GroupRepository, TagRepository, Tags, TransactionCancellationReason } from '@sif/resource-api-base';
import { PkType } from '../../common/pkUtils.js';
import type { TransactionCanceledException } from '@aws-sdk/client-dynamodb';

export class PipelineProcessorsRepository {
	public constructor(private log: FastifyBaseLogger, private dc: DynamoDBDocumentClient, private tableName: string,
					   private tagRepository: TagRepository, private groupRepository: GroupRepository, private dynamoDbUtils: DynamoDbUtils) {
	}

	private assemble(i: Record<string, any>): PipelineExecution {
		const pk = expandDelimitedAttribute(i['pk']);
		return {
			id: pk?.[1] as string,
			createdAt: i['createdAt'],
			createdBy: i['createdBy'],
			pipelineVersion: i['pipelineVersion'],
			updatedBy: i['updatedBy'],
			updatedAt: i['updatedAt'],
			status: i['status'],
			statusMessage: i['statusMessage'],
			actionType: i['actionType'],
			tags: i['tags'],
			connectorOverrides: i['connectorOverrides'],
			groupContextId: i['groupContextId'],
			groups: i['groups'],
			triggerMetricAggregations: i['triggerMetricAggregations'] ?? true,
			pipelineId: i['pipelineId'],
			auditVersion: (i['auditVersion'] as number) ?? 0,
		};
	}

	public async get(id: string): Promise<PipelineExecution> {
		this.log.debug(`PipelineProcessorsRepository> get> id:${id}`);

		const pipelineExecutionId = createDelimitedAttribute(PkType.PipelineExecution, id);
		const params: GetCommandInput = {
			TableName: this.tableName,
			Key: {
				pk: pipelineExecutionId,
				sk: pipelineExecutionId,
			},
		};
		this.log.debug(`PipelineProcessorsRepository> get> params: ${JSON.stringify(params)}`);
		const response = await this.dc.send(new GetCommand(params));
		this.log.debug(`PipelineProcessorsRepository> get> response: ${JSON.stringify(response)}`);
		if (response.Item === undefined) {
			this.log.debug(`PipelineProcessorsRepository> get> early exit: undefined`);
			return undefined;
		}

		// assemble before returning
		const activity = this.assemble(response.Item);

		this.log.debug(`PipelineProcessorsRepository> get> exit:${JSON.stringify(activity)}`);
		return activity;
	}

	public async listByIds(executionIds: string[]): Promise<PipelineExecution[]> {
		this.log.debug(`PipelineProcessorsRepository> listByIds> in> activityIds:${JSON.stringify(executionIds)}`);

		if ((executionIds?.length ?? 0) === 0) {
			this.log.debug(`PipelineProcessorsRepository> listByIds> early exit:[]`);
			return [];
		}

		const originalExecutionIds = [...executionIds];
		const executionIdSet = new Set(executionIds);
		executionIds = Array.from(executionIdSet);

		// retrieve the execution items
		const params: BatchGetCommandInput = {
			RequestItems: {},
		};
		params.RequestItems[this.tableName] = {
			Keys: executionIds.map((i) => ({
				pk: createDelimitedAttribute(PkType.PipelineExecution, i),
				sk: createDelimitedAttribute(PkType.PipelineExecution, i),
			})),
		};

		this.log.debug(`PipelineProcessorsRepository> listByIds> params:${JSON.stringify(params)}`);
		const items = await this.dynamoDbUtils.batchGetAll(params);
		this.log.debug(`PipelineProcessorsRepository> listByIds> items:${JSON.stringify(items)}`);

		if (items?.Responses?.[this.tableName] === undefined) {
			this.log.debug('PipelineProcessorsRepository> listByIds> exit: commands:undefined');
			return [];
		}

		const executionMap = items.Responses[this.tableName]
			.sort((a, b) => (a['pk'] as string).localeCompare(b['pk']) || (a['sk'] as string).localeCompare(b['sk']))
			.map((i) => this.assemble(i))
			.reduce((prev, curr) => {
				prev[curr.id] = curr;
				return prev;
			}, {});

		const executions = originalExecutionIds.map((id) => executionMap[id]);

		this.log.debug(`PipelineProcessorsRepository> listByIds> exit:${JSON.stringify(executions)}`);
		return executions;
	}

	private getPutResourceTransactionWriteCommandInput(p: PipelineExecution): TransactWriteCommandInput {
		this.log.trace(`PipelineProcessorsRepository> getPutResourceTransactionWriteCommandInput> p:${JSON.stringify(p)}`);
		const pipelineExecutionId = createDelimitedAttribute(PkType.PipelineExecution, p.id);
		const transaction = {
			TransactItems: [
				{
					Put: {
						TableName: this.tableName,
						Item: {
							pk: pipelineExecutionId,
							sk: pipelineExecutionId,
							...p,
						},
					},
				},
			],
		};
		this.log.trace(`PipelineProcessorsRepository> getPutResourceTransactionWriteCommandInput> exit> transaction:${JSON.stringify(transaction)}`);
		return transaction;
	}

	public async create(pipelineExecution: PipelineExecution): Promise<void> {
		this.log.info(`PipelineProcessorsRepository> create> pipelineExecution:${JSON.stringify(pipelineExecution)}`);

		const { pipelineId, id, ...rest } = pipelineExecution;

		const transaction = this.getPutResourceTransactionWriteCommandInput(pipelineExecution);

		// create tag items
		transaction.TransactItems.push(...this.tagRepository.getTagTransactWriteCommandInput(id, PkType.PipelineExecution, rest.groups, pipelineExecution.tags, {}).TransactItems);

		// group membership
		transaction.TransactItems.push(
			...this.groupRepository.getGrantGroupTransactWriteCommandInput(
				{
					id,
					keyPrefix: PkType.PipelineExecution,
				},
				// for other type of resources, the groups field contains the list of security group that can access the resources
				// so we can query all resources based on a group id (the implementation logic in @sif/resource-api-base module)
				// but for pipeline execution, the group will point to the pipeline to allow us to query executions based on a pipeline id
				{ id: pipelineId }
			).TransactItems
		);

		try {
			const response = await this.dc.send(new TransactWriteCommand(transaction));
			this.log.debug(`PipelineProcessorsRepository> create> response:${JSON.stringify(response)}`);
		} catch (err) {
			if (err instanceof Error) {
				if (err.name === 'TransactionCanceledException') {
					this.log.error(`PipelineProcessorsRepository> create> err> ${JSON.stringify((err as TransactionCanceledException).CancellationReasons)}`);
					throw new DatabaseTransactionError((err as TransactionCanceledException).CancellationReasons as TransactionCancellationReason[]);
				} else {
					this.log.error(err);
					throw err;
				}
			}
		}
		this.log.info(`PipelineProcessorsRepository> create> exit`);
	}
}

export interface PipelineExecutionListOptions {
	count?: number;
	exclusiveStart?: PipelineExecutionListPaginationKey;
	tags?: Tags;
}

export interface PipelineExecutionListPaginationKey {
	paginationToken: string;
}
