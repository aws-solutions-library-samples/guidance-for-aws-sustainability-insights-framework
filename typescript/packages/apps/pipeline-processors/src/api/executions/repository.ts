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
import type { PipelineExecution, PipelineExecutionListPaginationKey, PipelineExecutionWithMetadata } from './schemas.js';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { createDelimitedAttribute, expandDelimitedAttribute, createDelimitedAttributePrefix } from '@sif/dynamodb-utils';
import { NotFoundError } from '@sif/resource-api-base';

import { PkType } from '../../common/pkUtils.js';

import type { GetCommandInput, PutCommandInput, QueryCommandInput } from '@aws-sdk/lib-dynamodb';

export class PipelineProcessorsRepository {
	private readonly GSI1 = 'sk-pk-index';
	private readonly log: FastifyBaseLogger;
	private readonly dc: DynamoDBDocumentClient;
	private readonly tableName: string;

	public constructor(log: FastifyBaseLogger, dc: DynamoDBDocumentClient, tableName: string) {
		this.log = log;
		this.dc = dc;
		this.tableName = tableName;
	}

	private assemblePipelineExecution(i: Record<string, any>): PipelineExecutionWithMetadata {
		const pk = expandDelimitedAttribute(i['pk']);
		const sk = expandDelimitedAttribute(i['sk']);
		return {
			id: sk?.[1] as string,
			createdAt: i['createdAt'],
			createdBy: i['createdBy'],
			pipelineVersion: i['pipelineVersion'],
			updatedBy: i['updatedBy'],
			updatedAt: i['updatedAt'],
			status: i['status'],
			statusMessage: i['statusMessage'],
			ttl: i['ttl'],
			actionType: i['actionType'],
			// we should populate groupContextId from previous version where we store the value in securityContextId
			groupContextId: i.hasOwnProperty('groupContextId') ? i['groupContextId'] : i['securityContextId'],
			pipelineId: pk?.[1] as string,
		};
	}

	private assemblePipelineExecutionList(itemList: Record<string, any>[]): PipelineExecution[] {
		const pipelineExecutions = [];
		for (const item of itemList) {
			pipelineExecutions.push(this.assemblePipelineExecution(item));
		}

		return pipelineExecutions;
	}

	public async get(pipelineId: string, pipelineExecutionId: string): Promise<PipelineExecutionWithMetadata> {
		this.log.info(`PipelineProcessorsRepository> get> pipelineId:${pipelineId}, pipelineExecutionId: ${pipelineExecutionId}`);

		const params: GetCommandInput = {
			TableName: this.tableName,
			Key: {
				pk: createDelimitedAttribute(PkType.Pipeline, pipelineId),
				sk: createDelimitedAttribute(PkType.PipelineExecution, pipelineExecutionId),
			},
		};

		const result = await this.dc.send(new GetCommand(params));

		if (!result.Item) {
			throw new NotFoundError(`could not retrieve pipeline execution id : ${pipelineExecutionId}`);
		}

		this.log.info(`PipelineProcessorsRepository> put> exit`);
		return this.assemblePipelineExecution(result.Item);
	}

	public async getById(executionId: string): Promise<PipelineExecutionWithMetadata> {
		this.log.info(`PipelineProcessorsRepository> getById> executionId:${executionId}`);

		const params: QueryCommandInput = {
			TableName: this.tableName,
			IndexName: this.GSI1,
			KeyConditionExpression: `#hash=:hash AND begins_with(#sort,:sort)`,
			ExpressionAttributeNames: {
				'#hash': 'sk',
				'#sort': 'pk',
			},
			ExpressionAttributeValues: {
				':hash': createDelimitedAttribute(PkType.PipelineExecution, executionId),
				':sort': createDelimitedAttributePrefix(PkType.Pipeline),
			},
		};

		const result = await this.dc.send(new QueryCommand(params));
		if (result.Items === undefined || result.Items.length === 0) {
			this.log.debug('PipelineProcessorsRepository> getById: exit: undefined');
			return undefined;
		}

		const execution = this.assemblePipelineExecution(result.Items[0]);

		this.log.info(`PipelineProcessorsRepository> getById> exit: ${JSON.stringify(execution)}`);

		return execution;
	}

	public async list(pipelineId: string, exclusiveStart?: PipelineExecutionListPaginationKey, count = 10): Promise<[PipelineExecution[], PipelineExecutionListPaginationKey | undefined]> {
		this.log.info(`PipelineProcessorsRepository> list> pipelineId:${pipelineId}`);

		const params: QueryCommandInput = {
			TableName: this.tableName,
			KeyConditionExpression: `#hash=:hash  AND begins_with(#sortKey,:sortKey)`,
			ExpressionAttributeNames: {
				'#hash': 'pk',
				'#sortKey': 'sk',
				'#status': 'status',
			},
			ExpressionAttributeValues: {
				':hash': createDelimitedAttribute(PkType.Pipeline, pipelineId),
				':sortKey': createDelimitedAttribute(PkType.PipelineExecution),
				':status': 'waiting',
			},
			Limit: count,
			FilterExpression: '#status <> :status',
			ExclusiveStartKey: exclusiveStart
				? {
					pk: createDelimitedAttribute(PkType.Pipeline, pipelineId),
					sk: createDelimitedAttribute(PkType.PipelineExecution, exclusiveStart.id),
				}
				: undefined,
			ScanIndexForward: false,
		};

		const result = await this.dc.send(new QueryCommand(params));

		this.log.info(`PipelineProcessorsRepository> list> exit`);

		let paginationKey: PipelineExecutionListPaginationKey | undefined;

		if (result.LastEvaluatedKey) {
			const sk = expandDelimitedAttribute(result.LastEvaluatedKey['sk']);
			paginationKey = {
				id: sk?.[1] as string,
			};
		}
		return [this.assemblePipelineExecutionList(result.Items as Record<any, any>[]), paginationKey];
	}

	public async put(pipelineExecution: PipelineExecutionWithMetadata): Promise<void> {
		this.log.info(`PipelineProcessorsRepository> put> pipelineExecution:${JSON.stringify(pipelineExecution)}`);

		const { pipelineId, id, ...rest } = pipelineExecution;

		const params: PutCommandInput = {
			TableName: this.tableName,
			Item: {
				pk: createDelimitedAttribute(PkType.Pipeline, pipelineId),
				sk: createDelimitedAttribute(PkType.PipelineExecution, id),
				siKey1: createDelimitedAttribute(PkType.PipelineExecution, id),
				...rest,
			},
		};

		await this.dc.send(new PutCommand(params));

		this.log.info(`PipelineProcessorsRepository> put> exit`);
	}
}
