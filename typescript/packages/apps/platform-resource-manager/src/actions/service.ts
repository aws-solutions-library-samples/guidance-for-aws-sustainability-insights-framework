import type { FastifyBaseLogger } from 'fastify';
import type { ActionResource, ActionServiceBase } from './schema.js';
import { InvalidRequestError } from '@sif/resource-api-base';
import { AuroraService } from './aurora.service.js';

export class ActionService {
	private readonly serviceMap: { [name: string]: ActionServiceBase };

	constructor(private logger: FastifyBaseLogger, auroraService: AuroraService) {
		this.serviceMap = {
			[AuroraService.resourceName]: auroraService
		};
	}

	public async create(actionResource: ActionResource): Promise<void> {
		this.logger.trace(`ActionsService > create > actionResource: ${JSON.stringify(actionResource)}`);

		if (!this.serviceMap?.[actionResource.id]?.[actionResource.action] === undefined) {
			throw new InvalidRequestError(`Resource ${actionResource.id} or action ${actionResource.action} does not exists`);
		}
		this.serviceMap[actionResource.id].validateParameters(actionResource);
		await this.serviceMap[actionResource.id][actionResource.action]();
		this.logger.trace(`ActionsService > exit >`);
	}

}
