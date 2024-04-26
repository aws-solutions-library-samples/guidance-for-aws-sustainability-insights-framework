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

import { beforeEach, describe, expect, it } from 'vitest';
import pino from 'pino';
import { ResourceTagsService } from './resourceTags.service';
import { mock, MockProxy } from 'vitest-mock-extended';
import type { ImpactClient, LambdaRequestContext, ReferenceDatasetClient } from '@sif/clients/dist';
import type { ReferenceDatasetResource } from '@sif/clients';
import type { GetLambdaRequestContext } from '../../plugins/module.awilix.js';
import type { PipelineExecution } from '../../api/executions/schemas';

describe('ResourceTagsService', () => {

	let underTest: ResourceTagsService;
	let mockedImpactClient: MockProxy<ImpactClient>;
	let mockedReferenceDatasetClient: MockProxy<ReferenceDatasetClient>;

	beforeEach(() => {
		const logger = pino(
			pino.destination({
				sync: true // test frameworks must use pino logger in sync mode!
			})
		);
		logger.level = 'info';
		process.env['TENANT_ID'] = 'test-tenant';
		process.env['NODE_ENV'] = 'test-env';

		const mockGetLambdaRequestContext: GetLambdaRequestContext = (): LambdaRequestContext => {
			return {} as unknown as LambdaRequestContext;
		};

		mockedReferenceDatasetClient = mock<ReferenceDatasetClient>();
		mockedImpactClient = mock<ImpactClient>();
		underTest = new ResourceTagsService(logger, mockedReferenceDatasetClient, mockedImpactClient, mockGetLambdaRequestContext, 10);
	});

	it('Should update execution tags to include referenced resources tags', async () => {
		mockedReferenceDatasetClient.getByAlias.mockResolvedValue({ id: 'test' } as ReferenceDatasetResource);
		mockedReferenceDatasetClient.get.mockResolvedValueOnce({
			tags: {
				'df:source:data1': 'dddd:1111:1',
			}
		} as unknown as ReferenceDatasetResource);

		mockedReferenceDatasetClient.get.mockResolvedValueOnce({
			tags: {
				'df:source:data2': 'dddd:2222:1'
			}
		} as unknown as ReferenceDatasetResource);

		const tags = await underTest.assembleDependentResourcesTags({
			pipelineExecution: {} as PipelineExecution,
			referenceDatasets: {
				'sample set one': {
					name: 'sample set one',
					version: 1,
					group: '/'
				},
				'sample set two': {
					name: 'sample set two',
					version: 1,
					group: '/'
				}
			},
			activities: {}
		});

		expect(tags).toEqual({
			'df:source:data1': 'dddd:1111:1',
			'df:source:data2': 'dddd:2222:1'
		});

	});

})
;
