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
import { AlternateIdInUseError, NotFoundError, UnauthorizedError, GroupService, TagService, ResourceService, MergeUtils, InvalidRequestError } from '@sif/resource-api-base';
import type { CalculatorClient, CalculatorRequest, Transform } from '@sif/clients';
import type { TransformerValidator } from '@sif/validators';
import type { Pipeline, PipelineUpdateParams, PipelineCreateParams, PipelineVersionListType, DryRunResponse, Transformer } from './schemas.js';
import type { PipelineListOptions, PipelineListPaginationKey, PipelineRepository, PipelineVersionPaginationKey } from './repository.js';
import { PkType } from '../utils/pkUtils.utils.js';
import { InvalidOutputMetricError, PipelineDefinitionError } from '../common/errors.js';
import type { MetricService } from '../metrics/service.js';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';

dayjs.extend(utc);

export class PipelineService {
	private readonly log: FastifyBaseLogger;
	private readonly repository: PipelineRepository;
	private readonly authChecker: GroupPermissions;
	private readonly groupService: GroupService;
	private readonly tagService: TagService;
	private readonly resourceService: ResourceService;
	private readonly validator: TransformerValidator;
	private readonly mergeUtils: MergeUtils;
	private readonly calculatorClient: CalculatorClient;
	private readonly metricService: MetricService;

	public constructor(
		log: FastifyBaseLogger,
		authChecker: GroupPermissions,
		repository: PipelineRepository,
		groupService: GroupService,
		tagService: TagService,
		resourceService: ResourceService,
		validator: TransformerValidator,
		mergeUtils: MergeUtils,
		calculatorClient: CalculatorClient,
		metricService: MetricService
	) {
		this.log = log;
		this.authChecker = authChecker;
		this.repository = repository;
		this.groupService = groupService;
		this.tagService = tagService;
		this.resourceService = resourceService;
		this.validator = validator;
		this.mergeUtils = mergeUtils;
		this.calculatorClient = calculatorClient;
		this.metricService = metricService;
	}

	private async validateOutputMetrics(metrics: Metrics): Promise<void> {
		// check if specified metric has other metric as an input
		const metricsWithOtherMetricAsInput = metrics.filter((k) => k.inputMetrics?.length > 0).map((metric) => metric.name);

		if (metricsWithOtherMetricAsInput.length > 0) {
			throw new InvalidOutputMetricError(`These output metrics [${metricsWithOtherMetricAsInput}] has metric as an input`);
		}
	}

	public async create(sc: SecurityContext, params: PipelineCreateParams): Promise<Pipeline> {
		this.log.debug(`PipelineService.create(sc, params):[${JSON.stringify(sc)}, ${JSON.stringify(params)}]`);

		// validate access
		this.validateAccess(sc, atLeastContributor);

		if (params.activeAt && !dayjs(params.activeAt).isValid()) {
			throw new InvalidRequestError('Invalid Date specified double check if the date/time is in ISO8601 local time');
		}

		// validate alias usage for this pipeline
		await this.validateAlias(sc, params.name);

		// validate the transformer object
		await this.validator.validateTransformer(params.transformer);

		// validate any referenced metrics
		const metrics = await this.extractMetrics(sc, params.transformer, true);

		// validate that destination metric does not have other metric as an input
		await this.validateOutputMetrics(metrics);

		// validate formula syntax using calculator if dryRunOptions specified
		if (params.dryRunOptions) {
			await this.dryRun(sc, params);
		}

		const now = new Date(Date.now()).toISOString();

		const pipeline: Pipeline = {
			...params,
			id: ulid().toLowerCase(),
			groups: [sc.groupId],
			createdBy: sc.email,
			createdAt: now,
			updatedAt: now,
			activeAt: params.activeAt ? dayjs.utc(params.activeAt).toISOString() : undefined,
			version: 1,
			state: 'enabled',
		};

		this.mapTransformOutputsToKeyIndexes(pipeline);
		this.createAggregatedOutputsKeyList(pipeline);

		// save the pipeline
		await this.repository.create(pipeline);
		await this.tagService.submitGroupSummariesProcess(sc.groupId, PkType.Pipeline, pipeline.tags, {});

		// link any referenced metric's to the pipeline
		for (const metric of metrics) {
			await this.metricService.linkPipeline(sc, metric.metricId, { id: pipeline.id, output: metric.output });
		}

		this.log.debug(`PipelineService> create> exit> pipeline:${JSON.stringify(pipeline)}`);

		// cleanup the payload before returning
		this.sanitizePipelineObject(pipeline);
		return pipeline;
	}

