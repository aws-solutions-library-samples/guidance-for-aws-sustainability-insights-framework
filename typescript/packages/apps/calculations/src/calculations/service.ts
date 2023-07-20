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
import { atLeastAdmin, atLeastReader, GroupPermissions, SecurityContext, atLeastContributor } from '@sif/authz';
import { ulid } from 'ulid';
import type { CalculationListOptions, CalculationListPaginationKey, CalculationListVersionPaginationKey, CalculationListVersionsOptions, CalculationRepository } from './repository.js';
import type { Calculation, EditCalculation, NewCalculation, DryRunResponse } from './schemas.js';
import type { CalculationValidator } from '@sif/validators';
import type { CalculatorClient, CalculatorRequest } from '@sif/clients';
import { InvalidRequestError, AlternateIdInUseError, NotFoundError, UnauthorizedError, GroupService, TagService, ResourceService, MergeUtils } from '@sif/resource-api-base';
import { PkType } from '../common/pkTypes.js';
import { CalculationDefinitionError } from '../common/errors.js';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';

dayjs.extend(utc);

export class CalculationService {
	private readonly log: FastifyBaseLogger;
	private readonly authChecker: GroupPermissions;
	private readonly validator: CalculationValidator;
	private readonly repository: CalculationRepository;
	private readonly groupService: GroupService;
	private readonly tagService: TagService;
	private readonly resourceService: ResourceService;
	private readonly mergeUtils: MergeUtils;
	private readonly calculatorClient: CalculatorClient;

	public constructor(
		log: FastifyBaseLogger,
		authChecker: GroupPermissions,
		validator: CalculationValidator,
		repository: CalculationRepository,
		groupService: GroupService,
		tagService: TagService,
		resourceService: ResourceService,
		mergeUtils: MergeUtils,
		calculatorClient: CalculatorClient
	) {
		this.log = log;
		this.authChecker = authChecker;
		this.validator = validator;
		this.repository = repository;
		this.groupService = groupService;
		this.tagService = tagService;
		this.resourceService = resourceService;
		this.mergeUtils = mergeUtils;
		this.calculatorClient = calculatorClient;
	}

