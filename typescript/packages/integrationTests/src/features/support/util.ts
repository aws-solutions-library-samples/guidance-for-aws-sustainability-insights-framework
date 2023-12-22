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

import apickli from 'apickli';
import { BatchWriteCommand, BatchWriteCommandInput, DynamoDBDocumentClient, ScanCommand, ScanCommandInput } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { PutObjectCommand, PutObjectCommandInput, PutObjectCommandOutput, S3Client } from '@aws-sdk/client-s3';
import { CloudFormationClient, DescribeStacksCommand, DescribeStacksCommandInput, DescribeStacksCommandOutput } from '@aws-sdk/client-cloudformation';
import { KinesisClient, PutRecordsCommand, PutRecordsRequestEntry } from "@aws-sdk/client-kinesis"
import { Auth } from '@aws-amplify/auth';
import { fail } from 'assert';
import sign from 'jwt-encode';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { ulid } from "ulid";

export async function getUrl(path: string, parameterName: string): Promise<PostmanEnvironmentVariable> {
	const ssm = new SSMClient({});
	const response = await ssm.send(
		new GetParameterCommand({
			Name: path,
		})
	);
	return {
		key: parameterName,
		value: response.Parameter?.Value as string,
		type: 'default',
		enabled: true,
	};
}

export async function authorizeUser(username: string, password: string, newPassword?: string, sharedTenantId?: string): Promise<string> {
	let userPoolId = process.env.COGNITO_USER_POOL_ID;
	let clientId = process.env.COGNITO_CLIENT_ID;

	if (sharedTenantId) {
		userPoolId = process.env.SHARED_TENANT_COGNITO_USER_POOL_ID;
		clientId = process.env.SHARED_TENANT_COGNITO_CLIENT_ID;
	}

	Auth.configure({
		aws_user_pools_id: userPoolId,
		aws_user_pools_web_client_id: clientId,
		authenticationFlowType: 'USER_SRP_AUTH',
	});

	// check if env has username and password
	if (!process.env.COGNITO_CLIENT_ID) {
		fail('COGNITO_CLIENT_ID not defined');
	}
	if (!process.env.ADMIN_USER_USERNAME && !username) {
		fail('Username not defined');
	}
	if (!process.env.ADMIN_USER_PASSWORD && !password) {
		fail('Password not defined');
	}
	// generate a token
	if (!process.env.COGNITO_USER_POOL_ID) {
		fail('COGNITO_USER_POOL_ID not defined');
	}

	try {
		let loginFlowFinished = false;
		while (!loginFlowFinished) {
			const user = await Auth.signIn(username, password);
			if (user.challengeName === 'NEW_PASSWORD_REQUIRED') {
				if (newPassword) {
					password = newPassword;
				}
				await Auth.completeNewPassword(user, password ?? (process.env.ADMIN_USER_PASSWORD as string));
			}
			if (user?.authenticationFlowType === 'USER_SRP_AUTH') {
				const idToken = user.signInUserSession.idToken.jwtToken;
				loginFlowFinished = true;
				return idToken;
			}
		}
	} catch (err: any) {
		// swallow errors but log incase of false positive
		console.log(`authorizeUser: err: ${err}`);
		return err.name;
	}

	return '';
}

export async function getAuthToken(username: string, password?: string, sharedTenantId?: string): Promise<string> {
	username = username.toLowerCase();
	if (!password) {
		username = process.env.ADMIN_USER_USERNAME as string;
		password = process.env.ADMIN_USER_PASSWORD as string;
	}

	let token = global.jwts[username];

	if (!token || token === 'NotAuthorizedException') {
		if (process.env.NODE_ENV === 'local' && !global.forceCognitoUsage) {
			const claims = global.localUserClaims[username];
			if (claims === null || claims === undefined) {
				fail(`No claims set for user ${username}. Check your test steps.`);
			}
			const payload = {
				'cognito:groups': [claims],
				email: username,
			};
			token = sign(payload, 'integrationTest');
		} else {
			token = await authorizeUser(username, password, undefined, sharedTenantId);
		}

		// Set the last group context, so we can keep track which resource created in which context
		global.jwts[username] = token;
	}
	return token;
}

