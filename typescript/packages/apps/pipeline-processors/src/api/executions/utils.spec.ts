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

import { beforeEach, describe, it, expect } from 'vitest';
import pino from 'pino';
import type { GroupPermissions } from '@sif/authz';
import { PipelineExecutionUtils } from './utils.js';
import { mock, MockProxy } from 'vitest-mock-extended';
import dayjs from 'dayjs';

describe('ExecutionsUtils', () => {
	let utils: PipelineExecutionUtils;
	let mockAuthChecker: MockProxy<GroupPermissions>;
	const testAuditLogWaitTimeSeconds = 120;

	beforeEach(() => {
		const logger = pino(
			pino.destination({
				sync: true, // test frameworks must use pino logger in sync mode!
			})
		);
		logger.level = 'info';

		mockAuthChecker = mock<GroupPermissions>();
		utils = new PipelineExecutionUtils(logger, mockAuthChecker, testAuditLogWaitTimeSeconds);
	});

	it('audits not ready for execution in progress', async () => {
		expect(() => {
			utils.validateExecutionAuditComplete({ status: 'in_progress', updatedAt: '2022-08-10T23:55:20.322Z'});
		}).toThrow('audit processing is still in progress for execution');
	});

	it('audits not ready for execution in waiting', async () => {
		expect(() => {
			utils.validateExecutionAuditComplete({ status: 'waiting', updatedAt: '2022-08-10T23:55:20.322Z'});
		}).toThrow('audit processing is still in progress for execution');
	});

	it('audits not ready if no updatedAt', async () => {
		expect(() => {
			utils.validateExecutionAuditComplete({ status: 'success' });
		}).toThrow('audit processing is still in progress for execution');
	});

	it('audits not ready if updatedAt is too close to now', async () => {
		expect(() => {
			utils.validateExecutionAuditComplete({ status: 'success', updatedAt: dayjs().subtract(testAuditLogWaitTimeSeconds - 5, 'second').toISOString() });
		}).toThrow('audit processing is still in progress for execution');
	});

	it('happy path - audits ready if updatedAt long enough before now (success pipeline execution status)', async () => {
		utils.validateExecutionAuditComplete({ status: 'success', updatedAt: dayjs().subtract(testAuditLogWaitTimeSeconds + 5, 'second').toISOString() });
	});

	it('happy path - audits ready if updatedAt long enough before now (failed pipeline execution status)', async () => {
		utils.validateExecutionAuditComplete({ status: 'failed', updatedAt: dayjs().subtract(testAuditLogWaitTimeSeconds + 5, 'second').toISOString() });
	});
});
