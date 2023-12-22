import type { FastifyBaseLogger } from 'fastify';
import type { MatchExistingJob, MetricAggregationJob, MetricAggregationJobStatus, MetricAggregationJobWithContext, NewMetricAggregationJob } from './schemas.js';
import type { SecurityContext } from '@sif/authz';
import { atLeastAdmin, atLeastContributor, atLeastReader, GroupPermissions } from '@sif/authz';
import { InvalidRequestError, NotFoundError, ResourceService, UnauthorizedError, Utils } from '@sif/resource-api-base';
import type { ListTasksOptions, ListTasksPaginationKey, MetricAggregationJobRepository } from './repository.js';
import { validateNotEmpty } from '@sif/validators';
import { PkType } from '../../common/pkUtils.js';
import { ulid } from 'ulid';
import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import type { GroupsQueue, MetricAggregationTaskEvent } from '../../stepFunction/tasks/model';
import dayjs from 'dayjs';
import type { MetricClient, MetricQueue, PipelineClient } from '@sif/clients';
import type { GetLambdaRequestContext } from '../../plugins/module.awilix';
import type { AggregationUtil } from '../../utils/aggregation.util.js';
import type { AuroraStatus, PlatformResourceUtility } from '../../utils/platformResource.utility.js';
import { AuroraResourceName } from '../../utils/platformResource.utility.js';

export class MetricAggregationJobService {

	public constructor(private log: FastifyBaseLogger,
					   private repository: MetricAggregationJobRepository,
					   private authChecker: GroupPermissions,
					   private resourceService: ResourceService,
					   private sfnClient: SFNClient,
					   private jobStateMachineArn: string,
					   private pipelineClient: PipelineClient,
					   private metricClient: MetricClient,
					   private getLambdaRequestContext: GetLambdaRequestContext,
					   private groupUtils: Utils,
					   private metricAggregationUtil: AggregationUtil,
					   private platformResourceUtility: PlatformResourceUtility) {
	}

	public async list(sc: SecurityContext, options: ListTasksOptions): Promise<[MetricAggregationJobWithContext[], ListTasksPaginationKey]> {
		this.log.debug(`MetricAggregationJobService> list> in> options:${JSON.stringify(options)}`);

		// Authz check - `reader` of the group in context may list calculations.
		const isAuthorized = this.authChecker.isAuthorized([sc.groupId], sc.groupRoles, atLeastReader, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not at least a \`reader\` of the group in context \`${JSON.stringify(sc.groupId)}`);
		}

		let metricAggregationJobs: MetricAggregationJobWithContext[] = [], paginationKey: ListTasksPaginationKey, metricAggregationJobIds: string[];

		if (options.name) {
			this.log.info(`MetricAggregationJobService > list > searching by pipelineId : ${options.name}`);
			metricAggregationJobIds = await this.resourceService.listIdsByAlternateId(sc.groupId, options.name, PkType.MetricAggregationJob, {
				includeChildGroups: true,
				includeParentGroups: false
			});
		} else {
			[metricAggregationJobIds, paginationKey] = await this.resourceService.listIds(sc.groupId, PkType.MetricAggregationJob, {
				pagination: {
					count: options?.count,
					from: {
						paginationToken: options?.exclusiveStart?.paginationToken
					}
				},
				includeChildGroups: true
			});
		}

		if (metricAggregationJobIds && (metricAggregationJobIds?.length ?? 0) > 0) {
			metricAggregationJobs = (await this.repository.getByIds(metricAggregationJobIds)) as MetricAggregationJobWithContext[];
		}

		this.log.debug(`MetricAggregationJobService> list> exit> metricAggregationJobs:${JSON.stringify(metricAggregationJobs)}, paginationKey: ${JSON.stringify(paginationKey)}`);

