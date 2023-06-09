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

import { beforeEach, describe, it, expect} from 'vitest';
import { mock } from 'vitest-mock-extended';
import pino from 'pino';
import { AuditExportUtil } from './auditExport.util';
import type { S3Client } from '@aws-sdk/client-s3';
import type { AthenaClient } from '@aws-sdk/client-athena';
import type { SQSClient } from '@aws-sdk/client-sqs';
import type { PipelineClient } from '@sif/clients';
import type { GetLambdaRequestContext, GetSignedUrl } from '../plugins/module.awilix.js';
import type { Pipeline } from '@sif/clients';


const pipeline: Pipeline = {
	createdAt: new Date(),
	updatedAt: new Date(),
	connectorConfig: {
		input: [{
			name: 'sif-csv-pipeline-input-connector',
			parameters: {
				pipelineParam1: 'pipelineParam1',
				connectorParam2: 'connectorParam2ValPipeline'
			}
		}]
	},
	// ignore the rest below
	id: '01h03evc0mjceh3qa4cyd5zzrx',
	version: 1,
		'transformer': {
			'transforms': [
				{
					'index': 0,
					'formula': 'AS_TIMESTAMP(:timestamp, \'M/d/yyyy\')',
					'outputs': [
						{
							'index': 0,
							'key': 'timestamp',
							'type': 'timestamp'
						}
					]
				},
				{
					'index': 1,
					'formula': ':zipcode',
					'outputs': [
						{
							'index': 0,
							'key': 'zipcode',
							'type': 'string'
						}
					]
				},
				{
					'index': 2,
					'formula': ':kwh',
					'outputs': [
						{
							'index': 0,
							'key': 'kwh',
							'type': 'number'
						}
					]
				},
				{
					'index': 3,
					'formula': '#electricity_emissions(:kwh,IMPACT(LOOKUP(LOOKUP(LOOKUP(:zipcode, \'ZipcodeToState\', \'zipcode\', \'state\'), \'StatePrimaryGen\', \'state\', \'primary_gen\'), \'GenToImpact\', \'gen\', \'if\'), \'co2e\', \'co2\'))',
					'outputs': [
						{
							'index': 0,
							'key': 'co2e',
							'type': 'number'
						}
					]
				}
			],
			'parameters': [
				{
					'key': 'timestamp',
					'label': 'Timestamp',
					'type': 'string'
				},
				{
					'key': 'zipcode',
					'label': 'Zipcode',
					'type': 'string'
				},
				{
					'key': 'kwh',
					'label': 'kWh',
					'type': 'number'
				}
			]
		},
	createdBy: 'someone@somewhere.com',
	_aggregatedOutputKeyAndTypeMap: {}
};

