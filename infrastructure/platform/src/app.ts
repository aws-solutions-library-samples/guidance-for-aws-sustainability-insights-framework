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
import { SharedPlatformInfrastructureStack } from './shared/sharedPlatform.stack.js';
import { AwsSolutionsChecks } from 'cdk-nag';
import { getOrThrow } from './shared/stack.utils.js';
import { Aspects } from 'aws-cdk-lib';
import { InstanceType } from '@aws-cdk/aws-sagemaker-alpha';

const app = new cdk.App();

// mandatory requirements
const environment = getOrThrow(app, 'environment');

// optional requirements to launch, default the maxCapacity for aurora serverless v2 to 16
const maxClusterCapacity = (app.node.tryGetContext('maxClusterCapacity') as number) ?? 16;
const minClusterCapacity = (app.node.tryGetContext('minClusterCapacity') as number) ?? 1;
const includeVpnClient = (app.node.tryGetContext('includeVpnClient') ?? 'false') === 'true';
const clusterDeletionProtection = (app.node.tryGetContext('clusterDeletionProtection') ?? 'true') === 'true';
const deleteBucket = (app.node.tryGetContext('deleteBucket') ?? 'false') === 'true';
const rdsConcurrencyLimit = (app.node.tryGetContext('rdsConcurrencyLimit') as number) ?? 10;

// optional requirement to specify your own image registry
const repositoryName = app.node.tryGetContext('repositoryName');
const repositoryArn = app.node.tryGetContext('repositoryArn');
const imageTag = app.node.tryGetContext('imageTag');

const includeCaml = (app.node.tryGetContext('includeCaml') ?? 'false') === 'true';
// optional requirement to specify your CaML model artifact
const camlArtifactBucket = app.node.tryGetContext('camlArtifactBucket');
const camlArtifactKey = app.node.tryGetContext('camlArtifactKey');
// optional requirement to specify Hugging Face container tag
const camlContainerTag = app.node.tryGetContext('camlContainerTag') ?? '1.13.1-transformers4.26.0-gpu-py39-cu117-ubuntu20.04';
// optional requirement to specify Hugging Face sentence-transformers/all-mpnet-base-v2 model repository hash
const camlRepositoryHash = app.node.tryGetContext('camlRepositoryHash') ?? 'bd44305fd6a1b43c16baf96765e2ecb20bca8e1d';
// optimal requirement to specify SageMake instance type for CaML inference
const camlInstanceType = app.node.tryGetContext('camlInstanceType') ?? InstanceType.G4DN_XLARGE;

let certArn, clientArn;

if (includeVpnClient) {
	certArn = getOrThrow(app, 'certArn');
	clientArn = getOrThrow(app, 'clientArn');
}

// tags the entire tenant with cost allocation tags
cdk.Tags.of(app).add('sif:environment', environment);

Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));

const stackNamePrefix = `sif-shared-${environment}`;

const stackName = (suffix: string) => `${stackNamePrefix}-${suffix}`;
const tenantStackDescription = (moduleName: string) => `Infrastructure for ${moduleName} module -- Guidance for Sustainability Insights Framework on AWS (SO9161)`;

new SharedPlatformInfrastructureStack(app, 'SharedPlatform', {
	stackName: stackName('platform'),
	description: tenantStackDescription('SharedPlatform'),
	environment,
	minClusterCapacity: minClusterCapacity,
	maxClusterCapacity: maxClusterCapacity,
	clusterDeletionProtection: clusterDeletionProtection,
	vpnOptions: includeVpnClient ? { certArn, clientArn } : undefined,
	camlOptions: includeCaml ? { camlArtifactBucket, camlArtifactKey, camlContainerTag, camlRepositoryHash, camlInstanceType } : undefined,
	deleteBucket,
	rdsConcurrencyLimit,
	repositoryName,
	repositoryArn,
	imageTag,

});
