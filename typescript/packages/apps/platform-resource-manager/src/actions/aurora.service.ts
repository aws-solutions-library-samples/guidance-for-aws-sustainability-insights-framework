import type { FastifyBaseLogger } from 'fastify';
import { DescribeDBClustersCommand, RDSClient, StartDBClusterCommand } from '@aws-sdk/client-rds';
import type { ActionResource, ActionServiceBase } from './schema.js';
import { InvalidRequestError, NotFoundError } from '@sif/resource-api-base';
import { validateNotEmpty } from '@sif/validators';
import type { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import { PutEventsCommand } from '@aws-sdk/client-eventbridge';
import type { ResourceService } from '../resources/service.js';
import { EVENT_SOURCE, STOP_RESOURCE_EVENT_DETAIL_TYPE } from './schema.js';
import type { AuroraStatus } from '../resources/schema';


export class AuroraService implements ActionServiceBase {

	public static resourceName = 'aurora-cluster';

	constructor(private logger: FastifyBaseLogger,
				private rdsClient: RDSClient, private clusterIdentifier: string,
				private eventBridgeClient: EventBridgeClient, private eventBusName: string,
				private resourceService: ResourceService<AuroraStatus>
	) {
	}

	private async validateClusterState(expectedStatus: AuroraStatus[]): Promise<void> {
		this.logger.trace(`AuroraService > validateClusterState > in > expectedStatus: ${expectedStatus}`);

		const cluster = (await this.rdsClient.send(new DescribeDBClustersCommand({ DBClusterIdentifier: this.clusterIdentifier })))?.DBClusters?.[0];
		const resource = await this.resourceService.get(AuroraService.resourceName);

		this.logger.trace(`AuroraService > validateClusterState > cluster: ${JSON.stringify(cluster)}`);

		if (!cluster) {
			throw new NotFoundError(`Cluster ${this.clusterIdentifier} does not exist.`);
		}

		if (!expectedStatus.includes(cluster?.Status as AuroraStatus) || !expectedStatus.includes(resource.status as AuroraStatus)) {
			throw new InvalidRequestError(`Aurora cluster ${this.clusterIdentifier} is not in ${JSON.stringify(expectedStatus.join(' or '))} states, aurora cluster state is ${cluster.Status}, resource state is ${resource.status}`);
		}

		this.logger.trace(`AuroraService > validateClusterState > exit`);
	}

	public async start(): Promise<void> {
		this.logger.trace(`AuroraService > start> in>`);
		await this.validateClusterState(['stopped', 'starting_failed']);
		try {
			await Promise.all([
				this.resourceService.update(AuroraService.resourceName, 'starting'),
				this.rdsClient.send(new StartDBClusterCommand({ DBClusterIdentifier: this.clusterIdentifier }))
			]);
		} catch (exception) {
			this.logger.error(`AuroraService > start> exit> error : ${JSON.stringify(exception)}`);
			await this.resourceService.update(AuroraService.resourceName, 'starting_failed');
		}
		this.logger.trace(`AuroraService > start> exit>`);
	}

	public async stop(): Promise<void> {
		this.logger.trace(`AuroraService > stop> in>`);
		await this.validateClusterState(['available', 'stopping_failed']);
		try {
			await Promise.all([
				this.resourceService.update(AuroraService.resourceName, 'stopping'),
				this.eventBridgeClient.send(new PutEventsCommand({
					Entries: [{
						EventBusName: this.eventBusName,
						Source: EVENT_SOURCE,
						DetailType: STOP_RESOURCE_EVENT_DETAIL_TYPE,
						Detail: JSON.stringify({
							id: AuroraService.resourceName,
							action: 'stop'
						})
					}]
				}))
			]);
		} catch (exception) {
			this.logger.error(`AuroraService > stop> exit> error : ${JSON.stringify(exception)}`);
			await this.resourceService.update(AuroraService.resourceName, 'stopping_failed');
		}
		this.logger.trace(`AuroraService > stop>  exit>`);
	}

	public validateParameters(actionResource: ActionResource): void {

		validateNotEmpty(actionResource.action, 'actionResource.action');
		validateNotEmpty(actionResource.id, 'actionResource.id');

		if (!['start', 'stop'].includes(actionResource.action)) {
			throw new InvalidRequestError(`Action can only be start or stop for aurora-cluster.`);
		}
	}

}
