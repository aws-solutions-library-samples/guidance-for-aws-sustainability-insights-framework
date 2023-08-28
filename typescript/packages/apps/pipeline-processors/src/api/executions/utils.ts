import type { GroupPermissions } from '@sif/authz';
import { UnauthorizedError, NotFoundError } from '@sif/resource-api-base';
import type { FastifyBaseLogger } from 'fastify';

export class PipelineExecutionUtils {
	private readonly log: FastifyBaseLogger;
	private readonly authChecker: GroupPermissions;

	public constructor(log: FastifyBaseLogger, authChecker: GroupPermissions) {
		this.log = log;
		this.authChecker = authChecker;
	}

	public validatePipelineExecutionAccess(execution: { id: string, groupContextId: string } | undefined, groupContextId) {
		this.log.trace(`PipelineProcessorsService>  validatePipelineExecutionAccess>  groupContextId: ${groupContextId}, execution: ${execution}`);

		if (!execution) {
			throw new NotFoundError(`Pipeline execution does not exist`);
		}

		const isAllowed = this.authChecker.matchGroup([execution.groupContextId], groupContextId);
		if (!isAllowed) {
			throw new UnauthorizedError(`The caller does not have access to the group(s) that pipeline execution '${execution.id}' is part of.`);
		}
		this.log.trace(`PipelineProcessorsService>  validatePipelineExecutionAccess> exit> isAllowed:${isAllowed}`);
	}
}
