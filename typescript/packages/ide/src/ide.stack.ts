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

import { Duration, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import { CfnDocument, CfnAssociation } from 'aws-cdk-lib/aws-ssm';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { Runtime, Tracing } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { CfnEnvironmentEC2 } from 'aws-cdk-lib/aws-cloud9';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { parse } from 'yaml';
import { Policy, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import * as cdk from 'aws-cdk-lib';
import * as cr from 'aws-cdk-lib/custom-resources';
import { OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';

export interface IdeStackProperties {
	environment: string;
	ownerArn: string;
	instanceType: string;
	repositoryUrl: string;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class IDEStack extends Stack {
	constructor(scope: Construct, id: string, props?: StackProps & IdeStackProperties) {
		super(scope, id, props);

		const installationFile = parse(fs.readFileSync(path.join(__dirname, './ssmDocuments/installation.yml'), 'utf-8'));

		const namePrefix = `sif-${props.environment}`;

		const documentName = `${namePrefix}-bootstrap-cloud9`;

		const installationDocument = new CfnDocument(this, 'InstallationDocument', {
			name: documentName,
			content: installationFile,
			documentFormat: 'YAML',
			documentType: 'Command',
		});

		const outputBucket = new Bucket(this, 'OutputBucket', {
			autoDeleteObjects: true,
			removalPolicy: RemovalPolicy.DESTROY,
		});

		const cloud9Instance = new CfnEnvironmentEC2(this, 'Cloud9Instance', {
			instanceType: props.instanceType,
			automaticStopTimeMinutes: 60,
			imageId: 'amazonlinux-2-x86_64',
			ownerArn: props.ownerArn,
			connectionType: 'CONNECT_SSM',
			repositories: [
				{
					pathComponent: 'sif',
					repositoryUrl: props.repositoryUrl,
				},
			],
			name: this.stackName,
			tags: [
				{ key: 'SSMBootstrap', value: 'Active' },
				{ key: 'Environment', value: 'AWS Example' },
			],
		});

		const association = new CfnAssociation(this, 'InstallationDocumentAssociation', {
			name: documentName,
			outputLocation: { s3Location: { outputS3BucketName: outputBucket.bucketName, outputS3KeyPrefix: 'bootstrap-output' } },
			targets: [{ key: 'tag:SSMBootstrap', values: ['Active'] }],
		});

		association.node.addDependency(installationDocument);

		const customResourceLambda = new NodejsFunction(this, 'CustomResourceLambda', {
			entry: path.join(__dirname, './customResources/checkAssociation.ts'),
			functionName: `${namePrefix}-checkSsmAssociation`,
			description: `SIF IDE Stack: Tenant ${props.environment}`,
			runtime: Runtime.NODEJS_18_X,
			tracing: Tracing.ACTIVE,
			timeout: Duration.minutes(15),
			bundling: {
				minify: true,
				format: OutputFormat.ESM,
				target: 'node18.16',
				sourceMap: false,
				sourcesContent: false,
				banner: 'import { createRequire } from \'module\';const require = createRequire(import.meta.url);import { fileURLToPath } from \'url\';import { dirname } from \'path\';const __filename = fileURLToPath(import.meta.url);const __dirname = dirname(__filename);',
				externalModules: ['aws-sdk'],
			},
			depsLockFilePath: path.join(__dirname, '../package.json'),
		});

		// 👇 create a policy statement
		const ssmPolicy = new PolicyStatement({
			actions: ['ssm:DescribeAssociationExecutions', 'ssm:DescribeAssociationExecutionTargets', 'ssm:SendCommand'],
			resources: ['*'],
		});

		const ec2Policy = new PolicyStatement({
			actions: ['ec2:DescribeInstances', 'ec2:ModifyVolume', 'ec2:DescribeVolumesModifications'],
			resources: ['*'],
		});

		// 👇 add the policy to the Function's role
		customResourceLambda.role?.attachInlinePolicy(
			new Policy(this, 'list-executions-policy', {
				statements: [ssmPolicy],
			})
		);

		customResourceLambda.role?.attachInlinePolicy(
			new Policy(this, 'describe-instances-policy', {
				statements: [ec2Policy],
			})
		);

		const customResourceProvider = new cr.Provider(this, 'CustomResourceProvider', {
			onEventHandler: customResourceLambda,
		});

		// Create a new custom resource consumer
		new cdk.CustomResource(this, 'CustomResourceWaitSsmAssociation', {
			serviceToken: customResourceProvider.serviceToken,
			properties: {
				associationId: association.attrAssociationId,
				instanceArn: cloud9Instance.attrArn,
			},
		});
	}
}
