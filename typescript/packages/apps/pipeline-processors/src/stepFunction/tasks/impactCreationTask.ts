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


import type { BaseLogger } from 'pino';
import { convertCSVToArray } from 'convert-csv-to-array';
import { sdkStreamMixin } from '@aws-sdk/util-stream-node';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { ImpactCreationTaskEvent } from './model.js';
import { getPipelineOutputKey } from '../../utils/helper.utils.js';
import type { ImpactClient, NewActivity, LambdaRequestContext } from '@sif/clients';
import type { GetLambdaRequestContext } from '../../plugins/module.awilix.js';
import { validateNotEmpty } from '@sif/validators';

export class ImpactCreationTask {
	constructor(private log: BaseLogger,
				private s3: S3Client,
				private bucket: string,
				private impactClient: ImpactClient,
				private getLambdaRequestContext: GetLambdaRequestContext
	) {
	}

	private assembleActivityResource(csvObject: { [key: string]: any }, pipelineId: string, executionId: string): NewActivity {
		this.log.debug(`ImpactCreationTask > assembleActivity > csvObject: ${JSON.stringify(csvObject)}, pipelineId: ${pipelineId}, executionId: ${executionId}`);

		const { impactName, activityName, activityDescription, componentKey, componentType, componentValue, componentDescription, componentLabel } = csvObject;

		const activityAttribute = {};
		const activityTag = {};
		const impactAttribute = {};

		for (const prop in csvObject) {
			if (prop.startsWith('activity_attribute_')) {
				const key = prop.replace('activity_attribute_', '');
				activityAttribute[key] = csvObject[prop];
			}
			if (prop.startsWith('activity_tag_')) {
				const key = prop.replace('activity_tag_', '');
				activityTag[key] = csvObject[prop];
			}
			if (prop.startsWith('impact_attribute_')) {
				const key = prop.replace('impact_attribute_', '');
				impactAttribute[key] = csvObject[prop];
			}
		}

		const newActivity = JSON.parse(JSON.stringify({
			name: activityName,
			description: activityDescription,
			attributes: activityAttribute,
			tags: {
				pipelineId,
				executionId,
				...activityTag
			},
			impacts: {
				[impactName]: {
					name: impactName,
					attributes: impactAttribute,
					components: {
						[componentKey]: {
							key: componentKey,
							value: componentValue,
							type: componentType,
							description: componentDescription,
							label: componentLabel
						}
					}
				}
			}
		}));
		this.log.debug(`ImpactCreationTask > process > exit> newActivity: ${JSON.stringify(newActivity)}`);
		return newActivity;
	}

	private async createActivities(pipelineId: string, executionId: string, lambdaRequestContext: LambdaRequestContext): Promise<string[]> {
		this.log.debug(`ImpactCreationTask > createActivities > pipelineId: ${pipelineId}, executionId: ${executionId}`);

		const readResponse = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: getPipelineOutputKey('pipelines', pipelineId, executionId) }));
		const csvObjects: Record<string, any>[] = convertCSVToArray(await sdkStreamMixin(readResponse.Body).transformToString(), { header: false, separator: ',' }) as unknown as Record<string, any>[];

		const errorList = [];
		for (const csvObject of csvObjects) {
			for (let key in csvObject) {
				// remove start and end double quote if any for property with string value
				// this is appended by calculator to ensure that value that contains comma is
				// treated as singled unit
				if (typeof csvObject[key] === 'string') {
					csvObject[key] = csvObject[key].toString().replace(/(^"|"$)/g, '');
				}
			}
			const newActivity = this.assembleActivityResource(csvObject, pipelineId, executionId);
			try {
				this.log.info(`ImpactCreationTask > createActivities >  newActivityResource: ${JSON.stringify(newActivity)}`);
				const existingActivity = await this.impactClient.getByAlias(newActivity.name, lambdaRequestContext);
				if (!existingActivity) {
					await this.impactClient.create(newActivity, lambdaRequestContext);
				} else {
					await this.impactClient.update(existingActivity.id, newActivity, lambdaRequestContext);
				}
			} catch (Exception) {
				this.log.error(`ImpactCreationTask > createActivities > error : ${Exception}`);
				errorList.push(`activity ${csvObject['activityName']}, error: ${Exception.message}`);
			}
		}
		this.log.debug(`ImpactCreationTask > createActivities > errorList: ${errorList}`);
		return errorList;
	}

	public async process(event: ImpactCreationTaskEvent): Promise<[string, string]> {
		this.log.debug(`ImpactCreationTask > process > event: ${JSON.stringify(event)}`);
		validateNotEmpty(event, 'event');
		validateNotEmpty(event.executionId, 'executionId');
		validateNotEmpty(event.pipelineId, 'pipelineId');

		const { pipelineId, executionId, errorLocationList } = event;

		// create activities based on the calculation result
		const lambdaRequestContext = this.getLambdaRequestContext(event.security);
		const createActivitiesErrors = await this.createActivities(pipelineId, executionId, lambdaRequestContext);
		const hasError = createActivitiesErrors.length > 0 || errorLocationList.length > 0;

		const taskStatus = hasError ? 'failed' : 'success';
		const taskStatusMessage = !hasError ? undefined : errorLocationList.length > 0 ? 'error when performing calculation, review the pipeline execution error log for further info' : createActivitiesErrors.join(',');

		// update pipeline status
		this.log.debug(`ImpactCreationTask > process > exit> ${JSON.stringify([taskStatus, taskStatusMessage])}`);
		return [taskStatus, taskStatusMessage];
	}
}
