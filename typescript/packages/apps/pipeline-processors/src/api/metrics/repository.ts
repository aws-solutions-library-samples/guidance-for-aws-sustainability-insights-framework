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

import type { BaseLogger } from 'pino';

import { BatchWriteCommandInput, DynamoDBDocumentClient, QueryCommand, QueryCommandInput } from '@aws-sdk/lib-dynamodb';
import { createDelimitedAttribute, createDelimitedAttributePrefix, DynamoDbUtils, expandDelimitedAttribute } from '@sif/dynamodb-utils';
import { CommonPkType, DynamoDbItem } from '@sif/resource-api-base';

import type { AffectedTimeRange, GroupMetrics, TimeUnit } from './models.js';
import type { Metric } from './schemas.js';
import dayjs from 'dayjs';
import { PkType } from '../../common/pkUtils.js';
import clone from 'just-clone';

export class MetricsRepository {
	private readonly log: BaseLogger;
	private readonly dc: DynamoDBDocumentClient;
	private readonly metricsTable: string;
	private readonly dynamoDbUtils: DynamoDbUtils;

	private readonly BY_GROUP_SORT_KEY = 'sk1';
	private readonly BY_PARENT_GROUP_SORT_KEY = 'sk2';

	private readonly LSI1 = 'pk-sk2-index';

	constructor(log: BaseLogger, dc: DynamoDBDocumentClient, metricsTable: string, dynamoDbUtils: DynamoDbUtils) {
		this.log = log;
		this.dc = dc;
		this.metricsTable = metricsTable;
		this.dynamoDbUtils = dynamoDbUtils;
	}

	public async listCollectionMetrics(metricId: string, groupId: string, timeUnit: TimeUnit, timeRange: AffectedTimeRange, version: number | string = 'latest'): Promise<Metric[]> {
		this.log.info(`MetricsRepository> listCollectionMetrics> in: metricId:${metricId}, groupId:${groupId}, timeUnit:${timeUnit}, timeRange:${JSON.stringify(timeRange)}`);

		return await this.listMetrics(metricId, groupId, timeUnit, timeRange, version, this.BY_GROUP_SORT_KEY);
	}

	public async listMembersMetrics(metricId: string, groupId: string, timeUnit: TimeUnit, timeRange: AffectedTimeRange, version: number | string = 'latest'): Promise<Metric[]> {
		this.log.info(`MetricsRepository> listMembersMetrics> in: metricId:${metricId}, groupId:${groupId}, timeUnit:${timeUnit}, timeRange:${JSON.stringify(timeRange)}`);

		return await this.listMetrics(metricId, groupId, timeUnit, timeRange, version, this.BY_PARENT_GROUP_SORT_KEY);
	}

