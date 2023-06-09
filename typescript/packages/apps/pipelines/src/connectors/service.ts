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
import { GroupPermissions, SecurityScope, atLeastReader, atLeastContributor, atLeastAdmin } from '@sif/authz';
import { AlternateIdInUseError, NotFoundError, UnauthorizedError, GroupService, ResourceService, MergeUtils, TagService, InvalidRequestError } from '@sif/resource-api-base';
import type { ConnectorListOptions, ConnectorListPaginationKey, ConnectorRepository } from './repository.js';
import type { Connector, ConnectorCreateParams, ConnectorUpdateParams } from './schemas.js';
import { PkType } from '../utils/pkUtils.utils.js';

export class ConnectorService {
	private readonly log: FastifyBaseLogger;
	private readonly repository: ConnectorRepository;
	private readonly authChecker: GroupPermissions;
	private readonly groupService: GroupService;
	private readonly tagService: TagService;
	private readonly resourceService: ResourceService;
	private readonly mergeUtils: MergeUtils;

	public constructor(
		log: FastifyBaseLogger,
		authChecker: GroupPermissions,
		repository: ConnectorRepository,
		groupService: GroupService,
		tagService: TagService,
		resourceService: ResourceService,
		mergeUtils: MergeUtils
	) {
		this.log = log;
		this.authChecker = authChecker;
		this.repository = repository;
		this.groupService = groupService;
		this.tagService = tagService;
		this.resourceService = resourceService;
		this.mergeUtils = mergeUtils;
	}

	public async create(sc: SecurityContext, params: ConnectorCreateParams): Promise<Connector> {
		this.log.debug(`ConnectorService> create> params> ${JSON.stringify(params)}`);

		// validate access
		this.validateAccess(sc, atLeastContributor);
		// validate alias usage for this connector
		await this.validateAlias(sc, params.name);

		// the only way we can validate if its  backend request vs a user making an api call is to validate the email on the security context to be the one specified in the request generating from the backend.
		if (params.isManaged && sc.email !== 'sif') {
			throw new InvalidRequestError('"isManaged" property can only be set by SIF itself. This is used to track SIF managed default connectors seeded at deploy time. Altering or specifying this property is not allowed');
		}

		const now = new Date(Date.now()).toISOString();
		const connector: Connector = {
			...params,
			id: ulid().toLowerCase(),
			groups: [sc.groupId],
			createdBy: sc.email,
			createdAt: now,
			updatedAt: now,
		};

		await this.repository.create(connector);
		await this.tagService.submitGroupSummariesProcess(sc.groupId, PkType.Connector, connector.tags, {});
		this.log.debug(`ConnectorService> create> exit> connector:${JSON.stringify(connector)}`);

		return connector;
	}

	public async delete(sc: SecurityContext, connectorId: string): Promise<void> {
		this.log.debug(`ConnectorService> delete> in: sc:${JSON.stringify(sc)}, connectorId:${connectorId}`);

		// verify exists
		const connector = await this.get(sc, connectorId);

		// verify that user is an admin on all the groups granted to the connector
		const isAuthorized = this.authChecker.isAuthorized(connector.groups, sc.groupRoles, atLeastAdmin, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`${sc.email} is not an admin on the groups ${JSON.stringify(sc.groupRoles)}`);
		}

		if (connector.isManaged) {
			throw new InvalidRequestError('This connector cannot be deleted because its a SIF managed connector. Any connectors which are managed by SIF have "isManaged" property set to true. These connectors cannot be altered by users');
		}

		// save the changes to the pipeline
		await this.repository.delete(connectorId);
		await this.tagService.submitGroupSummariesProcess(sc.groupId, PkType.Connector, {}, connector.tags);

