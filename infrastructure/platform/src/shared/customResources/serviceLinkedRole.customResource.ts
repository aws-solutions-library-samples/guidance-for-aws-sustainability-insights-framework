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

import { CreateServiceLinkedRoleCommand, IAMClient } from '@aws-sdk/client-iam';

const createServiceLinkedRole = async () => {
	const iamClient = new IAMClient({});
	await iamClient.send(new CreateServiceLinkedRoleCommand({ AWSServiceName: 'rds.amazonaws.com' }));
	await iamClient.send(new CreateServiceLinkedRoleCommand({ AWSServiceName: 'ecs.amazonaws.com' }));
	// even though the role is created, it takes some time before RDS can use it, so we set artificial sleep for this
	await new Promise(r => setTimeout(r, 30000));
};

export const handler = async (event: any): Promise<any> => {
	console.log(`serviceLinkedRole.customResource > handler > in : ${JSON.stringify(event)}`);
	try {
		switch (event.RequestType) {
			case 'Create': {
				await createServiceLinkedRole();
				return;
			}
			case 'Update': {
				console.log(`nothing to do on update`);
				return;
			}
			case 'Delete': {
				console.log(`nothing to do on delete`);
				return;
			}
			default: {
				throw new Error('Unknown request type');
			}
		}
	} catch (Exception) {
		console.log(`serviceLinkedRole.customResource > error : ${Exception}`);
	}

	console.log(`serviceLinkedRole.customResource > exit`);
};