export const createApi = async (environment: string, url: string, headers: { [key: string]: string }): Promise<any> => {
	if (!url) {
		throw new Error(`<module>_BASE_URL not defined for ${environment} environment`);
	}
	const protocol = url.startsWith('https://') ? 'https' : 'http';
	const api = new apickli.Apickli(protocol, url.split(`${protocol}://`)[1]);
	api.setRequestHeader('Cache-Control', 'no-cache');
	api.setRequestHeader('Accept', 'application/json');
	api.setRequestHeader('Content-Type', 'application/json');
	api.setRequestHeader('Accept-Version', '1.0.0');

	for (const [key, value] of Object.entries(headers)) {
		api.setRequestHeader(key, value);
	}
	return api;
};

export async function cleanUpTable(tableName: string): Promise<void> {
	const ddb = new DynamoDBClient({ region: process.env.AWS_REGION });
	const marshallOptions = {
		convertEmptyValues: false,
		removeUndefinedValues: true,
		convertClassInstanceToMap: true,
	};
	const unmarshallOptions = {
		wrapNumbers: false,
	};
	const translateConfig = { marshallOptions, unmarshallOptions };
	const dbc = DynamoDBDocumentClient.from(ddb, translateConfig);

	let keepGoing = true,
		lastEvaluatedKey: Record<string, any> | undefined;

	while (keepGoing) {
		const params: ScanCommandInput = {
			TableName: tableName,
			Limit: 20,
			ExclusiveStartKey: lastEvaluatedKey,
		};
		const response = await dbc.send(new ScanCommand(params));

		if (response.Items && response.Items?.length < 1) {
			return;
		}

		const batchDeleteParams: BatchWriteCommandInput = {
			RequestItems: {
				[tableName as string]: (response?.Items ?? []).map((item) => {
					return {
						DeleteRequest: {
							Key: {
								pk: item['pk'],
								sk: item['sk'],
							},
						},
					};
				}),
			},
		};
		await dbc.send(new BatchWriteCommand(batchDeleteParams));
		lastEvaluatedKey = response.LastEvaluatedKey;
		if (!lastEvaluatedKey) keepGoing = false;
	}
}

export async function uploadToS3(objectKey:string, content:string): Promise<PutObjectCommandOutput> {
	const bucketName = process.env.BUCKET_NAME as string;
	const s3Client = new S3Client({ region: process.env.AWS_REGION });

	const inputParams:PutObjectCommandInput = {
		Bucket: bucketName,
		Key: objectKey,
		Body: content
	}
	const resp = await s3Client.send(new PutObjectCommand(inputParams));
	return resp;
}

export async function getCloudformationStackStatus(stackName:string): Promise<DescribeStacksCommandOutput> {
	const cloudFormationClient = new CloudFormationClient({ region: process.env.AWS_REGION });
	const inputParams:DescribeStacksCommandInput = {
		StackName: stackName
	}
	const resp = await cloudFormationClient.send(new DescribeStacksCommand(inputParams));
	return resp;
}

const generateUniqueKeys = (n: number) => [...new Set(Array.from({length: n}, (_) => ulid()))];

export async function streamData(streamName:string, records:[], partitionCount:number): Promise<DescribeStacksCommandOutput> {
	const kinesisClient = new KinesisClient({ region: process.env.AWS_REGION });
	const partitions = generateUniqueKeys(partitionCount);
	const data: PutRecordsRequestEntry[] = records.map((record) => {
		const randomPartitionIndex = Math.floor(Math.random() * partitions.length);
		return {
			Data: Buffer.from(JSON.stringify(record)),
			PartitionKey: partitions[randomPartitionIndex]
		}
	});
	const resp = await kinesisClient.send(new PutRecordsCommand({
			StreamName: streamName,
			Records: data
		}));
	return resp;
}




export interface PostmanEnvironmentVariable {
	key: string;
	value: string;
	type: string;
	enabled: boolean;
}
