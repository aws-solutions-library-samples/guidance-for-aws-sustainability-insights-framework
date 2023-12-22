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

import shelljs from 'shelljs';
import { Octokit } from 'octokit';

export interface SifMetadata {
	version?: string;
	tag?: string;
	branch: string;
	revision: string;
}

const REPO_OWNER = 'aws-solutions-library-samples';
const REPO_NAME = 'guidance-for-aws-sustainability-insights-framework';

const getSifMetadata = async (): Promise<SifMetadata> => {
	const octokit = new Octokit();
	const tag = shelljs.exec('git describe --tags', { silent: true }).stdout.trim();
	const branch = shelljs.exec('git rev-parse --abbrev-ref HEAD', { silent: true }).stdout.trim();
	const revision = shelljs.exec('git rev-parse HEAD', { silent: true }).stdout.trim();
	let release;
	try {
		release = (await octokit.rest.repos.getReleaseByTag({ owner: REPO_OWNER, repo: REPO_NAME, tag })).data;
	} catch (Exception) {
		console.log(`Could not find any release in Github that matches tag ${tag}`);
	}

	return {
		tag, branch, revision, version: release?.name
	};
};

export {
	getSifMetadata
};
