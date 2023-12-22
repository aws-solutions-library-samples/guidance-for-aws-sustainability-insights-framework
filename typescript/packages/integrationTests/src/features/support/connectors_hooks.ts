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

import { Before, setDefaultTimeout } from '@cucumber/cucumber';
import { createApi } from './util.js';

setDefaultTimeout(120 * 1000);

Before({ tags: '@setup_connectors' }, async function () {
	const nodeEnv = process.env.NODE_ENV as string;
	global.apicklis = {
		accessManagement: await createApi(nodeEnv, process.env.ACCESS_MANAGEMENT_BASE_URL as string, {}),
		impacts: await createApi(nodeEnv, process.env.IMPACTS_BASE_URL as string, {}),
		calculations: await createApi(nodeEnv, process.env.CALCULATIONS_BASE_URL as string, {}),
		pipelineProcessor: await createApi(nodeEnv, process.env.PIPELINE_PROCESSOR_BASE_URL as string, {}),
		pipelines: await createApi(nodeEnv, process.env.PIPELINES_BASE_URL as string, {}),
		referenceDatasets: await createApi(nodeEnv, process.env.REFERENCE_DATASETS_BASE_URL as string, {}),
	};
});
