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
import { BatchGetCommandInput, DynamoDBDocumentClient, GetCommand, QueryCommand, QueryCommandInput, TransactWriteCommand, TransactWriteCommandInput } from '@aws-sdk/lib-dynamodb';
import type { DocumentDbClientItem } from '@sif/dynamodb-utils';
import { createDelimitedAttribute, DynamoDbUtils, expandDelimitedAttribute } from '@sif/dynamodb-utils';
import { PkType } from '../../common/pkUtils.js';
import { DatabaseTransactionError, GroupRepository, TransactionCancellationReason } from '@sif/resource-api-base';
import type { MetricAggregationJobWithContext } from './schemas.js';
import type { TransactionCanceledException } from '@aws-sdk/client-dynamodb';

export class MetricAggregationJobRepository {
	public constructor(private log: FastifyBaseLogger, private dc: DynamoDBDocumentClient, private tableName: string, private groupRepository: GroupRepository, private dynamoDbUtils: DynamoDbUtils) {
	}

	private assembleMetricAggregationJobList(items: Record<string, any>[]): MetricAggregationJobWithContext[] {
		const metricAggregationJobs = [];
		for (const item of items) {
			metricAggregationJobs.push(this.assemble(item));
		}
		return metricAggregationJobs;
	}

	private assemble(i: DocumentDbClientItem): MetricAggregationJobWithContext {
		this.log.debug(`MetricAggregationJobRepository >  assemble > i > ${JSON.stringify(i)}`);

		if (i === undefined) return undefined;

		const task: MetricAggregationJobWithContext = {
			id: expandDelimitedAttribute(i['pk'])?.[1],
			groupContextId: i['groupContextId'],
			pipelineId: i['pipelineId'],
			metricQueue: i['metricQueue'],
			timeRange: i['timeRange'],
			groupsQueue: i['groupsQueue'],
			status: i['status'],
			securityContext: i['securityContext']
		};

		this.log.debug(`MetricAggregationJobRepository >  assemble > exit > task: ${JSON.stringify(task)}`);
		return task;
	}

	public async get(metricAggregationJobId: string): Promise<MetricAggregationJobWithContext> {
		this.log.debug(`MetricAggregationJobRepository > get > metricAggregationJobId : ${metricAggregationJobId}`);

		const response = await this.dc.send(new GetCommand({
			Key: {
				pk: createDelimitedAttribute(PkType.MetricAggregationJob, metricAggregationJobId),
				sk: createDelimitedAttribute(PkType.MetricAggregationJob, metricAggregationJobId)
			}, TableName: this.tableName

		}));

		if (!response.Item) return undefined;

		const task = this.assemble(response.Item);
		this.log.debug(`MetricAggregationJobRepository > get > exit > task : ${JSON.stringify(task)}`);
		return task;
	}

	public async getByIds(metricAggregationJobIds: string[]): Promise<MetricAggregationJobWithContext[] | undefined> {
		this.log.debug(`AggregationRepository > getByIds > metricAggregationJobIds :${metricAggregationJobIds}`);

		if ((metricAggregationJobIds?.length ?? 0) === 0) {
			this.log.debug(`AggregationRepository> getByIds> early exit:[]`);
			return [];
		}

		const originalPipelineIds = [...metricAggregationJobIds];
		const pipelineIdsSet = new Set(metricAggregationJobIds);
		metricAggregationJobIds = Array.from(pipelineIdsSet);

		const command: BatchGetCommandInput = {
			RequestItems: {
				[this.tableName]: {
					Keys: metricAggregationJobIds.map((id) => ({
						pk: createDelimitedAttribute(PkType.MetricAggregationJob, id),
						sk: createDelimitedAttribute(PkType.MetricAggregationJob, id)
					}))
				}
			}
		};

		this.log.debug(`MetricAggregationJobRepository> getByIds> command:${JSON.stringify(command)}`);
		const items = await this.dynamoDbUtils.batchGetAll(command);
		this.log.debug(`MetricAggregationJobRepository> getByIds> items:${JSON.stringify(items)}`);

		if (items?.Responses?.[this.tableName]) {
			const metricAggregationJobDict = this.assembleMetricAggregationJobList(items.Responses[this.tableName] as Record<string, any>[]).reduce((prev, curr) => {
				if (curr !== undefined) {
					prev[curr.id] = curr;
				}
				return prev;
			}, {});
			const metricAggregationJobs = originalPipelineIds
				.filter(id => metricAggregationJobDict.hasOwnProperty(id))
				.map((id) => metricAggregationJobDict[id]);
			this.log.debug(`MetricAggregationJobRepository > getByIds > exit pipelines:${metricAggregationJobs}`);
			return metricAggregationJobs;
		}
		return undefined;
	}

