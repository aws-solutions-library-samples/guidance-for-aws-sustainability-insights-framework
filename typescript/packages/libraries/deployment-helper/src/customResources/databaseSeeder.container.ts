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
import type { Logger } from 'pino';
import { ECSClient, LaunchType, RunTaskCommand } from '@aws-sdk/client-ecs';

export class DatabaseSeederContainer {

	constructor(
		private logger: Logger, private ecsClient: ECSClient,
		private ecsClusterArn: string, private ecsTaskRoleArn: string, private ecsTaskDefinitionArn: string,
		private containerSubnets: string[], private containerSecurityGroup: string,
		private rdsProxyEndpoint: string, private platformUserName: string, private caCertificate: string) {
	}

	public async runTask(callbackUrl: string, tenantUsername: string, tenantDatabaseName: string, assetBucket: string, assetPath: string) {
		this.logger.info(`databaseSeeder.container > runTask > in : tenantUsername: ${tenantUsername}`);

		await this.ecsClient.send(new RunTaskCommand({
			taskDefinition: this.ecsTaskDefinitionArn,
			launchType: LaunchType.FARGATE,
			cluster: this.ecsClusterArn,
			networkConfiguration: {
				awsvpcConfiguration: {
					subnets: this.containerSubnets,
					securityGroups: [this.containerSecurityGroup]
				}
			},
			overrides: {
				taskRoleArn: this.ecsTaskRoleArn,
				containerOverrides: [
					{
						name: 'SchemaMigratorContainer',
						environment: [
							{
								name: 'RDS_PROXY_ENDPOINT',
								value: this.rdsProxyEndpoint
							},
							{
								name: 'CA_CERTIFICATE',
								value: this.caCertificate
							},
							{
								name: 'PLATFORM_USERNAME',
								value: this.platformUserName
							},
							{
								name: 'CALLBACK_URL',
								value: callbackUrl
							},
							{
								name: 'TENANT_USERNAME',
								value: tenantUsername
							},
							{
								name: 'TENANT_DATABASE',
								value: tenantDatabaseName
							},
							{
								name: 'ASSET_BUCKET',
								value: assetBucket
							}, {
								name: 'ASSET_KEY',
								value: assetPath
							}
						]
					}
				]
			}
		}));
		this.logger.info(`databaseSeeder.container > runTask > exit: `);
	}

}
