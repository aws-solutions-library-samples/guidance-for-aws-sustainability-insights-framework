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

import type { SecurityContext } from '@sif/authz';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getPipelineImpactCreationOutputKey, getPipelineOutputKey } from '../../utils/helper.utils';
import { sdkStreamMixin } from '@aws-sdk/util-stream-node';
import type { BaseLogger } from 'pino';
import type { ImpactClient, NewActivity, NewBulkActivities, PipelineClient } from '@sif/clients';
import type { S3Location } from './model.js';
import type { PipelineExecution } from '../../api/executions/schemas';
import type { PipelineProcessorsRepository } from '../../api/executions/repository';
import type { EventPublisher } from '@sif/events';
import type { GetLambdaRequestContext } from '../../plugins/module.awilix';
import type { ConnectorUtility } from '../../utils/connectorUtility';
import { parse } from 'csv-parse/sync';

export class ImpactCreationTask {
	constructor(private readonly log: BaseLogger,
				private readonly s3: S3Client,
				private readonly bucket: string,
				private readonly impactClient: ImpactClient,
				private readonly pipelineProcessorsRepository: PipelineProcessorsRepository,
				private readonly eventPublisher: EventPublisher,
				private readonly pipelineClient: PipelineClient,
				private readonly getLambdaRequestContext: GetLambdaRequestContext,
				private readonly connectorUtility: ConnectorUtility,
	) {
	}

	public async process(event: { security: SecurityContext, pipelineId: string, executionId: string, pipelineType: string, errorLocationList: S3Location[] }): Promise<{
		moreActivitiesToProcess: boolean,
		taskStatus: string,
		taskStatusMessage: string
	}> {
		this.log.debug(`ImpactCreationTask > process > event: ${JSON.stringify(event)}`);
		const { pipelineId, executionId, pipelineType, security } = event;
		let taskStatus = event.errorLocationList.length < 1 ? 'success' : 'failed';
		let taskStatusMessage = taskStatus == 'failed' ? 'error when performing calculation, review the pipeline execution error log for further info' : undefined;
		let moreActivitiesToProcess = false;

		if (taskStatus === 'success') {
			if (pipelineType === 'impacts') {
				try {
					moreActivitiesToProcess = await this.createBulkActivities(pipelineId, executionId, security);
				} catch (error) {
					this.log.debug(`ImpactCreationTask > process > error: ${error}`);
					moreActivitiesToProcess = false;
					taskStatus = 'failed';
					taskStatusMessage = JSON.stringify(error);
				}
			}
		}

		if (!moreActivitiesToProcess) {
			await this.update(pipelineId, executionId, taskStatus, taskStatusMessage, security);
		}

		this.log.debug(`ImpactCreationTask > process > exit >`);
		return { moreActivitiesToProcess, taskStatusMessage, taskStatus };
	}

	public __assembleActivityResource_exposedForTesting(csvObject: { [key: string]: any }): NewActivity {
		return this.assembleActivityResource(csvObject);
	}

	private async update(pipelineId: string, executionId: string, taskStatus: string, taskStatusMessage: string, security: SecurityContext) {

		this.log.debug(`ImpactCreationTask > update > pipelineId: ${pipelineId}, executionId: ${executionId}, taskStatus: ${taskStatus}, taskStatusMessage: ${taskStatusMessage}`);

		const execution = await this.pipelineProcessorsRepository.get(executionId);
		const pipeline = await this.pipelineClient.get(pipelineId, undefined, this.getLambdaRequestContext(security));

		const outputConnectorEnabled = pipeline.connectorConfig?.output !== undefined;
		if (outputConnectorEnabled && taskStatus === 'success') {
			taskStatus = 'in_progress';
			await this.connectorUtility.publishConnectorOutputIntegrationEvent(security, pipeline, execution, [getPipelineOutputKey('pipelines', pipelineId, executionId)], pipeline.type);
		}

		const updatedExecution: PipelineExecution = {
			...execution,
			status: taskStatus,
			statusMessage: taskStatusMessage,
		};

		await Promise.all([
			this.pipelineProcessorsRepository.create(updatedExecution),
			this.eventPublisher.publishTenantEvent<PipelineExecution>({
				resourceType: 'pipelineExecution',
				eventType: 'updated',
				id: execution.id,
				new: updatedExecution,
				old: execution
			})
		]);

		this.log.debug(`ImpactCreationTask > update > exit >`);
	}