describe('AuditExportUtil', () => {
	let util: AuditExportUtil;
	let mockS3Client: S3Client;
	let mockSQSClient: SQSClient;
	let mockAthenaClient: AthenaClient;
	let mockPipelineClient: PipelineClient;
	let mockLambdaRequestContext: GetLambdaRequestContext;
	let mockGetSignedUrl: GetSignedUrl;
	let mockSQSUrl = 'some-url';
	let mockAthenaDBName = 'db';
	let mockAuditLogTableName = 'audit-logs';
	let mockBucketName = 'test';
	let mockBucketPrefix = 'pipelines';


	beforeEach(() => {
		const logger = pino(
			pino.destination({
				sync: true // test frameworks must use pino logger in sync mode!
			})
		);
		logger.level = 'info';
		mockS3Client = mock<S3Client>();
		mockSQSClient = mock<SQSClient>();
		mockAthenaClient = mock<AthenaClient>();
		mockPipelineClient = mock<PipelineClient>();
		mockLambdaRequestContext = mock<GetLambdaRequestContext>();
		mockGetSignedUrl = mock<GetSignedUrl>();
		util = new AuditExportUtil(logger, mockS3Client, mockGetSignedUrl, mockBucketName, mockBucketPrefix, mockSQSClient, mockAthenaClient, mockSQSUrl, mockPipelineClient, mockLambdaRequestContext, mockAthenaDBName, mockAuditLogTableName);
	});

	it('should create a athena query needed to perform an audit log export', () => {
		const expectedQuery = "\n" +
			"WITH inputs AS (\n" +
			"\tSELECT auditId, ikv['timestamp'] AS in_timestamp, ikv['zipcode'] AS in_zipcode, ikv['kwh'] AS in_kwh\n" +
			"\tFROM (\n" +
			"\t\tSELECT  auditId, map_agg(input.name, input.value) ikv\n" +
			"\t\tFROM    \"audit-logs\" CROSS JOIN UNNEST(inputs) AS t(input)\n" +
			"\t\tWHERE   pipeline_id = '01h03evc0mjceh3qa4cyd5zzrx'\n" +
			"\t\tAND     execution_id = '01h0672sx482bzc26fpb7y8fq0'\n" +
			"\t\tAND     input.name <> '___row_identifier___'\n" +
			"\t\tGROUP BY auditId\n" +
			"\t)\n" +
			"), outputs AS (\n" +
			"\tSELECT auditId,\n" +
			"\t\tokv_formulas['timestamp'] AS out_timestamp_formula, okv_results['timestamp'] AS out_timestamp_results, okv_impacts['timestamp'] AS out_timestamp_impacts, okv_calculations['timestamp'] AS out_timestamp_calculations, okv_referenceDatasets['timestamp'] AS out_timestamp_referenceDatasets,\n" +
			"okv_formulas['zipcode'] AS out_zipcode_formula, okv_results['zipcode'] AS out_zipcode_results, okv_impacts['zipcode'] AS out_zipcode_impacts, okv_calculations['zipcode'] AS out_zipcode_calculations, okv_referenceDatasets['zipcode'] AS out_zipcode_referenceDatasets,\n" +
			"okv_formulas['kwh'] AS out_kwh_formula, okv_results['kwh'] AS out_kwh_results, okv_impacts['kwh'] AS out_kwh_impacts, okv_calculations['kwh'] AS out_kwh_calculations, okv_referenceDatasets['kwh'] AS out_kwh_referenceDatasets,\n" +
			"okv_formulas['co2e'] AS out_co2e_formula, okv_results['co2e'] AS out_co2e_results, okv_impacts['co2e'] AS out_co2e_impacts, okv_calculations['co2e'] AS out_co2e_calculations, okv_referenceDatasets['co2e'] AS out_co2e_referenceDatasets\n" +
			"\tFROM (\n" +
			"\t\tSELECT  auditId,\n" +
			"\t\t\tmap_agg(output.name, output.formula) AS okv_formulas,\n" +
			"\t\t\tmap_agg(output.name, output.result) AS okv_results,\n" +
			"\t\t\tmap_agg(output.name, output.resources.activities) AS okv_impacts,\n" +
			"\t\t\tmap_agg(output.name, output.resources.calculations) AS okv_calculations,\n" +
			"\t\t\tmap_agg(output.name, output.resources.referenceDatasets) AS okv_referenceDatasets\n" +
			"\t\tFROM    \"audit-logs\" CROSS JOIN UNNEST(outputs) AS t(output)\n" +
			"\t\tWHERE   pipeline_id = '01h03evc0mjceh3qa4cyd5zzrx'\n" +
			"\t\tAND     execution_id = '01h0672sx482bzc26fpb7y8fq0'\n" +
			"\t\tGROUP BY auditId\n" +
			"\t)\n" +
			")\n" +
			"SELECT inputs.auditId,\n" +
			"in_timestamp, in_zipcode, in_kwh,\n" +
			"out_timestamp_formula, out_timestamp_results,out_timestamp_impacts,out_timestamp_calculations,out_timestamp_referenceDatasets,\n" +
			"out_zipcode_formula, out_zipcode_results,out_zipcode_impacts,out_zipcode_calculations,out_zipcode_referenceDatasets,\n" +
			"out_kwh_formula, out_kwh_results,out_kwh_impacts,out_kwh_calculations,out_kwh_referenceDatasets,\n" +
			"out_co2e_formula, out_co2e_results,out_co2e_impacts,out_co2e_calculations,out_co2e_referenceDatasets\n" +
			"FROM inputs LEFT JOIN outputs ON inputs.auditId = outputs.auditId"

		const query = util['createAthenaQuery'](pipeline, '01h0672sx482bzc26fpb7y8fq0');

		expect(query).toEqual(expectedQuery);

		console.log(query);
	});


});
