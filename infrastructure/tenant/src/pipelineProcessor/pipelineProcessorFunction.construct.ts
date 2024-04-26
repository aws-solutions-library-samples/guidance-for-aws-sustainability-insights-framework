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

import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import path from 'path';
import { Runtime, Tracing } from 'aws-cdk-lib/aws-lambda';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { getLambdaArchitecture } from '@sif/cdk-common';
import type { ISecurityGroup, IVpc, SubnetSelection } from 'aws-cdk-lib/aws-ec2';
import type { Construct } from 'constructs';
import type { Duration } from 'aws-cdk-lib';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface PipelineProcessorFunctionProperties {
	/**
	 * Lambda properties
	 */
	description: string;
	functionName: string;
	entry: string;
	memorySize: number;
	timeout: Duration;
	environment: { [key: string]: string };
	/**
	 * VPC property
	 */
	vpc?: IVpc;
	vpcSubnets?: SubnetSelection;
	securityGroups?: ISecurityGroup[];
}


/**
 * Construct that creates PipelineProcessor Function with some default values
 */
export class PipelineProcessorFunction extends NodejsFunction {
	constructor(scope: Construct, id: string, props: PipelineProcessorFunctionProperties) {
		super(scope, id, {
			entry: props.entry,
			description: props.description,
			functionName: props.functionName,
			runtime: Runtime.NODEJS_18_X,
			tracing: Tracing.ACTIVE,
			logRetention: RetentionDays.ONE_WEEK,
			memorySize: props.memorySize,
			timeout: props.timeout,
			environment: props.environment,
			vpc: props.vpc,
			vpcSubnets: props.vpcSubnets,
			securityGroups: props.securityGroups,
			bundling: {
				minify: true,
				format: OutputFormat.ESM,
				target: 'node18.16',
				sourceMap: false,
				sourcesContent: false,
				banner: 'import { createRequire } from \'module\';const require = createRequire(import.meta.url);import { fileURLToPath } from \'url\';import { dirname } from \'path\';const __filename = fileURLToPath(import.meta.url);const __dirname = dirname(__filename);',
				externalModules: ['aws-sdk', 'pg-native']
			},
			depsLockFilePath: path.join(__dirname, '../../../../common/config/rush/pnpm-lock.yaml'),
			architecture: getLambdaArchitecture(scope)
		});
	}
}

