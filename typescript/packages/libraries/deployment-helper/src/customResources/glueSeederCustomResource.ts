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

import type { CustomResource } from './customResource.js';
import type { Logger } from 'pino';
import { GlueClient, CreatePartitionIndexCommand, GetPartitionIndexesCommand, DeletePartitionIndexCommand } from '@aws-sdk/client-glue';
import type { CustomResourceEvent } from './customResource.model.js';
// @ts-ignore
import ow from 'ow';

export class GlueSeederCustomResource implements CustomResource {
	private readonly logger: Logger;
	private readonly glueClient: GlueClient;


	constructor(logger: Logger, glueClient: GlueClient) {
		this.glueClient = glueClient;
		this.logger = logger;
	}

	async create(customResourceEvent: CustomResourceEvent): Promise<unknown> {
		this.logger.info(`GlueSeeder.customResource > create > in > event: ${JSON.stringify(customResourceEvent)}`);

		ow(customResourceEvent.ResourceProperties, ow.object.nonEmpty);
		const { glueDatabaseName, glueTableName } = customResourceEvent.ResourceProperties;

		ow(glueTableName, ow.string.nonEmpty);
		ow(glueDatabaseName, ow.string.nonEmpty);


		try {
			// Get tables current indexes
			const indexes = await this.glueClient.send( new GetPartitionIndexesCommand({DatabaseName: glueDatabaseName , TableName: glueTableName }));
			this.logger.info(`GlueSeeder.customResource > create > indexes: ${JSON.stringify(indexes)}`);

			// Add Index if none are present
			if (!indexes?.PartitionIndexDescriptorList || indexes?.PartitionIndexDescriptorList.length === 0 ){
				await this.glueClient.send( new CreatePartitionIndexCommand({
					DatabaseName: glueDatabaseName ,
					 TableName: glueTableName,
					 PartitionIndex:{
						IndexName:'pipeline-execution',
						Keys :['pipeline_id','execution_id']
					 } }));
					 return Promise.resolve({status: 'SUCCESS'});
			}

		} catch (Exception) {
			this.logger.error(`GlueSeeder.customResource > create > error : ${Exception}`);
		}

		this.logger.info(`GlueSeeder.customResource > create > exit`);
		return Promise.resolve(undefined);
	}

	async update(customResourceEvent: CustomResourceEvent): Promise<unknown> {
		this.logger.info(`GlueSeeder.customResource > update > in > event: ${JSON.stringify(customResourceEvent)}`);

		ow(customResourceEvent.ResourceProperties, ow.object.nonEmpty);

		const { glueDatabaseName, glueTableName } = customResourceEvent.ResourceProperties;

		ow(glueTableName, ow.string.nonEmpty);
		ow(glueDatabaseName, ow.string.nonEmpty);

		try {
			// Get tables current indexes
			const indexes = await this.glueClient.send( new GetPartitionIndexesCommand({DatabaseName: glueDatabaseName , TableName: glueTableName }));
			this.logger.info(`GlueSeeder.customResource > create > indexes: ${JSON.stringify(indexes)}`);
			// Add Index if none are present
			if (!indexes?.PartitionIndexDescriptorList || indexes?.PartitionIndexDescriptorList.length === 0 ){
				await this.glueClient.send( new CreatePartitionIndexCommand({
					DatabaseName: glueDatabaseName ,
					 TableName: glueTableName,
					 PartitionIndex:{
						IndexName:'pipeline-execution',
						Keys :['pipeline_id','execution_id']
					 } }));
				return Promise.resolve({status: 'SUCCESS'});
			}

		} catch (Exception) {
			this.logger.error(`GlueSeeder.customResource > update > error : ${Exception}`);
		}

		this.logger.info(`GlueSeeder.customResource > update > exit`);
		return Promise.resolve(undefined);
	}

	async delete(customResourceEvent: CustomResourceEvent): Promise<unknown> {
		this.logger.info(`GlueSeeder.customResource > delete > in > event: ${JSON.stringify(customResourceEvent)}`);

		ow(customResourceEvent.ResourceProperties, ow.object.nonEmpty);

		const { glueDatabaseName, glueTableName } = customResourceEvent.ResourceProperties;

		ow(glueTableName, ow.string.nonEmpty);
		ow(glueDatabaseName, ow.string.nonEmpty);

		try {
			// Get tables current indexes
			const indexes = await this.glueClient.send( new GetPartitionIndexesCommand({DatabaseName: glueDatabaseName , TableName: glueTableName }));
			this.logger.info(`GlueSeeder.customResource > create > indexes: ${JSON.stringify(indexes)}`);
			// Add Index if none are present
			if (indexes?.PartitionIndexDescriptorList && indexes?.PartitionIndexDescriptorList.length > 0 ){
				await this.glueClient.send( new DeletePartitionIndexCommand({
					DatabaseName: glueDatabaseName ,
					 TableName: glueTableName,
					 IndexName:'pipeline-execution'
					}));
				return Promise.resolve({status: 'SUCCESS'});
		}

		} catch (Exception) {
			this.logger.info(`GlueSeeder.customResource > delete > exit`);
		}

		return Promise.resolve(undefined);
	}

}
