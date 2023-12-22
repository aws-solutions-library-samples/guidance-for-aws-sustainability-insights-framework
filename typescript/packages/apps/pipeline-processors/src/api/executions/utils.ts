import type { GroupPermissions } from '@sif/authz';
import { UnauthorizedError, NotFoundError } from '@sif/resource-api-base';
import type { FastifyBaseLogger } from 'fastify';
import dayjs from 'dayjs';
import { AuditFilePendingError } from '../../common/errors';

export class PipelineExecutionUtils {
	private readonly log: FastifyBaseLogger;
	private readonly authChecker: GroupPermissions;
	private readonly auditLogWaitTimeSeconds: number;

	public constructor(log: FastifyBaseLogger, authChecker: GroupPermissions, auditLogWaitTimeSeconds: number) {
		this.log = log;
		this.authChecker = authChecker;
		this.auditLogWaitTimeSeconds = auditLogWaitTimeSeconds;
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

	public validateExecutionAuditComplete(execution: { status: string, updatedAt?: string }) {
		this.log.trace(`PipelineProcessorsService>  validateExecutionAuditComplete>  execution: ${execution}`);

		if (!execution) {
			throw new NotFoundError(`Pipeline execution does not exist`);
		}

		// execution hasn't completed
		if (execution.status !== 'success' && execution.status !== 'failed') {
			this.log.trace(`PipelineProcessorsService>  validateExecutionAuditComplete>  pipeline execution still in progress`);
			throw new AuditFilePendingError('audit processing is still in progress for execution');
		}
		// not enough time has elapsed since completion to ensure audit records have all been flushed from Kinesis Firehose
		if (execution.updatedAt === undefined || dayjs(execution.updatedAt).add(this.auditLogWaitTimeSeconds, 'second').isAfter(dayjs())) {
			this.log.trace(`PipelineProcessorsService>  validateExecutionAuditComplete>  ${this.auditLogWaitTimeSeconds} seconds have not elapsed since pipeline completion`);
			throw new AuditFilePendingError('audit processing is still in progress for execution');
		}

		this.log.trace(`PipelineProcessorsService>  validateExecutionAuditComplete> exit>`);
	}
}
