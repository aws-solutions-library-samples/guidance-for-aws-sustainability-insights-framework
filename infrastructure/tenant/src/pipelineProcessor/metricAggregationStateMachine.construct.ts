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
import type { Grant, IGrantable, IPrincipal } from 'aws-cdk-lib/aws-iam';
import { Choice, Condition, DefinitionBody, IStateMachine, LogLevel, Parallel, Pass, StateMachine } from 'aws-cdk-lib/aws-stepfunctions';
import { LogGroup } from 'aws-cdk-lib/aws-logs';
import { RemovalPolicy } from 'aws-cdk-lib';
import { LambdaInvoke } from 'aws-cdk-lib/aws-stepfunctions-tasks';
import type { IFunction } from 'aws-cdk-lib/aws-lambda/lib';

export interface MetricAggregationStateMachineProperties {
	metricAggregationLambda: IFunction,
	metricExportLambda: IFunction,
	namePrefix: string;
	acquireLockState: Parallel,
	releaseLockState: Parallel
}

/**
 * StateMachine that will aggregates activity output values into user defined metrics
 */
export class MetricAggregationStateMachine extends Construct implements IGrantable {

	readonly stateMachineArn: string;
	readonly grantPrincipal: IPrincipal;
	readonly stateMachine: IStateMachine;

	constructor(scope: Construct, id: string, props: MetricAggregationStateMachineProperties) {
		super(scope, id);

		const jobMetricAggregationTask = new LambdaInvoke(this, 'JobMetricAggregationTask', {
			lambdaFunction: props.metricAggregationLambda,
			inputPath: '$',
			outputPath: '$.Payload'
		});

		const jobMetricExportTask = new LambdaInvoke(this, 'JobMetricExportTask', {
			lambdaFunction: props.metricExportLambda,
			inputPath: '$',
			outputPath: '$.Payload'
		});

		const metricAggregationLogGroup = new LogGroup(this, 'MetricAggregationLogGroup', { logGroupName: `/aws/vendedlogs/states/${props.namePrefix}-metricAggregationSM`, removalPolicy: RemovalPolicy.DESTROY });

		this.stateMachine = new StateMachine(this, 'MetricAggregationStateMachine', {
			definitionBody: DefinitionBody.fromChainable(props.acquireLockState
			  .next(jobMetricAggregationTask)
			  .next((new Choice(this, 'Processing Metric Complete (Job)?')
				.when(Condition.stringEquals('$.status', 'SUCCEEDED'),
				  jobMetricExportTask
					.next(props.releaseLockState)
					.next(new Pass(this, 'Processing Metric Pass (Job)', { outputPath: '$' })))
				.when(Condition.stringEquals('$.status', 'IN_PROGRESS'),
				  jobMetricAggregationTask)))),
			logs: { destination: metricAggregationLogGroup, level: LogLevel.ERROR, includeExecutionData: true },
			stateMachineName: `${props.namePrefix}-metricAggregationSM`,
			tracingEnabled: true
		});

		this.grantPrincipal = this.stateMachine.grantPrincipal;
		this.stateMachineArn = this.stateMachine.stateMachineArn;
	}

	public grantStartExecution(principal: IGrantable): Grant {
		return this.stateMachine.grantStartExecution(principal);
	}
}
