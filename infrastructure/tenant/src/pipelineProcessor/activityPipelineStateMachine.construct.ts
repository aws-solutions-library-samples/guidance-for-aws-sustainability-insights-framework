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
import { LogGroup } from 'aws-cdk-lib/aws-logs';
import { RemovalPolicy } from 'aws-cdk-lib';
import { Choice, Condition, CustomState, DefinitionBody, IntegrationPattern, IStateMachine, JsonPath, LogLevel, Parallel, StateMachine, TaskInput } from 'aws-cdk-lib/aws-stepfunctions';
import { LambdaInvoke, StepFunctionsStartExecution } from 'aws-cdk-lib/aws-stepfunctions-tasks';
import type { IFunction } from 'aws-cdk-lib/aws-lambda';
import type { Grant, IGrantable, IPrincipal } from 'aws-cdk-lib/aws-iam';

export interface ActivityPipelineStateMachineProperties {
	verificationLambda: IFunction,
	activityResultProcessorLambda: IFunction
	insertLatestValuesLambda: IFunction
	saveAggregationJobLambda: IFunction
	calculationLambda: IFunction
	pipelineAggregationLambda: IFunction
	sqlResultProcessorLambda: IFunction
	metricAggregationStateMachine: IStateMachine,
	namePrefix: string,
	acquireLockState: Parallel,
	releaseLockState: Parallel
}

export class ActivityPipelineStateMachine extends Construct implements IGrantable {

	readonly stateMachineArn: string;
	readonly grantPrincipal: IPrincipal;
	private stateMachine: IStateMachine;

	constructor(scope: Construct, id: string, props: ActivityPipelineStateMachineProperties) {

		super(scope, id);

		const verificationTask = new LambdaInvoke(this, 'VerificationTask', {
			lambdaFunction: props.verificationLambda,
			outputPath: '$.Payload'
		});

		const activityResultProcessorTask = new LambdaInvoke(this, 'ActivityResultProcessorTask', {
			  lambdaFunction: props.activityResultProcessorLambda,
			  payload: TaskInput.fromObject({
				  'input.$': '$',
				  'executionStartTime.$': '$$.Execution.StartTime',
				  'executionArn.$': '$$.Execution.Id'
			  })
		  }
		);

		const jobInsertLatestValuesTask = new LambdaInvoke(this, 'JobInsertLatestValuesTask', {
			  lambdaFunction: props.insertLatestValuesLambda,
			  inputPath: '$',
			  outputPath: '$.Payload'
		  }
		);

		const saveAggregationJobTask = new LambdaInvoke(this, 'SaveAggregationJobTask', {
			lambdaFunction: props.saveAggregationJobLambda,
			inputPath: '$',
			outputPath: '$.Payload'
		});

		const jobPipelineAggregationTask = new LambdaInvoke(this, 'JobPipelineAggregationTask', {
			lambdaFunction: props.pipelineAggregationLambda,
			inputPath: '$',
			outputPath: '$.Payload'
		});

		const map = new CustomState(this, 'Map State', {
			stateJson: {
				Type: 'Map',
				Next: 'Process SQL Insert Result',
				ItemProcessor: {
					ProcessorConfig: {
						Mode: 'INLINE'
					},
					StartAt: 'CalculationTask',
					States: {
						CalculationTask: {
							Type: 'Task',
							Resource: 'arn:aws:states:::lambda:invoke.waitForTaskToken',
							ResultPath: '$.Payload',
							OutputPath: '$.Payload',
							Parameters: {
								FunctionName: `${props.calculationLambda.functionArn}`,
								'Payload': {
									'chunk.$': '$.chunk',
									'source.$': '$.source',
									'context.$': '$.context',
									'taskToken.$': JsonPath.taskToken
								}
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

		const jobAggregationTasks = new Parallel(this, 'JobAggregationTasks')
		  .branch(
			new Choice(this, 'Trigger Metric Aggregations?')
			  .when(Condition.booleanEquals('$.triggerMetricAggregations', true),
				new StepFunctionsStartExecution(this, 'StartMetricAggregationJob',
				  {
					  stateMachine: props.metricAggregationStateMachine,
					  outputPath: '$.Output',
					  integrationPattern: IntegrationPattern.RUN_JOB
				  }))
			  .when(Condition.booleanEquals('$.triggerMetricAggregations', false),
				saveAggregationJobTask))
		  .branch(jobPipelineAggregationTask.next(activityResultProcessorTask));

		const sqlResultProcessorTask = new LambdaInvoke(this, 'Process SQL Insert Result', {
			lambdaFunction: props.sqlResultProcessorLambda,
			inputPath: '$',
			outputPath: '$.Payload'
		});

		const activityPipelineLogGroup = new LogGroup(this, 'ActivityPipelineLogGroup', { logGroupName: `/aws/vendedlogs/states/${props.namePrefix}-activityPipelineSM`, removalPolicy: RemovalPolicy.DESTROY });

		this.stateMachine = new StateMachine(this, 'ActivityPipelineStateMachine', {
			definitionBody: DefinitionBody.fromChainable(
			  verificationTask
				.next(props.acquireLockState)
				.next(map)
				.next(sqlResultProcessorTask)
				.next(jobInsertLatestValuesTask)
				.next(jobAggregationTasks)
				.next(props.releaseLockState)),
			logs: { destination: activityPipelineLogGroup, level: LogLevel.ERROR, includeExecutionData: true },
			stateMachineName: `${props.namePrefix}-activityPipelineSM`,
			tracingEnabled: true
		});
		this.grantPrincipal = this.stateMachine.grantPrincipal;
		this.stateMachineArn = this.stateMachine.stateMachineArn;
	}

	public grantStartExecution(principal: IGrantable): Grant {
		return this.stateMachine.grantStartExecution(principal);
	}
}
