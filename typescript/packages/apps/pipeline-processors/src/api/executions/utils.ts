import type { GroupPermissions } from '@sif/authz';
import { UnauthorizedError } from '@sif/resource-api-base';
import type { FastifyBaseLogger } from 'fastify';

export class PipelineExecutionUtils {
	private readonly log: FastifyBaseLogger;
	private readonly authChecker: GroupPermissions;

	public constructor(log: FastifyBaseLogger, authChecker: GroupPermissions) {
		this.log = log;
		this.authChecker = authChecker;
	}

	public validatePipelineExecutionAccess(resourceGroups: string[], groupContextId, executionId: string) {
		this.log.trace(`PipelineProcessorsService>  validatePipelineExecutionAccess> resourceGroups:${resourceGroups}, groupContextId: ${groupContextId}, executionId: ${executionId}`);
		const isAllowed = this.authChecker.matchGroup(resourceGroups, groupContextId);
		if (!isAllowed) {
			throw new UnauthorizedError(`The caller does not have access to the group(s) that pipeline execution '${executionId}' is part of.`);
		}
		this.log.trace(`PipelineProcessorsService>  validatePipelineExecutionAccess> exit> isAllowed:${isAllowed}`);
	}
}
