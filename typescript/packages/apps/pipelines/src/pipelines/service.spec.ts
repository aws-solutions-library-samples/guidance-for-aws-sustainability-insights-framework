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

import { mock } from 'vitest-mock-extended';
import { beforeEach, describe, expect, it } from 'vitest';
import pino from 'pino';

import type { GroupPermissions } from '@sif/authz';
import { CalculatorClient, ConnectorType } from '@sif/clients';
import type { GroupService, MergeUtils, ResourceService, TagService } from '@sif/resource-api-base';
import type { PipelineValidator } from './validator.js';

import type { PipelineRepository } from './repository.js';
import type { MetricService } from '../metrics/service.js';
import { PipelineService } from './service.js';
import type { ConnectorService } from '../connectors/service.js';
import type { Connector } from '../connectors/schemas.js';
import type { EventPublisher } from '@sif/events/dist/publisher.js';

describe('PipelineService', () => {
	let pipelineService: PipelineService;
	let mockGroupPermissions = mock<GroupPermissions>();
	let mockGroupService = mock<GroupService>();
	let mockTagService = mock<TagService>();
	let mockResourceService = mock<ResourceService>();
	let mockMergeUtils = mock<MergeUtils>();
	let mockValidator = mock<PipelineValidator>();
	let mockPipelineRepository = mock<PipelineRepository>();
	let mockMetricService = mock<MetricService>();
	let mockCalculatorClient = mock<CalculatorClient>();
	let mockConnectorService = mock<ConnectorService>();
	let mockEventPublisher = mock<EventPublisher>();


	beforeEach(async () => {
		const logger = pino(
			pino.destination({
				sync: true, // test frameworks must use pino logger in sync mode!
			})
		);
		logger.level = 'debug';

		pipelineService = new PipelineService(logger, mockGroupPermissions, mockPipelineRepository, mockGroupService, mockTagService, mockResourceService, mockValidator, mockMergeUtils, mockCalculatorClient, mockMetricService, mockConnectorService, 'testEventBus', mockEventPublisher);
	});

	it('should not throw an error if transform new and old have the same outputs which has "includeAsUnique" property set', () => {
		const oldTransforms = [
			{
				index: 0,
				formula: "AS_TIMESTAMP(:reading date,'M/d/yy')",
				outputs: [
					{
						index: 0,
						key: 'time',
						type: 'timestamp',
					},
				],
			},
			{
				index: 1,
				formula: ':a',
				outputs: [
					{
						index: 0,
						key: 'x',
						type: 'string',
						includeAsUnique: true,
					},
				],
			},
			{
				index: 2,
				formula: ':b*:c',
				outputs: [
					{
						index: 0,
						key: 'y*z',
						type: 'number',
						includeAsUnique: true,
					},
				],
			},
		];
		const newTransforms = [
			{
				index: 0,
				formula: "AS_TIMESTAMP(:reading date,'M/d/yy')",
				outputs: [
					{
						description: 'Timestamp of business activity.',
						index: 0,
						key: 'time',
						label: 'Time',
						type: 'timestamp',
					},
				],
			},
			{
				index: 1,
				formula: ':a',
				outputs: [
					{
						index: 0,
						key: 'a',
						type: 'string',
						includeAsUnique: true,
					},
				],
			},
			{
				index: 2,
				formula: ':b*:c',
				outputs: [
					{
						index: 0,
						key: 'b*c',
						type: 'number',
						includeAsUnique: true,
					},
				],
			},
		];

		try {
			//@ts-ignore
			pipelineService['validateOutputIncludeAsUniqueChange'](oldTransforms, newTransforms);
		} catch (e) {
			expect(e).not.throw();
		}
	});

	it('should throw an error if  new and old to do not have the same outputs which has "includeAsUnique" property set', () => {
		const oldTransforms = [
			{
				index: 0,
				formula: "AS_TIMESTAMP(:reading date,'M/d/yy')",
				outputs: [
					{
						index: 0,
						key: 'time',
						type: 'timestamp',
					},
				],
			},
			{
				index: 1,
				formula: ':a',
				outputs: [
					{
						index: 0,
						key: 'x',
						type: 'string',
						includeAsUnique: true,
					},
				],
			},
			{
				index: 2,
				formula: ':b*:c',
				outputs: [
					{
						index: 0,
						key: 'y*z',
						type: 'number',
						includeAsUnique: true,
					},
				],
			},
		];
		const newTransforms = [
			{
				index: 0,
				formula: "AS_TIMESTAMP(:reading date,'M/d/yy')",
				outputs: [
					{
						description: 'Timestamp of business activity.',
						index: 0,
						key: 'time',
						label: 'Time',
						type: 'timestamp',
					},
				],
			},
			{
				index: 1,
				formula: ':a',
				outputs: [
					{
						index: 0,
						key: 'a',
						type: 'string',
					},
				],
			},
			{
				index: 2,
				formula: ':b*:c',
				outputs: [
					{
						index: 0,
						key: 'b*c',
						type: 'number',
						includeAsUnique: true,
					},
				],
			},
		];

		try {
			//@ts-ignore
			pipelineService['validateOutputIncludeAsUniqueChange'](oldTransforms, newTransforms);
		} catch (e) {
			expect(e.message).toEqual('includeAsUnique cannot be changed or updated for the outputs. If it needs to be changed a new pipeline must be created');
		}
	});

	it('should throw an error if  new and old to do not have the different set of outputs then the new ones which could include "includeAsUnique"', () => {
		const oldTransforms = [
			{
				index: 0,
				formula: "AS_TIMESTAMP(:reading date,'M/d/yy')",
				outputs: [
					{
						index: 0,
						key: 'time',
						type: 'timestamp',
					},
				],
			},
			{
				index: 1,
				formula: ':a',
				outputs: [
					{
						index: 0,
						key: 'x',
						type: 'string',
						includeAsUnique: true,
					},
				],
			},
		];
		const newTransforms = [
			{
				index: 0,
				formula: "AS_TIMESTAMP(:reading date,'M/d/yy')",
				outputs: [
					{
						description: 'Timestamp of business activity.',
						index: 0,
						key: 'time',
						label: 'Time',
						type: 'timestamp',
					},
				],
			},
			{
				index: 1,
				formula: ':a',
				outputs: [
					{
						index: 0,
						key: 'a',
						type: 'string',
					},
				],
			},
			{
				index: 2,
				formula: ':b*:c',
				outputs: [
					{
						index: 0,
						key: 'b*c',
						type: 'number',
						includeAsUnique: true,
					},
				],
			},
		];

		try {
			//@ts-ignore
			pipelineService['validateOutputIncludeAsUniqueChange'](oldTransforms, newTransforms);
		} catch (e) {
			expect(e.message).toEqual('includeAsUnique cannot be changed or updated for the outputs. If it needs to be changed a new pipeline must be created');
		}
	});

	it('should throw an error if there are unknown parameter overrides provided on the pipeline connector config object', () => {
		const pipelineConnectorConfig = {
			name: 'my-connector',
			parameters: {
				key1: 'val1'
			}
		}

		const connector:Connector = {
			id: 'id',
			createdAt: 'time',
			createdBy: 'someone@somewhere.com',
			name: 'my-connector',
			type: ConnectorType.input,
			parameters: [{
				name: 'key2'
			}],
			groups: ['/'],
			updatedAt: 'time'
		}

		try {
			pipelineService['validateConnectorConfigParameters'](pipelineConnectorConfig, connector)
		} catch (e) {
			expect(e.message).toEqual('unknown parameter overrides specified: {"key1":"val1"}, valid parameters for this connector are: ["key2"]');
		}
	});


});
