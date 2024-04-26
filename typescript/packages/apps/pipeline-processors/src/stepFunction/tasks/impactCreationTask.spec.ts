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

import { beforeEach, describe, expect, it } from 'vitest';
import pino from 'pino';
import { GetObjectCommand, GetObjectCommandInput, GetObjectCommandOutput, S3Client } from '@aws-sdk/client-s3';
import { ImpactCreationTask } from './impactCreationTask';
import { mockClient } from 'aws-sdk-client-mock';
import { mock, MockProxy } from 'vitest-mock-extended';
import type { ImpactClient, LambdaRequestContext, NewActivity, Pipeline, PipelineClient } from '@sif/clients';
import { sdkStreamMixin } from '@aws-sdk/util-stream-node';
import { Readable } from 'stream';
import { getPipelineImpactCreationOutputKey } from '../../utils/helper.utils';
import type { EventPublisher } from '@sif/events/dist';
import type { PipelineProcessorsRepository } from '../../api/executions/repository';
import type { ConnectorUtility } from '../../utils/connectorUtility';
import type { GetLambdaRequestContext } from '../../plugins/module.awilix';
import { convertGroupRolesToCognitoGroups, SecurityContext, SecurityScope } from '@sif/authz';

describe('ImpactCreationTask', () => {
	let mockedImpactClient: MockProxy<ImpactClient>;
	let underTest: ImpactCreationTask;
	let mockedPipelineProcessorRepository: MockProxy<PipelineProcessorsRepository>;
	let mockedConnectorUtility: MockProxy<ConnectorUtility>;
	let mockedPipelineClient: MockProxy<PipelineClient>;
	const mockedS3Client = mockClient(S3Client);
	const mockedBucket = 'mockedBucketName';
	mockedImpactClient = mock<ImpactClient>();
	let mockedEventPublisher: MockProxy<EventPublisher>;
	mockedPipelineProcessorRepository = mock<PipelineProcessorsRepository>();
	mockedEventPublisher = mock<EventPublisher>();
	mockedConnectorUtility = mock<ConnectorUtility>();
	mockedPipelineClient = mock<PipelineClient>();

	const getLambdaRequestContext: GetLambdaRequestContext = (securityContext: SecurityContext): LambdaRequestContext => {
		const { email, groupRoles, groupId } = securityContext;
		return {
			authorizer: {
				claims: {
					email: email,
					'cognito:groups': convertGroupRolesToCognitoGroups(groupRoles),
					groupContextId: groupId
				}
			}
		};
	};
	beforeEach(() => {
		const logger = pino(
			pino.destination({
				sync: true, // test frameworks must use pino logger in sync mode!
			})
		);
		logger.level = 'info';
		process.env['TENANT_ID'] = 'test-tenant';
		process.env['NODE_ENV'] = 'test-env';
		mockedImpactClient.createBulk.mockReset();
		mockedPipelineClient.get.mockResolvedValue({} as Pipeline);
		underTest = new ImpactCreationTask(
			logger,
			mockedS3Client as unknown as S3Client,
			mockedBucket,
			mockedImpactClient,
			mockedPipelineProcessorRepository,
			mockedEventPublisher, mockedPipelineClient, getLambdaRequestContext, mockedConnectorUtility
		);
		mockedPipelineProcessorRepository.get.mockResolvedValue({ id: executionId } as any);
		mockedPipelineProcessorRepository.create.mockReset();
	});

	const pipelineId = '22222';
	const executionId = '1111';
	const securityContext: SecurityContext = {
		email: 'test@test.com',
		groupRoles: {
			'/a': SecurityScope.admin
		},
		groupId: '/a'
	};

	it('should update execution status to success if it\'s not impact type pipeline', async () => {
		const response = await underTest.process({ security: securityContext, executionId, pipelineId, pipelineType: 'data', errorLocationList: [] });
		// Impact Client should have not been called
		expect(mockedImpactClient.createBulk).toHaveBeenCalledTimes(0);
		expect(response.moreActivitiesToProcess).toEqual(false);
		expect(mockedPipelineProcessorRepository.create).toBeCalledWith({ id: executionId, status: 'success' });
	});

	it('should update execution status to failed if it\'s not impact type pipeline and calculator output has error', async () => {
		const response = await underTest.process({ security: securityContext, executionId, pipelineId, pipelineType: 'data', errorLocationList: [{ key: 'testKey', bucket: mockedBucket }] });
		// Impact Client should have not been called
		expect(mockedImpactClient.createBulk).toHaveBeenCalledTimes(0);
		expect(response.moreActivitiesToProcess).toEqual(false);
		expect(mockedPipelineProcessorRepository.create).toBeCalledWith({ id: executionId, status: 'failed', statusMessage: 'error when performing calculation, review the pipeline execution error log for further info' });
	});

	it('should update execution status to failed if it\'s an impact type pipeline and calculator output has error', async () => {
		const response = await underTest.process({ security: securityContext, executionId, pipelineId, pipelineType: 'impacts', errorLocationList: [{ key: 'testKey', bucket: mockedBucket }] });
		// Impact Client should have not been called
		expect(mockedImpactClient.createBulk).toHaveBeenCalledTimes(0);
		expect(response.moreActivitiesToProcess).toEqual(false);
		expect(mockedPipelineProcessorRepository.create).toBeCalledWith({ id: executionId, status: 'failed', statusMessage: 'error when performing calculation, review the pipeline execution error log for further info' });
	});

	it('should process input files containing more than 10 activities successfully', async () => {
		const getCommandParams: GetObjectCommandInput = {
			Bucket: mockedBucket,
			Key: getPipelineImpactCreationOutputKey('pipelines', pipelineId, executionId)
		};

		const getCommandOutput: GetObjectCommandOutput = {
			$metadata: {},
			Body: sdkStreamMixin(Readable.from(impactsDataMoreThan10))
		};
		mockedS3Client.on(GetObjectCommand, getCommandParams).resolves(getCommandOutput);
		const response = await underTest.process({ security: securityContext, executionId, pipelineId, pipelineType: 'impacts', errorLocationList: [] });
		expect(response.moreActivitiesToProcess).toEqual(true);
		expect(mockedImpactClient.createBulk).toHaveBeenCalledOnce();
		// Assert that we create activities in batch of 10
		expect(mockedImpactClient.createBulk.mock.calls[0][0].activities.length).toEqual(10);
	});

	it('should process input files containing 10 activities successfully', async () => {
		const getCommandParams: GetObjectCommandInput = {
			Bucket: mockedBucket,
			Key: getPipelineImpactCreationOutputKey('pipelines', pipelineId, executionId)
		};

		const getCommandOutput: GetObjectCommandOutput = {
			$metadata: {},
			Body: sdkStreamMixin(Readable.from(impactsDataEqualTo10))
		};
		mockedS3Client.on(GetObjectCommand, getCommandParams).resolves(getCommandOutput);
		const response = await underTest.process({ security: securityContext, executionId, pipelineId, pipelineType: 'impacts', errorLocationList: [] });
		expect(response.moreActivitiesToProcess).toEqual(false);
		expect(mockedImpactClient.createBulk).toHaveBeenCalledOnce();
	});

	it('should set the execution status when there is no more activities to processed', async () => {
		const getCommandParams: GetObjectCommandInput = {
			Bucket: mockedBucket,
			Key: getPipelineImpactCreationOutputKey('pipelines', pipelineId, executionId)
		};

		const getCommandOutput: GetObjectCommandOutput = {
			$metadata: {},
			Body: sdkStreamMixin(Readable.from(impactsDataEqualTo2))
		};
		mockedS3Client.on(GetObjectCommand, getCommandParams).resolves(getCommandOutput);
		const response = await underTest.process({ security: securityContext, executionId, pipelineId, pipelineType: 'impacts', errorLocationList: [] });
		expect(response.moreActivitiesToProcess).toEqual(false);
		expect(mockedImpactClient.createBulk).toHaveBeenCalledOnce();
		expect(mockedImpactClient.createBulk.mock.calls[0][0].activities.length).toEqual(2);
		expect(mockedPipelineProcessorRepository.create).toBeCalledWith({ id: executionId, status: 'success' });
	});

	it('should assemble activity resource correctly', () => {
		const csvObject: { [key: string]: any } = {
			'activity:name': 'usepa:electricity:AKGD',
			'activity:description': 'USEPA electricity emission factors for ASCC Alaska Grid',
			'activity:tag:provider': 'US EPA',
			'activity:tag:dataset': 'Electricity',
			'activity:tag:item': 'AKGD',
			'activity:tag:version': '2024',
			'impact:total_output_emission_factors:name': 'Total output emission factors',
			'impact:total_output_emission_factors:attribute:unit': 'lb / MWh',
			'impact:total_output_emission_factors:component:co2:key': 'CO2',
			'impact:total_output_emission_factors:component:co2:value': '1052.114',
			'impact:total_output_emission_factors:component:co2:type': 'pollutant',
			'impact:total_output_emission_factors:component:ch4:key': 'CH4',
			'impact:total_output_emission_factors:component:ch4:value': '0.088',
			'impact:total_output_emission_factors:component:ch4:type': 'pollutant',
			'impact:total_output_emission_factors:component:n2o:key': 'N2O',
			'impact:total_output_emission_factors:component:n2o:value': '0.012',
			'impact:total_output_emission_factors:component:n2o:type': 'pollutant',
			'impact:non_baseload_emission_factors:name': 'Non-baseload emission factors',
			'impact:non_baseload_emission_factors:attribute:unit': 'lb / MWh',
			'impact:non_baseload_emission_factors:component:co2:key': 'CO2',
			'impact:non_baseload_emission_factors:component:co2:value': '1224.498',
			'impact:non_baseload_emission_factors:component:co2:type': 'pollutant',
			'impact:non_baseload_emission_factors:component:ch4:key': 'CH4',
			'impact:non_baseload_emission_factors:component:ch4:value': '0.123',
			'impact:non_baseload_emission_factors:component:ch4:type': 'pollutant',
			'impact:non_baseload_emission_factors:component:n2o:key': 'N2O',
			'impact:non_baseload_emission_factors:component:n2o:value': '0.017',
			'impact:non_baseload_emission_factors:component:n2o:type': 'pollutant',
		};

		const expected: NewActivity = {
			name: 'usepa:electricity:AKGD',
			description: 'USEPA electricity emission factors for ASCC Alaska Grid',
			attributes: {},
			tags: {
				provider: 'US EPA',
				dataset: 'Electricity',
				item: 'AKGD',
				version: '2024',
			},
			impacts: {
				total_output_emission_factors: {
					name: 'Total output emission factors',
					attributes: {
						unit: 'lb / MWh',
					},
					components: {
						co2: {
							key: 'CO2',
							value: 1052.114,
							type: 'pollutant',
						},
						ch4: {
							key: 'CH4',
							value: 0.088,
							type: 'pollutant',
						},
						n2o: {
							key: 'N2O',
							value: 0.012,
							type: 'pollutant',
						},
					},
				},
				non_baseload_emission_factors: {
					name: 'Non-baseload emission factors',
					attributes: {
						unit: 'lb / MWh',
					},
					components: {
						co2: {
							key: 'CO2',
							value: 1224.498,
							type: 'pollutant',
						},
						ch4: {
							key: 'CH4',
							value: 0.123,
							type: 'pollutant',
						},
						n2o: {
							key: 'N2O',
							value: 0.017,
							type: 'pollutant',
						},
					},
				},
			},
		};

		const actual = underTest.__assembleActivityResource_exposedForTesting(csvObject);
		expect(actual).to.toStrictEqual(expected);
	});


	it('should assemble activity containing component with missing value correctly (components are not included the payload)', () => {
		const csvObject: { [key: string]: any } = {
			'activity:name': 'usepa:electricity:AKGD',
			'activity:description': 'USEPA electricity emission factors for ASCC Alaska Grid',
			'activity:tag:provider': 'US EPA',
			'activity:tag:dataset': 'Electricity',
			'activity:tag:item': 'AKGD',
			'activity:tag:version': '2024',
			'impact:total_output_emission_factors:name': 'Total output emission factors',
			'impact:total_output_emission_factors:attribute:unit': 'lb / MWh',
			'impact:total_output_emission_factors:component:co2:key': 'CO2',
			'impact:total_output_emission_factors:component:co2:value': '1052.114',
			'impact:total_output_emission_factors:component:co2:type': 'pollutant',
			'impact:total_output_emission_factors:component:ch4:key': 'CH4',
			'impact:total_output_emission_factors:component:ch4:value': '0.088',
			'impact:total_output_emission_factors:component:ch4:type': 'pollutant',
			'impact:total_output_emission_factors:component:n2o:key': 'N2O',
			'impact:total_output_emission_factors:component:n2o:value': '0.012',
			'impact:total_output_emission_factors:component:n2o:type': 'pollutant',
			'impact:non_baseload_emission_factors:name': 'Non-baseload emission factors',
			'impact:non_baseload_emission_factors:attribute:unit': 'lb / MWh',
			'impact:non_baseload_emission_factors:component:co2:key': 'CO2',
			'impact:non_baseload_emission_factors:component:co2:value': '1224.498',
			'impact:non_baseload_emission_factors:component:co2:type': 'pollutant',
			'impact:non_baseload_emission_factors:component:ch4:key': 'CH4',
			'impact:non_baseload_emission_factors:component:ch4:value': '',
			'impact:non_baseload_emission_factors:component:ch4:type': 'pollutant',
			'impact:non_baseload_emission_factors:component:n2o:key': 'N2O',
			'impact:non_baseload_emission_factors:component:n2o:value': '',
			'impact:non_baseload_emission_factors:component:n2o:type': 'pollutant',
		};

		const expected: NewActivity = {
			name: 'usepa:electricity:AKGD',
			description: 'USEPA electricity emission factors for ASCC Alaska Grid',
			attributes: {},
			tags: {
				provider: 'US EPA',
				dataset: 'Electricity',
				item: 'AKGD',
				version: '2024',
			},
			impacts: {
				total_output_emission_factors: {
					name: 'Total output emission factors',
					attributes: {
						unit: 'lb / MWh',
					},
					components: {
						co2: {
							key: 'CO2',
							value: 1052.114,
							type: 'pollutant',
						},
						ch4: {
							key: 'CH4',
							value: 0.088,
							type: 'pollutant',
						},
						n2o: {
							key: 'N2O',
							value: 0.012,
							type: 'pollutant',
						},
					},
				},
				non_baseload_emission_factors: {
					name: 'Non-baseload emission factors',
					attributes: {
						unit: 'lb / MWh',
					},
					components: {
						co2: {
							key: 'CO2',
							value: 1224.498,
							type: 'pollutant',
						}
					},
				},
			},
		};

		const actual = underTest.__assembleActivityResource_exposedForTesting(csvObject);
		expect(actual).to.toStrictEqual(expected);
	});

	const impactsDataMoreThan10 = 'activity:tag:provider,impact:ghg_emissions:name,impact:ghg_emissions:component:margins:key,impact:ghg_emissions:component:margins:type,impact:ghg_emissions:component:with_margins:type,activity:tag:dataset,activity:name,activity:description,impact:ghg_emissions:component:with_margins:value,impact:ghg_emissions:component:margins:value,impact:ghg_emissions:component:without_margins:value,impact:ghg_emissions:component:without_margins:key,impact:ghg_emissions:component:with_margins:key,activity:tag:naics_title_2017,impact:ghg_emissions:attribute:unit,impact:ghg_emissions:component:without_margins:type,activity:tag:naics_code_2017\n' +
		'"USEEIO","GHG emission factors","Margins","pollutant","pollutant","SupplyChainGHGEmissionFactors_v1.2_NAICS_CO2e_USD2021","useeio:supply_chain_naics_co2e:111110","Supply Chain GHG EmissionFactors v1.2 NAICS by GHG USD 2021 for 111110",1.326,0.103,1.223,"Without Margins","With Margins","Soybean Farming","kg CO2e/2021 USD, purchaser price","pollutant","111110"\n' +
		'"USEEIO","GHG emission factors","Margins","pollutant","pollutant","SupplyChainGHGEmissionFactors_v1.2_NAICS_CO2e_USD2021","useeio:supply_chain_naics_co2e:111120","Supply Chain GHG EmissionFactors v1.2 NAICS by GHG USD 2021 for 111120",1.326,0.103,1.223,"Without Margins","With Margins","Oilseed (except Soybean) Farming","kg CO2e/2021 USD, purchaser price","pollutant","111120"\n' +
		'"USEEIO","GHG emission factors","Margins","pollutant","pollutant","SupplyChainGHGEmissionFactors_v1.2_NAICS_CO2e_USD2021","useeio:supply_chain_naics_co2e:111130","Supply Chain GHG EmissionFactors v1.2 NAICS by GHG USD 2021 for 111130",3.007,0.134,2.874,"Without Margins","With Margins","Dry Pea and Bean Farming","kg CO2e/2021 USD, purchaser price","pollutant","111130"\n' +
		'"USEEIO","GHG emission factors","Margins","pollutant","pollutant","SupplyChainGHGEmissionFactors_v1.2_NAICS_CO2e_USD2021","useeio:supply_chain_naics_co2e:111140","Supply Chain GHG EmissionFactors v1.2 NAICS by GHG USD 2021 for 111140",3.007,0.134,2.874,"Without Margins","With Margins","Wheat Farming","kg CO2e/2021 USD, purchaser price","pollutant","111140"\n' +
		'"USEEIO","GHG emission factors","Margins","pollutant","pollutant","SupplyChainGHGEmissionFactors_v1.2_NAICS_CO2e_USD2021","useeio:supply_chain_naics_co2e:111150","Supply Chain GHG EmissionFactors v1.2 NAICS by GHG USD 2021 for 111150",3.007,0.134,2.874,"Without Margins","With Margins","Corn Farming","kg CO2e/2021 USD, purchaser price","pollutant","111150"\n' +
		'"USEEIO","GHG emission factors","Margins","pollutant","pollutant","SupplyChainGHGEmissionFactors_v1.2_NAICS_CO2e_USD2021","useeio:supply_chain_naics_co2e:111160","Supply Chain GHG EmissionFactors v1.2 NAICS by GHG USD 2021 for 111160",3.007,0.134,2.874,"Without Margins","With Margins","Rice Farming","kg CO2e/2021 USD, purchaser price","pollutant","111160"\n' +
		'"USEEIO","GHG emission factors","Margins","pollutant","pollutant","SupplyChainGHGEmissionFactors_v1.2_NAICS_CO2e_USD2021","useeio:supply_chain_naics_co2e:111191","Supply Chain GHG EmissionFactors v1.2 NAICS by GHG USD 2021 for 111191",3.007,0.134,2.874,"Without Margins","With Margins","Oilseed and Grain Combination Farming","kg CO2e/2021 USD, purchaser price","pollutant","111191"\n' +
		'"USEEIO","GHG emission factors","Margins","pollutant","pollutant","SupplyChainGHGEmissionFactors_v1.2_NAICS_CO2e_USD2021","useeio:supply_chain_naics_co2e:111199","Supply Chain GHG EmissionFactors v1.2 NAICS by GHG USD 2021 for 111199",3.007,0.134,2.874,"Without Margins","With Margins","All Other Grain Farming","kg CO2e/2021 USD, purchaser price","pollutant","111199"\n' +
		'"USEEIO","GHG emission factors","Margins","pollutant","pollutant","SupplyChainGHGEmissionFactors_v1.2_NAICS_CO2e_USD2021","useeio:supply_chain_naics_co2e:111211","Supply Chain GHG EmissionFactors v1.2 NAICS by GHG USD 2021 for 111211",0.588,0.077,0.511,"Without Margins","With Margins","Potato Farming","kg CO2e/2021 USD, purchaser price","pollutant","111211"\n' +
		'"USEEIO","GHG emission factors","Margins","pollutant","pollutant","SupplyChainGHGEmissionFactors_v1.2_NAICS_CO2e_USD2021","useeio:supply_chain_naics_co2e:111219","Supply Chain GHG EmissionFactors v1.2 NAICS by GHG USD 2021 for 111219",0.588,0.077,0.511,"Without Margins","With Margins","Other Vegetable (except Potato) and Melon Farming","kg CO2e/2021 USD, purchaser price","pollutant","111219"\n' +
		'"USEEIO","GHG emission factors","Margins","pollutant","pollutant","SupplyChainGHGEmissionFactors_v1.2_NAICS_CO2e_USD2021","useeio:supply_chain_naics_co2e:111310","Supply Chain GHG EmissionFactors v1.2 NAICS by GHG USD 2021 for 111310",0.5,0.081,0.419,"Without Margins","With Margins","Orange Groves","kg CO2e/2021 USD, purchaser price","pollutant","111310"\n' +
		'"USEEIO","GHG emission factors","Margins","pollutant","pollutant","SupplyChainGHGEmissionFactors_v1.2_NAICS_CO2e_USD2021","useeio:supply_chain_naics_co2e:111320","Supply Chain GHG EmissionFactors v1.2 NAICS by GHG USD 2021 for 111320",0.5,0.081,0.419,"Without Margins","With Margins","Citrus (except Orange) Groves","kg CO2e/2021 USD, purchaser price","pollutant","111320"\n' +
		'"USEEIO","GHG emission factors","Margins","pollutant","pollutant","SupplyChainGHGEmissionFactors_v1.2_NAICS_CO2e_USD2021","useeio:supply_chain_naics_co2e:111331","Supply Chain GHG EmissionFactors v1.2 NAICS by GHG USD 2021 for 111331",0.5,0.081,0.419,"Without Margins","With Margins","Apple Orchards","kg CO2e/2021 USD, purchaser price","pollutant","111331"\n' +
		'"USEEIO","GHG emission factors","Margins","pollutant","pollutant","SupplyChainGHGEmissionFactors_v1.2_NAICS_CO2e_USD2021","useeio:supply_chain_naics_co2e:111332","Supply Chain GHG EmissionFactors v1.2 NAICS by GHG USD 2021 for 111332",0.5,0.081,0.419,"Without Margins","With Margins","Grape Vineyards","kg CO2e/2021 USD, purchaser price","pollutant","111332"\n' +
		'"USEEIO","GHG emission factors","Margins","pollutant","pollutant","SupplyChainGHGEmissionFactors_v1.2_NAICS_CO2e_USD2021","useeio:supply_chain_naics_co2e:111333","Supply Chain GHG EmissionFactors v1.2 NAICS by GHG USD 2021 for 111333",0.5,0.081,0.419,"Without Margins","With Margins","Strawberry Farming","kg CO2e/2021 USD, purchaser price","pollutant","111333"\n' +
		'"USEEIO","GHG emission factors","Margins","pollutant","pollutant","SupplyChainGHGEmissionFactors_v1.2_NAICS_CO2e_USD2021","useeio:supply_chain_naics_co2e:111334","Supply Chain GHG EmissionFactors v1.2 NAICS by GHG USD 2021 for 111334",0.5,0.081,0.419,"Without Margins","With Margins","Berry (except Strawberry) Farming","kg CO2e/2021 USD, purchaser price","pollutant","111334"\n' +
		'"USEEIO","GHG emission factors","Margins","pollutant","pollutant","SupplyChainGHGEmissionFactors_v1.2_NAICS_CO2e_USD2021","useeio:supply_chain_naics_co2e:111335","Supply Chain GHG EmissionFactors v1.2 NAICS by GHG USD 2021 for 111335",0.5,0.081,0.419,"Without Margins","With Margins","Tree Nut Farming","kg CO2e/2021 USD, purchaser price","pollutant","111335"\n' +
		'"USEEIO","GHG emission factors","Margins","pollutant","pollutant","SupplyChainGHGEmissionFactors_v1.2_NAICS_CO2e_USD2021","useeio:supply_chain_naics_co2e:111336","Supply Chain GHG EmissionFactors v1.2 NAICS by GHG USD 2021 for 111336",0.5,0.081,0.419,"Without Margins","With Margins","Fruit and Tree Nut Combination Farming","kg CO2e/2021 USD, purchaser price","pollutant","111336"\n' +
		'"USEEIO","GHG emission factors","Margins","pollutant","pollutant","SupplyChainGHGEmissionFactors_v1.2_NAICS_CO2e_USD2021","useeio:supply_chain_naics_co2e:111339","Supply Chain GHG EmissionFactors v1.2 NAICS by GHG USD 2021 for 111339",0.5,0.081,0.419,"Without Margins","With Margins","Other Noncitrus Fruit Farming","kg CO2e/2021 USD, purchaser price","pollutant","111339"\n' +
		'"USEEIO","GHG emission factors","Margins","pollutant","pollutant","SupplyChainGHGEmissionFactors_v1.2_NAICS_CO2e_USD2021","useeio:supply_chain_naics_co2e:111411","Supply Chain GHG EmissionFactors v1.2 NAICS by GHG USD 2021 for 111411",1.043,0.108,0.934,"Without Margins","With Margins","Mushroom Production","kg CO2e/2021 USD, purchaser price","pollutant","111411"\n' +
		'"USEEIO","GHG emission factors","Margins","pollutant","pollutant","SupplyChainGHGEmissionFactors_v1.2_NAICS_CO2e_USD2021","useeio:supply_chain_naics_co2e:111419","Supply Chain GHG EmissionFactors v1.2 NAICS by GHG USD 2021 for 111419",1.043,0.108,0.934,"Without Margins","With Margins","Other Food Crops Grown Under Cover","kg CO2e/2021 USD, purchaser price","pollutant","111419"\n' +
		'"USEEIO","GHG emission factors","Margins","pollutant","pollutant","SupplyChainGHGEmissionFactors_v1.2_NAICS_CO2e_USD2021","useeio:supply_chain_naics_co2e:111421","Supply Chain GHG EmissionFactors v1.2 NAICS by GHG USD 2021 for 111421",1.043,0.108,0.934,"Without Margins","With Margins","Nursery and Tree Production","kg CO2e/2021 USD, purchaser price","pollutant","111421"\n' +
		'"USEEIO","GHG emission factors","Margins","pollutant","pollutant","SupplyChainGHGEmissionFactors_v1.2_NAICS_CO2e_USD2021","useeio:supply_chain_naics_co2e:111422","Supply Chain GHG EmissionFactors v1.2 NAICS by GHG USD 2021 for 111422",1.043,0.108,0.934,"Without Margins","With Margins","Floriculture Production","kg CO2e/2021 USD, purchaser price","pollutant","111422"\n' +
		'"USEEIO","GHG emission factors","Margins","pollutant","pollutant","SupplyChainGHGEmissionFactors_v1.2_NAICS_CO2e_USD2021","useeio:supply_chain_naics_co2e:111910","Supply Chain GHG EmissionFactors v1.2 NAICS by GHG USD 2021 for 111910",1.431,0.111,1.32,"Without Margins","With Margins","Tobacco Farming","kg CO2e/2021 USD, purchaser price","pollutant","111910"\n' +
		'"USEEIO","GHG emission factors","Margins","pollutant","pollutant","SupplyChainGHGEmissionFactors_v1.2_NAICS_CO2e_USD2021","useeio:supply_chain_naics_co2e:111920","Supply Chain GHG EmissionFactors v1.2 NAICS by GHG USD 2021 for 111920",1.431,0.111,1.32,"Without Margins","With Margins","Cotton Farming","kg CO2e/2021 USD, purchaser price","pollutant","111920"\n' +
		'"USEEIO","GHG emission factors","Margins","pollutant","pollutant","SupplyChainGHGEmissionFactors_v1.2_NAICS_CO2e_USD2021","useeio:supply_chain_naics_co2e:111930","Supply Chain GHG EmissionFactors v1.2 NAICS by GHG USD 2021 for 111930",1.431,0.111,1.32,"Without Margins","With Margins","Sugarcane Farming","kg CO2e/2021 USD, purchaser price","pollutant","111930"\n' +
		'"USEEIO","GHG emission factors","Margins","pollutant","pollutant","SupplyChainGHGEmissionFactors_v1.2_NAICS_CO2e_USD2021","useeio:supply_chain_naics_co2e:111940","Supply Chain GHG EmissionFactors v1.2 NAICS by GHG USD 2021 for 111940",1.431,0.111,1.32,"Without Margins","With Margins","Hay Farming","kg CO2e/2021 USD, purchaser price","pollutant","111940"\n' +
		'"USEEIO","GHG emission factors","Margins","pollutant","pollutant","SupplyChainGHGEmissionFactors_v1.2_NAICS_CO2e_USD2021","useeio:supply_chain_naics_co2e:111991","Supply Chain GHG EmissionFactors v1.2 NAICS by GHG USD 2021 for 111991",1.431,0.111,1.32,"Without Margins","With Margins","Sugar Beet Farming","kg CO2e/2021 USD, purchaser price","pollutant","111991"\n';

	const impactsDataEqualTo10 = 'activity:tag:provider,impact:ghg_emissions:name,impact:ghg_emissions:component:margins:key,impact:ghg_emissions:component:margins:type,impact:ghg_emissions:component:with_margins:type,activity:tag:dataset,activity:name,activity:description,impact:ghg_emissions:component:with_margins:value,impact:ghg_emissions:component:margins:value,impact:ghg_emissions:component:without_margins:value,impact:ghg_emissions:component:without_margins:key,impact:ghg_emissions:component:with_margins:key,activity:tag:naics_title_2017,impact:ghg_emissions:attribute:unit,impact:ghg_emissions:component:without_margins:type,activity:tag:naics_code_2017\n' +
		'"USEEIO","GHG emission factors","Margins","pollutant","pollutant","SupplyChainGHGEmissionFactors_v1.2_NAICS_CO2e_USD2021","useeio:supply_chain_naics_co2e:111110","Supply Chain GHG EmissionFactors v1.2 NAICS by GHG USD 2021 for 111110",1.326,0.103,1.223,"Without Margins","With Margins","Soybean Farming","kg CO2e/2021 USD, purchaser price","pollutant","111110"\n' +
		'"USEEIO","GHG emission factors","Margins","pollutant","pollutant","SupplyChainGHGEmissionFactors_v1.2_NAICS_CO2e_USD2021","useeio:supply_chain_naics_co2e:111120","Supply Chain GHG EmissionFactors v1.2 NAICS by GHG USD 2021 for 111120",1.326,0.103,1.223,"Without Margins","With Margins","Oilseed (except Soybean) Farming","kg CO2e/2021 USD, purchaser price","pollutant","111120"\n' +
		'"USEEIO","GHG emission factors","Margins","pollutant","pollutant","SupplyChainGHGEmissionFactors_v1.2_NAICS_CO2e_USD2021","useeio:supply_chain_naics_co2e:111130","Supply Chain GHG EmissionFactors v1.2 NAICS by GHG USD 2021 for 111130",3.007,0.134,2.874,"Without Margins","With Margins","Dry Pea and Bean Farming","kg CO2e/2021 USD, purchaser price","pollutant","111130"\n' +
		'"USEEIO","GHG emission factors","Margins","pollutant","pollutant","SupplyChainGHGEmissionFactors_v1.2_NAICS_CO2e_USD2021","useeio:supply_chain_naics_co2e:111140","Supply Chain GHG EmissionFactors v1.2 NAICS by GHG USD 2021 for 111140",3.007,0.134,2.874,"Without Margins","With Margins","Wheat Farming","kg CO2e/2021 USD, purchaser price","pollutant","111140"\n' +
		'"USEEIO","GHG emission factors","Margins","pollutant","pollutant","SupplyChainGHGEmissionFactors_v1.2_NAICS_CO2e_USD2021","useeio:supply_chain_naics_co2e:111150","Supply Chain GHG EmissionFactors v1.2 NAICS by GHG USD 2021 for 111150",3.007,0.134,2.874,"Without Margins","With Margins","Corn Farming","kg CO2e/2021 USD, purchaser price","pollutant","111150"\n' +
		'"USEEIO","GHG emission factors","Margins","pollutant","pollutant","SupplyChainGHGEmissionFactors_v1.2_NAICS_CO2e_USD2021","useeio:supply_chain_naics_co2e:111160","Supply Chain GHG EmissionFactors v1.2 NAICS by GHG USD 2021 for 111160",3.007,0.134,2.874,"Without Margins","With Margins","Rice Farming","kg CO2e/2021 USD, purchaser price","pollutant","111160"\n' +
		'"USEEIO","GHG emission factors","Margins","pollutant","pollutant","SupplyChainGHGEmissionFactors_v1.2_NAICS_CO2e_USD2021","useeio:supply_chain_naics_co2e:111191","Supply Chain GHG EmissionFactors v1.2 NAICS by GHG USD 2021 for 111191",3.007,0.134,2.874,"Without Margins","With Margins","Oilseed and Grain Combination Farming","kg CO2e/2021 USD, purchaser price","pollutant","111191"\n' +
		'"USEEIO","GHG emission factors","Margins","pollutant","pollutant","SupplyChainGHGEmissionFactors_v1.2_NAICS_CO2e_USD2021","useeio:supply_chain_naics_co2e:111199","Supply Chain GHG EmissionFactors v1.2 NAICS by GHG USD 2021 for 111199",3.007,0.134,2.874,"Without Margins","With Margins","All Other Grain Farming","kg CO2e/2021 USD, purchaser price","pollutant","111199"\n' +
		'"USEEIO","GHG emission factors","Margins","pollutant","pollutant","SupplyChainGHGEmissionFactors_v1.2_NAICS_CO2e_USD2021","useeio:supply_chain_naics_co2e:111211","Supply Chain GHG EmissionFactors v1.2 NAICS by GHG USD 2021 for 111211",0.588,0.077,0.511,"Without Margins","With Margins","Potato Farming","kg CO2e/2021 USD, purchaser price","pollutant","111211"\n' +
		'"USEEIO","GHG emission factors","Margins","pollutant","pollutant","SupplyChainGHGEmissionFactors_v1.2_NAICS_CO2e_USD2021","useeio:supply_chain_naics_co2e:111219","Supply Chain GHG EmissionFactors v1.2 NAICS by GHG USD 2021 for 111219",0.588,0.077,0.511,"Without Margins","With Margins","Other Vegetable (except Potato) and Melon Farming","kg CO2e/2021 USD, purchaser price","pollutant","111219"\n';

	const impactsDataEqualTo2 = 'activity:tag:provider,impact:ghg_emissions:name,impact:ghg_emissions:component:margins:key,impact:ghg_emissions:component:margins:type,impact:ghg_emissions:component:with_margins:type,activity:tag:dataset,activity:name,activity:description,impact:ghg_emissions:component:with_margins:value,impact:ghg_emissions:component:margins:value,impact:ghg_emissions:component:without_margins:value,impact:ghg_emissions:component:without_margins:key,impact:ghg_emissions:component:with_margins:key,activity:tag:naics_title_2017,impact:ghg_emissions:attribute:unit,impact:ghg_emissions:component:without_margins:type,activity:tag:naics_code_2017\n' +
		'"USEEIO","GHG emission factors","Margins","pollutant","pollutant","SupplyChainGHGEmissionFactors_v1.2_NAICS_CO2e_USD2021","useeio:supply_chain_naics_co2e:111110","Supply Chain GHG EmissionFactors v1.2 NAICS by GHG USD 2021 for 111110",1.326,0.103,1.223,"Without Margins","With Margins","Soybean Farming","kg CO2e/2021 USD, purchaser price","pollutant","111110"\n' +
		'"USEEIO","GHG emission factors","Margins","pollutant","pollutant","SupplyChainGHGEmissionFactors_v1.2_NAICS_CO2e_USD2021","useeio:supply_chain_naics_co2e:111120","Supply Chain GHG EmissionFactors v1.2 NAICS by GHG USD 2021 for 111120",1.326,0.103,1.223,"Without Margins","With Margins","Oilseed (except Soybean) Farming","kg CO2e/2021 USD, purchaser price","pollutant","111120"\n';
});
