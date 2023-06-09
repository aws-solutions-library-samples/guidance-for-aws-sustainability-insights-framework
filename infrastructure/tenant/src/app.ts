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
import { Aspects } from 'aws-cdk-lib';
import axios from 'axios';
import { AwsSolutionsChecks } from 'cdk-nag';
import { AccessManagementStack } from './accessManagement/accessManagement.stack.js';
import { AuditLogDepositorStack } from './auditLogDepositor/auditLogDepositor.stack.js';
import { CalculationApiStack } from './calculations/calculations.stack.js';
import { CalculatorApiStack } from './calculator/calculator.stack.js';
import { CsvConnectorStack } from './connectors/csv.stack.js';
import { SifConnectorStack } from './connectors/sif.stack.js';
import { ImpactsApiStack } from './impacts/impacts.stack.js';
import { PipelineProcessorsApiStack } from './pipelineProcessor/pipelineProcessors.stack.js';
import { PipelineApiStack } from './pipelines/pipelines.stack.js';
import { ReferenceDatasetsApiStack } from './referenceDatasets/referenceDatasets.stack.js';
import { SharedTenantInfrastructureStack } from './shared/sharedTenant.stack.js';
import { getOrThrow } from './shared/stack.utils.js';

const tenantApp = new cdk.App();

// mandatory requirements
const tenantId = getOrThrow(tenantApp, 'tenantId');
const environment = getOrThrow(tenantApp, 'environment');
const administratorEmail = getOrThrow(tenantApp, 'administratorEmail');

// optional requirements? SES related
const cognitoFromEmail = tenantApp.node.tryGetContext('cognitoFromEmail') as string;
const cognitoVerifiedDomain = tenantApp.node.tryGetContext('cognitoVerifiedDomain') as string;
const cognitoFromName = tenantApp.node.tryGetContext('cognitoFromName') as string;
const cognitoReplyToEmail = tenantApp.node.tryGetContext('cognitoReplyToEmail') as string;
// optional requirement to expose delete resource endpoint
const enableDeleteResource = tenantApp.node.tryGetContext('enableDeleteResource') as boolean;
// optional requirement to remove bucket and objects when it got deleted
const deleteBucket = (tenantApp.node.tryGetContext('deleteBucket') ?? 'false') === 'true';

// optional requirements to specify sql or nosql storage type to store the metric (defaulted to sql)
const metricStorage = tenantApp.node.tryGetContext('metricStorage') as string;

//optional requirements for cross tenant resource sharing
const permittedOutgoingTenantPaths = tenantApp.node.tryGetContext('outgoingTenantPaths') as string;
const externallySharedGroupIds = tenantApp.node.tryGetContext('externallySharedGroupIds') as string;

//optional requirements for audit file features in pipeline processors module
const downloadAuditFileParallelLimit = (tenantApp.node.tryGetContext('downloadAuditFileParallelLimit') as number) ?? 5;

//optional requirements for calculation engine lambda scaling
const minScaling = (tenantApp.node.tryGetContext('minScaling') as number) ?? 1;
const maxScaling = (tenantApp.node.tryGetContext('maxScaling') as number) ?? 10;

//Validate parameters
let tenantPathRegex = /([a-z1-9_-]*):\/([a-z1-9_-]*)/g;
let sharedGroupRegex = /\/([a-z1-9_-]*)/g;


if (permittedOutgoingTenantPaths) {
	if (!permittedOutgoingTenantPaths.match(tenantPathRegex)) {
		throw new Error('outgoingTenantPaths does not match the correct format ([a-z1-9_-]*):/([a-z1-9_-]*) ');
	}
}

if (externallySharedGroupIds) {
	if (!externallySharedGroupIds.match(sharedGroupRegex)) {
		throw new Error('externallySharedGroupIds does not match the correct format /([a-z1-9_-]* ');
	}
}

// tags the entire tenant with cost allocation tags
cdk.Tags.of(tenantApp).add('sif:tenantId', tenantId);
cdk.Tags.of(tenantApp).add('sif:environment', environment);
Aspects.of(tenantApp).add(new AwsSolutionsChecks({ verbose: true }));

const tenantStackNamePrefix = `sif-${tenantId}-${environment}`;

const csvConnectorName = 'sif-csv-pipeline-input-connector';
const sifConnectorName = 'sif-activity-pipeline-input-connector';

const tenantStackName = (suffix: string) => `${tenantStackNamePrefix}-${suffix}`;
const tenantStackDescription = (moduleName: string) => `Infrastructure for ${moduleName} module -- Guidance for Sustainability Insights Framework on AWS (SO9161)`;

const getCaCertResponse = await axios.get('https://www.amazontrust.com/repository/AmazonRootCA1.pem');

/**
 * When using `StringParameter.valueFromLookup` in stacks it returns the actual value of the parameter as a Runtime context
 * value. If the value is not already cached in cdk.json or passed on the command line, it will be retrieved from the current
 * AWS account. For this reason, the stack must be synthesized with explicit account and region information.
 */
