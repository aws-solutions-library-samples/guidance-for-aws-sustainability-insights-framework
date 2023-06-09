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

import type { Context, SQSEvent } from 'aws-lambda';

import pino from 'pino';
import { S3Client } from '@aws-sdk/client-s3';
import { Depositor } from './depositor.js';


const logger = pino();
logger.level = process.env['LOG_LEVEL'] ?? 'info';

const region:string = process.env['AWS_REGION'];
const bucket:string = process.env['BUCKET_NAME'];
const concurrencyLimit:number = Number.parseInt(process.env['CONCURRENCY_LIMIT'] ?? '50');
logger.info(`region: ${region}, bucket: ${bucket}, concurrencyLimit: ${concurrencyLimit}`);

const s3Client = new S3Client({ region });
const depositor = new Depositor(logger, s3Client, bucket, concurrencyLimit);

export const handler = async (event: SQSEvent, _context: Context): Promise<void> => {
	logger.debug(`handler> in> `);

	if (event?.Records) {
		for (const r of event.Records) {
			if (r.eventSource !== 'aws:sqs') {
				logger.warn(`MessageService> handleEvent> ignoring non-sqs events: ${JSON.stringify(r)}`);
				continue;
			}

			const auditMessages:AuditMessages = JSON.parse(r.body);
			await depositor.deposit(auditMessages);
		}
	}
};
