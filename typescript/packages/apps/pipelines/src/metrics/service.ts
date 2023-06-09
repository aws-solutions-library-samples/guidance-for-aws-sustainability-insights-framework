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
import { ulid } from 'ulid';
import type { SecurityContext } from '@sif/authz';
import { GroupPermissions, SecurityScope, atLeastAdmin, atLeastReader, atLeastContributor } from '@sif/authz';
import { AlternateIdInUseError, NotFoundError, UnauthorizedError, GroupService, TagService, ResourceService, MergeUtils, ResourceListByAliasOptions, ResourceInUseError } from '@sif/resource-api-base';
import type { Metric, MetricVersionsList, NewMetric, EditMetric } from './schemas.js';
import type { MetricListOptions, MetricListPaginationKey, MetricRepository, MetricVersionPaginationKey } from './repository.js';
import { PkType } from '../utils/pkUtils.utils.js';
import { InvalidOutputMetricError } from '../common/errors.js';
import { NotImplementedError } from '@sif/resource-api-base';

export class MetricService {
	private readonly log: FastifyBaseLogger;
	private readonly repository: MetricRepository;
	private readonly authChecker: GroupPermissions;
	private readonly groupService: GroupService;
	private readonly tagService: TagService;
	private readonly resourceService: ResourceService;
	private readonly mergeUtils: MergeUtils;

	public constructor(log: FastifyBaseLogger, authChecker: GroupPermissions, repository: MetricRepository, groupService: GroupService, tagService: TagService, resourceService: ResourceService, mergeUtils: MergeUtils) {
		this.log = log;
		this.authChecker = authChecker;
		this.repository = repository;
		this.groupService = groupService;
		this.tagService = tagService;
		this.resourceService = resourceService;
		this.mergeUtils = mergeUtils;
	}

	private async validateOutputMetrics(groupId: string, newMetricName: string, outputMetricNames: string[], currentMetricToCheck?: string, metricDict: { [key: string]: boolean } = {}): Promise<void> {
		this.log.debug(`MetricService> validateOutputMetrics> in: newMetricName:${newMetricName}, parenMetrics:${JSON.stringify(outputMetricNames)}, groupId: ${groupId}`);

		// return if there are no more output metrics to process
		if (outputMetricNames === undefined || outputMetricNames.length === 0) return;

		const options: ResourceListByAliasOptions = { includeChildGroups: false, includeParentGroups: false };

		const getOutputMetricFutures = outputMetricNames.map((n) => {
			return this.resourceService.listIdsByAlternateId(groupId, n, PkType.Metric, options);
		});

		const getOutputMetricResponses = await Promise.all(getOutputMetricFutures);

		if (!currentMetricToCheck) {
			currentMetricToCheck = newMetricName;
		}

		const invalidOutputMetricsIndex = getOutputMetricResponses
			.map((r, i) => {
				if (r.length < 1) return i;
				else return undefined;
			})
			.filter((o) => o !== undefined);

		// if there are output metrics that do not exist
		if (invalidOutputMetricsIndex.length > 0) {
			const invalidParentNames = invalidOutputMetricsIndex.map((i) => outputMetricNames[i]);
			throw new InvalidOutputMetricError(`These parent metrics [${invalidParentNames}] do not exist`);
		}

		// if there output metric that has the same name as the modified/created metric
		// then it's a circular reference
		if (outputMetricNames.find((o) => o === newMetricName)) {
			throw new InvalidOutputMetricError(`There is circular reference pointing back to metric ${newMetricName} from ${currentMetricToCheck}`);
		}

		const outputMetrics = await this.repository.getByIds(getOutputMetricResponses.flatMap((o) => o));

		if (currentMetricToCheck === newMetricName) {
			// we only need to check this on the first level of the recursive call
			const metricsWithPipelineAsInput = outputMetrics.filter((o) => o.inputPipelines?.length > 0).map((o) => o.name);

			if (metricsWithPipelineAsInput.length > 0) {
				throw new InvalidOutputMetricError(`These output metrics [${metricsWithPipelineAsInput}] has pipeline as an input`);
			}
		}

		if (metricDict[currentMetricToCheck]) {
			throw new InvalidOutputMetricError(`This metric ${currentMetricToCheck} exists in multiple path`);
		}

		// keep track of all visited metrics
		metricDict[currentMetricToCheck] = true;

		for (const metric of outputMetrics.filter((o) => o.outputMetrics?.length > 0)) {
			await this.validateOutputMetrics(groupId, newMetricName, metric.outputMetrics, metric.name, metricDict);
		}

		this.log.debug(`MetricService> validateOutputMetrics> exit:`);
	}

