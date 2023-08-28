@setup_LoadTest @loadTest
Feature: Load Testing - Single pipeline

	Scenario: Setup groups
		Given group /loadTestSinglePipeline exists
		Given group / has user load_test_single_pipeline_admin@amazon.com with role admin and password p@ssword1
		And group /loadTestSinglePipeline has user load_test_single_pipeline_admin@amazon.com granted access with role admin


	Scenario: Setup environment in global scope
		Given I'm using the referenceDatasets api
		Given I store the environment variable LOAD_TEST_DIRECTORY as directory in global scope

	Scenario: Teardown: Pipelines with tag testSource:loadTestSinglePipeline
	Cleans up any pipelines remaining from a previous test run associated with this test.

		Given I'm using the pipelines api
		And I authenticate using email load_test_single_pipeline_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /loadTestSinglePipeline
		And no pipeline exists with tags testSource:loadTestSinglePipeline

	Scenario: Teardown: Metrics with tag testSource:load_test_single_pipeline_admin
	Cleans up any tags remaining from a previous test run associated with this test.

		Given I'm using the pipelines api
		And I authenticate using email load_test_single_pipeline_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /
		And no metric exists with tags testSource:loadTestSinglePipeline

	Scenario: Teardown: Activities with tag testSource:LoadTestSinglePipeline
	Cleans up any activities remaining from test run associated with this test.
		Given I'm using the impacts api
		And I authenticate using email load_test_single_pipeline_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /loadTestSinglePipeline
		And no activities exists with tags testSource:loadTestSinglePipeline

	Scenario: Teardown: ReferenceDataSets with tag testSource:LoadTestSinglePipeline
	Cleans up any referenceDatasets remaining from test run associated with this test.
		Given I'm using the referenceDatasets api
		And I authenticate using email load_test_single_pipeline_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /loadTestSinglePipeline
		And no referenceDatasets exists with tags testSource:loadTestSinglePipeline

	Scenario: Teardown: Calculations with tag testSource:LoadTestSinglePipeline
	Cleans up any calculations remaining from test run associated with this test.
		Given I'm using the calculations api
		And I authenticate using email load_test_single_pipeline_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /loadTestSinglePipeline
		And no calculations exists with tags testSource:loadTestSinglePipeline

	Scenario: Create Metrics on group /loadTestSinglePipeline
		Given I'm using the pipelines api
		And I authenticate using email load_test_single_pipeline_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /
		# Top Scope
		And I set body to {"name":"load_test_single_pipeline:ghg:co2e","summary":"GHG Scope 1 direct emissions.","aggregationType":"sum","tags":{"testSource":"loadTestSinglePipeline","standard":"ghg","scope":"1"}}
		When I POST to /metrics
		Then response code should be 201
		Then I pause for 1000ms
		And I set body to {"name":"load_test_single_pipeline:ghg:scope1","summary":"GHG Scope 1 direct emissions.","aggregationType":"sum","tags":{"testSource":"loadTestSinglePipeline","standard":"ghg","scope":"1"},"outputMetrics":["load_test_single_pipeline:ghg:co2e"]}
		When I POST to /metrics
		Then response code should be 201
		# Scope 1
		Then I pause for 1000ms
		And I store the value of body path $.id as metric_scope1_mobile_id in global scope
		Given I set body to {"name":"load_test_single_pipeline:ghg:scope1:stationary","summary":"GHG Scope 1 direct emissions from mobile combustion.","aggregationType":"sum","outputMetrics":["load_test_single_pipeline:ghg:scope1"],"tags":{"testSource":"loadTestSinglePipeline","standard":"ghg","scope":"1","category":"mobile"}}
		When I POST to /metrics
		Then response code should be 201

	Scenario: Create emission factor
		Given I'm using the impacts api
		And I authenticate using email load_test_single_pipeline_admin@amazon.com and password p@ssword1
		And I set body to {"name":"load_test_single_pipeline:direct:stationary:natural_gas","description":"emission factor natural gas","attributes":{"category":"direct","version":"2021","subcategory":"Stationary Combustion"},"tags":{"category":"direct","version":"2021","subcategory":"Stationary Combustion", "testSource":"loadTestSinglePipeline"},"impacts":{"co2e_mmbtu":{"name":"co2e_mmbtu","attributes":{"outUnit":"kg CO2 per mmBtu"},"components":{"co2":{"key":"co2","value":51.9,"type":"pollutant"},"ch4":{"key":"ch4","value":0.002,"type":"pollutant"},"n2o":{"key":"n2o","value":0.0003,"type":"pollutant"}}},"co2e_short_ton":{"name":"g CO2 per short ton","attributes":{"outUnit":"kg CO2 per short ton"},"components":{"co2":{"key":"co2","value":0.05333,"type":"pollutant"},"ch4":{"key":"ch4","value":0.0000301,"type":"pollutant"},"n2o":{"key":"n2o","value":0.000001,"type":"pollutant"}}}}}
		When I POST to /activities
		Then response code should be 201
		And I store the value of body path $.id as activityId3 in global scope

	Scenario: Create new referenceDataset using s3 as the datasource
		Given I'm using the referenceDatasets api
		And I authenticate using email load_test_single_pipeline_admin@amazon.com and password p@ssword1
		And I set body to {"name":"load_test_single_pipeline_gas_to_gwp","description":"random number to unique id map" , "datasetSource": "s3" ,"datasetHeaders":["row_number", "unique_id","gas_type","value"],"tags":{"testSource":"loadTestSinglePipeline"}}
		When I POST to /referenceDatasets
		Then response code should be 201
		And I store the value of body path $.uploadUrl as s3_referenceDataset_uploadUrl in global scope
		And I store the value of body path $.id as s3_referenceDataset_id in global scope
		And I store the value of body path $.createdAt as s3_referenceDataset_createdAt in global scope

	Scenario: Update the reference dataset by uploading the file using the signed url
		Given I'm using the referenceDatasets api
		And I authenticate using email load_test_single_pipeline_admin@amazon.com and password p@ssword1
		And Using directory stored at global variable directory I upload referenceDataSet.csv as an input CSV file to url stored at global variable s3_referenceDataset_uploadUrl
		Then I pause for 200000ms
		When I GET /referenceDatasets/`s3_referenceDataset_id`
		Then response code should be 200
		And response body path $.status should be success
		And response body path $.state should be enabled

	# Custom Calculations
	Scenario: Create unit conversion calculation
		Given I'm using the calculations api
		And I authenticate using email load_test_single_pipeline_admin@amazon.com and password p@ssword1
		And I set body to {"name":"load_test_single_pipeline_heat_therms_to_mmbtu","summary":"Convert therms to mmBtu","formula":":therms*0.1","parameters":[{"index":0,"key":"therms","label":"therms","description":"therms","type":"number"}],"outputs":[{"name":"mmbtu","description":"mmbtu","type":"number"}],"tags":{"version":"2021","subcategory":"Stationary Combustion","type":"unit conversion","testSource":"loadTestSinglePipeline"}}
		When I POST to /calculations
		Then response code should be 201

	Scenario: Create heat content calculation
		Given I'm using the calculations api
		And I authenticate using email load_test_single_pipeline_admin@amazon.com and password p@ssword1
		And I set body to {"name":"load_test_single_pipeline_heat_content_equation","summary":"Calculates the emissions when the actual fuel heat content is known","formula":"(#load_test_single_pipeline_heat_therms_to_mmbtu(:therms,group='/')*IMPACT(CONCAT('load_test_single_pipeline:direct:stationary:',LOOKUP(:reference_row_number,'load_test_single_pipeline_gas_to_gwp', 'row_number','gas_type',group='/')),'co2e_mmbtu','co2',group='/')*LOOKUP(:reference_row_number,'load_test_single_pipeline_gas_to_gwp', 'row_number', 'value',group='/'))*0.001","parameters":[{"index":0,"key":"reference_row_number","label":"reference_row_number","description":"reference_row_number","type":"number"},{"index":1,"key":"therms","label":"therms","description":"therms","type":"number"},{"index":2,"key":"gas","label":"gas","description":"gas","type":"string"}],"outputs":[{"name":"co2e","description":"co2e in metric tons","type":"number"}],"tags":{"version":"2021","subcategory":"Stationary Combustion","type":"emission equation","testSource":"loadTestSinglePipeline"}}
		When I POST to /calculations
		Then response code should be 201
		And I store the value of body path $.id as calculation_id in global scope

 	# Pipeline
	Scenario: Create simple pipeline pipeline1 that output to metric load_test_single_pipeline:ghg:scope1:stationary
		Given I'm using the pipelines api
		And I authenticate using email load_test_single_pipeline_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /loadTestSinglePipeline
		And I set body to {"connectorConfig":{"input":[{"name":"sif-csv-pipeline-input-connector"}]},"attributes":{"scope":"1","type":"stationary combustion"},"name":"load_test_single_pipeline_scope_1_stationary","description":"data processing pipeline to calculate scope 1 stationary combustion","transformer":{"transforms":[{"index":0,"formula":"AS_TIMESTAMP(:date,'M/d/yyyy HH:mm:ss')","outputs":[{"description":"Timestamp of bill.","index":0,"key":"time","label":"Time","type":"timestamp"}]},{"index":1,"formula":"#load_test_single_pipeline_heat_content_equation(:reference_row_number,:therms,'co2',group='/')+#load_test_single_pipeline_heat_content_equation(:reference_row_number,:therms,'ch4',group='/')+#load_test_single_pipeline_heat_content_equation(:reference_row_number,:therms,'n2o',group='/')","outputs":[{"description":"therms","index":0,"key":"reference_row_number","label":"therms","type":"number","metrics":["load_test_single_pipeline:ghg:scope1:stationary"]}]}],"parameters":[{"index":0,"key":"date","type":"string"},{"index":1,"key":"reference_row_number","type":"string"},{"index":2,"key":"therms","label":"therms","description":"therms","type":"number"}]},"tags":{"testSource":"loadTestSinglePipeline"}}
		When I POST to /pipelines
		And I store the value of body path $.id as pipeline_1 in global scope


	Scenario: Upload Input File for Pipeline Processing for /loadTestSinglePipeline
		Given I'm using the pipelineProcessor api
		And I authenticate using email load_test_single_pipeline_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /loadTestSinglePipeline
		And I set body to { "expiration" : 300}
		When I POST to /pipelines/`pipeline_1`/executions
		And response body should contain inputUploadUrl
		And I store the value of body path $.inputUploadUrl as pipeline_1_url in global scope
		And I store the value of body path $.id as pipeline_1_execution in global scope



	Scenario: Upload file concurrently
		Given I'm using the pipelineProcessor api
		And I authenticate using email load_test_single_pipeline_admin@amazon.com and password p@ssword1
		When Using directory stored at global variable directory, I upload pipeline execution concurrently using this urls
			| url                  	| file                                     	|
			| `pipeline_1_url` 		| load_test_single_1_1.csv 					|

		Then I wait until pipeline executions are complete with 1800s timeout
			| groupId                       | pipelineId   | executionId            |
			| /loadTestSinglePipeline				| `pipeline_1` | `pipeline_1_execution` |

