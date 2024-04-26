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
import { Choice, Condition, CustomState, DefinitionBody, IStateMachine, LogLevel, Pass, StateMachine, TaskInput } from 'aws-cdk-lib/aws-stepfunctions';
import { LambdaInvoke } from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { LogGroup } from 'aws-cdk-lib/aws-logs';
import { RemovalPolicy } from 'aws-cdk-lib';
import type { IFunction } from 'aws-cdk-lib/aws-lambda/lib';
import type { Grant, IGrantable, IPrincipal } from 'aws-cdk-lib/aws-iam';

export interface DataPipelineStateMachineProperties {
	verificationLambda: IFunction,
	dataResultProcessorLambda: IFunction,
	impactCreationLambda: IFunction,
	calculationLambda: IFunction
	namePrefix: string
}

export class DataPipelineStateMachine extends Construct implements IGrantable {

	readonly stateMachineArn: string;
	readonly grantPrincipal: IPrincipal;
	private stateMachine: IStateMachine;

	constructor(scope: Construct, id: string, props: DataPipelineStateMachineProperties) {
		super(scope, id);
		const dataVerificationTask = new LambdaInvoke(this, 'DataVerificationTask', {
			lambdaFunction: props.verificationLambda,
			outputPath: '$.Payload'
		});

		const dataResultProcessorTask = new LambdaInvoke(this, 'DataResultProcessorTask', {
				lambdaFunction: props.dataResultProcessorLambda,
				payload: TaskInput.fromObject({
					'inputs.$': '$',
					'executionStartTime.$': '$$.Execution.StartTime',
					'executionArn.$': '$$.Execution.Id',
				}),
				outputPath: '$.Payload',
			}
		);

		const impactCreationTask = new LambdaInvoke(this, 'ImpactCreationTask', {
				lambdaFunction: props.impactCreationLambda,
				outputPath: '$.Payload',
			}
		);

		const calculateDataPipelineTask = new CustomState(this, 'Data Map State', {
			stateJson: {
				Type: 'Map',
				Next: 'DataResultProcessorTask',
				ItemProcessor: {
					ProcessorConfig: {
						Mode: 'INLINE'
					},
					StartAt: 'CalculationTask',
					States: {
						CalculationTask: {
							Type: 'Task',
							Resource: 'arn:aws:states:::lambda:invoke',
							OutputPath: '$.Payload',
							Parameters: {
								FunctionName: `${props.calculationLambda.functionArn}`,
								'Payload.$': '$'
							},
							End: true,
							Retry: [
								{
									ErrorEquals: [
										'Lambda.ServiceException',
										'Lambda.AWSLambdaException',
										'Lambda.SdkClientException'
									],
									IntervalSeconds: 2,
									MaxAttempts: 6,
									BackoffRate: 2
								}
							]
						}
					}
				},
				ItemsPath: '$.chunks',
				ItemSelector: {
					'source.$': '$.source',
					'context.$': '$.context',
					'chunk': {
						'sequence.$': '$$.Map.Item.Index',
						'range.$': '$$.Map.Item.Value.range'
					}
				},
				MaxConcurrency: 10
			}
		});

		const dataPipelineStateMachineLogGroup = new LogGroup(this, 'DataPipelineLogGroup', { logGroupName: `/aws/vendedlogs/states/${props.namePrefix}-dataPipelineSM`, removalPolicy: RemovalPolicy.DESTROY });

		this.stateMachine = new StateMachine(this, 'DataPipelineStateMachine', {
			definitionBody: DefinitionBody.fromChainable(
				dataVerificationTask
					.next(calculateDataPipelineTask)
					.next(dataResultProcessorTask)
					.next(impactCreationTask).next(
					new Choice(this, 'More Activities To Process?')
						.when(Condition.booleanEquals('$.moreActivitiesToProcess', true), impactCreationTask)
						.when(Condition.booleanEquals('$.moreActivitiesToProcess', false), new Pass(this, 'Finish', {})))
			),
			logs: { destination: dataPipelineStateMachineLogGroup, level: LogLevel.ERROR, includeExecutionData: true },
			stateMachineName: `${props.namePrefix}-dataPipelineSM`,
			tracingEnabled: true
		});

		this.grantPrincipal = this.stateMachine.grantPrincipal;
		this.stateMachineArn = this.stateMachine.stateMachineArn;
	}

	public grantStartExecution(principal: IGrantable): Grant {
		return this.stateMachine.grantStartExecution(principal);
	}
}