const env: cdk.Environment = {
	account: process.env['CDK_DEPLOY_ACCOUNT'] || process.env['CDK_DEFAULT_ACCOUNT'],
	region: process.env['CDK_DEPLOY_REGION'] || process.env['CDK_DEFAULT_REGION'],
};

const sharedInfrastructureStack = new SharedTenantInfrastructureStack(tenantApp, 'SharedTenant', {
	stackName: tenantStackName('shared'),
	description: tenantStackDescription('SharedTenant'),
	env,
	tenantId,
	environment,
	administratorEmail,
	deleteBucket,
	userPoolEmail:
		cognitoFromEmail !== undefined
			? {
					fromEmail: cognitoFromEmail,
					fromName: cognitoFromName,
					replyTo: cognitoReplyToEmail,
					sesVerifiedDomain: cognitoVerifiedDomain,
			  }
			: undefined,
	caCert: getCaCertResponse.data,
});

const accessManagementStack = new AccessManagementStack(tenantApp, 'AccessManagement', {
	stackName: tenantStackName('accessManagement'),
	description: tenantStackDescription('AccessManagement'),
	env,
	tenantId,
	environment,
	administratorEmail,
});
accessManagementStack.node.addDependency(sharedInfrastructureStack);

const calculatorStack = new CalculatorApiStack(tenantApp, 'Calculator', {
	stackName: tenantStackName('calculator'),
	description: tenantStackDescription('Calculator'),
	env,
	tenantId,
	environment,
	caCert: getCaCertResponse.data,
	minScaling,
	maxScaling,
});
calculatorStack.node.addDependency(sharedInfrastructureStack);

const auditLogDepositorStack = new AuditLogDepositorStack(tenantApp, 'AuditLogDepositor', {
	stackName: tenantStackName('auditLogDepositor'),
	description: tenantStackDescription('AuditLogDepositor'),
	env,
	tenantId,
	environment,
});
auditLogDepositorStack.node.addDependency(calculatorStack);

const pipelineProcessorsStack = new PipelineProcessorsApiStack(tenantApp, 'PipelineProcessors', {
	stackName: tenantStackName('pipelineProcessors'),
	description: tenantStackDescription('PipelineProcessors'),
	env,
	tenantId,
	environment,
	csvConnectorName,
	caCert: getCaCertResponse.data,
	downloadAuditFileParallelLimit,
	metricStorage,
});
pipelineProcessorsStack.node.addDependency(sharedInfrastructureStack);
pipelineProcessorsStack.node.addDependency(calculatorStack);

const referenceDatasetsApiStack = new ReferenceDatasetsApiStack(tenantApp, 'ReferenceDatasets', {
	stackName: tenantStackName('referenceDatasets'),
	description: tenantStackDescription('ReferenceDatasets'),
	env,
	tenantId,
	environment,
	enableDeleteResource,
	permittedOutgoingTenantPaths,
	externallySharedGroupIds,
});
referenceDatasetsApiStack.node.addDependency(sharedInfrastructureStack);

const impactsApiStack = new ImpactsApiStack(tenantApp, 'Impacts', {
	stackName: tenantStackName('impacts'),
	description: tenantStackDescription('Impacts'),
	env,
	tenantId,
	environment,
	enableDeleteResource,
	permittedOutgoingTenantPaths,
	externallySharedGroupIds,
});
impactsApiStack.node.addDependency(sharedInfrastructureStack);

const pipelineApiStack = new PipelineApiStack(tenantApp, 'Pipelines', {
	stackName: tenantStackName('pipelines'),
	description: tenantStackDescription('Pipelines'),
	env,
	tenantId,
	environment,
	enableDeleteResource,
});
pipelineApiStack.node.addDependency(sharedInfrastructureStack);

const calculationApiStack = new CalculationApiStack(tenantApp, 'Calculations', {
	stackName: tenantStackName('calculations'),
	description: tenantStackDescription('Calculations'),
	env,
	tenantId,
	environment,
	enableDeleteResource,
	permittedOutgoingTenantPaths,
	externallySharedGroupIds,
});
calculationApiStack.node.addDependency(sharedInfrastructureStack);

// Connectors

const sifConnectorStack = new SifConnectorStack(tenantApp, 'sifConnector', {
	stackName: tenantStackName('sifConnector'),
	description: tenantStackDescription('sifConnector'),
	env,
	tenantId,
	environment,
	connectorName: sifConnectorName,
});
sifConnectorStack.node.addDependency(pipelineApiStack);

const csvConnectorStack = new CsvConnectorStack(tenantApp, 'csvConnector', {
	stackName: tenantStackName('csvConnector'),
	description: tenantStackDescription('csvConnector'),
	env,
	tenantId,
	environment,
	connectorName: csvConnectorName,
});
csvConnectorStack.node.addDependency(pipelineApiStack);