	private async listMetrics(metricId: string, groupId: string, timeUnit: TimeUnit, timeRange: AffectedTimeRange, version: number | string = 'latest', sortKeyName: string): Promise<Metric[]> {
		this.log.info(`MetricsRepository> listMetrics> in: metricId:${metricId}, groupId:${groupId}, timeUnit:${timeUnit}, timeRange:${JSON.stringify(timeRange)}, sortKeyName:${sortKeyName}`);

		let parentGroupId;
		// check if the members=true parameter is specified which pass the "this.BY_PARENT_GROUP_SORT_KEY" key through this function
		if(sortKeyName === this.BY_PARENT_GROUP_SORT_KEY) {
			// if its specified, then we use the groupId as is to list all metris for the cascading children groups
			parentGroupId = groupId
		} else {
			// if not, then we take the parent of the group and use that to list all metrics within a group
			parentGroupId =  groupId.substring(0, groupId.lastIndexOf('/'));
		}

		const hash = createDelimitedAttribute(PkType.Metric, metricId, CommonPkType.Group, parentGroupId, PkType.MetricVersion, version);

		let sortKeyFrom;
		let sortKeyTo;
		// check if the sortKeyName equals to 'sk2'
		// this sortkeyName resolves to sk2 if the metrics query has a members=true parameter passed through
		// based on this parameter we need to construct the sortKeyFrom and sortKeyTo accordingly
		if(sortKeyName === this.BY_PARENT_GROUP_SORT_KEY) {
			sortKeyFrom = timeRange.from
				// if it is then create the sortKeyFrom like so: tu:<timeUnit>:d:<date> i.e. tu:day:d:2022-12-01:
				? createDelimitedAttributePrefix(PkType.TimeUnit, timeUnit, PkType.Date, dayjs(timeRange.from).format('YYYY-MM-DD'))
				// if not then, like so: tu:<timeUnit> i.e. tu:day:
				: createDelimitedAttributePrefix(PkType.TimeUnit, timeUnit);
			sortKeyTo = timeRange.to
				// if it is then create the sortkeyTo like so: tu:<timeUnit>:d:<date> i.e. tu:day:d:2022-12-01:
				? createDelimitedAttributePrefix(PkType.TimeUnit, timeUnit, PkType.Date, dayjs(timeRange.to).format('YYYY-MM-DD'))
				// if not then, like so: tu:<timeUnit>:d: i.e. tu:day:d:ZZZZZ
				: createDelimitedAttributePrefix(PkType.TimeUnit, timeUnit, PkType.Date) + 'ZZZZZ';
		} else {
			// check if timeRangeFrom is provided
			sortKeyFrom = timeRange.from
				// if it is, then create the sortKeyFrom like so: g:<groupId>:tu:<timeUnit>:d:<date> i.e. g:%2f:tu:day:d:2022-01-01
				? createDelimitedAttribute(CommonPkType.Group, groupId, PkType.TimeUnit, timeUnit, PkType.Date, dayjs(timeRange.from).format('YYYY-MM-DD'))
				// if not then, like so: g:<groupId>:tu:<timeUnit> i.e. g:%2f:tu:day:
				: createDelimitedAttributePrefix(CommonPkType.Group, groupId, PkType.TimeUnit, timeUnit);
			// check if timeRange 'to' is provided
			sortKeyTo = timeRange.to
				// if it is, then create the sortKeyFrom like so: g:<groupId>:tu:<timeUnit>:d:<date> i.e. g:%2f:tu:day:d:2022-01-01
				? createDelimitedAttribute(CommonPkType.Group, groupId, PkType.TimeUnit, timeUnit, PkType.Date, dayjs(timeRange.to).format('YYYY-MM-DD'))
				// if not then, like so: g:<groupId>:tu:<timeUnit>:d:ZZZZZ i.e. g:%2f:tu:day:d:ZZZZZ
				: createDelimitedAttribute(CommonPkType.Group, groupId, PkType.TimeUnit, timeUnit) + 'ZZZZZ';
		}


		let keyConditionExpression = '#hash=:hash AND #sortKey BETWEEN :sortKeyFrom AND :sortKeyTo';

		const params: QueryCommandInput = {
			TableName: this.metricsTable,
			KeyConditionExpression: keyConditionExpression,
			ExpressionAttributeNames: {
				'#hash': 'pk',
				'#sortKey': sortKeyName,
				'#time': 'time',
				'#name': 'name',
				'#subGroupsValue': 'subGroupsValue',
				'#groupValue': 'groupValue',
				'#version': 'version',
				'#date': 'date',
				'#day': 'day',
				'#week': 'week',
				'#month': 'month',
				'#quarter': 'quarter',
				'#year': 'year',
			},
			ExpressionAttributeValues: {
				':hash': hash,
				':sortKeyFrom': sortKeyFrom,
				':sortKeyTo': sortKeyTo,
			},
			ProjectionExpression: '#time,#date,#subGroupsValue,#groupValue,#name,#version,#day,#week,#month,#quarter,#year,#hash,#sortKey',
			ReturnConsumedCapacity: 'TOTAL',
		};

		if(sortKeyName === this.BY_PARENT_GROUP_SORT_KEY) {
			params.IndexName = this.LSI1;
		}

		let exclusiveStartKey: DynamoDbItem;
		const items: DynamoDbItem[] = [];
		do {
			params.ExclusiveStartKey = exclusiveStartKey;
			this.log.debug(`MetricsRepository> listMetrics> params:${JSON.stringify(params)}`);
			const result = await this.dc.send(new QueryCommand(params));
			this.log.debug(`MetricsRepository> listMetrics> result:${JSON.stringify(result)}`);
			items.push(...result.Items);
			exclusiveStartKey = result.LastEvaluatedKey;
		} while (exclusiveStartKey !== undefined);

		const metrics = items?.map((i) => this.assembleMetric(i));

		this.log.info(`MetricsRepository> listMetrics> exit:`);
		this.log.debug(`MetricsRepository> listMetrics> exit:${JSON.stringify(metrics)}`);
		return metrics;
	}

