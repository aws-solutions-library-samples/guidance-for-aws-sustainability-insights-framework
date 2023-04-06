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

import type { EventBridgeHandler, Context, Callback, S3ObjectCreatedNotificationEventDetail } from 'aws-lambda';
import type { AwilixContainer } from 'awilix';
import type { FastifyInstance } from 'fastify';
import { buildLightApp } from './app.light';
import type { EventProcessor } from './events/event.processor.js';
import type { ConnectorIntegrationResponseEvent } from '@sif/clients';
import { PIPELINE_PROCESSOR_EVENT_SOURCE, PIPELINE_PROCESSOR_CONNECTOR_RESPONSE_EVENT } from '@sif/events';

const app: FastifyInstance = await buildLightApp();
const di: AwilixContainer = app.diContainer;

const dataBucket = process.env['BUCKET_NAME'];
const dataBucketPrefix = process.env['BUCKET_PREFIX'];

const eventProcessor = di.resolve<EventProcessor>('eventProcessor');

// these are stubbed out event names, rather than statically referencing them. Ideal place for these could be in the sif/events library.
const S3ObjectCreatedEventName = 'Object Created';

export const handler: EventBridgeHandler<string, EventDetails, void> = async (event, _context: Context, _callback: Callback) => {
	app.log.info(`EventBridgeLambda > handler > event: ${JSON.stringify(event)}`);

	// filter event for raw input uploaded to S3
	if (event.source === 'aws.s3' && event['detail-type'] === S3ObjectCreatedEventName) {
		const detail = event.detail as S3ObjectCreatedNotificationEventDetail;
		// we need to further filter down the event for a specific bucket, key, in this case, we are capturing raw input files being dropped
		// in the sif bucket with key includes "pipelines" and "raw" keywords.
		if (detail?.bucket?.name === dataBucket && detail?.object?.key.includes(dataBucketPrefix) && detail?.object?.key.includes('/raw')) {
			// process the s3 bucket event as a pluginIntegration request, once we capture the bucket event and evaluate that it's the one
			// we are interested in, we then need to integrate the pipeline plugin. The actual execution of the step function happens when the plugin
			// resolves the integration request by responding back (the event "ConnectorIntegrationResponseEvent" below is what we expect back form to continue the pipeline execution).
			const request = event.detail as S3ObjectCreatedNotificationEventDetail;
			await eventProcessor.processConnectorIntegrationRequestEvent(request);
			// not interested in any other type of bucket events.
		} else {
			app.log.error('EventBridgeLambda > handler > Unimplemented S3 Bucket event: ${JSON.Stringify(event)}');
		}
		// filter out plugin response integration event
	} else if (event.source !== PIPELINE_PROCESSOR_EVENT_SOURCE && event['detail-type'] === PIPELINE_PROCESSOR_CONNECTOR_RESPONSE_EVENT) {
		// process plugin integration response event
		await eventProcessor.processConnectorIntegrationResponseEvent(event.detail as ConnectorIntegrationResponseEvent);
		// any other events are not handled
	} else {
		app.log.error('EventBridgeLambda > handler > Unimplemented event: ${JSON.Stringify(event)}');
	}

};

type EventDetails = S3ObjectCreatedNotificationEventDetail | ConnectorIntegrationResponseEvent


