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
import type { IFunction } from 'aws-cdk-lib/aws-lambda';
import { Choice, Condition, DefinitionBody, Fail, IStateMachine, LogLevel, StateMachine, Succeed, TaskInput, Wait, WaitTime } from 'aws-cdk-lib/aws-stepfunctions';
import { Construct } from 'constructs';
import type { Grant, IGrantable, IPrincipal } from 'aws-cdk-lib/aws-iam';
import { LambdaInvoke } from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { LogGroup } from 'aws-cdk-lib/aws-logs';
import { Duration, RemovalPolicy } from 'aws-cdk-lib';

export interface ReferenceDatasetStateMachineProperties {
	namePrefix: string;
	referenceDatasetCreationLambda: IFunction;
	referenceDatasetVerificationLambda: IFunction;
}

export class ReferenceDatasetStateMachine extends Construct {
	readonly stateMachineArn: string;
	readonly grantPrincipal: IPrincipal;
	private stateMachine: IStateMachine;

	constructor(scope: Construct, id: string, props: ReferenceDatasetStateMachineProperties) {
		super(scope, id);

		const waitForCreateReferenceDatasetsTask = new Wait(this, 'Wait For Create ReferenceDatasets', { time: WaitTime.duration(Duration.seconds(5)) });

		const referenceDatasetCreationTask = new LambdaInvoke(this, 'ReferenceDatasetCreationTask', {
			lambdaFunction: props.referenceDatasetCreationLambda,
			inputPath: '$',
			outputPath: '$.Payload'
		});

		const referenceDatasetVerificationTask = new LambdaInvoke(this, 'ReferenceDatasetVerificationTask', {
			lambdaFunction: props.referenceDatasetVerificationLambda,
			payload: TaskInput.fromObject({
				'status.$': '$.status',
				'referenceDatasetId.$': '$.referenceDatasetId',
				'referenceDatasetVersionId.$': '$.referenceDatasetVersionId',
				'securityContext.$': '$.securityContext',
				'pipelineId.$': '$.pipelineId',
				'executionId.$': '$.executionId',
			}),
			outputPath: '$.Payload'
		});

		const referenceDatasetPipelineGroup = new LogGroup(this, 'ReferenceDatasetPipelineGroup', { logGroupName: `/aws/vendedlogs/states/${props.namePrefix}-referenceDatasetPipelineSM`, removalPolicy: RemovalPolicy.DESTROY });

		this.stateMachine = new StateMachine(this, 'ReferenceDatasetPipelineStateMachine', {
			definitionBody: DefinitionBody.fromChainable(
			  referenceDatasetCreationTask
				.next(waitForCreateReferenceDatasetsTask)
				.next(referenceDatasetVerificationTask)
				.next(new Choice(this, 'Create ReferenceDataset Complete?')
				  .when(Condition.stringEquals('$.status', 'failed'),
					new Fail(this, 'CreateReferenceDatasetsFail')
				  )
				  .when(Condition.stringEquals('$.status', 'success'),
					new Succeed(this, 'CreateReferenceDatasetsSucceed'))
				  .otherwise(waitForCreateReferenceDatasetsTask)),
			),
			logs: { destination: referenceDatasetPipelineGroup, level: LogLevel.ERROR, includeExecutionData: true },
			stateMachineName: `${props.namePrefix}-referenceDatasetPipelineSM`,
			tracingEnabled: true
		});
		this.grantPrincipal = this.stateMachine.grantPrincipal;
		this.stateMachineArn = this.stateMachine.stateMachineArn;
	}

	public grantStartExecution(principal: IGrantable): Grant {
		return this.stateMachine.grantStartExecution(principal);
	}
}
