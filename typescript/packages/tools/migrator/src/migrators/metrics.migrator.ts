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

import { Command, Option } from 'clipanion';
import { AttributeValue, DynamoDBClient, ScanCommand, ScanCommandInput, GetItemCommand } from '@aws-sdk/client-dynamodb';
import fs from 'fs';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { ulid } from 'ulid';
import { expandDelimitedAttribute, createDelimitedAttribute } from '@sif/dynamodb-utils';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSSMParameter } from '../utils/common.util.js';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import os from 'os';
import { join } from 'path';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
dayjs.extend(utc);

const dynamoDBClient = new DynamoDBClient({});
const s3Client = new S3Client({});
const sqsClient = new SQSClient({});

const pageSize = 10000; // max number of items to return per page
const delay = 1000; // delay between requests
const newLineDelimiter = '\n';
const tempMetricsFileName = 'metrics.temp.rds.csv'
const tempMetricsFilePath = join(os.tmpdir(), tempMetricsFileName);
const cache: { [string: string]: { createdAt: string } } = {};

export class MetricsMigrator extends Command {

	tenantId = Option.String();
	environment = Option.String();

	static override usage = Command.Usage({
		category: `SIF Migration`,
		description: `This command migrates metrics from DynamoDB to RDS`,
		details: `The latest release of SIF has changes which has moved the existing dynamoDB metrics datastore to RDS. This command will migrate the metrics from DynamoDB to RDS`,
		examples: [[
			`example of running the command`,
			`npm run start migrate:metrics <tenantId> <environment>`
		]]
	});

	async execute() {

		const transformedMetrics:string[] = [];

		// lets check if the metrics file exists, if it does, we will just delete it
		if (fs.existsSync(tempMetricsFilePath)) {
			fs.unlinkSync(tempMetricsFilePath);
		}

		// create a new metrics file which we can append the data to when scanning the db
		const metricStream = fs.createWriteStream(tempMetricsFilePath, { flags: 'a' });
		// need to write the header to the file first
		metricStream.write('metricId,groupId,date,timeUnit,name,executionId,pipelineId,createdAt,groupValue,subGroupValue,isLatest' + newLineDelimiter);

		try {
			// we will export the data from dynamodb to the tmp file
			await exportFromDynamoDB(this.tenantId, this.environment, transformedMetrics, undefined);
			metricStream.write(transformedMetrics.join(newLineDelimiter))

		} catch (e) {
			throw e
		} finally {
			metricStream.end();
		}

		// then we will copy the tmp file to s3
		const s3Location = await copyToS3(this.tenantId, this.environment);
		// to kick off the migration process we will send a message to sqs which will trigger the migration process
		await sendMessageToSQS(this.tenantId, this.environment, s3Location);

	}
}

