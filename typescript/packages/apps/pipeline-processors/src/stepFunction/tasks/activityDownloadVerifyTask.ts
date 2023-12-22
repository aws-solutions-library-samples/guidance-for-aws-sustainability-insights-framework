/* eslint-disable require-atomic-updates */
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

export class ActivityDownloadVerifyTask {
	private readonly log: BaseLogger;
	private readonly activityDownloadUtil: ActivityDownloadUtil;

	constructor(log: BaseLogger, activityDownloadUtil: ActivityDownloadUtil) {
		this.log = log;
		this.activityDownloadUtil = activityDownloadUtil;
	}


	public async process(event: ActivityDownloadTaskResponse): Promise<ActivityDownloadTaskResponse> {
		this.log.info(`ActivityDownloadVerifyTask > process > event : ${JSON.stringify(event)}`);

		const { id } = event;
		try {

			const  isCompleted = await this.activityDownloadUtil.verifyQueryStatus(event.id);
			if(isCompleted){
				// verify result files exist
				const isFileExported = this.activityDownloadUtil.verifyExportFile(event.id);
				if (isFileExported){
					await this.activityDownloadUtil.updateDownloadStatus(id,'success',event.executionArn);
					event.state = 'success';
				}
			}
		} catch (error) {
			this.log.error(`ActivityDownloadVerifyTask > error : ${error.message}`);
			await this.activityDownloadUtil.updateDownloadStatus(id,'failed',event.executionArn,error.message);
			event.state = 'failed';
		}

		this.log.info(`ActivityDownloadVerifyTask > process > exit:`);
		return event;
	}

}
