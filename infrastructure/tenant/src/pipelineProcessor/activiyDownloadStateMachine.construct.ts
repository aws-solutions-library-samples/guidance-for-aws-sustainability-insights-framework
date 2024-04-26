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
import { Choice, Condition, DefinitionBody, IStateMachine, LogLevel, Parallel, StateMachine, TaskInput, Wait, WaitTime } from 'aws-cdk-lib/aws-stepfunctions';
import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import { LogGroup } from 'aws-cdk-lib/aws-logs';
import { LambdaInvoke } from 'aws-cdk-lib/aws-stepfunctions-tasks';
import type { IFunction } from 'aws-cdk-lib/aws-lambda';

export interface ActivityDownloadStateMachineProperties {
	acquireLockActivityDownload: Parallel;
	releaseLockActivityDownloadFail: Parallel;
	releaseLockActivityDownloadSuccess: Parallel;
	namePrefix: string;
	activityDownloadInitiateLambda: IFunction;
	activityDownloadStartLambda: IFunction;
	activityDownloadVerifyLambda: IFunction;
}

export class ActivityDownloadStateMachine extends Construct implements IGrantable {
	readonly stateMachineArn: string;
	readonly grantPrincipal: IPrincipal;
	private stateMachine: IStateMachine;

	constructor(scope: Construct, id: string, props: ActivityDownloadStateMachineProperties) {
		super(scope, id);

		const waitForActivityDownload = new Wait(this, 'Wait For Download Export Result', { time: WaitTime.duration(Duration.seconds(10)) });

		const activityDownloadLogGroup = new LogGroup(this, 'ActivityDownloadLogGroup', { logGroupName: `/aws/vendedlogs/states/${props.namePrefix}-activityDownloadSM`, removalPolicy: RemovalPolicy.DESTROY });


		const initiateDownloadTask = new LambdaInvoke(this, 'Initiate Download Task', {
			lambdaFunction: props.activityDownloadInitiateLambda,
			payload: TaskInput.fromObject({
				'payload.$': '$',
				'executionArn.$': '$$.Execution.Id'
			}),
			outputPath: '$.Payload'
		});


		const startDownloadTask = new LambdaInvoke(this, 'Start Download Task', {
			lambdaFunction: props.activityDownloadStartLambda,
			outputPath: '$.Payload'
		});

		const verifyDownloadTask = new LambdaInvoke(this, 'Verify Download was successful', {
			lambdaFunction: props.activityDownloadVerifyLambda,
			outputPath: '$.Payload'
		});

		this.stateMachine = new StateMachine(this, 'ActivityDownloadStateMachine', {
			definitionBody: DefinitionBody.fromChainable(initiateDownloadTask
				.next(props.acquireLockActivityDownload)
				.next(startDownloadTask)
				.next(waitForActivityDownload)
				.next(verifyDownloadTask)
				.next(new Choice(this, 'Download Complete?')
					.when(Condition.stringEquals('$.state', 'failed'),
						props.releaseLockActivityDownloadFail)
					.when(Condition.stringEquals('$.state', 'success'),
						props.releaseLockActivityDownloadSuccess)
					.otherwise(waitForActivityDownload))),
			logs: { destination: activityDownloadLogGroup, level: LogLevel.ERROR, includeExecutionData: true },
			stateMachineName: `${props.namePrefix}-activityDownloadSM`,
			tracingEnabled: true
		});
		this.grantPrincipal = this.stateMachine.grantPrincipal;
		this.stateMachineArn = this.stateMachine.stateMachineArn;
	}

	public grantStartExecution(principal: IGrantable): Grant {
		return this.stateMachine.grantStartExecution(principal);
	}


}