const metricsTableName = (tenantId: string, environment: string) => `sif-${tenantId}-${environment}-pipelineMetrics`;
const executionsTableName = (tenantId: string, environment: string) => `sif-${tenantId}-${environment}-pipelineProcessors`;
const bucketNamePath = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/shared/bucketName`;
const sqsQueueUrlPath = (tenantId: string, environment: string) => `/sif/${tenantId}/${environment}/pipeline-processor/taskQueueUrl`;

const exportFromDynamoDB = async (tenantId: string, environment: string, items: string[], exclusiveStartKey?: Record<string, AttributeValue>) => {

	const tableName = metricsTableName(tenantId, environment);

	try {
		// start scanning the records in the ddb table
		// @ts-ignore
		const input: ScanCommandInput = {
			TableName: tableName,
			Limit: pageSize,
			ExclusiveStartKey: exclusiveStartKey ?? undefined
		};
		const command = new ScanCommand(input);
		const response = await dynamoDBClient.send(command);

		if (response.Items) {
			// write the data to the file
			for (const item of response.Items) {
				const transformed = await transformMetric(tenantId, environment, unmarshall(item));
				items.push(transformed)
			}
		}

		// if there are more records to process, lets recursively get them
		if (response.LastEvaluatedKey) {
			// let's add a sleep so we don't bombard the service too much, also we need to make the scans predictable
			await new Promise((resolve) => setTimeout(resolve, delay));
			await exportFromDynamoDB(tenantId, environment, items, response.LastEvaluatedKey);
		}
	} catch (e) {
		/*
		* Semgrep issue https://sg.run/7Y5R
		* Ignore reason: Migrator tool is run by end user - there is no risk of command injection in this context
		*/
		// nosemgrep
		console.error(`Error scanning dynamodb table: ${tableName}`, e);
		throw e;
	}
};

// the legacy metric object in ddb has the following structure:
/*
{
 "pk": "m:01gwtej8vst56nh0twbsz0nhrm:g::mv:2",
 "sk1": "g:%2fmetricsaggregationtests:tu:day:d:2022-03-23",
 "date": "2022-03-23",
 "day": 82,
 "executionId": "01gwtenhbnj3aze09faz411pcr",
 "groupValue": 0,
 "name": "ghg:scope1:mobile",
 "pipelineId": "01gwtemmt29ngbj9zex2h9d60y",
 "sk2": "tu:day:d:2022-03-23:g:%2fmetricsaggregationtests",
 "subGroupsValue": 0,
 "version": 2,
 "year": 2022
}
 */

// the object above would need to transformed into the new metric object in rds like so:
/*
metric:
metricId,groupId,date,timeUnit,name
84877,/metricsaggregationtests,2022-01-01 00:00:00.000000,d,ghg:scope1:mobile
metricValue:
metricId,executionId,pipelineId,createdAt,groupValue,subGroupValue
84877,01gwtenhbnj3aze09faz411pcr,01gwtemmt29ngbj9zex2h9d60y,2023-05-19 21:26:49.000000,17400.000000,0.000000
 */

const transformMetric = async (tenantId: string, environment: string, item: Record<string, any>): Promise<string> => {

	// lets start with the easy things we dont need to do anything special with
	const name = item['name'];
	const executionId = item['executionId'];
	const pipelineId = item['pipelineId'];
	const groupValue = item['groupValue'];
	const subGroupsValue = item['subGroupsValue'];

	const date = dayjs(item['date']).format('YYYY-MM-DD HH:mm:ss.SSS')

	let groupId;
	let timeUnit;
	if (item['sk1']) {
		const sk1 = expandDelimitedAttribute(item['sk1']);
		groupId = sk1[1];
		timeUnit = sk1[3];
	} else if (item['sk2']) {
		const sk2 = expandDelimitedAttribute(item['sk2']);
		groupId = sk2[5];
		timeUnit = sk2[1];
	}

	const pk = expandDelimitedAttribute(item['pk'])
	const isLatest = pk[5] === 'latest'
	const version = pk[5]

	switch (timeUnit) {
		case 'day':
			timeUnit = 'd';
			break;
		case 'week':
			timeUnit = 'w';
			break;
		case 'month':
			timeUnit = 'm';
			break;
		case 'year':
			timeUnit = 'y';
			break;
		case 'quarter':
			timeUnit = 'q';
			break;
	}

	// here is where it gets tricky, we need to get the execution time for the createdAt dates, we need to make a query and actually cache the results
	const execution = await getPipelineExecution(tenantId, environment, pipelineId, executionId);
	let createdAt = execution?.createdAt

	// to make sure we get all the historical records as well, we will see if there is a version other then if its latest, if there is we will just take the version and subtract some value from the created at time
	if(version !== 'latest') {
		createdAt = dayjs(createdAt, 'YYYY-MM-DD HH:mm:ss.SSS').subtract(parseInt(version), 'minute').format('YYYY-MM-DD HH:mm:ss.SSS');
	}

	// for us to unqiuely identify the metric we need to have matching uuid pair
	const metricId = ulid();

	const metric: Metric = {
		metricId,
		groupId,
		date,
		timeUnit,
		name,
		executionId,
		pipelineId,
		createdAt,
		groupValue,
		subGroupsValue,
		isLatest
	};

	return jsonToCsv(metric);

};

const getPipelineExecution = async (tenantId: string, environment: string, pipelineId: string, executionId: string): Promise<{ createdAt: string }> => {
	// we will cache these execution ids, we dont need to do this everytime we run the query
	if (cache[executionId]) {
		return cache[executionId];
	} else {
		// if its not in the cache then we query the table
		const result = await dynamoDBClient.send(new GetItemCommand({
			TableName: executionsTableName(tenantId, environment),
			Key: {
				pk: { S: createDelimitedAttribute('p', pipelineId) },
				sk: { S: createDelimitedAttribute('pe', executionId) }
			}
		}));

		if (result.Item) {
			const item = unmarshall(result.Item);
			cache[executionId] = {
				createdAt:  dayjs(item['createdAt']).utc().format('YYYY-MM-DD HH:mm:ss.SSS')
			};
		}
		return cache[executionId];
	}

};

const copyToS3 = async (tenantId: string, environment: string) => {
	const bucketNameParameter = await getSSMParameter(bucketNamePath(tenantId, environment), 'bucketName');
	const bucketName = bucketNameParameter.value;
	const fileName = `${tenantId}-${environment}-metrics.csv`;
	const filePath = `metricsMigration/${fileName}`;
	const fileStream = fs.createReadStream(tempMetricsFilePath);

	const uploadParams = {
		Bucket: bucketName,
		Key: filePath,
		Body: fileStream
	};

	await s3Client.send(new PutObjectCommand(uploadParams));

	return {
		bucket: bucketName,
		key: filePath
	}
};

const sendMessageToSQS = async (tenantId: string, environment: string, message: {bucket: string, key: string}) => {
	const queueUrlParameter = await getSSMParameter(sqsQueueUrlPath(tenantId, environment), 'queueUrl');
	const queueUrl = queueUrlParameter.value;

	const sendMessageParams = {
		QueueUrl: queueUrl,
		MessageBody: JSON.stringify(message),
		MessageAttributes: {
			messageType: {
				DataType: 'String',
				StringValue: `Metrics:migrate`,
			},
		},
	};

	await sqsClient.send(new SendMessageCommand(sendMessageParams));
};


// this function takes in a object and converts it to a csv string of only the values
const jsonToCsv = (obj: Record<string, any>) => {
	return Object.values(obj).join(',');
};

interface Metric {
	metricId: string;
	groupId: string;
	date: string;
	timeUnit: string;
	name: string;
	executionId: string;
	pipelineId: string;
	createdAt: string;
	groupValue: number;
	subGroupsValue: number;
	isLatest: boolean;
}