	public async saveMetrics(metricId: string, pipelineId: string, executionId: string, groupMetrics: GroupMetrics): Promise<void> {
		this.log.info(`MetricsRepository> saveMetrics> in: metricId:${metricId}, pipelineId:${pipelineId}, executionId:${executionId}`);
		this.log.debug(`MetricsRepository> saveMetrics> in: groupMetrics:${JSON.stringify(groupMetrics)}`);

		const params: BatchWriteCommandInput = {
			RequestItems: {
				[this.metricsTable]: [],
			},
		};

		Object.entries(groupMetrics).forEach(([groupId, timeUnitMetrics]) => {
			const parentGroupId = groupId.substring(0, groupId.lastIndexOf('/'));

			Object.entries(timeUnitMetrics).forEach(([timeUnit, metrics]) => {
				for (const m of metrics) {
					const metric = m as Metric;
					this.log.debug(`MetricsRepository> saveMetrics> metric:${JSON.stringify(metric)}`);

					const versionNo = isNaN(metric.version as number) ? 1 : ((metric.version as number) ?? 0) + 1;
					const date = dayjs(metric.date).format('YYYY-MM-DD');

					const latest = {
						PutRequest: {
							Item: {
								pk: createDelimitedAttribute(PkType.Metric, metricId, CommonPkType.Group, parentGroupId, PkType.MetricVersion, 'latest'),
								sk1: createDelimitedAttribute(CommonPkType.Group, groupId, PkType.TimeUnit, timeUnit, PkType.Date, date),
								sk2: createDelimitedAttribute(PkType.TimeUnit, timeUnit, PkType.Date, date, CommonPkType.Group, groupId),
								name: metric.name,
								version: versionNo,
								pipelineId: pipelineId,
								executionId: executionId,
								date,
								day: metric.day,
								week: metric.week,
								month: metric.month,
								quarter: metric.quarter,
								year: metric.year,
								groupValue: metric.groupValue,
								subGroupsValue: metric.subGroupsValue,
							},
						},
					};
					const versioned = clone(latest);
					versioned.PutRequest.Item['pk'] = createDelimitedAttribute(PkType.Metric, metricId, CommonPkType.Group, parentGroupId, PkType.MetricVersion, versionNo);

					this.log.debug(`MetricsRepository> saveMetrics> latest:${JSON.stringify(latest)}`);
					this.log.debug(`MetricsRepository> saveMetrics> versioned:${JSON.stringify(versioned)}`);
					params.RequestItems[this.metricsTable].push(latest, versioned);
				}
			});
		});

		this.log.debug(`MetricsRepository> saveMetrics> params:${JSON.stringify(params)}`);
		const response = await this.dynamoDbUtils.batchWriteAll(params);
		this.log.debug(`MetricsRepository> saveMetrics> response:${JSON.stringify(response)}`);
		if (this.dynamoDbUtils.hasUnprocessedItems(response)) {
			this.log.error(`MetricsRepository> saveMetrics>  has unprocessed items: ${JSON.stringify(response.UnprocessedItems)}`);
			// TODO: replace with custom error
			throw new Error('SAVE_FAILED');
		}

		this.log.debug(`MetricsRepository> saveMetrics> exit:`);
	}

	private assembleMetric(item: DynamoDbItem): Metric {
		this.log.trace(`MetricsRepository> assembleMetric> in> item:${JSON.stringify(item)}`);

		const pk = expandDelimitedAttribute(item['pk']);
		const metricId = pk[1];

		let timeUnit: string, date: Date, groupId: string;
		if (item['sk1']) {
			const sk1 = expandDelimitedAttribute(item['sk1']);
			groupId = sk1[1]
			timeUnit = sk1[3];
			date = dayjs(sk1[5]).toDate();
		} else if (item['sk2']) {
			const sk2 = expandDelimitedAttribute(item['sk2']);
			groupId = sk2[5]
			timeUnit = sk2[1];
			date = dayjs(sk2[3]).toDate();
		}

		const metric: Metric = {
			date: date,
			metricId,
			name: item['name'],
			timeUnit,
			day: item['day'],
			week: item['week'],
			month: item['month'],
			quarter: item['quarter'],
			year: item['year'],
			hierarchyValue: item['groupValue'] + item['subGroupsValue'],
			groupValue: item['groupValue'],
			subGroupsValue: item['subGroupsValue'],
			version: item['version'],
			groupId
		};

		this.log.trace(`MetricsRepository> assembleMetric> exit: metric:${JSON.stringify(metric)}`);
		return metric;
	}
}
