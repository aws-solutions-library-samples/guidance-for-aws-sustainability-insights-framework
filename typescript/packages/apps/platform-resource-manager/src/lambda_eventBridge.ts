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
import type { ResourceService } from './resources/service.js';
import { AuroraService } from './actions/aurora.service.js';
import type { AuroraStatus } from './resources/schema.js';

const app: FastifyInstance = await buildLightApp(true);
const di: AwilixContainer = app.diContainer;

// Sample Events
// {
// 	"version": "0",
// 	"id": "844e2571-85d4-695f-b930-0153b71dcb42",
// 	"detail-type": "RDS DB Cluster Event",
// 	"source": "aws.rds",
// 	"account": "123456789012",
// 	"time": "2018-10-06T12:26:13Z",
// 	"region": "us-east-1",
// 	"resources": ["arn:aws:rds:us-east-1:123456789012:cluster:mysql-cluster-2018-10-06-12-24"],
// 	"detail": {
// 		"EventCategories": ["notification"],
// 			"SourceType": "CLUSTER",
// 			"SourceArn": "arn:aws:rds:us-east-1:123456789012:cluster:mysql-cluster-2018-10-06-12-24",
// 			"Date": "2018-10-06T12:26:13.882Z",
// 			"SourceIdentifier": "rds:mysql-instance-2018-10-06-12-24",
// 			"Message": "DB cluster created",
// 			"EventID": "RDS-EVENT-0170"
// 	}
// }
export interface RDSNotificationEvent {
	version: string;
	id: string;
	'detail-type': string;
	source: string;
	account: string;
	time: string;
	region: string;
	resources: string[];
	detail: {
		EventCategories: string[];
		SourceType: string;
		SourceArn: string;
		Date: string;
		SourceIdentifier: string;
		Message: string;
		EventID: string;
	};
}

export const handler = async (event: RDSNotificationEvent, _context, _callback) => {
	app.log.info(`EventBridge > handler > event: ${JSON.stringify(event)}`);

	const resourceService = di.resolve<ResourceService<AuroraStatus>>('resourceService');

	if (event?.detail?.EventID === 'RDS-EVENT-0153' || event?.detail?.EventID === 'RDS-EVENT-0151') {
		await resourceService.update(AuroraService.resourceName, 'available');
	} else if (event?.detail?.EventID === 'RDS-EVENT-0150') {
		await resourceService.update(AuroraService.resourceName, 'stopped');
	} else if (event?.detail?.EventID === 'RDS-EVENT-0152') {
		await resourceService.update(AuroraService.resourceName, 'stopping_failed');
	} else {
		app.log.info(`EventBridge > handler > unrecognized EventID : ${event?.detail?.EventID}`);
	}

	app.log.info(`EventBridge > handler > exit>`);
};

