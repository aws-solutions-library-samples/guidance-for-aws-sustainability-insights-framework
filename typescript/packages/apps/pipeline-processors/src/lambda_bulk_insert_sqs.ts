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

import type { Context, SQSBatchResponse, SQSEvent } from 'aws-lambda';
import type { AwilixContainer } from 'awilix';
import type { FastifyInstance } from 'fastify';
import { buildLightApp } from './app.light';
import type { InsertActivityBulkTask } from './stepFunction/tasks/insertActivityBulkTask';

const app: FastifyInstance = await buildLightApp();
const di: AwilixContainer = app.diContainer;

const insertActivityBulkTask: InsertActivityBulkTask = di.resolve('insertActivityBulkTask');

export const handler = async (event: SQSEvent, _context: Context): Promise<SQSBatchResponse> => {
	app.log.info(`SQS > handler > event: ${JSON.stringify(event)}`);

	const response: SQSBatchResponse = { batchItemFailures: [] };
	if (event?.Records) {
		for (const r of event.Records) {
			app.log.debug(`SQS> handler> start messageId: ${r.messageId} record: ${JSON.stringify(r)}`);

			if (r.eventSource !== 'aws:sqs') {
				app.log.warn(`SQS> handler> ignoring non-sqs events: ${JSON.stringify(r)}`);
				continue;
			}

			const payload = JSON.parse(r.body);
			await insertActivityBulkTask.process(payload);
		}
	}

	app.log.debug(`SQS> handler> exit response: ${JSON.stringify(response)}`);
	return response;

};