Scenario: Teardown: Pipelines with tag testSource:loadTestSinglePipeline
	Cleans up any pipelines remaining from a previous test run associated with this test.
		Given I'm using the pipelines api
		Then I pause for 100000ms
		And I authenticate using email load_test_single_pipeline_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /loadTestSinglePipeline
		And no pipeline exists with tags testSource:loadTestSinglePipeline

	Scenario: Teardown: Metrics with tag testSource:load_test_single_pipeline_admin
	Cleans up any tags remaining from a previous test run associated with this test.

		Given I'm using the pipelines api
		And I authenticate using email load_test_single_pipeline_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /
		And no metric exists with tags testSource:loadTestSinglePipeline

	Scenario: Teardown: Activities with tag testSource:LoadTestSinglePipeline
	Cleans up any activities remaining from test run associated with this test.
		Given I'm using the impacts api
		And I authenticate using email load_test_single_pipeline_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /loadTestSinglePipeline
		And no activities exists with tags testSource:loadTestSinglePipeline

	Scenario: Teardown: ReferenceDataSets with tag testSource:LoadTestSinglePipeline
	Cleans up any referenceDatasets remaining from test run associated with this test.
		Given I'm using the referenceDatasets api
		And I authenticate using email load_test_single_pipeline_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /loadTestSinglePipeline
		And no referenceDatasets exists with tags testSource:loadTestSinglePipeline

	Scenario: Teardown: Calculations with tag testSource:LoadTestSinglePipeline
	Cleans up any calculations remaining from test run associated with this test.
		Given I'm using the calculations api
		And I authenticate using email load_test_single_pipeline_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /loadTestSinglePipeline
		And no calculations exists with tags testSource:loadTestSinglePipeline


	Scenario: Teardown: Revoke users
		Given group / has user load_test_single_pipeline_admin@amazon.com revoked
		And group /loadTestSinglePipeline has user load_test_single_pipeline_admin@amazon.com revoked


	Scenario: Teardown: Delete groups
		And group /loadTestSinglePipeline has been removed