		return [metricAggregationJobs, paginationKey];
	}

	public async get(sc: SecurityContext, metricAggregationJobId: string): Promise<MetricAggregationJobWithContext | undefined> {
		this.log.debug(`MetricAggregationJobService > get > metricAggregationJobId: ${metricAggregationJobId}`);

		// Authz check - `reader` of the group in context may list calculations.
		const isAuthorized = this.authChecker.isAuthorized([sc.groupId], sc.groupRoles, atLeastReader, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not at least a \`reader\` of the group in context \`${JSON.stringify(sc.groupId)}`);
		}

		validateNotEmpty(metricAggregationJobId, 'metricAggregationJobId');

		const metricAggregationJob = await this.repository.get(metricAggregationJobId);

		if (!metricAggregationJob) {
			throw new NotFoundError(`Metric aggregation job ${metricAggregationJobId} not found.`);
		}

		this.log.debug(`MetricAggregationJobService > get > exit > task: ${JSON.stringify(metricAggregationJob)}`);

		return metricAggregationJob;
	}

	private async getMetricQueue(sc: SecurityContext, pipelineId: string): Promise<MetricQueue> {
		this.log.trace(`MetricAggregationJobService > getMetricQueue > pipelineId: ${pipelineId}`);

		const pipeline = await this.pipelineClient.get(pipelineId, undefined, this.getLambdaRequestContext(sc));
		const metrics = Array.from(new Set(pipeline.transformer.transforms.flatMap((t) => t.outputs.flatMap((o) => o.metrics ?? []))));
		const metricQueue = await this.metricClient.sortMetricsByDependencyOrder(metrics, this.getLambdaRequestContext(sc));

		this.log.trace(`MetricAggregationJobService > getMetricQueue > exit > metricQueue: ${metricQueue}`);
		return metricQueue;
	}

	public async delete(sc: SecurityContext, metricAggregationJobId: string): Promise<void> {
		this.log.debug(`MetricAggregationJobService > delete > metricAggregationJobId: ${metricAggregationJobId}`);

		validateNotEmpty(metricAggregationJobId, 'metricAggregationJobId');

		const isAuthorized = this.authChecker.isAuthorized([sc.groupId], sc.groupRoles, atLeastAdmin, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not at least a \`admin\` of the group in context \`${JSON.stringify(sc.groupId)}`);
		}

		const metricAggregationJob = await this.repository.get(metricAggregationJobId);

		if (!metricAggregationJob) {
			throw new NotFoundError(`Metric aggregation job ${metricAggregationJobId} cannot be found`);
		}

		await this.repository.delete(metricAggregationJobId);

		this.log.debug(`MetricAggregationJobService > delete > exit >`);
	}

	private assembleUpdateJobPayload(existingJob: MetricAggregationJobWithContext, updateRequest: { groups: string[], timeRange: { to: string, from: string } }): MetricAggregationJobWithContext {
		this.log.debug(`MetricAggregationJobService > assembleUpdateJobPayload > existingJob: ${JSON.stringify(existingJob)}, updateRequest: ${JSON.stringify(updateRequest)}`);

		const existingGroupsLeaves = existingJob.groupsQueue.map(o => o.group);
		// create a new group queue from the combined group
		const executionGroupLeaves = this.metricAggregationUtil.mergeExecutionGroupLeaves(updateRequest.groups, existingGroupsLeaves);
		const groupsQueue = [];
		executionGroupLeaves.forEach((egl, i) => {
			groupsQueue.push({ order: i + 1, group: egl });
		});

		// update the time range
		const { timeRange: existingTimeRange } = existingJob;
		const existingTo = dayjs(existingTimeRange.to).toDate();
		const existingFrom = dayjs(existingTimeRange.from).toDate();
		const newTo = dayjs(updateRequest.timeRange.to).toDate();
		const newFrom = dayjs(updateRequest.timeRange.from).toDate();
		const updatedTimeRange = {
			to: ((existingTo > newTo) ? existingTo : newTo).toISOString(),
			from: ((existingFrom < newFrom) ? existingFrom : newFrom).toISOString()
		};

		this.log.debug(`MetricAggregationJobService > assembleUpdateJobPayload > exit`);
		return {
			...existingJob,
			groupsQueue,
			timeRange: updatedTimeRange
		};
	}


	public async update(metricAggregationJobId: string, updateRequest: { status: MetricAggregationJobStatus }): Promise<void> {
		this.log.debug(`MetricAggregationJobService > update > metricAggregationJobId: ${metricAggregationJobId}, updateRequest: ${JSON.stringify(updateRequest)}`);

		validateNotEmpty(updateRequest?.status, 'updateRequest.status');

		const existingJob = await this.repository.get(metricAggregationJobId);
		if (!existingJob) {
			throw new NotFoundError(`Metric aggregation job not found`);
		}
		if (existingJob.status === 'succeeded' || existingJob.status === 'failed') {
			throw new InvalidRequestError(`Metric aggregation job has already completed`);
		}

		const secondsSinceEpoch = Math.round(Date.now() / 1000);
		// set the aggregation task to expire in 1 hour
		const expirationTime = secondsSinceEpoch + (60 * 60);
		await this.repository.create({
			...existingJob,
			status: updateRequest.status
		}, expirationTime);

		this.log.debug(`MetricAggregationJobService > update > exit >`);
	}

	public async create(sc: SecurityContext, newMetricAggregationJob: NewMetricAggregationJob, groupsQueue?: GroupsQueue): Promise<[MetricAggregationJob, MatchExistingJob]> {
		this.log.debug(`MetricAggregationJobService > create > newMetricAggregationJob: ${JSON.stringify(newMetricAggregationJob)}`);

		const isAuthorized = this.authChecker.isAuthorized([sc.groupId], sc.groupRoles, atLeastContributor, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not at least a \`contributor\` of the group in context \`${JSON.stringify(sc.groupId)}`);
		}

		const { pipelineId, timeRange } = newMetricAggregationJob;

		validateNotEmpty(pipelineId, 'pipelineId');
		validateNotEmpty(timeRange?.to, 'timeRange.to');
		validateNotEmpty(timeRange?.from, 'timeRange.from');

		if (dayjs(timeRange.from).toDate() > dayjs(timeRange.to).toDate()) {
			throw new InvalidRequestError(`time range is invalid`);
		}

		let matchExistingJob = false;
		// create payload to create new metric job
		let metricAggregationJob: MetricAggregationJobWithContext = {
			...newMetricAggregationJob,
			id: ulid().toLowerCase(),
			groupContextId: sc.groupId,
			securityContext: sc,
			status: 'pending',
			metricQueue: await this.getMetricQueue(sc, pipelineId),
			// set the group queue if provided, if not default the current group context id
			groupsQueue: groupsQueue ?? [{ order: 1, group: sc.groupId }]
		};

		// we only check against pending jobs
		const existingJobs = (await this.list(sc, { name: pipelineId }))?.[0].filter(o => o.status === 'pending');
		// check if this can be combined with existing job
		if (existingJobs) {
			for (const existingJob of existingJobs) {
				const newGroupLeaves = groupsQueue ? groupsQueue.map(o => o.group) : [sc.groupId];
				const existingGroupsLeaves = existingJob.groupsQueue.map(o => o.group);
				if (this.groupUtils.checkIfGroupsLeavesOverlap(newGroupLeaves, existingGroupsLeaves)) {
					metricAggregationJob = this.assembleUpdateJobPayload(existingJob, { groups: newGroupLeaves, timeRange });
					matchExistingJob = true;
					break;
				}
			}
		}
		await this.repository.create(metricAggregationJob);
		this.log.debug(`MetricAggregationJobService > create > exit > task: ${JSON.stringify(newMetricAggregationJob)}`);
		return [metricAggregationJob, matchExistingJob];
	}

	public async start(sc: SecurityContext, metricAggregationJobId: string, dateRange?: { from: string, to: string }): Promise<MetricAggregationJob> {
		this.log.debug(`MetricAggregationJobService > start > metricAggregationJobId: ${metricAggregationJobId}, dateRange: ${JSON.stringify(dateRange)}`);

		const isAuthorized = this.authChecker.isAuthorized([sc.groupId], sc.groupRoles, atLeastContributor, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not at least a \`contributor\` of the group in context \`${JSON.stringify(sc.groupId)}`);
		}

		await this.platformResourceUtility.checkPlatformResourceState<AuroraStatus>(AuroraResourceName, 'available');

		const metricAggregationJob = await this.get(sc, metricAggregationJobId);

		if (!metricAggregationJob || ['failed', 'succeeded', 'running'].includes(metricAggregationJob.status)) {
			throw new InvalidRequestError(`Metric aggregation job cannot be found or status is not in pending state`);
		}

		const dateFrom = dayjs(dateRange?.from ?? metricAggregationJob.timeRange.from).toDate();
		const dateTo = dayjs(dateRange?.to ?? metricAggregationJob.timeRange.to).toDate();

		if (dateFrom > dateTo) {
			throw new InvalidRequestError(`time range is invalid`);
		}

		const { status, ...metricAggregationTaskEvent } = metricAggregationJob;

		const event: MetricAggregationTaskEvent = {
			...metricAggregationTaskEvent,
			security: metricAggregationTaskEvent.securityContext,
			metricAggregationJobId,
			timeRange: {
				to: dateTo,
				from: dateFrom
			}
		};

		this.log.debug(`MetricAggregationJobService > start > triggering the metric aggregation state machine`);
		await this.sfnClient.send(new StartExecutionCommand({ stateMachineArn: this.jobStateMachineArn, input: JSON.stringify(event) }));

		this.log.debug(`MetricAggregationJobService > start > set the aggregation job to completed`);
		metricAggregationJob.status = 'running';
		await this.repository.create(metricAggregationJob);

		this.log.debug(`MetricAggregationJobService > start > exit > metricAggregationJob: ${JSON.stringify(metricAggregationJob)}`);
		return metricAggregationJob;
	}

}
