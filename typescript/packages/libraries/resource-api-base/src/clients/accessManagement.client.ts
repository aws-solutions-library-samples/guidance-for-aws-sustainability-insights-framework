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

import { Invoker, LambdaApiGatewayEventBuilder } from '@sif/lambda-invoker';
import type { BaseLogger } from 'pino';
import pLimit from 'p-limit';

export class AccessManagementClient {
	private readonly log: BaseLogger;
	private readonly invoker: Invoker;
	private readonly concurrencyLimit: number;

	public constructor(log: BaseLogger, invoker: Invoker, concurrencyLimit: number) {
		this.concurrencyLimit = concurrencyLimit;
		this.log = log;
		this.invoker = invoker;
	}

	public async listSubGroupIds(groupId: string, recurse = false) {
		this.log.debug(`AccessManagementClient> listSubGroupIds> in> groupId:${groupId}`);
		const subGroupIds: string[] = [];
		let fromToken: string;
		do {
			const response = await this.listGroups(groupId, fromToken);
			subGroupIds.push(...response.groupIds);
			fromToken = response.lastEvaluatedToken;
		} while (fromToken !== undefined);

		if (recurse) {
			if (subGroupIds.length === 0) return subGroupIds;
			const limit = pLimit(this.concurrencyLimit);
			const listSubGroupsFutures = subGroupIds.map((o) => limit(() => this.listSubGroupIds(o, true)));
			const listSubGroupsResults = (await Promise.all(listSubGroupsFutures)).flat();
			subGroupIds.push(...listSubGroupsResults);
			return subGroupIds;
		}

		this.log.debug(`AccessManagementClient> listSubGroupIds> exit:${JSON.stringify(subGroupIds)}`);
		return subGroupIds;
	}

	public async getGroup(groupId: string): Promise<Group> {
		this.log.debug(`AccessManagementClient> getGroup> in> groupId: ${groupId}`);
		const event = new LambdaApiGatewayEventBuilder()
			.setMethod('GET')
			.setPath(`/groups/${encodeURIComponent(groupId)}`)
			.setHeaders({
				Accept: 'application/json',
				'Accept-Version': '1.0.0',
				'Content-Type': 'application/json',
				'x-groupcontextid': `${groupId}`,
			})
			.setRequestContext({
				authorizer: {
					claims: {
						email: 'resourceManagementLibrary',
						'cognito:groups': `/|||reader`,
						groupContextId: `${groupId}`,
					},
				},
			});
		this.log.debug(`AccessManagementClient> getGroup> event:${JSON.stringify(event)}`);
		const data = await this.invoker.invoke(process.env['ACCESS_MANAGEMENT_FUNCTION_NAME'] as string, event);
		this.log.debug(`AccessManagementClient> getGroup> data:${JSON.stringify(data)}`);
		return data.body as Group;
	}

	public async listGroups(parentGroupId: string, fromToken?: string): Promise<ListGroupsResponse> {
		this.log.debug(`AccessManagementClient> listGroups> in> parentGroupId:${parentGroupId}, fromToken:${fromToken}`);
		const event = new LambdaApiGatewayEventBuilder()
			.setMethod('GET')
			.setPath('/groups')
			.setHeaders({
				Accept: 'application/json',
				'Accept-Version': '1.0.0',
				'Content-Type': 'application/json',
				'x-groupcontextid': `${parentGroupId}`,
			})
			.setQueryStringParameters({
				fromToken,
			})
			.setRequestContext({
				authorizer: {
					claims: {
						email: 'resourceManagementLibrary',
						'cognito:groups': `${parentGroupId}|||reader`,
						groupContextId: parentGroupId,
					},
				},
			});

		this.log.debug(`AccessManagementClient> listGroups> event:${JSON.stringify(event)}`);
		const data = await this.invoker.invoke(process.env['ACCESS_MANAGEMENT_FUNCTION_NAME'] as string, event);
		this.log.debug(`AccessManagementClient> listGroups> data:${JSON.stringify(data)}`);

		const response: ListGroupsResponse = {
			groupIds: (data.body as Groups).groups.map((g) => g.id),
			lastEvaluatedToken: (data.body as Groups).pagination?.lastEvaluatedToken,
		};
		this.log.debug(`AccessManagementClient> listGroups> exit:${JSON.stringify(response)}`);
		return response;
	}

	public async isGroupExists(parentGroupId: string, groupId: string): Promise<boolean> {
		this.log.debug(`AccessManagementClient> isGroupExists> in> parentGroupId:${parentGroupId}, groupId:${groupId}`);
		const event = new LambdaApiGatewayEventBuilder()
			.setMethod('GET')
			.setPath(`/groups/${encodeURIComponent(groupId)}`)
			.setHeaders({
				Accept: 'application/json',
				'Accept-Version': '1.0.0',
				'Content-Type': 'application/json',
				'x-groupcontextid': `${parentGroupId}`,
			})
			.setRequestContext({
				authorizer: {
					claims: {
						email: 'resourceManagementLibrary',
						'cognito:groups': `${parentGroupId}|||reader`,
						groupContextId: parentGroupId,
					},
				},
			});

		this.log.debug(`AccessManagementClient> isGroupExists> event:${JSON.stringify(event)}`);
		const data = await this.invoker.invoke(process.env['ACCESS_MANAGEMENT_FUNCTION_NAME'] as string, event);
		this.log.debug(`AccessManagementClient> isGroupExists> data:${JSON.stringify(data)}`);

		const exists = data.statusCode === 200;
		this.log.debug(`AccessManagementClient> isGroupExists> exit:${exists}`);
		return exists;
	}
}

export interface ListGroupsResponse {
	groupIds: string[];
	lastEvaluatedToken?: string;
}

interface Group {
	id: string,
	name: string,
	description: string,
	state: 'active' | 'disabled',
	createdAt: string,
	createdBy: string,
	updatedAt: string
	configuration?: {
		referenceDatasets?: {
			alwaysUseLatest?: boolean
		},
		preferredGroup?: string,
		pipelineProcessor?: {
			chunkSize?: number,
			triggerMetricAggregations?: boolean,
		},
	}
}


interface Groups {
	groups: {
		id: string;
	}[];
	pagination?: {
		lastEvaluatedToken?: string;
	};
}
