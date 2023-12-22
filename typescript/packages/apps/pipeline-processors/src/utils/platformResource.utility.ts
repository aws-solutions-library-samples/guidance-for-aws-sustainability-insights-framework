import type { SSMClient } from '@aws-sdk/client-ssm';
import { GetParameterCommand } from '@aws-sdk/client-ssm';
import { ServiceUnavailableError } from '@sif/resource-api-base';
import type { FastifyBaseLogger } from 'fastify';


export const AuroraResourceName = 'aurora-cluster';

export type AuroraStatus = 'starting' | 'starting_failed' | 'available' | 'stopping' | 'stopping_failed' | 'stopped';

export class PlatformResourceUtility {
	constructor(private logger: FastifyBaseLogger, private ssmClient: SSMClient, private resourceStatusParameterPrefix: string) {
	}

	public async checkPlatformResourceState<T extends string>(id: string, status: T) {
		this.logger.trace(`PlatformResourceUtility > checkPlatformResourceState > id: ${id}, status: ${status}`);

		const resourceStatusParameter = await this.ssmClient.send(new GetParameterCommand({ Name: `${this.resourceStatusParameterPrefix}/${id}/status` }));

		if (resourceStatusParameter?.Parameter?.Value !== status) {
			throw new ServiceUnavailableError(`Platform resource ${id} status is ${status}. Expected status is ${resourceStatusParameter?.Parameter?.Value}`);
		}
		this.logger.trace(`PlatformResourceUtility > checkPlatformResourceState > exit`);
	}
}