	public async create(securityContext: SecurityContext, calculation: NewCalculation): Promise<Calculation> {
		this.log.debug(`CalculationService> create> calculation:${JSON.stringify(calculation)}`);

		// Authz check - Only `admin` and above may create new calculations.
		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId], securityContext.groupRoles, atLeastContributor, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not an \`admin\` of the group in context \`${JSON.stringify(securityContext.groupId)}`);
		}

		// Validation - ensure name is unique for the group
		if (await this.groupService.isAlternateIdInUse(calculation.name, securityContext.groupId, PkType.Calculation)) {
			throw new AlternateIdInUseError(calculation.name);
		}

		if (calculation.activeAt && !dayjs(calculation.activeAt).isValid()) {
			throw new InvalidRequestError('Invalid Date specified double check if the date/time is in ISO8601 local time');
		}

		// Validation - check parameters
		this.validator.validateParameters(calculation.formula, calculation.parameters);

		// Validation - check outputs
		this.validator.validateOutputs(calculation.outputs);

		// Validate formula using calculator module if dryRunOptions specified
		if (calculation.dryRunOptions) {
			await this.dryRun(securityContext, calculation);
		}


		// save
		const created: Calculation = {
			id: ulid().toLowerCase(),
			name: calculation.name,
			summary: calculation.summary,
			description: calculation.description,
			formula: calculation.formula,
			parameters: calculation.parameters,
			outputs: calculation.outputs,
			version: 1,
			state: 'enabled',
			groups: [securityContext.groupId],
			tags: calculation.tags,
			createdBy: securityContext.email,
			createdAt: new Date(Date.now()).toISOString(),
			activeAt: calculation.activeAt ? dayjs(calculation.activeAt).toISOString() : undefined,
		};
		await this.repository.create(created);

		// async tag group processing
		await this.tagService.submitGroupSummariesProcess(securityContext.groupId, PkType.Calculation, calculation.tags, {});

		this.log.debug(`CalculationService> create> exit:${JSON.stringify(created)}`);
		return created;
	}

	public async dryRun(securityContext: SecurityContext, calculation: NewCalculation): Promise<DryRunResponse> {
		this.log.debug(`CalculationService> dryRun> calculation:${JSON.stringify(calculation)}`);

		if (!calculation.dryRunOptions) {
			throw new CalculationDefinitionError(`dry run options not specified`);
		}

		// Authz check - Only `admin` and above may create new calculations.
		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId], securityContext.groupRoles, atLeastContributor, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not authorized of the group in context \`${JSON.stringify(securityContext.groupId)}`);
		}

		// Validation - check parameters
		this.validator.validateParameters(calculation.formula, calculation.parameters);

		// Validation - check outputs
		this.validator.validateOutputs(calculation.outputs);

		// create calculation request payload to perform a dryrun
		const calculatorRequest: CalculatorRequest = {
			dryRun: true,
			username: securityContext.email,
			actionType: 'create',
			pipelineId: ulid(),
			executionId: ulid(),
			groupContextId: securityContext.groupId,
			sourceData: calculation.dryRunOptions.data.map((d) => JSON.stringify(d)),
			parameters: calculation.parameters,
			// when executing dry run in calculator it's the same as activities type
			pipelineType: 'activities',
			transforms: [
				{
					index: 0,
					formula: calculation.formula,
					outputs: [
						{
							index: 0,
							key: calculation.outputs[0].name,
							type: calculation.outputs[0].type
						}
					]
				}
			]
		};

		const res = (await this.calculatorClient.process(calculatorRequest)) as DryRunResponse;

		if (res.errors && res.errors.length > 0) {
			throw new CalculationDefinitionError(JSON.stringify(res));
		}

		this.log.debug(`CalculationService> dryRun> calculation: ${JSON.stringify(res)}`);

		return res;
	}

	public async dryRunForUpdate(securityContext: SecurityContext, id: string, toUpdate: EditCalculation & { groups?: string[] }): Promise<DryRunResponse> {
		this.log.debug(`CalculationService> dryRunForUpdate> id:${id}, toUpdate:${JSON.stringify(toUpdate)}`);

		// retrieve existing
		const existing = await this.get(securityContext, id);

		// merge the existing and to be updated
		const merged = this.mergeUtils.mergeResource(existing, toUpdate) as Calculation;

		return await this.dryRun(securityContext, merged);
	}

	public async update(securityContext: SecurityContext, id: string, toUpdate: EditCalculation & { groups?: string[] }): Promise<Calculation> {
		this.log.debug(`CalculationService> update> id:${id}, toUpdate:${JSON.stringify(toUpdate)}`);

		// Authz check - Only `admin` and above may update calculations.
		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId], securityContext.groupRoles, atLeastContributor, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not an \`admin\` of the group in context \`${JSON.stringify(securityContext.groupId)}`);
		}

		if (toUpdate.activeAt && !dayjs(toUpdate.activeAt).isValid()) {
			throw new InvalidRequestError('Invalid Date specified double check if the date/time is in ISO8601 local time');
		}

		// retrieve existing
		const existing = await this.get(securityContext, id);

		// merge the existing and to be updated
		const merged = this.mergeUtils.mergeResource(existing, toUpdate) as Calculation;
		merged.version = existing.version + 1;
		merged.updatedAt = new Date(Date.now()).toISOString();
		merged.activeAt = toUpdate.activeAt ? dayjs(toUpdate.activeAt).toISOString() : undefined;
		merged.updatedBy = securityContext.email;

		// Validation - check parameters
		this.validator.validateParameters(merged.formula, merged.parameters);

		// Validation - check outputs
		this.validator.validateOutputs(merged.outputs);

		// Validate formula using calculator module if dryRunOptions specified
		if (merged.dryRunOptions) {
			await this.dryRun(securityContext, merged);
		}

		// determine which tags are to add/delete
		const tagDiff = this.tagService.diff(existing.tags, merged.tags);

		// save
		await this.repository.update(merged, tagDiff.toAdd, tagDiff.toDelete);

		// async tag group processing
		await this.tagService.submitGroupSummariesProcess(securityContext.groupId, PkType.Calculation, tagDiff.toAdd, tagDiff.toDelete);

		this.log.debug(`CalculationService> update> exit:${JSON.stringify(merged)}`);
		return merged;
	}

	public async get(securityContext: SecurityContext, id: string, version?: string): Promise<Calculation> {
		this.log.debug(`CalculationService> get> in: id:${id}, version:${version}`);

		// Authz check - `reader` and above may retrieve calculations.
		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId], securityContext.groupRoles, atLeastReader, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not at least a \`reader\` of the group in context \`${JSON.stringify(securityContext.groupId)}`);
		}

		// retrieve
		const calculation = await this.repository.get(id, version);
		if (calculation === undefined) {
			throw new NotFoundError(`Calculation '${id}' not found.`);
		}

		// verify calculation is permissible to group
		const isAllowed = this.authChecker.matchGroup(calculation.groups, securityContext.groupId);
		if (!isAllowed) {
			throw new UnauthorizedError(`The calculation is not part of this group.`);
		}

		// override state if frozen or disabled
		if (version) {
			const currentCalculation = await this.repository.get(id);
			if (currentCalculation.state === 'disabled' || currentCalculation.state === 'frozen') {
				calculation.state = currentCalculation.state;
			}
		}

		this.log.debug(`CalculationService> get> exit:${JSON.stringify(calculation)}`);
		return calculation;
	}

	public async delete(securityContext: SecurityContext, id: string): Promise<void> {
		this.log.debug(`CalculationService> delete> id:${id}`);

		// Authz check - Only `admin` and above may update calculations.
		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId], securityContext.groupRoles, atLeastAdmin, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not a \`superAdmin\` of the group in context \`${JSON.stringify(securityContext.groupId)}`);
		}

		// check exists
		const existing = await this.repository.get(id);

		// verify calculation is permissible to group
		const isAllowed = this.authChecker.matchGroup(existing.groups, securityContext.groupId);
		if (!isAllowed) {
			throw new UnauthorizedError(`The calculation is not part of this group.`);
		}

		// delete
		await this.repository.delete(id);

		// async tag group processing
		await this.tagService.submitGroupSummariesProcess(securityContext.groupId, PkType.Calculation, {}, existing.tags);

		this.log.debug(`CalculationService> delete> exit:`);
	}

	public async list(securityContext: SecurityContext, options: CalculationListOptions): Promise<[Calculation[], CalculationListPaginationKey]> {
		this.log.debug(`CalculationService> list> in> options:${JSON.stringify(options)}`);

		// Authz check - `reader` of the group in context may list calculations.
		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId], securityContext.groupRoles, atLeastReader, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not at least a \`reader\` of the group in context \`${JSON.stringify(securityContext.groupId)}`);
		}

		let calculations: Calculation[] = [];
		let calculationIds: string[];
		let paginationKey: CalculationListPaginationKey = undefined;
		if (options.name) {
			this.log.info(`CalculationsService> list> searching by name : ${options.name}`);
			options.name = options.name.toLowerCase();
			calculationIds = await this.resourceService.listIdsByAlternateId(securityContext.groupId, options.name, PkType.Calculation, {
				includeChildGroups: options?.includeChildGroups,
				includeParentGroups: options?.includeParentGroups
			});
		} else {
			this.log.info(`CalculationsService> list> searching by group and tags : ${options.name}`);

			[calculationIds, paginationKey] = await this.resourceService.listIds(securityContext.groupId, PkType.Calculation, {
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
		calculations = await this.repository.listByIds(calculationIds);

		this.log.debug(`CalculationService> list> exit:${JSON.stringify([calculations, paginationKey])}`);
		return [calculations, paginationKey];
	}

	public async listVersions(securityContext: SecurityContext, id: string, options: CalculationListVersionsOptions): Promise<[Calculation[], CalculationListVersionPaginationKey]> {
		this.log.debug(`CalculationService> listVersions> in: id:${id}, options:${JSON.stringify(options)}`);

		// Authz check - `reader` of the group in context may list calculations.
		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId], securityContext.groupRoles, atLeastReader, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not at least a \`reader\` of the group in context \`${JSON.stringify(securityContext.groupId)}`);
		}

		// retrieve the versions
		let calculations: Calculation[] = [];
		let paginationKey: CalculationListVersionPaginationKey = undefined;
		do {
			// retrieve a page of versions
			[calculations, paginationKey] = await this.repository.listVersions(id, options);

			// as each version may have different groups applied, check group membership individually
			const versionsToRemove: number[] = [];
			for (let i = 0; i < calculations.length; i++) {
				const version = calculations[i];
				const isAllowed = this.authChecker.matchGroup(version.groups, securityContext.groupId);
				if (!isAllowed) {
					versionsToRemove.push(i);
				}
			}
			for (let i = versionsToRemove.length - 1; i >= 0; i--) {
				calculations.splice(versionsToRemove[i], 1);
			}

			// once we have checked the version we may have ended up with less than the requested page of results. if so, retrieve the next page
		} while (paginationKey !== undefined && calculations.length < options.count);

		this.log.debug(`CalculationService> listVersions> exit:${JSON.stringify([calculations, paginationKey])}`);
		return [calculations, paginationKey];
	}

	public async grant(securityContext: SecurityContext, id: string, groupId: string): Promise<void> {
		this.log.debug(`CalculationService> grant> id:${id}, groupId:${groupId}`);

		// Authz check - Only `admin` and above of both current and target groups may grant
		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId, groupId], securityContext.groupRoles, atLeastAdmin, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not an \`admin\` of either the group in context \`${JSON.stringify(securityContext.groupId)} or the target group \`${groupId}\`.`);
		}

		// retrieve existing calculation (also verifying permissions)
		const existing = await this.get(securityContext, id);
		if (!existing) {
			throw new NotFoundError(`Calculation '${id}' not found.`);
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
				keyPrefix: PkType.Calculation
			},
			{ id: groupId }
		);

		// update the main resource item
		existing.groups.push(groupId);
		await this.update(securityContext, id, existing);

		this.log.debug(`CalculationService> grant> exit:`);
	}

	public async revoke(securityContext: SecurityContext, id: string, groupId: string): Promise<void> {
		this.log.debug(`CalculationService> revoke> id:${id}, groupId:${groupId}`);

		// Authz check - Only `admin` and above of both current and target groups may grant
		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId, groupId], securityContext.groupRoles, atLeastAdmin, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not an \`admin\` of either the group in context \`${JSON.stringify(securityContext.groupId)} or the target group \`${groupId}\`.`);
		}

		// retrieve existing calculation (also verifying permissions)
		const existing = await this.get(securityContext, id);
		if (!existing) {
			throw new NotFoundError(`Calculation '${id}' not found.`);
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
				keyPrefix: PkType.Calculation
			},
			{ id: groupId }
		);

		// update the main resource item
		const index = existing.groups.indexOf(groupId);
		if (index > 0) {
			existing.groups.splice(index, 1);
			await this.update(securityContext, id, existing);
		}

		this.log.debug(`CalculationService> revoke> exit:`);
	}
}
