#!/usr/bin/env node
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
import * as cdk from 'aws-cdk-lib';
import { IDEStack } from './ide.stack.js';
import type { App } from 'aws-cdk-lib';

const app = new cdk.App();

export function getOrThrow(app: App, name: string): string {
	const attribute = app.node.tryGetContext(name) as string;
	if (attribute === undefined) {
		throw new Error(`'${name}' is required`);
	}
	return attribute;
}

const tenantId = getOrThrow(app, 'tenantId');
const environment = getOrThrow(app, 'environment');
const ownerArn = getOrThrow(app, 'ownerArn');
const repositoryUrl = getOrThrow(app, 'repositoryUrl');
const instanceType = getOrThrow(app, 'instanceType');

new IDEStack(app, 'IdeStack', {
	stackName: `sif-${tenantId}-${environment}-ide`,
	tenantId,
	ownerArn,
	instanceType,
	repositoryUrl,
	environment,
});
