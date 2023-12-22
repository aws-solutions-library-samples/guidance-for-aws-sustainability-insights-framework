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


import { Construct } from 'constructs';
import path from 'path';
import { fileURLToPath } from 'url';
import { AssetHashType, BundlingOutput, CustomResource, DockerImage } from 'aws-cdk-lib';
import { Asset } from 'aws-cdk-lib/aws-s3-assets';
import { execSync, ExecSyncOptions } from 'child_process';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface KinesisConnectorConstructProperties {
	tenantId: string;
	environment: string;
	bucketName: string;
	connectorName: string;
	customResourceProviderToken: string;
}

export const kinesisConnectorApplicationAssetBucketParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/connectors/kinesis/application/bucket`;
export const kinesisConnectorApplicationAssetKeyParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/connectors/kinesis/application/key`;
export const kinesisConnectorTemplateAssetBucketParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/connectors/kinesis/template/bucket`;
export const kinesisConnectorTemplateAssetKeyParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/connectors/kinesis/template/key`;

export class KinesisConnector extends Construct {

	constructor(scope: Construct, id: string, props: KinesisConnectorConstructProperties) {
		super(scope, id);

		const execOptions: ExecSyncOptions = { stdio: ['ignore', process.stderr, 'inherit'] };
		const repoPath = path.join(__dirname, '../../../../');

		const templateAsset = new Asset(this, 'KinesisConnectorTemplateAsset', {
			path: repoPath,
			assetHashType: AssetHashType.SOURCE,
			bundling: {
				image: DockerImage.fromRegistry('public.ecr.aws/amazonlinux/amazonlinux:2023.2.20231011.0'),
				outputType: BundlingOutput.AUTO_DISCOVER,
				local: {
					tryBundle(outputDir: string): boolean {
						try {
							/*
								* semgrep issue https://sg.run/l2lo
								* Ignore reason: there is no risk of command injection in this context
								*/
							// nosemgrep
							execSync(`cp kinesisConnector.yaml ${outputDir}/kinesisConnector.yaml.zip`, {
								...execOptions,
								cwd: path.join(repoPath, 'infrastructure/cloudformation'),
							});
						} catch (err) {
							console.log(`Error:${(err as Error).message}`);
							return false;
						}
						return true;
					},
				}
			},
		});

		const asset = new Asset(this, 'BundleAsset', {
			path: `${repoPath}/typescript/packages/connectors/kinesis/dist/cjs`,
		});

		new StringParameter(this, 'KinesisConnectorAssetBucketParameter', {
			parameterName: kinesisConnectorApplicationAssetBucketParameter(props.tenantId, props.environment),
			stringValue: asset.s3BucketName,
		});

		new StringParameter(this, 'KinesisConnectorAssetKeyParameter', {
			parameterName: kinesisConnectorApplicationAssetKeyParameter(props.tenantId, props.environment),
			stringValue: asset.s3ObjectKey,
		});

		new StringParameter(this, 'KinesisConnectorTemplateAssetBucketParameter', {
			parameterName: kinesisConnectorTemplateAssetBucketParameter(props.tenantId, props.environment),
			stringValue: templateAsset.s3BucketName,
		});

		new StringParameter(this, 'KinesisConnectorTemplateAssetKeyParameter', {
			parameterName: kinesisConnectorTemplateAssetKeyParameter(props.tenantId, props.environment),
			stringValue: templateAsset.s3ObjectKey,
		});

		const newConnectorRequest = {
			'description': 'this connector uses a kinesis datastream to ingest stream data and convert it to a file upload into SIF compatible pipeline format',
			'name': props.connectorName,
			'type': 'input',
			'isManaged': true,
			'parameters': [
				{
					'name': 'useExistingDataStream',
					'description': 'boolean value if true you must also supply dataStreamArn otherwise one will be created with the stack.',
					'defaultValue': false,
					'required': true
				}, {
					'name': 'kinesisDataStreamArn',
					'description': 'if provided, the connector will make use of the provided dataStream else it will create its own.',
					'required': false
				},
				{
					'name': 'bufferSize',
					'description': 'The buffered record size in MB, must be between 0.2 - 3 .',
					'defaultValue': 0.2,
					'required': false
				},
				{
					'name': 'bufferInterval',
					'description': 'The buffered record time in seconds, must be between 60 - 900 .',
					'defaultValue': 60,
					'required': false
				},
				{
					'name': 'handlebarsTemplate',
					'description': 'template use by handelbars to transform the raw request.'
				},
				{
					'name': 'deploymentMethod',
					'description': 'The deployment method to be used for deploying the connector infrastructure values can be sif|lambda|manual',
					'defaultValue': 'managed-pipeline',
					'required': true
				},
				{
					'name': 'deploymentStatus',
					'description': 'The deployment status of the connector can be any of deployed|filed',
				},
				{
					'name': 'blockDeploymentForUpdates',
					'description': 'if set to true will block any stack deployments for pipeline updates',
					'defaultValue': false,
					'required': true
				}

			]
		};

		new CustomResource(this, 'CustomResourceConnectorSeeder', {
			serviceToken: props.customResourceProviderToken,
			resourceType: 'Custom::ConnectorSeeder',
			properties: {
				uniqueToken: Date.now(),
				connectors: [newConnectorRequest]
			}
		});

	}
}
