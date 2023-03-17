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

import { Then } from '@cucumber/cucumber';
import assert from 'assert';

Then(/^pipelines response should contain pipeline (.*)$/, async function (pipelineIdVariable: string) {
	const pipelinesResponse = JSON.parse(this['apickli'].getResponseObject().body);
	const pipelineId = this['apickli'].getGlobalVariable(pipelineIdVariable);

	const pipelineMatch = pipelinesResponse['pipelines'].filter((p: any) => {
		return p.id === pipelineId;
	});

	assert(pipelineMatch.length === 1);
	assert(pipelineMatch[0].id, pipelineId);
});
