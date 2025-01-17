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

import { Stack, StackProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import { PipelineProcessors } from './pipelineProcessors.construct.js';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { userPoolIdParameter } from '../shared/cognito.construct.js';
import { eventBusNameParameter } from '../shared/eventbus.construct.js';
import { bucketNameParameter } from '../shared/s3.construct.js';
import {
	acquireLockSqsQueueArnParameter,
	environmentEventBusNameParameter,
	rdsProxyArnParameter,
	rdsProxySecurityGroupParameter,
	rdsProxyWriterEndpointParameter,
	releaseLockSqsQueueArnParameter,
	vpcIdParameter
} from '../shared/sharedTenant.stack.js';
import { tenantDatabaseNameParameter, tenantDatabaseUsernameParameter } from '../shared/auroraSeeder.construct.js';
import { NagSuppressions } from 'cdk-nag';
import {
	accessManagementApiFunctionNameParameter,
	auditLogDepositorDatabaseNameParameter,
	auditLogDepositorTableNameParameter,
	calculatorFunctionNameParameter,
	impactsApiFunctionNameParameter,
	pipelineProcessorApiFunctionNameParameter,
	pipelinesApiFunctionNameParameter,
	referenceDatasetsApiFunctionNameParameter
} from '../shared/ssm.construct.js';
import { kmsKeyArnParameter } from '../shared/kms.construct.js';
import { calculatorActivityInsertQueueArnParameter } from '../calculator/calculator.construct.js';
import { ResourceApiBase } from '../shared/resourceApiBase.construct.js';
import { kinesisConnectorTemplateAssetBucketParameter, kinesisConnectorTemplateAssetKeyParameter } from '../connectors/kinesis.construct.js';

export type PipelineProcessorsStackProperties = StackProps & {
	tenantId: string;
	environment: string;
	caCert: string;
	downloadAuditFileParallelLimit: number;
	csvConnectorName: string;
	metricStorage: string;
	auditVersion: string;
	triggerMetricAggregations: boolean;
	auditLogWaitTimeSeconds: number;
};

export class PipelineProcessorsApiStack extends Stack {
	constructor(scope: Construct, id: string, props: PipelineProcessorsStackProperties) {
		super(scope, id, props);

		const accessManagementApiFunctionName = StringParameter.fromStringParameterAttributes(this, 'accessManagementApiFunctionName', {
			parameterName: accessManagementApiFunctionNameParameter(props.tenantId, props.environment),
			simpleName: false
		}).stringValue;

		const calculatorFunctionName = StringParameter.fromStringParameterAttributes(this, 'calculatorFunctionName', {
			parameterName: calculatorFunctionNameParameter(props.tenantId, props.environment),
			simpleName: false,
		}).stringValue;

		const kmsKeyArn = StringParameter.fromStringParameterAttributes(this, 'kmsKeyArn', {
			parameterName: kmsKeyArnParameter(props.tenantId, props.environment),
			simpleName: false
		}).stringValue;

		const cognitoUserPoolId = StringParameter.fromStringParameterAttributes(this, 'userPoolId', {
			parameterName: userPoolIdParameter(props.tenantId, props.environment),
			simpleName: false,
		}).stringValue;

		const rdsProxyEndpoint = StringParameter.fromStringParameterAttributes(this, 'rdsProxyEndpoint', {
			parameterName: rdsProxyWriterEndpointParameter(props.environment),
			simpleName: false,
		}).stringValue;

		const eventBusName = StringParameter.fromStringParameterAttributes(this, 'eventBusName', {
			parameterName: eventBusNameParameter(props.tenantId, props.environment),
			simpleName: false,
		}).stringValue;

		const bucketName = StringParameter.fromStringParameterAttributes(this, 'bucketName', {
			parameterName: bucketNameParameter(props.tenantId, props.environment),
			simpleName: false,
		}).stringValue;

		const pipelineApiFunctionName = StringParameter.fromStringParameterAttributes(this, 'pipelineApiFunctionName', {
			parameterName: pipelinesApiFunctionNameParameter(props.tenantId, props.environment),
			simpleName: false,
		}).stringValue;

		const impactApiFunctionName = StringParameter.fromStringParameterAttributes(this, 'impactApiFunctionName', {
			parameterName: impactsApiFunctionNameParameter(props.tenantId, props.environment),
			simpleName: false,
		}).stringValue;

		const referenceDatasetApiFunctionName = StringParameter.fromStringParameterAttributes(this, 'referenceDatasetApiFunctionName', {
			parameterName: referenceDatasetsApiFunctionNameParameter(props.tenantId, props.environment),
			simpleName: false,
		}).stringValue;

		const vpcId = StringParameter.fromStringParameterAttributes(this, 'vpcId', {
			parameterName: vpcIdParameter(props.environment),
			simpleName: false,
		}).stringValue;

		const rdsProxySecurityGroupId = StringParameter.fromStringParameterAttributes(this, 'rdsProxySecurityGroupId', {
			parameterName: rdsProxySecurityGroupParameter(props.environment),
			simpleName: false,
		}).stringValue;

		const tenantDatabaseUsername = StringParameter.fromStringParameterAttributes(this, 'tenantDatabaseUsername', {
			parameterName: tenantDatabaseUsernameParameter(props.tenantId, props.environment),
			simpleName: false,
		}).stringValue;

		const tenantDatabaseName = StringParameter.fromStringParameterAttributes(this, 'tenantDatabaseName', {
			parameterName: tenantDatabaseNameParameter(props.tenantId, props.environment),
			simpleName: false,
		}).stringValue;

		const rdsProxyArn = StringParameter.fromStringParameterAttributes(this, 'rdsProxyArn', {
			parameterName: rdsProxyArnParameter(props.environment),
			simpleName: false,
		}).stringValue;

		const pipelineProcessorApiFunctionName = StringParameter.fromStringParameterAttributes(this, 'FunctionName', {
			parameterName: pipelineProcessorApiFunctionNameParameter(props.tenantId, props.environment),
			simpleName: false,
		}).stringValue;

		const auditLogsTableName = StringParameter.fromStringParameterAttributes(this, 'AuditLogsTableName', {
			parameterName: auditLogDepositorTableNameParameter(props.tenantId, props.environment),
			simpleName: false,
		}).stringValue;

		const auditLogsDatabaseName = StringParameter.fromStringParameterAttributes(this, 'AuditLogsDatabaseName', {
			parameterName: auditLogDepositorDatabaseNameParameter(props.tenantId, props.environment),
			simpleName: false,
		}).stringValue;

		const acquireLockSqsQueueArn = StringParameter.fromStringParameterAttributes(this, 'AcquireLockSqsQueueArn', {
			parameterName: acquireLockSqsQueueArnParameter(props.environment),
			simpleName: false,
		}).stringValue;

		const releaseLockSqsQueueArn = StringParameter.fromStringParameterAttributes(this, 'ReleaseLockSqsQueueArn', {
			parameterName: releaseLockSqsQueueArnParameter(props.environment),
			simpleName: false,
		}).stringValue;

		const environmentEventBusName = StringParameter.fromStringParameterAttributes(this, 'EnvironmentEventBusName', {
			parameterName: environmentEventBusNameParameter(props.environment),
			simpleName: false,
		}).stringValue;

		const activityInsertQueueArn = StringParameter.fromStringParameterAttributes(this, 'activityInsertQueueArn', {
			parameterName: calculatorActivityInsertQueueArnParameter(props.tenantId, props.environment),
			simpleName: false,
		}).stringValue;

		const kinesisTemplateBucket = StringParameter.fromStringParameterAttributes(this, 'kinesisTemplateBucket', {
			parameterName: kinesisConnectorTemplateAssetBucketParameter(props.tenantId, props.environment),
			simpleName: false,
		}).stringValue;

		const kinesisTemplateKey = StringParameter.fromStringParameterAttributes(this, 'kinesisTemplateKey', {
			parameterName: kinesisConnectorTemplateAssetKeyParameter(props.tenantId, props.environment),
			simpleName: false,
		}).stringValue;

		const base = new ResourceApiBase(this, 'ResourceApiBase', {
			tenantId: props.tenantId,
			environment: props.environment,
			moduleName: 'pipelineProcessorsV2',
			eventBusName,
			timeToLiveAttribute: 'ttl',
			auth: {
				accessManagementApiFunctionName,
			},
			queue: {
				moduleSqsLambdaLocation: '../../../../typescript/packages/apps/pipeline-processors/src/lambda_messaging_service_sqs.ts',
				pnpmLockFileLocation: '../../../../common/config/rush/pnpm-lock.yaml',
			},
		});

		const module = new PipelineProcessors(this, 'PipelineProcessors', {
			...props,
			acquireLockSqsQueueArn,
			releaseLockSqsQueueArn,
			accessManagementApiFunctionName,
			pipelineApiFunctionName,
			impactApiFunctionName,
			referenceDatasetApiFunctionName,
			pipelineProcessorApiFunctionName,
			cognitoUserPoolId,
			eventBusName,
			environmentEventBusName,
			bucketName,
			rdsProxyEndpoint,
			rdsProxySecurityGroupId,
			tenantDatabaseUsername,
			vpcId,
			tenantDatabaseName,
			rdsProxyArn,
			auditLogWaitTimeSeconds: props.auditLogWaitTimeSeconds,
			caCert: props.caCert,
			kmsKeyArn,
			calculatorFunctionName: `${calculatorFunctionName}:live`,
			downloadAuditFileParallelLimit: props.downloadAuditFileParallelLimit,
			csvConnectorName: props.csvConnectorName,
			metricStorage: props.metricStorage,
			auditLogsTableName,
			auditLogsDatabaseName,
			activityInsertQueueArn,
			triggerMetricAggregations: props.triggerMetricAggregations,
			tableName: base.tableName,
			workerQueueArn: base.workerQueueArn,
			kinesisTemplateBucket,
			kinesisTemplateKey
		});

		module.node.addDependency(base);

		NagSuppressions.addResourceSuppressionsByPath(this, [
				'/PipelineProcessors/LogRetentionaae0aa3c5b4d4f87b02d85b201efdd8a/ServiceRole/Resource'
			],
			[
				{
					id: 'AwsSolutions-IAM4',
					appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'],
					reason: 'This policy attached to the role is generated by CDK.'

				},
				{
					id: 'AwsSolutions-IAM5',
					appliesTo: ['Resource::*'],
					reason: 'The resource condition in the IAM policy is generated by CDK, this only applies to logs:DeleteRetentionPolicy and logs:PutRetentionPolicy actions.'

				}],
			true);
	}
}
