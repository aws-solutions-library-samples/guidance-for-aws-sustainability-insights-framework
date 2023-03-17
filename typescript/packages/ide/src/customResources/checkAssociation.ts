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

import type { CloudFormationCustomResourceEvent } from 'aws-lambda';
import { DescribeAssociationExecutionsCommand, DescribeAssociationExecutionTargetsCommand, SSMClient } from '@aws-sdk/client-ssm';
import { DescribeInstancesCommand, EC2Client } from '@aws-sdk/client-ec2';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const { AWS_REGION } = process.env;

const ec2 = new EC2Client({ region: AWS_REGION });
const ssm = new SSMClient({ region: AWS_REGION });

async function checkAssociationForInstance(associationId: string, instanceArn: string): Promise<void> {
	const environmentId = instanceArn.split(':').pop();

	// Get the Cloud9 EC2 instance id using the tag name that Cloud9 generated under aws:cloud9:environment
	const describeInstancesResponses = await ec2.send(
		new DescribeInstancesCommand({
			Filters: [
				{
					Name: `tag:aws:cloud9:environment`,
					Values: [environmentId],
				},
			],
		})
	);

	if (describeInstancesResponses.Reservations.length < 1 || describeInstancesResponses.Reservations[0].Instances.length < 1) {
		throw new Error(`could not find instance id ${environmentId}`);
	}

	const instanceId = describeInstancesResponses.Reservations[0].Instances[0].InstanceId;

	let bootstrapFinish = false;

	while (!bootstrapFinish) {
		// Get the list of executions from the association
		const associationExecution = await ssm.send(
			new DescribeAssociationExecutionsCommand({
				AssociationId: associationId,
			})
		);

		if (associationExecution.AssociationExecutions.length < 1) {
			throw new Error(`Association ${associationId} has no execution`);
		}

		// There should be only 1 execution
		const executionId = associationExecution.AssociationExecutions[0].ExecutionId;

		const executionTargets = await ssm.send(
			new DescribeAssociationExecutionTargetsCommand({
				ExecutionId: executionId,
				AssociationId: associationId,
			})
		);

		// From all the executions of the association check if the Cloud9 instance is successful
		for (let target of executionTargets.AssociationExecutionTargets) {
			if (target.ResourceId === instanceId && target.Status === 'Success') {
				console.log(`Association for instance ${instanceId}, status is :${target.Status}`);
				bootstrapFinish = true;
			}
		}

		// If status is not successful wait for 10 seconds
		if (!bootstrapFinish) {
			await sleep(10000);
		}
	}
}

export const handler = async (event: CloudFormationCustomResourceEvent): Promise<any> => {
	try {
		switch (event.RequestType) {
			case 'Update':
			case 'Create': {
				const { instanceArn, associationId } = event.ResourceProperties;
				await checkAssociationForInstance(instanceArn, associationId);
				return;
			}
			case 'Delete': {
				return;
			}
			default: {
				throw new Error('Unknown request type');
			}
		}
	} catch (Exception) {
		return;
	}
};