	public async delete(id: string): Promise<void> {
		this.log.debug(`MetricAggregationJobRepository> delete> id:${id}`);

		// keys
		const aggregationJobId = createDelimitedAttribute(PkType.MetricAggregationJob, id);

		// list all items directly relating to the Pipeline
		const params1: QueryCommandInput = {
			TableName: this.tableName,
			KeyConditionExpression: `#hash=:hash`,
			ExpressionAttributeNames: {
				'#hash': 'pk'
			},
			ExpressionAttributeValues: {
				':hash': aggregationJobId
			}
		};

		const dbIds: { pk: string; sk: string }[] = [];
		let exclusiveStartKey: Record<string, any>;
		do {
			this.log.debug(`MetricAggregationJobRepository> delete> params1:${JSON.stringify(params1)}`);
			params1.ExclusiveStartKey = exclusiveStartKey;
			const data = await this.dc.send(new QueryCommand(params1));
			this.log.debug(`MetricAggregationJobRepository> delete> data:${JSON.stringify(data)}`);
			if (data.Count > 0) {
				dbIds.push(...data.Items.map((i) => ({ pk: i['pk'], sk: i['sk'] })));
			}
			exclusiveStartKey = data.LastEvaluatedKey;
		} while (exclusiveStartKey !== undefined);
		this.log.debug(`MetricAggregationJobRepository> delete> dbIds:${JSON.stringify(dbIds)}`);

		// delete all the Pipeline related items
		const transaction: TransactWriteCommandInput = {
			TransactItems: dbIds.map((i) => ({
				Delete: {
					TableName: this.tableName,
					Key: {
						pk: i.pk,
						sk: i.sk
					}
				}
			}))
		};

		try {
			this.log.debug(`MetricAggregationJobRepository> delete> transaction:${JSON.stringify(transaction)}`);
			const response = await this.dc.send(new TransactWriteCommand(transaction));
			this.log.debug(`MetricAggregationJobRepository> delete> response:${JSON.stringify(response)}`);
		} catch (err) {
			if (err instanceof Error) {
				if (err.name === 'TransactionCanceledException') {
					this.log.error(`MetricAggregationJobRepository> delete> err> ${JSON.stringify((err as TransactionCanceledException).CancellationReasons)}`);
					throw new DatabaseTransactionError((err as TransactionCanceledException).CancellationReasons as TransactionCancellationReason[]);
				} else {
					this.log.error(err);
					throw err;
				}
			}
		}

		this.log.debug(`MetricAggregationJobRepository> delete> exit>`);
	}

	public async create(job: MetricAggregationJobWithContext, ttl?: number): Promise<void> {
		this.log.debug(`MetricAggregationJobRepository > create > job : ${JSON.stringify(job)}`);

		const { pipelineId, groupContextId, id } = job;

		const metricAggregationJobId = createDelimitedAttribute(PkType.MetricAggregationJob, id);

		const transaction: TransactWriteCommandInput = {
			TransactItems: [
				{
					Put: {
						TableName: this.tableName,
						Item: {
							pk: metricAggregationJobId,
							sk: metricAggregationJobId,
							...job
						}
					}
				}
			]
		};

		// group membership
		transaction.TransactItems.push(
			...this.groupRepository.getGrantGroupTransactWriteCommandInput(
				{
					id,
					keyPrefix: PkType.MetricAggregationJob,
					alternateId: pipelineId
				},
				{ id: groupContextId }
			).TransactItems
		);

		if (ttl) {
			transaction.TransactItems.forEach(item => {
				item.Put.Item = {
					...item.Put.Item,
					ttl: ttl
				};
			});
		}

		try {
			this.log.debug(`MetricAggregationJobRepository> create> params:${JSON.stringify(transaction)}`);
			const response = await this.dc.send(new TransactWriteCommand(transaction));
			this.log.debug(`MetricAggregationJobRepository> create> response:${JSON.stringify(response)}`);
		} catch (err) {
			if (err instanceof Error) {
				if (err.name === 'TransactionCanceledException') {
					this.log.error(`MetricAggregationJobRepository> create> err> ${JSON.stringify((err as TransactionCanceledException).CancellationReasons)}`);
					throw new DatabaseTransactionError((err as TransactionCanceledException).CancellationReasons as TransactionCancellationReason[]);
				} else {
					this.log.error(err);
					throw err;
				}
			}
		}
		this.log.debug(`MetricAggregationJobRepository > create > exit >`);
	}
}

export interface ListTasksOptions {
	count?: number;
	name?: string;
	exclusiveStart?: ListTasksPaginationKey;
}

export interface ListTasksPaginationKey {
	paginationToken: string;
}