	public async create(securityContext: SecurityContext, metric: NewMetric): Promise<Metric> {
		this.log.debug(`MetricService> create> in: securityContext:${JSON.stringify(securityContext)}, metric:${JSON.stringify(metric)}`);

		// validate access
		this.validateAccess(securityContext, atLeastContributor);

		// validate alias usage for this metric
		await this.validateAlias(securityContext, metric.name);

		await this.validateHierarchicalAlias(securityContext, metric.name);

		if (metric.aggregationType !== 'sum') {
			throw new NotImplementedError('Only sum aggregation type is supported for now.');
		}

		await this.validateOutputMetrics(securityContext.groupId, metric.name, metric.outputMetrics);

		const toCreate: Metric = {
			id: ulid().toLowerCase(),
			name: metric.name,
			summary: metric.summary,
			description: metric.description,
			aggregationType: metric.aggregationType,
			outputMetrics: metric.outputMetrics,

			tags: metric.tags,
			attributes: metric.attributes,

			version: 1,
			state: 'enabled',
			groups: [securityContext.groupId],
			createdBy: securityContext.email,
			createdAt: new Date(Date.now()).toISOString(),
		};

		// save the metric
		await this.repository.create(toCreate);
		await this.tagService.submitGroupSummariesProcess(securityContext.groupId, PkType.Metric, metric.tags, {});

		// ink to output metrics
		for (const outputMetricId of metric.outputMetrics ?? []) {
			await this.linkMetric(securityContext, toCreate.name, outputMetricId);
		}

		this.log.debug(`MetricService> create> exit:${JSON.stringify(toCreate)}`);
		return toCreate;
	}

	public async delete(securityContext: SecurityContext, metricId: string): Promise<void> {
		this.log.debug(`MetricService> delete> in: securityContext:${JSON.stringify(securityContext)}, metricId:${metricId}`);

		//perform authorization check
		this.validateAccess(securityContext, atLeastAdmin);

		// process repository call
		const metric = await this.get(securityContext, metricId);

		if (metric.inputMetrics?.length > 0 || metric.inputPipelines?.length > 0) {
			throw new ResourceInUseError(`metric ${metric.name} cannot be deleted because it is an output metric of another metric or pipeline`);
		}

		// save the metric
		await this.repository.delete(metricId);
		await this.tagService.submitGroupSummariesProcess(securityContext.groupId, PkType.Metric, {}, metric.tags);

		// carry out unlinking to output metric's
		for (const outputMetricId of metric.outputMetrics ?? []) {
			await this.unlinkMetric(securityContext, metric.name, outputMetricId);
		}
	}

	public async get(securityContext: SecurityContext, metricId: string, version?: number): Promise<Metric | undefined> {
		this.log.debug(`MetricService> get> in: securityContext:${JSON.stringify(securityContext)}, metricId:${metricId}`);

		//perform authorization check
		this.validateAccess(securityContext, atLeastReader);

		// process repository call
		const metric = await this.repository.get(metricId, version);

		if (!metric) {
			throw new NotFoundError(`Metric '${metricId}' cannot be found`);
		}

		// verify metric is permissible to group
		const isAllowed = this.authChecker.matchGroup(metric.groups, securityContext.groupId);
		if (!isAllowed) {
			throw new UnauthorizedError(`The caller does not have access the group(s) that metric '${metricId}' is part of.`);
		}

		// override metric state if frozen or disabled
		if (version) {
			const currentMetric = await this.repository.get(metricId);
			if (currentMetric.state === 'disabled' || currentMetric.state === 'frozen') {
				metric.state = currentMetric.state;
			}
		}

		this.log.debug(`MetricService> get> exit:${JSON.stringify(metric)}`);
		return metric;
	}