		this.log.debug(`PipelineService> delete> exit:`);
	}

	public async get(sc: SecurityContext, connectorId: string): Promise<Connector> {
		this.log.debug(`ConnectorService > get sc:${JSON.stringify(sc)}, connectorId: ${connectorId}}`);

		//perform authorization check
		this.validateAccess(sc, atLeastReader);

		const connector = await this.repository.get(connectorId);

		if (!connector) {
			throw new NotFoundError(`Connector ${connectorId} not found.`);
		}

		const isAllowed = this.authChecker.matchGroup(connector.groups, sc.groupId);
		if (!isAllowed) {
			throw new UnauthorizedError(`The caller does not have access the group(s) that connector '${connectorId}' is part of.`);
		}

		this.log.debug(`ConnectorService > get > exit > connector :${JSON.stringify(connector)}`);
		return connector;

	}

	public async getByName(sc: SecurityContext, name: string): Promise<Connector> {
		this.log.debug(`ConnectorService> getByName> in> sc:${sc}, name:${name}`);

		const [connectors] = await this.list(sc, { name, includeParentGroups: true, includeChildGroups: true });

		if (connectors.length === 0) {
			throw new NotFoundError(`Connector ${name} not found.`);
		}

		this.log.debug(`ConnectorService> getByName> out>`);
		return connectors[0];
	}

	public async grant(sc: SecurityContext, id: string, groupId: string): Promise<void> {
		this.log.debug(`ConnectorService> grant> in: id:${id}, groupId:${groupId}`);

		// Authz check - Only `admin` and above of both current and target groups may grant
		const isAuthorized = this.authChecker.isAuthorized([sc.groupId, groupId], sc.groupRoles, atLeastAdmin, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not an \`admin\` of either the group in context \`${JSON.stringify(sc.groupId)} or the target group \`${groupId}\`.`);
		}

		// retrieve existing connector (also verifying permissions)
		const existing = await this.get(sc, id);
		if (!existing) {
			throw new NotFoundError(`Connector '${id}' not found.`);
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
				keyPrefix: PkType.Connector
			},
			{ id: groupId }
		);

		// update the main resource item
		existing.groups.push(groupId);
		await this.update(sc, id, existing);

		this.log.debug(`ConnectorService> grant> exit:`);
	}

	public async list(sc: SecurityContext, options: ConnectorListOptions): Promise<[Connector[], ConnectorListPaginationKey]> {
		this.log.debug(`ConnectorService> list> sc:${JSON.stringify(sc)}, options${JSON.stringify(options)}`);

		this.validateAccess(sc, atLeastReader);

		let connectors: Connector[] = [],
			paginationKey,
			connectorIds;

		if (options.name) {
			this.log.info(`ConnectorsService > list > searching by name : ${options.name}`);
			options.name = options.name.toLowerCase();
			connectorIds = await this.resourceService.listIdsByAlternateId(sc.groupId, options.name, PkType.Connector, {
				includeChildGroups: options?.includeChildGroups,
				includeParentGroups: options?.includeParentGroups
			});
		} else {
			this.log.info(`ConnectorsService > list > searching by group and tags : ${options.name}`);
			[connectorIds, paginationKey] = await this.resourceService.listIds(sc.groupId, PkType.Connector, {
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

		if (connectorIds && (connectorIds?.length ?? 0) > 0) {
			connectors = (await this.repository.getByIds(connectorIds)) as Connector[];
		}

		this.log.debug(`ConnectorService > list > exit: ${JSON.stringify(connectors)}`);
		return [connectors, paginationKey];

	}


	public async revoke(sc: SecurityContext, id: string, groupId: string): Promise<void> {
		this.log.debug(`ConnectorService> revoke> in: id:${id}, groupId:${groupId}`);

		// Authz check - Only `admin` and above of both current and target groups may grant
		const isAuthorized = this.authChecker.isAuthorized([sc.groupId, groupId], sc.groupRoles, atLeastAdmin, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not an \`admin\` of either the group in context \`${JSON.stringify(sc.groupId)} or the target group \`${groupId}\`.`);
		}

		// retrieve existing calculation (also verifying permissions)
		const existing = await this.get(sc, id);
		if (!existing) {
			throw new NotFoundError(`Connector '${id}' not found.`);
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
				keyPrefix: PkType.Connector
			},
			{ id: groupId }
		);

		// update the main resource item
		const index = existing.groups.indexOf(groupId);
		if (index > 0) {
			existing.groups.splice(index, 1);
			await this.update(sc, id, existing);
		}

		this.log.debug(`ConnectorService> grant> exit:`);
	}

	public async update(sc: SecurityContext, connectorId: string, params: ConnectorUpdateParams & { groups?: string[] }): Promise<Connector> {
		this.log.debug(`ConnectorService> update> in: sc:${sc}, connectorId:${connectorId}, params: ${params}`);

		this.validateAccess(sc, atLeastContributor);

		// NOTE: user cannot pass in "isManaged" property through the API request. typebox validation will drop that property because its not specified in the ConnectorUpdateParams model

		// check if the connector exist
		const connector = await this.get(sc, connectorId);


		const merged = this.mergeUtils.mergeResource(connector, params) as Connector;
		merged.updatedAt = new Date(Date.now()).toISOString();
		merged.updatedBy = sc.email;

		// determine which tags are to add/delete
		const tagDiff = this.tagService.diff(connector.tags, merged.tags);

		// save the connector
		await this.repository.update(merged, tagDiff.toAdd, tagDiff.toDelete);
		await this.tagService.submitGroupSummariesProcess(sc.groupId, PkType.Connector, tagDiff.toAdd, tagDiff.toDelete);

		this.log.debug(`ConnectorService > update > exit: ${JSON.stringify(merged)}`);

		return merged;

	}

	private validateAccess(sc: SecurityContext, allowedRoles: SecurityScope[]): void {
		const isAuthorized = this.authChecker.isAuthorized([sc.groupId], sc.groupRoles, allowedRoles, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not authorized of the group in context \`${JSON.stringify(sc.groupId)}`);
		}
	}

	private async validateAlias(sc: SecurityContext, alias: string): Promise<void> {
		this.log.debug(`ConnectorService> validateAlias> groupId:${sc.groupId}, alias:${alias}`);
		// Validation - ensure name is unique for the group
		if (await this.groupService.isAlternateIdInUse(alias, sc.groupId, PkType.Connector)) {
			throw new AlternateIdInUseError(alias);
		}
		this.log.debug(`ConnectorService> validateAlias> exit:`);
	}

}

