import type { FastifyBaseLogger } from 'fastify';
import type { SSMClient } from '@aws-sdk/client-ssm/dist-types/SSMClient';
import type { Resource } from './schema.js';
import { GetParameterCommand, PutParameterCommand } from '@aws-sdk/client-ssm';
import { NotFoundError } from '@sif/resource-api-base';
import { AuroraService } from '../actions/aurora.service.js';

export class ResourceService<T extends string> {
	constructor(private log: FastifyBaseLogger, private ssmClient: SSMClient, private resourceStatusParameterPrefix: string) {
	}

	public async list(): Promise<Resource[]> {
		this.log.trace(`ResourceService > list`);
		const resourceList = [await this.get(AuroraService.resourceName)];
		this.log.trace(`ResourceService > list > exit> ${resourceList}`);
		return resourceList;
	}

	public async update(id: string, status: T): Promise<void> {
		this.log.trace(`ResourceService > update > ${id}, status: ${status}`);

		await this.ssmClient.send(new PutParameterCommand({
			Name: `${this.resourceStatusParameterPrefix}/${id}/status`,
			Value: status as string,
			Overwrite: true
		}));

		this.log.trace(`ResourceService > update > exit`);
	}

	public async get(id: string): Promise<Resource> {
		this.log.trace(`ResourceService > get > ${id}`);
		let resource: Resource;
		try {
			const result = await this.ssmClient.send(new GetParameterCommand({ Name: `${this.resourceStatusParameterPrefix}/${id}/status` }));
			resource = {
				id,
				status: result.Parameter.Value
			};

		} catch (err) {
			throw new NotFoundError(`resource ${id} does not exist`);
		}

		this.log.trace(`ResourceService > get > exit> ${resource}`);
		return resource;
	}
}
