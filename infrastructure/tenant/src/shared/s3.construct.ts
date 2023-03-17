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
import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { BlockPublicAccess, Bucket, BucketEncryption } from 'aws-cdk-lib/aws-s3';
import * as ssm from 'aws-cdk-lib/aws-ssm';

export interface S3ConstructProperties {
	tenantId: string;
	environment: string;
	deleteBucket?: boolean;
	accessLogBucketName: string;
}

export const bucketNameParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/shared/bucketName`;

export class S3 extends Construct {
	constructor(scope: Construct, id: string, props: S3ConstructProperties) {
		super(scope, id);
		const accountId = cdk.Stack.of(this).account;
		const region = cdk.Stack.of(this).region;
		const bucketName = `sif-${props.tenantId}-${props.environment}-${accountId}-${region}`;
		const namePrefix = `sif-${props.tenantId}-${props.environment}`;
		const accessLogBucket = Bucket.fromBucketName(this, 'AccessLogBucket', props.accessLogBucketName);

		const s3 = new Bucket(this, 'Bucket', {
			bucketName: bucketName,
			encryption: BucketEncryption.S3_MANAGED,
			serverAccessLogsBucket: accessLogBucket,
			serverAccessLogsPrefix: `${namePrefix}/`,
			eventBridgeEnabled: true,
			versioned: !props.deleteBucket,
			removalPolicy: props.deleteBucket ? RemovalPolicy.DESTROY : RemovalPolicy.RETAIN,
			autoDeleteObjects: props.deleteBucket,
			blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
			enforceSSL: true,
			intelligentTieringConfigurations: [
				{
					name: 'archive',
					archiveAccessTierTime: Duration.days(90),
					deepArchiveAccessTierTime: Duration.days(180)
				}
			],
		});

		new ssm.StringParameter(this, 'bucketNameParameter', {
			parameterName: bucketNameParameter(props.tenantId, props.environment),
			stringValue: s3.bucketName
		});
	}
}
