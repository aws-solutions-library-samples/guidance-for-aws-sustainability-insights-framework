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

import { ContainerImage, Endpoint, EndpointConfig, InstanceType, Model, ModelData } from '@aws-cdk/aws-sagemaker-alpha';
import { Construct } from 'constructs';
import { Asset } from 'aws-cdk-lib/aws-s3-assets';
import { execSync, ExecSyncOptions } from 'child_process';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import path from 'path';
import { fileURLToPath } from 'url';
import { Stack } from 'aws-cdk-lib';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { NagSuppressions } from 'cdk-nag';
import * as ssm from 'aws-cdk-lib/aws-ssm';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface CamlConstructProperties {
	environment: string;
	camlArtifactBucket: string;
	camlArtifactKey: string;
	camlContainerTag: string,
	camlRepositoryHash: string,
	camlInstanceType: InstanceType
}

export const camlInferenceEndpointNameParameter = (environment: string) => `/sif/shared/${environment}/caml/inferenceEndpointName`;

export class Caml extends Construct {
	constructor(scope: Construct, id: string, props: CamlConstructProperties) {
		super(scope, id);
		const namePrefix = `sif-${props.environment}`;
		let containerModel;
		if (props.camlArtifactBucket && props.camlArtifactKey) {
			const bucket = Bucket.fromBucketName(this, 'CamlArtifactBucket', props.camlArtifactBucket);
			containerModel = ModelData.fromBucket(bucket, props.camlArtifactKey);
		} else {
			const camlPath = path.join(__dirname, '../../../../python/apps/caml');
			const execOptions: ExecSyncOptions = { stdio: ['ignore', process.stderr, 'inherit'] };
			new Asset(this, 'BundledAsset', {
				path: `${camlPath}`,
				bundling: {
					image: Runtime.NODEJS_18_X.bundlingImage,
					local: {
						tryBundle(outputDir: string): boolean {
							try {
								// clone the model locally
								execSync(`[ "$(ls -A ${camlPath}/model)" ] && echo "Model folder is not empty" || git clone https://huggingface.co/sentence-transformers/all-mpnet-base-v2 ${camlPath}/model && cd model && git checkout ${props.camlRepositoryHash}`, {
									...execOptions,
									cwd: camlPath,
								});
								// copy our custom inference
								execSync(`mkdir -p  ./model/code && cp inference.py naics_codes.pkl requirements.txt ./model/code`, {
									...execOptions,
									cwd: camlPath,
								});
								execSync(`rm -f model.tar.gz`, {
									...execOptions,
									cwd: `${camlPath}/model`,
								});
								// tar our model and custom code
								execSync(`tar zcvf model.tar.gz *`, {
									...execOptions,
									cwd: `${camlPath}/model`,
								});
								/*
								 * semgrep issue https://sg.run/l2lo
								 * Ignore reason: there is no risk of command injection in this context
								*/
								// nosemgrep
								execSync(`cp model.tar.gz ${outputDir}`, {
									...execOptions,
									cwd: `${camlPath}/model`,
								});
							} catch (err) {
								return false;
							}
							return true;
						},
					},
				},
			});
			containerModel = ModelData.fromAsset(`${camlPath}/model/model.tar.gz`);
		}

		const repositoryName = 'huggingface-pytorch-inference';
		const image = ContainerImage.fromDlc(repositoryName, props.camlContainerTag);

		const camlContainerModel = new Model(this, 'CamlContainerModel', {
			containers: [
				{
					image: image,
					modelData: containerModel,
					environment: {
						'NAICS_CODES_FILE_PATH': '/opt/ml/model/code/naics_codes.pkl',
						'SAGEMAKER_CONTAINER_LOG_LEVEL': '20',
						'SAGEMAKER_REGION': Stack.of(this).region
					}
				}
			]
		});

		const endpointConfig = new EndpointConfig(this, 'CamlEndpointConfig', {
			instanceProductionVariants: [{
				model: camlContainerModel,
				variantName: 'AllTraffic',
				instanceType: props.camlInstanceType
			}]
		});

		const endpoint = new Endpoint(this, 'CamlEndpoint', { endpointConfig, endpointName: `${namePrefix}-caml-endpoint` });

		new ssm.StringParameter(this, 'camlInferenceEndpointNameParameter', {
			parameterName: camlInferenceEndpointNameParameter(props.environment),
			stringValue: endpoint.endpointName
		});

		const suppressionList = [{
			id: 'AwsSolutions-IAM4',
			appliesTo: [
				'Policy::arn:<AWS::Partition>:iam::aws:policy/AmazonSageMakerFullAccess'],
			reason: 'This policy is generated @aws-cdk/aws-sagemaker-alpha construct.'
		},
			{
				id: 'AwsSolutions-IAM5',
				appliesTo: ['Resource::*', 'Action::s3:GetBucket*', 'Action::s3:GetObject*', 'Action::s3:List*'],
				reason: 'This policy is generated @aws-cdk/aws-sagemaker-alpha construct.'
			}];

		if (props.camlArtifactBucket) {
			suppressionList.push({
				id: 'AwsSolutions-IAM5',
				appliesTo: [`Resource::arn:<AWS::Partition>:s3:::${props.camlArtifactBucket}/*`],
				reason: 'This policy is generated @aws-cdk/aws-sagemaker-alpha construct.'
			});
		} else {
			suppressionList.push({
				id: 'AwsSolutions-IAM5',
				appliesTo: [`Resource::arn:<AWS::Partition>:s3:::cdk-hnb659fds-assets-<AWS::AccountId>-<AWS::Region>/*`],
				reason: 'This policy is generated @aws-cdk/aws-sagemaker-alpha construct.'
			});
		}

		NagSuppressions.addResourceSuppressions([camlContainerModel],
			suppressionList,
			true);
	}
}
