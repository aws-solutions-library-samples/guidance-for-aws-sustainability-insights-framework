import { beforeEach, describe, it, expect } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import pino from 'pino';
import { S3Client, ListObjectsV2Command, ListObjectsV2CommandOutput, GetObjectCommand, GetObjectCommandInput, GetObjectCommandOutput } from '@aws-sdk/client-s3';
import { sdkStreamMixin } from '@aws-sdk/util-stream-node';
import { Readable } from "stream";
import { AggregationUtil } from './aggregation.util';

describe('AggregationUtil', () => {
	let aggregationUtil: AggregationUtil;
	const mockedS3Client = mockClient(S3Client);

	beforeEach(() => {
		const logger = pino(
			pino.destination({
				sync: true, // test frameworks must use pino logger in sync mode!
			})
		);
		logger.level = 'debug';
		mockedS3Client.reset();
		aggregationUtil = new AggregationUtil(logger, mockedS3Client as unknown as S3Client, 'unit-test-bucket', 'unit-test-prefix');
	});

	it('happy path group leaves', async () => {
		const listObjectOutput: ListObjectsV2CommandOutput = {
			$metadata: {},
			Contents:[{Key:'chunk0.txt'},{Key: 'chunk1.txt'},{Key:'chunk2.txt'}]
		};
		mockedS3Client.on(ListObjectsV2Command).resolves(listObjectOutput);

		const chunk0GetCommandParams: GetObjectCommandInput = {
			Bucket: 'unit-test-bucket',
			Key: 'chunk0.txt'
		};
		const chunk0GetOutput: GetObjectCommandOutput = {
			$metadata: {},
			Body: sdkStreamMixin(Readable.from(['/usa/mn/minneapolis\n/usa/mn/mankato\n/usa/ca/bakersfield']))
		};
		mockedS3Client.on(GetObjectCommand, chunk0GetCommandParams).resolves(chunk0GetOutput);

		const chunk1GetCommandParams: GetObjectCommandInput = {
			Bucket: 'unit-test-bucket',
			Key: 'chunk1.txt'
		};
		const chunk1GetOutput: GetObjectCommandOutput = {
			$metadata: {},
			Body: sdkStreamMixin(Readable.from(['/usa/mn/minneapolis\n/usa/wa/seattle\n/usa']))
		};
		mockedS3Client.on(GetObjectCommand, chunk1GetCommandParams).resolves(chunk1GetOutput);

		const chunk2GetCommandParams: GetObjectCommandInput = {
			Bucket: 'unit-test-bucket',
			Key: 'chunk2.txt'
		};
		const chunk2GetOutput: GetObjectCommandOutput = {
			$metadata: {},
			Body: sdkStreamMixin(Readable.from(['/usa/ny\n/usa/wa']))
		};
		mockedS3Client.on(GetObjectCommand, chunk2GetCommandParams).resolves(chunk2GetOutput);

		// run test
		const groupLeaves = await aggregationUtil.getExecutionGroupLeaves('happy-path-pipeline', 'happy-path-execution');

		// verify
		expect(groupLeaves.length).toEqual(5);
		// only group leaf paths, de-duped and sorted by hierarchy depth
		expect(groupLeaves).toEqual(['/usa/mn/minneapolis','/usa/mn/mankato','/usa/ca/bakersfield','/usa/wa/seattle','/usa/ny']);
	});

	it('happy path groups', async () => {
		const listObjectOutput: ListObjectsV2CommandOutput = {
			$metadata: {},
			Contents:[{Key:'chunk0.txt'},{Key: 'chunk1.txt'},{Key:'chunk2.txt'}]
		};
		mockedS3Client.on(ListObjectsV2Command).resolves(listObjectOutput);

		const chunk0GetCommandParams: GetObjectCommandInput = {
			Bucket: 'unit-test-bucket',
			Key: 'chunk0.txt'
		};
		const chunk0GetOutput: GetObjectCommandOutput = {
			$metadata: {},
			Body: sdkStreamMixin(Readable.from(['/usa/mn/minneapolis\n/usa/mn/mankato\n/usa/ca/bakersfield']))
		};
		mockedS3Client.on(GetObjectCommand, chunk0GetCommandParams).resolves(chunk0GetOutput);

		const chunk1GetCommandParams: GetObjectCommandInput = {
			Bucket: 'unit-test-bucket',
			Key: 'chunk1.txt'
		};
		const chunk1GetOutput: GetObjectCommandOutput = {
			$metadata: {},
			Body: sdkStreamMixin(Readable.from(['/usa/mn/minneapolis\n/usa/wa/seattle\n/usa']))
		};
		mockedS3Client.on(GetObjectCommand, chunk1GetCommandParams).resolves(chunk1GetOutput);

		const chunk2GetCommandParams: GetObjectCommandInput = {
			Bucket: 'unit-test-bucket',
			Key: 'chunk2.txt'
		};
		const chunk2GetOutput: GetObjectCommandOutput = {
			$metadata: {},
			Body: sdkStreamMixin(Readable.from(['/usa/ny\n/usa/wa']))
		};
		mockedS3Client.on(GetObjectCommand, chunk2GetCommandParams).resolves(chunk2GetOutput);

		// run test
		const groups = await aggregationUtil.getExecutionGroups('happy-path-pipeline', 'happy-path-execution');

		// verify
		expect(groups.length).toEqual(7);
		// de-duped and sorted by hierarchy depth
		expect(groups).toEqual(['/usa/mn/minneapolis','/usa/mn/mankato','/usa/ca/bakersfield','/usa/wa/seattle','/usa/ny','/usa/wa','/usa']);
	});
});