	public async list(securityContext: SecurityContext, options: MetricListOptions): Promise<[Metric[], MetricListPaginationKey]> {
		this.log.debug(`MetricService> list> in: securityContext:${JSON.stringify(securityContext)}, options:${JSON.stringify(options)}`);

		//perform authorization check
		this.validateAccess(securityContext, atLeastReader);

		let metrics: Metric[] = [],
			paginationKey,
			metricIds;

		if (options.name) {
			this.log.debug(`MetricService> list> searching by name : ${options.name}`);
			options.name = options.name.toLowerCase();
			metricIds = await this.resourceService.listIdsByAlternateId(securityContext.groupId, options.name, PkType.Metric, {
				includeChildGroups: options?.includeChildGroups,
				includeParentGroups: options?.includeParentGroups,
			});
		} else {
			// process repository call
			[metricIds, paginationKey] = await this.resourceService.listIds(securityContext.groupId, PkType.Metric, {
				tagFilter: options?.tags,
				pagination: {
					count: options?.count,
					from: {
						paginationToken: options?.exclusiveStart?.paginationToken,
					},
				},
				includeChildGroups: options?.includeChildGroups,
				includeParentGroups: options?.includeParentGroups,
			});
		}

		if (metricIds && (metricIds?.length ?? 0) > 0) {
			metrics = (await this.repository.getByIds(metricIds)) as Metric[];
		}

		this.log.debug(`metricService> list> exit: ${JSON.stringify(metrics)}`);
		return [metrics, paginationKey];
	}

	public async listVersions(securityContext: SecurityContext, metricId: string, count?: number, fromVersion?: number): Promise<MetricVersionsList> {
		this.log.debug(`MetricService.get(securityContext, metricId):[${securityContext}, ${metricId}, ${count}, ${fromVersion}]`);

		//perform authorization check
		this.validateAccess(securityContext, atLeastReader);

		// retrieve the versions
		let metrics: Metric[] = [];
		let paginationKey: MetricVersionPaginationKey = undefined;
		do {
			// retrieve a page of versions
			[metrics, paginationKey] = await this.repository.listVersions(metricId, count, fromVersion ? { version: fromVersion } : undefined);

			// as each version may have different groups applied, check group membership individually
			const versionsToRemove: number[] = [];
			for (let i = 0; i < metrics.length; i++) {
				const version = metrics[i];
				const isAllowed = this.authChecker.matchGroup(version.groups, securityContext.groupId);
				if (!isAllowed) {
					versionsToRemove.push(i);
				}
			}
			for (let i = versionsToRemove.length - 1; i >= 0; i--) {
				metrics.splice(versionsToRemove[i], 1);
			}

			// once we have checked the version we may have ended up with less than the requested page of results. if so, retrieve the next page
		} while (paginationKey !== undefined && metrics.length < count);

		const response: MetricVersionsList = {
			metrics,
		};

		if (paginationKey) {
			response.pagination = {
				count: metrics.length,
				lastEvaluatedVersion: paginationKey?.version,
			};
		}
		this.log.debug(`metricService> listVersions> exit: ${JSON.stringify(response)}`);

		return response;
	}

	public async update(securityContext: SecurityContext, metricId: string, metricUpdateParams: EditMetric & { groups?: string[] }): Promise<Metric> {
		this.log.debug(`MetricService> create> in: securityContext:${securityContext}, metricId:${metricId}, metricUpdateParams:${JSON.stringify(metricUpdateParams)}`);

		//perform authorization check
		this.validateAccess(securityContext, atLeastContributor);

		// check if the metric exist
		const existing = await this.get(securityContext, metricId);

		await this.validateOutputMetrics(securityContext.groupId, existing.name, metricUpdateParams.outputMetrics);

		// TODO: validate that output Metric's exist

		// merge the existing and to be updated
		const merged = this.mergeUtils.mergeResource(existing, metricUpdateParams) as Metric;
		merged.updatedAt = new Date(Date.now()).toISOString();
		merged.updatedBy = securityContext.email;
		merged.version = existing.version + 1;

		// determine which tags are to add/delete
		const tagDiff = this.tagService.diff(existing.tags, merged.tags);

		// make the changes
		await this.repository.update(merged, tagDiff.toAdd, tagDiff.toDelete);
		await this.tagService.submitGroupSummariesProcess(securityContext.groupId, PkType.Metric, tagDiff.toAdd, tagDiff.toDelete);

		// link/unlink any metrics to/from the pipeline
		const metricDiff = this.diff(existing.outputMetrics, merged.outputMetrics);
		for (const targetMetricId of metricDiff.toAdd) {
			await this.linkMetric(securityContext, existing.name, targetMetricId);
		}
		for (const targetMetricId of metricDiff.toDelete) {
			await this.unlinkMetric(securityContext, existing.name, targetMetricId);
		}

		this.log.debug(`metricService> update> exit: ${JSON.stringify(merged)}`);
		return merged;
	}

