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
import type { ActivityService } from '../pipeline-processor/activities/service';
import type { ActivityQS } from '@sif/clients';
import * as fs from 'fs';
import { ulid } from 'ulid';
import axios from 'axios';
import type { ActivityResource, ConnectorIntegrationRequestEvent } from '@sif/clients';
import type { ConnectorEvents } from '../events/connector.events.js';
import os from 'os';
import path from 'path';
import { SecurityScope } from '@sif/authz';

export class SifService {
	private readonly log: BaseLogger;
	private readonly activityService: ActivityService;
	private readonly connectorEvents: ConnectorEvents;

	public constructor(log: BaseLogger, activityService: ActivityService, connectorEvents: ConnectorEvents) {
		this.log = log;
		this.activityService = activityService;
		this.connectorEvents = connectorEvents;
	}

	public async processConnectorIntegrationRequest(event: ConnectorIntegrationRequestEvent) {
		this.log.info(`Connectors> SIF> events> process> event: ${JSON.stringify(event)}`);

		let { pipeline, executionId, transformedInputUploadUrl, securityContext, connector } = event;

		const options = this.initializeDefaultOptions(connector.parameters);

		// Create a security context if none are passed in the event payload
		if (!securityContext) {
			const groupId = '/';
			const groupRoles = {};
			groupRoles[groupId] = SecurityScope.reader;

			securityContext = {
				email: 'sif-Connector',
				groupId,
				groupRoles
			}

		}

		const groupId = securityContext.groupId;

		const activityRequest: ActivityQS = {
			pipelineId: pipeline.id,
			executionId,
			groupId,
			count: options.count.toString()
		}


		try {
			const activities = await this.activityService.list(securityContext, activityRequest);

			this.log.trace(`Connectors> SIF> events>  activities: ${JSON.stringify(activities)}`);

			// Create and upload the result file
			const outputFilePath = await this.convertArrayToSifFormat(activities);
			await axios.put(transformedInputUploadUrl, fs.readFileSync(outputFilePath));

		} catch (error) {
			this.log.info(`Connectors> SIF> events>  error: ${error}`);
			this.log.info(`Connectors> SIF> events>  executionId: ${executionId},pipelineId: ${pipeline.id}, errorMessage: ${(error as Error).message}`);
			await this.connectorEvents.publishResponse({
				executionId: executionId,
				pipelineId: pipeline.id,
				status: 'error',
				statusMessage: (error as Error).message
			});
			throw new Error(error);
		}

		await this.connectorEvents.publishResponse({
			executionId: executionId,
			pipelineId: pipeline.id,
			status: 'success',
			statusMessage: `successfully processed input file for pipeline: ${pipeline.id}, execution: ${executionId}`,
			securityContext
		});

		this.log.info(`Connectors> SIF> events>  exit`);
	}

	private async convertArrayToSifFormat(input: ActivityResource[]): Promise<string> {
		this.log.info(`Connectors> SIF> events> convertArrayToSifFormat> in`);

		const newlineDelimiter = `\r\n`;

		// Convert to Json Lines
		const sifString = input.map(i => JSON.stringify(i)).join(newlineDelimiter);

		const tmpFile = os.tmpdir() + path.sep + `${ulid().toLowerCase()}`;
		fs.writeFileSync(tmpFile, sifString);
		this.log.info(`Connectors> SIF> events> convertArrayToSifFormat> out`);
		return tmpFile;
	}

	private initializeDefaultOptions(parameters: Record<string, string | number | boolean>): Options {
		this.log.info(`Connectors> SIF> sif> in> parameters: ${parameters}`);

		// if we pass parameters which are undefined, then we need to initialize them as an empty object for the code below to populate the defaults
		if(!parameters) {
			parameters = {}
		}

		// empty options object
		const options:Options = {};

		// check if the 'count' is specified in parameters if not we default it to a 1000
		options.count = (parameters?.['count']) ? parameters['count'] as number : 1000;

		this.log.info(`csvService> initializeDefaultOptions> out> options: ${options}`);

		return options;
	}

}

export interface Options {
	delimiter?: string;
	count?: number
}