	private async extractMetrics(sc: SecurityContext, transformer: Transformer, validate: boolean): Promise<Metrics> {
		this.log.debug(`PipelineService> extractMetrics> in: transformer:${JSON.stringify(transformer)}`);

		const metrics: Metrics = [];

		for (const transform of transformer.transforms) {
			for (const output of transform.outputs) {
				if ((output.metrics?.length ?? 0) > 0) {
					for (const name of output.metrics) {
						const existing = (await this.metricService.list(sc, { name, includeParentGroups: true }))?.[0];
						if (validate) {
							if ((existing?.length ?? 0) === 0) {
								throw new PipelineDefinitionError(`Metric '${name}' not found.`);
							} else if (existing.length > 1) {
								throw new PipelineDefinitionError(`Multiple Metric's found matching name '${name}', but only 1 per hierarchy should exist.`);
							}
						}
						if (existing) {
							metrics.push({
								metricId: existing[0].id,
								output: output.key,
								inputMetrics: existing[0].inputMetrics,
								name: existing[0].name
							});
						}
					}
				}
			}
		}

		this.log.debug(`PipelineService > extractMetrics > exit: ${JSON.stringify(metrics)}`);
		return metrics;
	}

	public async delete(sc: SecurityContext, pipelineId: string): Promise<void> {
		this.log.debug(`PipelineService > delete > ${JSON.stringify(sc)}, ${pipelineId}`);

		// perform authorization check
		this.validateAccess(sc, atLeastAdmin);

		// verify exists
		const pipeline = await this.get(sc, pipelineId);

		// unlink any metrics
		const metrics = await this.extractMetrics(sc, pipeline.transformer, false);
		for (const metric of metrics) {
			await this.metricService.unlinkPipeline(sc, metric.metricId, { id: pipeline.id, output: metric.output });
		}

		// save the changes to the pipeline
		await this.repository.delete(pipelineId);
		await this.tagService.submitGroupSummariesProcess(sc.groupId, PkType.Pipeline, {}, pipeline.tags);

		this.log.debug(`PipelineService.delete(sc, pipelineId): [${JSON.stringify(sc)}, ${pipelineId}]`);
	}

	public async dryRunForUpdate(sc: SecurityContext, id: string, pipelineUpdateParams: PipelineUpdateParams & { groups?: string[] }): Promise<DryRunResponse> {
		this.log.debug(`PipelineService > dryRun > pipeline:${JSON.stringify(id)}, toUpdate:${JSON.stringify(pipelineUpdateParams)}`);

		// check if pipeline exists
		const existing = await this.get(sc, id);

		if (!existing) {
			throw new NotFoundError(`Pipeline with id: '${id} does not exist'`);
		}

		// merge the existing and to be updated
		const merged = this.mergeUtils.mergeResource(existing, pipelineUpdateParams) as Pipeline;

		return await this.dryRun(sc, merged);
	}

	public async dryRun(sc: SecurityContext, pipeline: PipelineCreateParams): Promise<DryRunResponse> {
		this.log.debug(`PipelineService > dryRun > pipeline:${JSON.stringify(pipeline)}`);

		if (!pipeline.dryRunOptions) {
			throw new PipelineDefinitionError(`dry run options not specified`);
		}

		// validate access
		this.validateAccess(sc, atLeastContributor);

		// validate the transformer object
		this.validator.validateTransformer(pipeline.transformer);

		// validate any referenced metrics
		await this.extractMetrics(sc, pipeline.transformer, true);

		// create calculation request payload to perform a dryrun
		const calculatorRequest: CalculatorRequest = {
			dryRun: true,
			actionType: 'create',
			pipelineId: ulid(),
			executionId: ulid(),
			groupContextId: sc.groupId,
			csvSourceData: pipeline.dryRunOptions.data,
			csvHeader: pipeline.transformer.parameters.map((o) => o.key).join(','),
			parameters: pipeline.transformer.parameters,
			transforms: pipeline.transformer.transforms,
			username: sc.email
		};

		const res = (await this.calculatorClient.process(calculatorRequest)) as DryRunResponse;

		if (res.errors && res.errors.length > 0) {
			throw new PipelineDefinitionError(JSON.stringify(res));
		}

		this.log.debug(`PipelineService > dryRun > pipeline: ${JSON.stringify(res)}`);

		return res;
	}

