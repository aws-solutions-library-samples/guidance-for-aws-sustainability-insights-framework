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

import type { S3NotificationEvent, S3NotificationEventBridgeHandler } from 'aws-lambda';
import type { AwilixContainer } from 'awilix';
import { container } from './plugins/module.awilix.js';
import type { Logger } from 'pino';
import type { CleanRoomsService } from './clean-rooms/cleanRooms.service';

const di: AwilixContainer = container;

const cleanRoomsService = di.resolve<CleanRoomsService>('cleanRoomsService');
const logger = di.resolve<Logger>('logger');
const cleanRoomsBucketName = process.env['BUCKET_NAME'];
const cleanRoomsBucketPrefix = process.env['BUCKET_PREFIX'];

export const handler: S3NotificationEventBridgeHandler = async (event: S3NotificationEvent, _context, _callback) => {
	logger.info(`connectors > cleanRooms > eventsLambda > handler > event: ${JSON.stringify(event)}`);

	const { object, bucket } = event.detail;
	const [bucketPrefix, queryId, _] = object.key.split('/');

	if (bucket.name === cleanRoomsBucketName && bucketPrefix === cleanRoomsBucketPrefix) {
		await cleanRoomsService.processQueryExecutionResult(queryId, bucket.name, object.key);
	} else {
		logger.warn(`connectors > cleanRooms > eventsLambda > handler > invalid event : ${JSON.stringify(event)}`);
	}

	logger.info(`connectors > cleanRooms > eventsLambda > handler > exit:`);
};
