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
import { CleanRoomsConnectorStack } from './connectors/cleanRooms.stack.js';
import { KinesisConnectorStack } from './connectors/kinesis.stack.js';
import { getOrThrow } from './shared/stack.utils.js';
import { registerAllFacts, tryGetBooleanContext } from '@sif/cdk-common';

const tenantApp = new cdk.App();

import { fileURLToPath } from 'url';
import path from 'path';
import * as fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
const enableDeleteResource = tryGetBooleanContext(tenantApp, 'enableDeleteResource', false);

// optional requirement to remove bucket and objects when it got deleted
const deleteBucket = tryGetBooleanContext(tenantApp, 'deleteBucket', false);

// optional requirement to expose delete resource endpoint
const includeCaml = tryGetBooleanContext(tenantApp, 'includeCaml', false);

// optional configuration to enable/disable metric aggregation when execution finish
const triggerMetricAggregations = tryGetBooleanContext(tenantApp, 'triggerMetricAggregations', true);

// optional requirements to specify sql or nosql storage type to store the metric (defaulted to sql)
const metricStorage = tenantApp.node.tryGetContext('metricStorage') as string;

//optional requirements for cross tenant resource sharing
const permittedOutgoingTenantPaths = tenantApp.node.tryGetContext('outgoingTenantPaths') as string;
const externallySharedGroupIds = tenantApp.node.tryGetContext('externallySharedGroupIds') as string;

//optional requirements for audit file features in pipeline processors module
const downloadAuditFileParallelLimit = (tenantApp.node.tryGetContext('downloadAuditFileParallelLimit') as number) ?? 5;

// Static argument defining the deployed audit version
const auditVersion = '1';

// Time value used for a hint for when firehose should flush audit log data
// This value is also used in audit log processing to ensure audit logs are not attempted to be exported until all records have been flushed
const auditLogFirehoseFlushTimeInSeconds = 60;

//optional requirements for calculation engine lambda scaling
const minScaling = (tenantApp.node.tryGetContext('minScaling') as number) ?? 1;
const maxScaling = (tenantApp.node.tryGetContext('maxScaling') as number) ?? 10;

//optional requirements for calculator precision of decimal number
const decimalPrecision = (tenantApp.node.tryGetContext('decimalPrecision') as number) ?? 16;

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
const cleanRoomsConnectorName = 'sif-cleanRooms-pipeline-input-connector';
const kinesisConnectorName = 'sif-kinesis-pipeline-input-connector';

const tenantStackName = (suffix: string) => `${tenantStackNamePrefix}-${suffix}`;
const tenantStackDescription = (moduleName: string, includeGuidanceCode: boolean) => `Infrastructure for ${moduleName} module${includeGuidanceCode ? ' -- Guidance for Sustainability Insights Framework on AWS (SO9161).' : '.'}`;

/**
 * When using `StringParameter.valueFromLookup` in stacks it returns the actual value of the parameter as a Runtime context
 * value. If the value is not already cached in cdk.json or passed on the command line, it will be retrieved from the current
 * AWS account. For this reason, the stack must be synthesized with explicit account and region information.
 */
const env: cdk.Environment = {
	account: process.env['CDK_DEPLOY_ACCOUNT'] || process.env['CDK_DEFAULT_ACCOUNT'],
	region: process.env['CDK_DEPLOY_REGION'] || process.env['CDK_DEFAULT_REGION'],
};

registerAllFacts();

const tags = {};

if (!fs.existsSync(`${__dirname}/predeploy.json`)) {
	throw new Error('Pre deployment file does not exist\n' +
		'Make sure you run the cdk using npm script which will run the predeploy script automatically\n' +
		'EXAMPLE\n' +
		'$ npm run cdk deploy -- -c sampleTenant -e sampleEnvironment');
}

const { sifMetadata, sifCertificate } = JSON.parse(fs.readFileSync(`${__dirname}/predeploy.json`, 'utf-8'));

const { revision: gitRevision, tag: gitTag, branch: gitBranch, version: gitVersion } = sifMetadata;

if (gitTag) {
	tags['sif:gitTag'] = gitTag;
}
if (gitRevision) {
	tags['sif:gitRevision'] = gitRevision;
}
if (gitBranch) {
	tags['sif:gitBranch'] = gitBranch;
}
if (gitVersion) {
	tags['sif:gitVersion'] = gitVersion;
}

const sharedInfrastructureStack = new SharedTenantInfrastructureStack(tenantApp, 'SharedTenant', {
	stackName: tenantStackName('shared'),
	description: tenantStackDescription('SharedTenant', true),
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
	caCert: sifCertificate,
	tags
});

const accessManagementStack = new AccessManagementStack(tenantApp, 'AccessManagement', {
	stackName: tenantStackName('accessManagement'),
	description: tenantStackDescription('AccessManagement', false),
	env,
	tenantId,
	environment,
	administratorEmail,
	tags
});
accessManagementStack.node.addDependency(sharedInfrastructureStack);

