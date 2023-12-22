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

import type { AwilixContainer } from 'awilix';
import type { FastifyInstance } from 'fastify';
import { buildLightApp } from './app.light.js';
import type { RDSClient } from '@aws-sdk/client-rds';
import { StopDBClusterCommand } from '@aws-sdk/client-rds';
import type { ResourceService } from './resources/service.js';
import { AuroraService } from './actions/aurora.service.js';
import type { AuroraStatus } from './resources/schema.js';

const app: FastifyInstance = await buildLightApp(true);
const di: AwilixContainer = app.diContainer;

const { CLUSTER_IDENTIFIER: clusterIdentifier } = process.env;

export const handler = async (_event, _context, _callback) => {
	app.log.info(`StopAuroraCluster > handler > event: ${JSON.stringify(_event)}`);
	const rdsClient = di.resolve<RDSClient>('rdsClient');
	const resourceService = di.resolve<ResourceService<AuroraStatus>>('resourceService');
	try {
		await rdsClient.send(new StopDBClusterCommand({ DBClusterIdentifier: clusterIdentifier }));
	} catch (exception) {
		app.log.info(`StopAuroraCluster > handler > error : ${JSON.stringify(exception)}`);
		await resourceService.update(AuroraService.resourceName, 'stopping_failed');
	}
	app.log.info(`StopAuroraCluster > handler > exit>`);
};