	public async get(sc: SecurityContext, pipelineId: string, version?: number, verbose?: boolean): Promise<Pipeline | undefined> {
		this.log.debug(`PipelineService > get sc:${JSON.stringify(sc)}, pipelineId: ${pipelineId}, version:${version}, verbose:${verbose}`);

		//perform authorization check
		this.validateAccess(sc, atLeastReader);

		// process repository call
		const pipeline = await this.repository.get(pipelineId, version, verbose);

		if (!pipeline) {
			throw new NotFoundError(`Pipeline ${pipelineId} not found.`);
		}

		// verify calculation is permissible to group
		const isAllowed = this.authChecker.matchGroup(pipeline.groups, sc.groupId);
		if (!isAllowed) {
			throw new UnauthorizedError(`The caller does not have access the group(s) that pipeline '${pipelineId}' is part of.`);
		}

		// override pipeline state if latest is frozen or disabled
		if (version) {
			const latestPipeline = await this.repository.get(pipelineId, undefined, verbose);
			if (latestPipeline.state === 'disabled' || latestPipeline.state === 'frozen') {
				pipeline.state = latestPipeline.state;
			}
		}

		this.log.debug(`PipelineService > get > exit > pipeline :${JSON.stringify(pipeline)}`);
		return pipeline;
	}

	public async list(sc: SecurityContext, options: PipelineListOptions): Promise<[Pipeline[], PipelineListPaginationKey]> {
		this.log.debug(`PipelineService.list(sc): [${JSON.stringify(sc)}, ${JSON.stringify(options)}]`);
		//perform authorization check
		this.validateAccess(sc, atLeastReader);

		let pipelines: Pipeline[] = [],
			paginationKey,
			pipelineIds;

		if (options.name) {
			this.log.info(`PipelinesService > list > searching by name : ${options.name}`);
			options.name = options.name.toLowerCase();
			pipelineIds = await this.resourceService.listIdsByAlternateId(sc.groupId, options.name, {
				includeChildGroups: options?.includeChildGroups,
				includeParentGroups: options?.includeParentGroups
			});
		} else {
			this.log.info(`PipelinesService > list > searching by group and tags : ${options.name}`);

			[pipelineIds, paginationKey] = await this.resourceService.listIds(sc.groupId, PkType.Pipeline, {
				tagFilter: options?.tags,
				pagination: {
					count: options?.count,
					from: {
						paginationToken: options?.exclusiveStart?.paginationToken
					}
				},
				includeChildGroups: options?.includeChildGroups,
				includeParentGroups: options?.includeParentGroups
			});
		}

		if (pipelineIds && (pipelineIds?.length ?? 0) > 0) {
			pipelines = (await this.repository.getByIds(pipelineIds)) as Pipeline[];
		}

		this.log.debug(`pipelineService > list > exit: ${JSON.stringify(pipelines)}`);
		return [pipelines, paginationKey];
	}

	public async listVersions(sc: SecurityContext, pipelineId: string, count?: number, fromVersion?: number, versionAsAt?: string): Promise<PipelineVersionListType> {
		this.log.debug(`PipelineService.get(sc, pipelineId): [${sc}, ${pipelineId}, ${count}, ${fromVersion}]`);

		//perform authorization check
		this.validateAccess(sc, atLeastReader);

		// retrieve the versions
		let pipelines: Pipeline[] = [];
		let paginationKey: PipelineVersionPaginationKey = undefined;
		do {
			// retrieve a page of versions
			[pipelines, paginationKey] = await this.repository.listVersions(pipelineId, count, fromVersion ? { version: fromVersion } : undefined, versionAsAt);

			// as each version may have different groups applied, check group membership individually
			const versionsToRemove: number[] = [];
			for (let i = 0; i < pipelines.length; i++) {
				const version = pipelines[i];
				const isAllowed = this.authChecker.matchGroup(version.groups, sc.groupId);
				if (!isAllowed) {
					versionsToRemove.push(i);
				}
			}
			for (let i = versionsToRemove.length - 1; i >= 0; i--) {
				pipelines.splice(versionsToRemove[i], 1);
			}

			// once we have checked the version we may have ended up with less than the requested page of results. if so, retrieve the next page
		} while (paginationKey !== undefined && pipelines.length < count);

		const response: PipelineVersionListType = {
			pipelines
		};

		if (paginationKey) {
			response.pagination = {
				lastEvaluatedVersion: paginationKey?.version
			};
		}
		this.log.debug(`pipelineService > listVersions > exit: ${JSON.stringify(response)}`);

		return response;
	}