const auditLogDepositorStack = new AuditLogDepositorStack(tenantApp, 'AuditLogDepositor', {
	stackName: tenantStackName('auditLogDepositor'),
	description: tenantStackDescription('AuditLogDepositor', false),
	env,
	tenantId,
	environment,
	tags,
	auditLogFirehoseFlushTimeInSeconds
});
auditLogDepositorStack.node.addDependency(sharedInfrastructureStack);

const calculatorStack = new CalculatorApiStack(tenantApp, 'Calculator', {
	stackName: tenantStackName('calculator'),
	description: tenantStackDescription('Calculator', false),
	env,
	tenantId,
	environment,
	caCert: sifCertificate,
	minScaling,
	maxScaling,
	includeCaml,
	decimalPrecision,
	tags
});
calculatorStack.node.addDependency(sharedInfrastructureStack, auditLogDepositorStack);


const referenceDatasetsApiStack = new ReferenceDatasetsApiStack(tenantApp, 'ReferenceDatasets', {
	stackName: tenantStackName('referenceDatasets'),
	description: tenantStackDescription('ReferenceDatasets', false),
	env,
	tenantId,
	environment,
	enableDeleteResource,
	permittedOutgoingTenantPaths,
	externallySharedGroupIds,
	tags
});
referenceDatasetsApiStack.node.addDependency(sharedInfrastructureStack);

const impactsApiStack = new ImpactsApiStack(tenantApp, 'Impacts', {
	stackName: tenantStackName('impacts'),
	description: tenantStackDescription('Impacts', false),
	env,
	tenantId,
	environment,
	enableDeleteResource,
	permittedOutgoingTenantPaths,
	externallySharedGroupIds,
	tags
});
impactsApiStack.node.addDependency(sharedInfrastructureStack);

const pipelineApiStack = new PipelineApiStack(tenantApp, 'Pipelines', {
	stackName: tenantStackName('pipelines'),
	description: tenantStackDescription('Pipelines', false),
	env,
	tenantId,
	environment,
	enableDeleteResource,
	tags
});
pipelineApiStack.node.addDependency(sharedInfrastructureStack);

const calculationApiStack = new CalculationApiStack(tenantApp, 'Calculations', {
	stackName: tenantStackName('calculations'),
	description: tenantStackDescription('Calculations', false),
	env,
	tenantId,
	environment,
	enableDeleteResource,
	permittedOutgoingTenantPaths,
	externallySharedGroupIds,
	tags
});
calculationApiStack.node.addDependency(sharedInfrastructureStack);

// Connectors

const sifConnectorStack = new SifConnectorStack(tenantApp, 'sifConnector', {
	stackName: tenantStackName('sifConnector'),
	description: tenantStackDescription('sifConnector', false),
	env,
	tenantId,
	environment,
	connectorName: sifConnectorName,
	tags
});
sifConnectorStack.node.addDependency(pipelineApiStack);

const csvConnectorStack = new CsvConnectorStack(tenantApp, 'csvConnector', {
	stackName: tenantStackName('csvConnector'),
	description: tenantStackDescription('csvConnector', false),
	env,
	tenantId,
	environment,
	connectorName: csvConnectorName,
	tags
});
csvConnectorStack.node.addDependency(pipelineApiStack);

const cleanRoomsConnectorStack = new CleanRoomsConnectorStack(tenantApp, 'cleanRoomsConnector', {
	stackName: tenantStackName('cleanRoomsConnector'),
	description: tenantStackDescription('cleanRoomsConnector', false),
	env,
	tenantId,
	environment,
	connectorName: cleanRoomsConnectorName,
	tags
});
cleanRoomsConnectorStack.node.addDependency(pipelineApiStack);

const kinesisConnectorStack = new KinesisConnectorStack(tenantApp, 'kinesisConnector', {
	stackName: tenantStackName('kinesisConnector'),
	description: tenantStackDescription('kinesisConnector', false),
	env,
	tenantId,
	environment,
	connectorName: kinesisConnectorName
});
kinesisConnectorStack.node.addDependency(pipelineApiStack);

const pipelineProcessorsStack = new PipelineProcessorsApiStack(tenantApp, 'PipelineProcessors', {
	stackName: tenantStackName('pipelineProcessors'),
	description: tenantStackDescription('PipelineProcessors', false),
	env,
	tenantId,
	environment,
	csvConnectorName,
	caCert: sifCertificate,
	downloadAuditFileParallelLimit,
	metricStorage,
	auditVersion,
	tags,
	triggerMetricAggregations,
	auditLogWaitTimeSeconds: auditLogFirehoseFlushTimeInSeconds * 2
});
pipelineProcessorsStack.node.addDependency(sharedInfrastructureStack);
pipelineProcessorsStack.node.addDependency(calculatorStack);
pipelineProcessorsStack.node.addDependency(kinesisConnectorStack);
