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
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import path from 'path';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Runtime, Tracing } from 'aws-cdk-lib/aws-lambda';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Duration } from 'aws-cdk-lib';
import { fileURLToPath } from 'url';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as cdk from 'aws-cdk-lib';
import { DatabaseSecret } from 'aws-cdk-lib/aws-rds';
import { HostedRotation } from 'aws-cdk-lib/aws-secretsmanager';
import { NagSuppressions } from 'cdk-nag';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface AuroraSeederConstructProperties {
	tenantId: string;
	environment: string;
}

export const tenantSecretNameParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/shared/tenantSecretName`;
export const tenantSecretArnParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/shared/tenantSecretArn`;
export const tenantDatabaseNameParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/shared/tenantDatabaseName`;
export const tenantDatabaseUsernameParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/shared/tenantDatabaseUsername`;
export const activityTableParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/shared/activityTable`;
export const activityStringValueTableParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/shared/activityStringValueTable`;
export const activityNumberValueTableParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/shared/activityNumberValueTable`;
export const activityDateTimeValueTableParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/shared/activityDateTimeValueTable`;
export const activityBooleanValueTableParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/shared/activityBooleanValueTable`;
export const customResourceProviderTokenParameter = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/shared/customResourceProviderToken`;

export class AuroraSeeder extends Construct {

	public tenantSecret: DatabaseSecret;
	public tenantDatabaseUsername: string;

	constructor(scope: Construct, id: string, props?: AuroraSeederConstructProperties) {
		super(scope, id);
		const namePrefix = `sif-${props.tenantId}-${props.environment}`;

		// table name
		const activityTable = 'Activity';
		const activityStringValueTable = 'ActivityStringValue';
		const activityNumberValueTable = 'ActivityNumberValue';
		const activityDateTimeValueTable = 'ActivityDateTimeValue';
		const activityBooleanValueTable = 'ActivityBooleanValue';

		// need to do this because of postgresql limitation
		this.tenantDatabaseUsername = `${namePrefix}-user`.replaceAll('-', '_');
		const databaseName = `${props.tenantId}-${props.environment}`.replace(/[^a-zA-Z\d\s]/g, '');

		this.tenantSecret = new DatabaseSecret(this, 'TenantDatabaseSecret', { username: this.tenantDatabaseUsername, secretName: `${namePrefix}-database-secret` });

		this.tenantSecret.addRotationSchedule('RotationSchedule', {
			hostedRotation: HostedRotation.postgreSqlSingleUser(
				{
					functionName: `${namePrefix}-secret-rotation`
				}
			)
		});

		// Below section of the legacy custom resource that is replaced with the custom resource specified
		// in calculator stack
		const customResourceLambda = new NodejsFunction(this, 'AuroraSeederLambda', {
			functionName: `${namePrefix}-database-seeder`,
			description: `rds schema and user seeder: Tenant ${props.tenantId}`,
			entry: path.join(__dirname, './customResources/databaseSeeder.customResource.ts'),
			runtime: Runtime.NODEJS_16_X,
			tracing: Tracing.ACTIVE,
			memorySize: 256,
			logRetention: RetentionDays.ONE_WEEK,
			timeout: Duration.minutes(5),
			bundling: {
				minify: true,
				format: OutputFormat.ESM,
				target: 'node16.15',
				sourceMap: false,
				sourcesContent: false,
				banner: 'import { createRequire } from \'module\';const require = createRequire(import.meta.url);import { fileURLToPath } from \'url\';import { dirname } from \'path\';const __filename = fileURLToPath(import.meta.url);const __dirname = dirname(__filename);',
				externalModules: ['aws-sdk', 'pg-native']
			},
			environment: {},
			depsLockFilePath: path.join(__dirname, '../../../../common/config/rush/pnpm-lock.yaml')
		});

		const customResourceProvider = new cr.Provider(this, 'CustomResourceProvider', {
			onEventHandler: customResourceLambda
		});

		new cdk.CustomResource(this, 'CustomResourceAuroraSeeder', {
			serviceToken: customResourceProvider.serviceToken,
			properties: {
				uniqueToken: Date.now()
			}
		});

		NagSuppressions.addResourceSuppressions(customResourceProvider, [
			{
				id: 'AwsSolutions-IAM4',
				reason: 'This only contains the policy the create and insert log to log group.',
				appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole']
			},
			{
				id: 'AwsSolutions-IAM5',
				reason: 'This only applies to the seeder lambda defined in this construct and its versions.',
				appliesTo: ['Resource::<AuroraSeederAuroraSeederLambda29C2B97F.Arn>:*']
			},
			{
				id: 'AwsSolutions-L1',
				reason: 'The cr.Provider library is not maintained by this project.'
			}
		], true);
		// 	End of legacy code

		NagSuppressions.addResourceSuppressions([customResourceLambda], [
			{
				id: 'AwsSolutions-IAM4',
				reason: 'This only contains the policy the create and insert log to log group.',
				appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole']
			},
			{
				id: 'AwsSolutions-IAM4',
				reason: 'Lambda needs AWSLambdaVPCAccessExecutionRole to run inside VPC',
				appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole']
			},
			{
				id: 'AwsSolutions-IAM5',
				appliesTo: ['Resource::*'],
				reason: 'The resource condition in the IAM policy is generated by CDK, this only applies to xray:PutTelemetryRecords and xray:PutTraceSegments.'
			}
		], true);

		new ssm.StringParameter(this, 'tenantSecretNameParameter', {
			parameterName: tenantSecretNameParameter(props.tenantId, props.environment),
			stringValue: this.tenantSecret.secretName
		});

		new ssm.StringParameter(this, 'tenantSecretArnParameter', {
			parameterName: tenantSecretArnParameter(props.tenantId, props.environment),
			stringValue: this.tenantSecret.secretArn
		});

		new ssm.StringParameter(this, 'tenantDatabaseUsername', {
			parameterName: tenantDatabaseUsernameParameter(props.tenantId, props.environment),
			stringValue: this.tenantDatabaseUsername
		});

		new ssm.StringParameter(this, 'tenantDatabaseNameParameter', {
			parameterName: tenantDatabaseNameParameter(props.tenantId, props.environment),
			stringValue: databaseName
		});

		new ssm.StringParameter(this, 'activityTableParameter', {
			parameterName: activityTableParameter(props.tenantId, props.environment),
			stringValue: activityTable
		});

		new ssm.StringParameter(this, 'activityStringValueTableParameter', {
			parameterName: activityStringValueTableParameter(props.tenantId, props.environment),
			stringValue: activityStringValueTable
		});

		new ssm.StringParameter(this, 'activityNumberValueTableParameter', {
			parameterName: activityNumberValueTableParameter(props.tenantId, props.environment),
			stringValue: activityNumberValueTable
		});

		new ssm.StringParameter(this, 'activityDateTimeValueTableParameter', {
			parameterName: activityDateTimeValueTableParameter(props.tenantId, props.environment),
			stringValue: activityDateTimeValueTable
		});

		new ssm.StringParameter(this, 'activityBooleanValueTableParameter', {
			parameterName: activityBooleanValueTableParameter(props.tenantId, props.environment),
			stringValue: activityBooleanValueTable
		});
	}
}