	private validateAccess(securityContext: SecurityContext, allowedRoles: SecurityScope[]): void {
		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId], securityContext.groupRoles, allowedRoles, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not authorized of the group in context \`${JSON.stringify(securityContext.groupId)}`);
		}
	}

	private async validateAlias(securityContext: SecurityContext, alias: string): Promise<void> {
		this.log.debug(`MetricService> validateAlias> groupId:${securityContext.groupId}, alias:${alias}`);
		// Validation - ensure name is unique for the hierarchy
		// TODO ensure this is for hierarchy, not just group in context
		if (await this.groupService.isAlternateIdInUse(alias, securityContext.groupId, PkType.Metric,)) {
			throw new AlternateIdInUseError(alias);
		}
	}

	private async validateHierarchicalAlias(sc: SecurityContext, alias: string): Promise<void> {
		this.log.debug(`MetricsService> validateHierarchicalAlias> groupId:${sc.groupId}, alias:${alias}`);

		const response = await this.list(sc, { includeChildGroups: true, includeParentGroups: true, name: alias });

		this.log.debug(`MetricsService> validateHierarchicalAlias> out: it:${JSON.stringify(response)}`);

		if(response[0].length > 0) {
			throw new AlternateIdInUseError(alias);
		}
	}

	public async grant(securityContext: SecurityContext, id: string, groupId: string): Promise<void> {
		this.log.debug(`MetricsService> grant> id:${id}, groupId:${groupId}`);

		// Authz check - Only `admin` and above of both current and target groups may grant
		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId, groupId], securityContext.groupRoles, atLeastAdmin, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not an \`admin\` of either the group in context \`${JSON.stringify(securityContext.groupId)} or the target group \`${groupId}\`.`);
		}

		// retrieve existing metric (also verifying permissions)
		const existing = await this.get(securityContext, id);

		// verify target group exists
		const targetGroupExists = await this.groupService.isGroupExists(groupId);
		if (!targetGroupExists) {
			throw new NotFoundError(`Group '${id}' not found.`);
		}

		// grant
		await this.groupService.grant(
			{
				id: existing.id,
				alternateId: existing.name,
				keyPrefix: PkType.Metric,
			},
			{ id: groupId }
		);

		// update the main resource item
		existing.groups.push(groupId);
		await this.update(securityContext, id, existing);

		this.log.debug(`MetricsService> grant> exit:`);
	}

	public async revoke(securityContext: SecurityContext, id: string, groupId: string): Promise<void> {
		this.log.debug(`MetricsService> revoke> id:${id}, groupId:${groupId}`);

		// Authz check - Only `admin` and above of both current and target groups may grant
		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId, groupId], securityContext.groupRoles, atLeastAdmin, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not an \`admin\` of either the group in context \`${JSON.stringify(securityContext.groupId)} or the target group \`${groupId}\`.`);
		}

		// retrieve existing metric (also verifying permissions)
		const existing = await this.get(securityContext, id);

		// verify target group exists
		const targetGroupExists = await this.groupService.isGroupExists(groupId);
		if (!targetGroupExists) {
			throw new NotFoundError(`Group '${id}' not found.`);
		}

		// revoke
		await this.groupService.revoke(
			{
				id: existing.id,
				alternateId: existing.name,
				keyPrefix: PkType.Metric,
			},
			{ id: groupId }
		);

		// update the main resource item
		const index = existing.groups.indexOf(groupId);
		if (index > 0) {
			existing.groups.splice(index, 1);
			await this.update(securityContext, id, existing);
		}

		this.log.debug(`MetricsService> revoke> exit:`);
	}

	public async linkPipeline(securityContext: SecurityContext, metricId: string, pipeline: { id: string; output: string }): Promise<Metric> {
		this.log.debug(`MetricService> linkPipeline> in: securityContext:${securityContext}, metricId:${metricId}, pipeline:${JSON.stringify(pipeline)}`);

		//perform authorization check
		this.validateAccess(securityContext, atLeastContributor);

		// check if the metric exist
		const existing = await this.get(securityContext, metricId);

		// verify metric is permissible to group
		const isAllowed = this.authChecker.matchGroup(existing.groups, securityContext.groupId);
		if (!isAllowed) {
			throw new UnauthorizedError(`The caller does not have access the group(s) that metric '${metricId}' is part of.`);
		}

		// merge the existing and to be updated
		if (existing.inputPipelines === undefined) {
			existing.inputPipelines = [];
		}
		existing.inputPipelines.push({
			pipelineId: pipeline.id,
			output: pipeline.output,
		});
		existing.updatedAt = new Date(Date.now()).toISOString();
		existing.updatedBy = securityContext.email;
		existing.version = existing.version + 1;

		// save
		await this.repository.update(existing);

		this.log.debug(`metricService> linkPipeline> exit: ${JSON.stringify(existing)}`);
		return existing;
	}

	public async unlinkPipeline(securityContext: SecurityContext, metricId: string, pipeline: { id: string; output: string }): Promise<Metric> {
		this.log.debug(`MetricService> unlinkPipeline> in: securityContext:${securityContext}, metricId:${metricId}, pipeline:${JSON.stringify(pipeline)}`);

		//perform authorization check
		this.validateAccess(securityContext, atLeastContributor);

		// check if the metric exist
		const existing = await this.get(securityContext, metricId);

		// verify metric is permissible to group
		const isAllowed = this.authChecker.matchGroup(existing.groups, securityContext.groupId);
		if (!isAllowed) {
			throw new UnauthorizedError(`The caller does not have access the group(s) that metric '${metricId}' is part of.`);
		}

		// merge the existing and to be updated
		const indexToRemove = existing.inputPipelines?.findIndex((i) => i.pipelineId === pipeline.id && i.output === pipeline.output);
		if (indexToRemove >= 0) {
			existing.inputPipelines.splice(indexToRemove, 1);
			existing.updatedAt = new Date(Date.now()).toISOString();
			existing.updatedBy = securityContext.email;
			existing.version = existing.version + 1;

			// save
			await this.repository.update(existing);
		}

		this.log.debug(`metricService> unlinkPipeline> exit: ${JSON.stringify(existing)}`);
		return existing;
	}

	public async linkMetric(securityContext: SecurityContext, sourceName: string, targetName: string): Promise<Metric> {
		this.log.debug(`MetricService> linkMetric> in: securityContext:${securityContext}, sourceName:${sourceName}, targetName:${targetName}`);

		// perform authorization check
		this.validateAccess(securityContext, atLeastContributor);

		// check the target exists
		const target = (await this.list(securityContext, { name: targetName }))?.[0]?.[0];

		// verify metric is permissible to group
		const isAllowed = this.authChecker.matchGroup(target.groups, securityContext.groupId);
		if (!isAllowed) {
			throw new UnauthorizedError(`The caller does not have access the group(s) that metric '${targetName}' is part of.`);
		}

		// merge the existing and to be updated
		if (target.inputMetrics === undefined) {
			target.inputMetrics = [];
		}
		target.inputMetrics.push(sourceName);
		target.updatedAt = new Date(Date.now()).toISOString();
		target.updatedBy = securityContext.email;
		target.version = target.version + 1;

		// save
		await this.repository.update(target);

		this.log.debug(`metricService> linkMetric> exit: ${JSON.stringify(target)}`);
		return target;
	}

	public async unlinkMetric(securityContext: SecurityContext, sourceName: string, targetName: string): Promise<Metric> {
		this.log.debug(`MetricService> unlinkMetric> in: securityContext:${securityContext}, sourceName:${sourceName}, targetName:${targetName}`);

		// perform authorization check
		this.validateAccess(securityContext, atLeastContributor);

		// check the target metric exists
		const target = (await this.list(securityContext, { name: targetName }))?.[0]?.[0];

		// verify metric is permissible to group
		const isAllowed = this.authChecker.matchGroup(target.groups, securityContext.groupId);
		if (!isAllowed) {
			throw new UnauthorizedError(`The caller does not have access the group(s) that metric '${targetName}' is part of.`);
		}

		// merge the existing and to be updated
		const indexToRemove = target.inputMetrics?.findIndex((i) => i === sourceName);
		if (indexToRemove >= 0) {
			target.inputMetrics.splice(indexToRemove, 1);
			target.updatedAt = new Date(Date.now()).toISOString();
			target.updatedBy = securityContext.email;
			target.version = target.version + 1;

			// save
			await this.repository.update(target);
		}

		this.log.debug(`metricService> unlinkMetric> exit: ${JSON.stringify(target)}`);
		return target;
	}

	private diff(existing: string[] = [], updated: string[] = []): DiffResult {
		this.log.debug(`metricService> diff> in> existing:${JSON.stringify(existing)}, updated:${JSON.stringify(updated)}`);

		const result: DiffResult = {
			toAdd: [],
			toDelete: [],
		};

		updated.filter((u) => existing.find((e) => u === e) === undefined).forEach((u) => result.toAdd.push(u));

		existing.filter((e) => updated.find((u) => e === u) === undefined).forEach((e) => result.toDelete.push(e));

		this.log.debug(`metricService> diff> exit:${JSON.stringify(result)}`);
		return result;
	}
}

interface DiffResult {
	toAdd: string[];
	toDelete: string[];
}
