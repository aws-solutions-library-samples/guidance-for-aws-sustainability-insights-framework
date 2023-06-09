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
import type { ActivitiesRepository } from '../../api/activities/repository.js';
import type { ProcessedTaskEvent } from './model.js';
import { validateDefined, validateNotEmpty } from '@sif/validators';
import type { Client } from 'pg';

export class InsertLatestValuesTaskService {
	private readonly log: BaseLogger;
	private readonly activitiesRepository: ActivitiesRepository;

	public constructor(log: BaseLogger, activitiesRepository: ActivitiesRepository) {
		this.log = log;
		this.activitiesRepository = activitiesRepository;
	}

	public async process(event: ProcessedTaskEvent): Promise<void> {
		this.log.info(`InsertLatestValuesTaskService> process> event: ${JSON.stringify(event)}`);
		validateDefined(event, 'event');
		validateNotEmpty(event.executionId, 'event.executionId');
		let sharedDbConnection: Client;
		try {
			sharedDbConnection = await this.activitiesRepository.getConnection();
			await this.activitiesRepository.insertExecutionValuesToLatestTablesPerOutput(event.executionId, event.outputs, sharedDbConnection);
		} catch (Exception) {
			this.log.error(`InsertLatestValuesTaskService> process> error: ${JSON.stringify(Exception)}`);
		} finally {
			if (sharedDbConnection !== undefined) {
				await sharedDbConnection.end();
			}
		}
		this.log.info(`InsertLatestValuesTaskService> exit:`);
	}
}
