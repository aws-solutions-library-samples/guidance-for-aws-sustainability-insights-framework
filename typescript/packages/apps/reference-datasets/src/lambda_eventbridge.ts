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

import type { S3NotificationEventBridgeHandler } from 'aws-lambda';
import type { AwilixContainer } from 'awilix';
import type { FastifyInstance } from 'fastify';
import { SecurityScope } from '@sif/authz';

import { buildLightApp } from './app.light';
import type { ReferenceDatasetService } from './referenceDatasets/service';
import { fileUploadName } from './referenceDatasets/service';
import type { ReferenceDatasetUpdateMetadata } from './referenceDatasets/schemas';

const app: FastifyInstance = await buildLightApp(true);
const di: AwilixContainer = app.diContainer;

const { BUCKET_NAME } = process.env;

export const handler: S3NotificationEventBridgeHandler = async (event, _context, _callback) => {
	app.log.info(`bucketEventsLambda > handler > event: ${JSON.stringify(event)}`);

	const service = di.resolve<ReferenceDatasetService>('referenceDatasetService');

	if (event['detail-type'] === 'Object Created' && event?.detail?.bucket?.name === BUCKET_NAME && event?.detail?.object?.key.includes(`/${fileUploadName}`) && event?.detail?.object?.key.includes(app.config.BUCKET_PREFIX)) {
		const [id, changeId, encodedGroupId] = event.detail.object.key.replace(`${app.config.BUCKET_PREFIX}/`, '').split('/');
		let headersFromFile: string[];

		const partial: ReferenceDatasetUpdateMetadata = {
			status: 'inProgress',
			statusMessage: 'index creation in progress',
			uploadUrl: undefined,
		};

		// need to decode the group id
		const decodedGroupId = encodedGroupId?.replaceAll('|||', '/');

		const securityContext = {
			email: 'sif-referencedatasets-file-upload',
			groupRoles: { '/': SecurityScope.contributor },
			groupId: decodedGroupId,
		};

		const existing = await service.get(securityContext, id);
		const headersFromMetadata: string[] = existing.datasetHeaders;

		// is the existing RD is in pendingUpload state ? if it isn't, then ignore
		if (existing.status !== 'pendingUpload') {
			throw new Error('cannot use existing signed URL to update existing reference datasets');
		}

		try {
			headersFromFile = await service.getFileHeaders(event.detail.bucket.name, event.detail.object.key);
			service.validateFileHeaders(headersFromFile, headersFromMetadata);
			// copy the file to
			const [dataFileBucket, dataFileKey] = await service.storeDatasetFile(
				id,
				{
					key: event.detail.object.key,
					bucket: event.detail.bucket.name,
				},
				changeId
			);

			partial.s3Location = {
				key: dataFileKey,
				bucket: dataFileBucket,
			};
			partial.indexS3Location = {
				key: `referenceDatasets/${id}/${changeId}/`,
				bucket: event.detail.bucket.name,
			};

			const merged = {
				...existing,
				...partial,
			};

			await service.executeIndexerStateMachine(merged);
		} catch (e) {
			partial.status = 'failed';
			partial.statusMessage = 'mismatched file headers, verify headers in the file matches the headers specified in the reference dataset object';
		}

		// update the resource
		await service.updatePartial(securityContext, id, partial);
	}

	app.log.info(`bucketEventsLambda > handler > exit:`);
};