	private async fromCsvFileToObject(pipelineId: string, executionId: string): Promise<Record<string, any>[]> {
		this.log.debug(`ImpactCreationTask > fromCsvFileToObject > pipelineId: ${pipelineId}, executionId: ${executionId}`);
		const readResponse = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: getPipelineImpactCreationOutputKey('pipelines', pipelineId, executionId) }));
		let csvObjects: Record<string, any>[];
		try {
			csvObjects = parse(await sdkStreamMixin(readResponse.Body).transformToString(), {
				columns: true,
				skip_empty_lines: true
			});
		} catch (error) {
			this.log.error(`ImpactCreationTask > fromCsvFileToObject > error: ${error}`);
			throw error;
		}

		this.log.debug(`ImpactCreationTask > fromCsvFileToObject > csvObjects: ${JSON.stringify(csvObjects)}`);
		return csvObjects;
	}

	private async fromObjectToCsvFile(pipelineId: string, executionId: string, activities: Record<string, any>[]) {
		this.log.debug(`ImpactCreationTask > fromObjectToCsvFile > pipelineId: ${pipelineId}, executionId: ${executionId}, activities: ${JSON.stringify(activities)}`);

		// Convert the object to csv file string
		const activitiesFileContent = [
			Object.keys(activities[0]).map(a => `"${a}"`).join(','),
			...activities.map(a => Object.values(a).map(a => `"${a}"`).join(','))].join('\n');

		// Update the task output files for the next iteration
		await this.s3.send(new PutObjectCommand(
			{
				Bucket: this.bucket,
				Key: getPipelineImpactCreationOutputKey('pipelines', pipelineId, executionId), Body: activitiesFileContent
			}));

		this.log.debug(`ImpactCreationTask > fromObjectToCsvFile > exit>`);
	}

	private async createBulkActivities(pipelineId: string, executionId: string, security: SecurityContext): Promise<boolean> {
		this.log.debug(`ImpactCreationTask > createBulkActivities > pipelineId: ${pipelineId}, executionId: ${executionId}`);

		const csvObjects = await this.fromCsvFileToObject(pipelineId, executionId);
		// assemble the 10 activities that we will create
		const activitiesToProcess = csvObjects.slice(0, 10);
		const newBulkActivities: NewBulkActivities = { activities: [], type: 'create' };
		for (const activityToProcess of activitiesToProcess) {
			newBulkActivities.activities.push(this.assembleActivityResource(activityToProcess));
		}

		// create the activities using impact API
		await this.impactClient.createBulk(newBulkActivities, this.getLambdaRequestContext(security));

		// Removed the created activity and update the task file
		const activitiesLeft = csvObjects.slice(10);
		let keepGoing = false;
		if (activitiesLeft.length > 0) {
			await this.fromObjectToCsvFile(pipelineId, executionId, activitiesLeft);
			keepGoing = true;
		}
		this.log.debug(`ImpactCreationTask > createBulkActivities > keepGoing: ${keepGoing}`);
		return keepGoing;
	}

	private assembleActivityResource(csvObject: Record<string, any>): NewActivity {
		this.log.debug(`ImpactCreationTask > assembleActivity > csvObject: ${JSON.stringify(csvObject)}`);

		const activity: NewActivity = {
			name: undefined,
			description: undefined,
			attributes: {},
			tags: {},
			impacts: {}
		};

		const initializeImpact = (impactKey: string) => {
			if (!activity.impacts[impactKey]) {
				activity.impacts[impactKey] = {
					name: undefined,
					attributes: {},
					components: {},
				};
			}
		};

		const initializeComponent = (impactKey: string, componentKey: string) => {
			if (!activity.impacts[impactKey].components[componentKey]) {
				activity.impacts[impactKey].components[componentKey] = {
					key: undefined,
					value: undefined,
					type: undefined,
				};
			}
		};

		for (const prop in csvObject) {
			if (prop === 'activity:name') {
				activity.name = csvObject[prop];
			} else if (prop === 'activity:description') {
				activity.description = csvObject[prop];
			} else if (prop.startsWith('activity:attribute:')) {
				const key = prop.replace('activity:attribute:', '');
				activity.attributes[key] = csvObject[prop];
			} else if (prop.startsWith('activity:tag:')) {
				const key = prop.replace('activity:tag:', '');
				activity.tags[key] = csvObject[prop];
			} else if (prop.startsWith('impact:')) {
				const keys = prop.split(':');
				const impactKey = keys[1];
				const impactProperty = keys[2];

				if (impactProperty === 'name') {
					initializeImpact(impactKey);
					activity.impacts[impactKey].name = csvObject[prop];
				} else if (impactProperty === 'attribute') {
					initializeImpact(impactKey);
					const impactAttributeKey = keys[3];
					activity.impacts[impactKey].attributes[impactAttributeKey] = csvObject[prop];
				} else if (impactProperty === 'component') {
					initializeImpact(impactKey);
					const componentKey = keys[3];
					const componentProperty = keys[4];
					initializeComponent(impactKey, componentKey);
					const value = (componentProperty === 'value') ? Number.parseFloat(csvObject[prop]) : csvObject[prop];
					activity.impacts[impactKey].components[componentKey][componentProperty] = value;
				}
			}
		}

		for (const impact in activity.impacts) {
			const componentKeys = Object.keys(activity.impacts[impact].components);
			for (const component of componentKeys) {
				/**
				 * Delete the component if the value is null
				 */
				if (!activity.impacts[impact].components[component].value || activity.impacts[impact].components[component].value === null) {
					delete activity.impacts[impact].components[component];
				}
			}
		}

		this.log.debug(`ImpactCreationTask > process > exit> activity: ${JSON.stringify(activity)}`);
		return activity;
	}

}