	public async update(sc: SecurityContext, pipelineId: string, pipelineUpdateParams: PipelineUpdateParams & { groups?: string[] }): Promise<Pipeline> {
		this.log.debug(`PipelineService.create(sc, params): [${sc}, ${pipelineId}, ${JSON.stringify(pipelineUpdateParams)}]`);

		// perform authorization check
		this.validateAccess(sc, atLeastContributor);

		if (pipelineUpdateParams.activeAt && !dayjs(pipelineUpdateParams.activeAt).isValid()) {
			throw new InvalidRequestError('Invalid Date specified double check if the date/time is in ISO8601 local time');
		}

		// check if the pipeline exist
		const existing = await this.get(sc, pipelineId, undefined, true);

		// merge the existing and to be updated
		const merged = this.mergeUtils.mergeResource(existing, pipelineUpdateParams) as Pipeline;

		merged.updatedAt = new Date(Date.now()).toISOString();
		merged.updatedBy = sc.email;
		merged.version = existing.version + 1;
		merged.activeAt = pipelineUpdateParams.activeAt ? dayjs.utc(pipelineUpdateParams.activeAt).toISOString() : undefined;

		this.validateOutputIncludeAsUniqueChange(existing.transformer.transforms, merged.transformer.transforms);

		// validate the transformer object
		this.validator.validateTransformer(merged.transformer);

		// validate formula syntax using calculator if dryRunOptions specified
		if (merged.dryRunOptions) {
			await this.dryRun(sc, merged);
		}

		// validate any referenced metrics
		const existingMetrics = await this.extractMetrics(sc, existing.transformer, false);
		const mergedMetrics = await this.extractMetrics(sc, merged.transformer, true);

		// validate that destination metric does not have other metric as an input
		await this.validateOutputMetrics(mergedMetrics);

		// determine which tags are to add/delete
		const tagDiff = this.tagService.diff(existing.tags, merged.tags);

		this.mapTransformOutputsToKeyIndexes(merged);

		if (pipelineUpdateParams.transformer) {
			this.createAggregatedOutputsKeyList(merged);
		}

		// save the pipeline
		await this.repository.update(merged, tagDiff.toAdd, tagDiff.toDelete);
		await this.tagService.submitGroupSummariesProcess(sc.groupId, PkType.Pipeline, tagDiff.toAdd, tagDiff.toDelete);

		// link/unlink any metrics to/from the pipeline
		const metricDiff = this.metricDiff(existingMetrics, mergedMetrics);
		for (const metric of metricDiff.toAdd) {
			await this.metricService.linkPipeline(sc, metric.metricId, { id: merged.id, output: metric.output });
		}
		for (const metric of metricDiff.toDelete) {
			await this.metricService.unlinkPipeline(sc, metric.metricId, { id: merged.id, output: metric.output });
		}

		this.log.debug(`pipelineService > update > exit: ${JSON.stringify(merged)}`);
		// cleanup the payload before returning
		this.sanitizePipelineObject(merged);

		return merged;
	}

