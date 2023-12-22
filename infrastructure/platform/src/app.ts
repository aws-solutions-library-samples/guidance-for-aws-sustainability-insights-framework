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
import { registerAllFacts, tryGetBooleanContext } from '@sif/cdk-common';
import path from 'path';
import { fileURLToPath } from 'url';
import * as fs from 'fs';
import shelljs from 'shelljs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = new cdk.App();

// mandatory requirements
const environment = getOrThrow(app, 'environment');


// optional requirements to launch, default the maxCapacity for aurora serverless v2 to 16
const maxClusterCapacity = (app.node.tryGetContext('maxClusterCapacity') as number) ?? 16;
const minClusterCapacity = (app.node.tryGetContext('minClusterCapacity') as number) ?? 1;
const includeVpnClient = tryGetBooleanContext(app, 'includeVpnClient', false);
const clusterDeletionProtection = tryGetBooleanContext(app, 'clusterDeletionProtection', true);
const deleteBucket = tryGetBooleanContext(app, 'deleteBucket', false);
const rdsConcurrencyLimit = (app.node.tryGetContext('rdsConcurrencyLimit') as number) ?? 10;

// optional requirement to specify your own image registry
const repositoryName = app.node.tryGetContext('repositoryName');
const repositoryArn = app.node.tryGetContext('repositoryArn');
const imageTag = app.node.tryGetContext('imageTag');

const includeCaml = tryGetBooleanContext(app, 'includeCaml', false);
// optional requirement to specify your CaML model artifact
const camlArtifactBucket = app.node.tryGetContext('camlArtifactBucket');
const camlArtifactKey = app.node.tryGetContext('camlArtifactKey');
// optional requirement to specify Hugging Face container tag
const camlContainerTag = app.node.tryGetContext('camlContainerTag') ?? '1.13.1-transformers4.26.0-gpu-py39-cu117-ubuntu20.04';
// optional requirement to specify Hugging Face sentence-transformers/all-mpnet-base-v2 model repository hash
const camlRepositoryHash = app.node.tryGetContext('camlRepositoryHash') ?? 'bd44305fd6a1b43c16baf96765e2ecb20bca8e1d';
// optimal requirement to specify SageMake instance type for CaML inference
const camlInstanceType = app.node.tryGetContext('camlInstanceType') ?? InstanceType.G4DN_XLARGE;

// user VPC config
const useExistingVpc = tryGetBooleanContext(app, 'useExistingVpc', false);

if (useExistingVpc && includeVpnClient) {
	throw new Error('It is not allowed to include a VPN client when deploying into an existing VPC (both "useExistingVpc" and "includeVpnClient" cannot be set at the same time).');
}

let userVpcId;
let userIsolatedSubnetIds;
let userPrivateSubnetIds;
if (useExistingVpc) {
	userVpcId = getOrThrow(app, 'existingVpcId');
	userIsolatedSubnetIds = getOrThrow(app, 'existingIsolatedSubnetIds').toString().split(',');
	userPrivateSubnetIds = getOrThrow(app, 'existingPrivateSubnetIds').toString().split(',');
}

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
const platformStackDescription = (moduleName: string) => `Infrastructure for ${moduleName} module`;

registerAllFacts();

const deployPlatform = (callerEnvironment?: {accountId?: string, region?: string}, camlModelArtifactPath?: string): void => {
	new SharedPlatformInfrastructureStack(app, 'SharedPlatform', {
		stackName: stackName('platform'),
		description: platformStackDescription('SharedPlatform'),
		environment,
		minClusterCapacity: minClusterCapacity,
		maxClusterCapacity: maxClusterCapacity,
		clusterDeletionProtection: clusterDeletionProtection,
		userVpcConfig: useExistingVpc ? { vpcId: userVpcId, isolatedSubnetIds: userIsolatedSubnetIds, privateSubnetIds: userPrivateSubnetIds, publicSubnetIds: [] } : undefined,
		vpnOptions: includeVpnClient ? { certArn, clientArn } : undefined,
		camlOptions: includeCaml ? { camlArtifactBucket, camlArtifactKey, camlContainerTag, camlInstanceType, camlModelArtifactPath } : undefined,
		deleteBucket,
		rdsConcurrencyLimit,
		repositoryName,
		repositoryArn,
		imageTag,
		env: {
			// The SIF_REGION environment variable is set by sif-cli when -r is specified
			region: process.env?.['SIF_REGION'] || callerEnvironment?.region,
			account: callerEnvironment?.accountId
		}
	});
};

const bundleCamlSageMakerModelArtifact = (): string | undefined => {
	const modelFile = 'model.tar.gz';
	const camlPath = path.join(__dirname, '../../../python/apps/caml');
	if (includeCaml && !camlArtifactBucket && !camlArtifactKey) {
		if (!fs.existsSync(`${camlPath}/model`)) {
			shelljs.exec(`git clone https://huggingface.co/sentence-transformers/all-mpnet-base-v2 ${camlPath}/model && cd model && git checkout ${camlRepositoryHash}`, { cwd: camlPath });
		}
		shelljs.exec(`mkdir -p  ./model/code && cp inference.py naics_codes.pkl requirements.txt ./model/code`, { cwd: camlPath });
		shelljs.exec(`rm -f model.tar.gz && tar zcvf ${modelFile} *`, { cwd: `${camlPath}/model` });
		return `${camlPath}/model/${modelFile}`;
	} else {
		console.log(`⎘ --- Skip bundling CaML model --- ⎘`);
		return undefined;
	}
};
const appendSifRepositoryMetadataToTags = () => {
	if (!fs.existsSync(`${__dirname}/predeploy.json`)) {
		throw new Error('Pre deployment file does not exist\n' +
		  'Make sure you run the cdk using npm script which will run the predeploy script automatically\n' +
		  'EXAMPLE\n' +
		  '$ npm run cdk deploy -- -e sampleEnvironment');
	}
	const { sifMetadata } = JSON.parse(fs.readFileSync(`${__dirname}/predeploy.json`, 'utf-8'));
	const { revision: gitRevision, tag: gitTag, branch: gitBranch, version: gitVersion } = sifMetadata;
	if (gitTag) {
		cdk.Tags.of(app).add('sif:gitTag', gitTag);
	}
	if (gitRevision) {
		cdk.Tags.of(app).add('sif:gitRevision', gitRevision);
	}
	if (gitBranch) {
		cdk.Tags.of(app).add('sif:gitBranch', gitBranch);
	}
	if (gitVersion) {
		cdk.Tags.of(app).add('sif:gitVersion', gitVersion);
	}
};
const getCallerEnvironment = (): {accountId?: string, region?:string} | undefined => {
	if (!fs.existsSync(`${__dirname}/predeploy.json`)) {
		throw new Error('Pre deployment file does not exist\n' +
		  'Make sure you run the cdk using npm script which will run the predeploy script automatically\n' +
		  'EXAMPLE\n' +
		  '$ npm run cdk deploy -- -e sampleEnvironment');
	}
	const { callerEnvironment } = JSON.parse(fs.readFileSync(`${__dirname}/predeploy.json`, 'utf-8'));
	return callerEnvironment;
};

appendSifRepositoryMetadataToTags();
deployPlatform(getCallerEnvironment(), bundleCamlSageMakerModelArtifact());




