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
import type { ActivityDownloadUtil } from '../../utils/activityDownload.util';
import type { ActivityDownloadTaskResponse } from './model';

export class ActivityDownloadStartTask {
	private readonly log: BaseLogger;
	private readonly activityDownloadUtil: ActivityDownloadUtil;

	constructor(log: BaseLogger, activityDownloadUtil: ActivityDownloadUtil) {
		this.log = log;
		this.activityDownloadUtil = activityDownloadUtil;
	}


	public async process(event: ActivityDownloadTaskResponse): Promise<ActivityDownloadTaskResponse> {
		this.log.info(`ActivityDownloadStartTask > process > event : ${JSON.stringify(event)}`);
		const { id, type } = event;

		try {

			if (type === 'activity' ){
				await this.activityDownloadUtil.processActivitiesDownloadRequest(event);
			} else {
				await this.activityDownloadUtil.processMetricsDownloadRequest(event);
			}

		} catch (error) {
			this.log.error(`ActivityDownloadStartTask > error : ${error.message}`);
			await this.activityDownloadUtil.updateDownloadStatus(id,'failed','',error.message);
			// eslint-disable-next-line require-atomic-updates
			event.state = 'failed';
		}

		this.log.info(`ActivityDownloadStartTask > process > exit:`);
		return event;
	}

}
