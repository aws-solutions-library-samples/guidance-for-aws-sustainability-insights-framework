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
import type { CalculatorReferencedResource, ImpactClient, ReferenceDatasetClient } from '@sif/clients';
import type { PipelineExecution } from '../../api/executions/schemas.js';
import { SecurityScope } from '@sif/authz';
import type { BaseLogger } from 'pino';
import type { GetLambdaRequestContext } from '../../plugins/module.awilix.js';
import pLimit from 'p-limit';

export interface AssembleResourceTagsParams {
	pipelineExecution: PipelineExecution;
	referenceDatasets: { [key: string]: CalculatorReferencedResource },
	activities: { [key: string]: CalculatorReferencedResource }
}

export class ResourceTagsService {

	constructor(private readonly log: BaseLogger, private readonly referenceDatasetClient: ReferenceDatasetClient, private readonly impactClient: ImpactClient, private readonly getLambdaRequestContext: GetLambdaRequestContext, private readonly taskParallelLimit: number) {
	}

	public async assembleDependentResourcesTags(params: AssembleResourceTagsParams): Promise<Record<string, string>> {
		this.log.info(`ResourceTagService > assembleDependentResourcesTags > params: ${JSON.stringify(params)}`);
		const referenceDatasetsTags = await this.getTags('referenceDatasetClient', params.referenceDatasets, params.pipelineExecution.createdBy);
		const activitiesTags = await this.getTags('impactClient', params.activities, params.pipelineExecution.createdBy);
		const tags = {
			...referenceDatasetsTags,
			...activitiesTags
		};
		this.log.info(`ResourceTagService > assembleDependentResourcesTags > tags: ${JSON.stringify(tags)}`);
		return tags;
	}

	private async getTags(client: 'referenceDatasetClient' | 'impactClient', resources: { [key: string]: CalculatorReferencedResource }, email: string) {
		this.log.trace(`ResourceTagService > getTags > client: ${client}, resources: ${JSON.stringify(resources)}, email: ${email}`);
		const reduceTags = (prev: Record<string, string>, curr: { tags: Record<string, any> }) => {
			Object.entries(curr.tags).forEach(([key, value]) => {
				if (key.startsWith('df:source:') && !prev[key]) {
					prev[key] = value;
				}
			});
			return prev;
		};

		const limit = pLimit(this.taskParallelLimit);

		const tags = (await Promise.all(
			Object.values(resources ?? {})
				.map((cr) => {
					return limit(async () => {
						const requestContext = this.getLambdaRequestContext({ email: email, groupId: cr.group, groupRoles: { [cr.group]: SecurityScope.contributor } });
						const referenceDataset = await this[client].getByAlias(cr.name, requestContext);
						return await this[client].get(referenceDataset.id, cr.version, requestContext);
					});
				}))).reduce(reduceTags, {});

		this.log.trace(`ResourceTagService > getTags > exit> tags: ${tags}`);
		return tags;
	}
}