	private validateAccess(sc: SecurityContext, allowedRoles: SecurityScope[]): void {
		const isAuthorized = this.authChecker.isAuthorized([sc.groupId], sc.groupRoles, allowedRoles, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not authorized of the group in context \`${JSON.stringify(sc.groupId)}`);
		}
	}

	private async validateAlias(sc: SecurityContext, alias: string): Promise<void> {
		this.log.debug(`PipelineService> validateAlias> groupId:${sc.groupId}, alias:${alias}`);
		// Validation - ensure name is unique for the group
		if (await this.groupService.isAlternateIdInUse(alias, sc.groupId)) {
			throw new AlternateIdInUseError(alias);
		}
	}

	public async grant(securityContext: SecurityContext, id: string, groupId: string): Promise<void> {
		this.log.debug(`PipelinesService> grant> id:${id}, groupId:${groupId}`);

		// Authz check - Only `admin` and above of both current and target groups may grant
		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId, groupId], securityContext.groupRoles, atLeastAdmin, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not an \`admin\` of either the group in context \`${JSON.stringify(securityContext.groupId)} or the target group \`${groupId}\`.`);
		}

		// retrieve existing calculation (also verifying permissions)
		const existing = await this.get(securityContext, id);
		if (!existing) {
			throw new NotFoundError(`Pipeline '${id}' not found.`);
		}

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
				keyPrefix: PkType.Pipeline
			},
			{ id: groupId }
		);

		// update the main resource item
		existing.groups.push(groupId);
		await this.update(securityContext, id, existing);

		this.log.debug(`PipelinesService> grant> exit:`);
	}

	public async revoke(securityContext: SecurityContext, id: string, groupId: string): Promise<void> {
		this.log.debug(`PipelinesService> revoke> id:${id}, groupId:${groupId}`);

		// Authz check - Only `admin` and above of both current and target groups may grant
		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId, groupId], securityContext.groupRoles, atLeastAdmin, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not an \`admin\` of either the group in context \`${JSON.stringify(securityContext.groupId)} or the target group \`${groupId}\`.`);
		}

		// retrieve existing calculation (also verifying permissions)
		const existing = await this.get(securityContext, id);
		if (!existing) {
			throw new NotFoundError(`Pipelines '${id}' not found.`);
		}

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
				keyPrefix: PkType.Pipeline
			},
			{ id: groupId }
		);

		// update the main resource item
		const index = existing.groups.indexOf(groupId);
		if (index > 0) {
			existing.groups.splice(index, 1);
			await this.update(securityContext, id, existing);
		}

		this.log.debug(`PipelinesService> revoke> exit:`);
	}

	private metricDiff(existing: Metrics = [], updated: Metrics = []): DiffResult {
		this.log.debug(`PipelinesService> metricDiff> in> existing:${JSON.stringify(existing)}, updated:${JSON.stringify(updated)}`);

		const result: DiffResult = {
			toAdd: [],
			toDelete: []
		};

		updated.filter((u) => existing.find((e) => u.metricId === e.metricId && u.output === e.output) === undefined).forEach((u) => result.toAdd.push(u));

		existing.filter((e) => updated.find((u) => e.metricId === u.metricId && e.output === u.output) === undefined).forEach((e) => result.toDelete.push(e));

		this.log.debug(`PipelinesService> metricDiff> exit:${JSON.stringify(result)}`);
		return result;
	}

	/**
	 * This maps transform outputs to a unique column in postgresdb if transform output contains "includeAsUnique" property. The _keyMapIndex, will be used to identify an activity by additional unique attributes such as
	 * equipmentId, serialNumber, any output can be tagged to be unique, but only max of 5 (this validation is done in the validator). This is also used when building out the sql query when filtering on activities if a user
	 * specifies a filter like so: attributes=equipmentId:abc
	 * @param pipeline
	 * @private
	 * example: a part of a transform which has an output which includes "includeAsUniqueKey"
	 * input: trasnformers.transfomrs[1].outputs[0]: {
	 *  "description": "Column A",
	 *  "index": 0,
	 *  "key": "x",
	 *  "label": "Column A",
	 * 	"type": "string",
	 * 	"includeAsUnique": true
	 * }
	 *
	 * output: trasnformers.transfomrs[1].outputs[0]: {
	 *  "description": "Column A",
	 *  "index": 0,
	 *  "key": "x",
	 *  "label": "Column A",
	 * 	"type": "string",
	 * 	"includeAsUnique": true,
	 * 	"_keyMapIndex": "key1"
	 * }
	 */
	private mapTransformOutputsToKeyIndexes(pipeline: Pipeline): void {
		this.log.debug(`PipelinesService> mapTransformOutputsToKeyIndexes> in> pipeline:${JSON.stringify(pipeline)}`);
		// to handle updates, we need to first remove all indexes, we will assume the user has changed the transform, rather then doing a diff, we should just re-map the index
		pipeline.transformer.transforms.forEach((transform) => {
			transform.outputs.forEach((output) => {
				delete output._keyMapping;
			});
		});

		// loop over the transforms and include the "_keyMapping" to the individual transform outputs which contain "includeAsUnique" boolean set to true
		// why we need do this ? The activities postgres table needs to uniquely identify activity by user specified unique keys, these keys can be specified
		// if the user sets "includeAsUnique" property on specific output of a transform, the output key becomes part of the primary key for the activity
		// what's this code below doing ? we loop over all transform outputs and check which has the user specified "includeAsUnique" flag, if it does,
		// we need to dynamically allocate a mapping to the output which matches to one of "key1 ... key5" (this is validated beforehand in the transform validator)
		// we simply just sequentially go over each output and specify a mapping key to it which maps to a colum in activity table.
		let keyIndex = 1;
		pipeline.transformer.transforms.forEach((transform) => {
			transform.outputs.forEach((output) => {
				if (output.includeAsUnique === true && keyIndex !== 6) {
					output._keyMapping = `key${keyIndex}`;
					keyIndex++;
				}
			});
		});
		this.log.debug(`PipelinesService> mapTransformOutputsToKeyIndexes> out> `);
	}

	/**
	 * This creates an aggregated object called "_aggregatedOutputKeyAndTypeMap" which contains historical reference to all outputs between different versions, this is needed for us to perform the historical query on activites
	 * the map key is the output key name and the value is the output key type. When a pipeline transform is updated this aggregated map will be merged with the transform output key and type to track all outputs/types for all different
	 * versions of the pipeline.
	 * @param pipeline
	 * @private
	 */
	private createAggregatedOutputsKeyList(pipeline: Pipeline): void {
		this.log.debug(`PipelinesService> createAggregatedOutputsKeyList> in> pipeline:${JSON.stringify(pipeline)}`);
		if (!pipeline._aggregatedOutputKeyAndTypeMap) pipeline._aggregatedOutputKeyAndTypeMap = {};

		pipeline.transformer.transforms.slice(1).forEach((transform) => {
			transform.outputs.forEach((output) => {
				pipeline._aggregatedOutputKeyAndTypeMap[output.key] = output.type;
			});
		});
		this.log.debug(`PipelinesService> createAggregatedOutputsKeyList> out>`);
	}

	/**
	 * We introduced system specific attributes on the pipeline object, some funtions above such as update/get returns pipeline object as is to the user. We have to cleanup the system specific attributes from those objects before we retur it
	 * to the user
	 * @param pipeline
	 * @private
	 */
	private sanitizePipelineObject(pipeline: Pipeline): void {
		this.log.debug(`PipelinesService>sanitizePipelieObject> in> pipeline:${JSON.stringify(pipeline)}`);

		pipeline.transformer.transforms.forEach((transform) => {
			transform.outputs.forEach((output) => {
				delete output._keyMapping;
			});
		});
		delete pipeline._aggregatedOutputKeyAndTypeMap;

		this.log.debug(`PipelinesService> sanitizePipelieObject> out>`);
	}

	/**
	 * validate if the existing Transforms doesnt match with updated transform, throws an error if validation fails.
	 * @param existingTransforms
	 * @param updatedTransforms
	 * @private
	 */
	private validateOutputIncludeAsUniqueChange(existingTransforms: Transform[], updatedTransforms: Transform[]): void {
		this.log.debug(`PipelinesService> validateOutputIncludeAsUniqueChange> in> existingTransforms: ${JSON.stringify(existingTransforms)}, updatedTransforms: ${JSON.stringify(updatedTransforms)}`);
		// lets loop over the transforms
		existingTransforms.slice(1).forEach((t) => {
			const updatedTransform = updatedTransforms[t.index];
			// lets loop over the individual outputs
			t.outputs.forEach((o) => {
				// throw an error if the same output on the updated transform has the "includeAsUnique" changed
				if (o.includeAsUnique && !updatedTransform.outputs[o.index].includeAsUnique) {
					throw new PipelineDefinitionError('includeAsUnique cannot be changed or updated for the outputs. If it needs to be changed a new pipeline must be created');
				}
			});
		});
	}
}

type Metrics = {
	metricId: string;
	output: string;
	inputMetrics: string[];
	name: string;
}[];

interface DiffResult {
	toAdd: Metrics;
	toDelete: Metrics;
}
