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

import { ListObjectsV2Command, ListObjectsV2CommandInput, GetObjectCommand, GetObjectCommandInput, GetObjectCommandOutput, S3Client } from '@aws-sdk/client-s3';
import type { BaseLogger } from 'pino';
import { GroupNode } from './groupNode.js';

// The calculator will write out to S3 a list group nodes visited during processing. This is per chunk so in S3
// there will exist a text file for each chunk that has the group values for that chunk.
// This class provides two methods. One to fetch all of the groups and one to fetch the group path leaves.
// Both list the chunk files, fetches the file content, then de-dupes across chunks.
// FWIW, if the pipeline used the ASSIGN_TO_GROUPS functionality there could be many groups
// in the list. If not, the list will contain one entry (the group context of the execution).

export class AggregationUtil {
	private readonly s3Client: S3Client;
	private readonly log: BaseLogger;
	private readonly dataBucket: string;
	private readonly dataPrefix: string;

	public constructor(
	  log: BaseLogger,
	  s3Client: S3Client,
	  dataBucket: string,
	  dataPrefix: string
	) {
		this.log = log;
		this.s3Client = s3Client;
		this.dataBucket = dataBucket;
		this.dataPrefix = dataPrefix;
	}

	public mergeExecutionGroupLeaves(firstGroups: string[], secondGroups: string[]): string[] {
		this.log.debug(`AggregationUtil> mergeExecutionGroupLeaves> firstGroups: ${firstGroups}, secondGroups: ${secondGroups}`);

		// create a group tree to get only the leaf group paths
		const root: GroupNode = new GroupNode('/', undefined);
		root.setRoot(true);

		firstGroups.forEach((g) => root.addChildrenByPath(g));
		secondGroups.forEach((g) => root.addChildrenByPath(g));

		const leafGroupPaths = root.getLeafNodes();

		this.log.debug(`AggregationUtil> mergeExecutionGroupLeaves> exit: ${JSON.stringify(leafGroupPaths)}`);
		return leafGroupPaths;
	}

	public async getExecutionGroupLeaves(pipelineId: string, executionId: string): Promise<string[]> {
		this.log.debug(`AggregationUtil> getExecutionGroupLeaves> pipelineId: ${pipelineId}, executionId: ${executionId}`);

		// first fetch all groups
		const groups = await this.getExecutionGroups(pipelineId, executionId);

		// create a group tree to get only the leaf group paths
		const root: GroupNode = new GroupNode('/', undefined);
		root.setRoot(true);

		groups.forEach((g) => root.addChildrenByPath(g));

		const leafGroupPaths = root.getLeafNodes();

		this.log.debug(`AggregationUtil> getExecutionGroupLeaves> exit: ${JSON.stringify(leafGroupPaths)}`);
		return leafGroupPaths;
	}

	public async getExecutionGroups(pipelineId: string, executionId: string): Promise<string[]> {
		this.log.debug(`AggregationUtil> getExecutionGroups> pipelineId: ${pipelineId}, executionId: ${executionId}`);
		// fetch listing of group files
		let listObjectsS3Params: ListObjectsV2CommandInput = {
			Bucket: this.dataBucket,
			Prefix: `${this.dataPrefix}/${pipelineId}/executions/${executionId}/groups`,
		};

		let groupFileKeys: string[] = [];
		let listResult = await this.s3Client.send(new ListObjectsV2Command(listObjectsS3Params));
		groupFileKeys = groupFileKeys.concat(listResult.Contents.map((c) => c.Key));
		// pagination
		while (listResult.ContinuationToken) {
			listObjectsS3Params.ContinuationToken = listResult.ContinuationToken;
			listResult = await this.s3Client.send(new ListObjectsV2Command(listObjectsS3Params));
			groupFileKeys = groupFileKeys.concat(listResult.Contents.map((c) => c.Key));
		}

		// fetch the group lists from each file
		const s3SelectPromises: Promise<GetObjectCommandOutput>[] = [];
		groupFileKeys.forEach((gfk) => {
			this.log.debug(gfk);
			const s3GetParams: GetObjectCommandInput = {
				Bucket: this.dataBucket,
				Key: gfk,
			};
			s3SelectPromises.push(this.s3Client.send(new GetObjectCommand(s3GetParams)));
		});


		// add groups to a set to de-dupe
		const groupsSet: Set<string> = new Set();

		const getGroupsObjectsResults = await Promise.all(s3SelectPromises);
		for (const gor of getGroupsObjectsResults) {
			const body = await gor.Body.transformToString();
			body.split(/\r*\n/).forEach((l) => {
				if (l) {
					groupsSet.add(l);
				}
			});
		}

		// sort by hierarchy length (longest first)
		const sortedGroupPaths = Array.from(groupsSet).sort((a, b) => {
			return b.split('/').length - a.split('/').length;
		});
		this.log.debug(`AggregationUtil> getExecutionGroups> exit: ${JSON.stringify(sortedGroupPaths)}`);
		return sortedGroupPaths;
	}
}

