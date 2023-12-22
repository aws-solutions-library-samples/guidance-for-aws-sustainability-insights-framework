@setup_endToEnd @endToEnd
Feature:
	End to End Integration Test

	Scenario: Setup users
		Given I'm using the accessManagement api
		And group /e2e exists
		And group / has user e2e_tests_admin@amazon.com with role admin and password p@ssword1

	Scenario: Grant group /e2e access to sif-csv-pipeline-input-connector processor
		Given I'm using the pipelines api
		And I authenticate using email e2e_tests_admin@amazon.com and password p@ssword1
		When I GET /connectors?name=sif-csv-pipeline-input-connector
		Then response code should be 200
		And I store the value of body path $.connectors[0].id as connector_id in global scope
		When I remove header Content-Type
		When I PUT /connectors/`connector_id`/groups/%2fe2e
		Then response code should be 204

	Scenario: List groups
		Given I'm using the accessManagement api
		And I authenticate using email e2e_tests_admin@amazon.com and password p@ssword1
		When I GET /groups
		Then response code should be 200
		And response body path $.groups should be of type array
		And I store the value of body path $.groups as e2e_groups in global scope
		And groups response stored in global variable e2e_groups should contain group /e2e with name e2e created by integrationTests

	Scenario: Create Metrics
		Given I'm using the pipelines api
		And I authenticate using email e2e_tests_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /e2e
		And I set body to {"name":"int:ghg:scope1","summary":"GHG Scope 1 direct emissions.","aggregationType":"sum","tags":{"standard":"ghg","scope":"1"}}
		When I POST to /metrics
		Then response code should be 201
		And response body should contain id
		And I store the value of body path $.id as metric_scope1_id in global scope
		And response body path $.name should be int:ghg:scope1
		And response body path $.summary should be GHG Scope 1 direct emissions.
		And response body path $.aggregationType should be sum
		And response body path $.tags.standard should be ghg
		And response body path $.tags.scope should be 1
		Given I set body to {"name":"int:ghg:scope1:mobile","summary":"GHG Scope 1 direct emissions from mobile combustion.","aggregationType":"sum","outputMetrics":["int:ghg:scope1"],"tags":{"standard":"ghg","scope":"1","category":"mobile"}}
		When I POST to /metrics
		Then response code should be 201
		And response body should contain id
		And I store the value of body path $.id as metric_scope1_mobile_id in global scope
		And response body path $.name should be int:ghg:scope1:mobile
		And response body path $.summary should be GHG Scope 1 direct emissions from mobile combustion.
		And response body path $.aggregationType should be sum
		And response body path $.tags.standard should be ghg
		And response body path $.tags.scope should be 1
		And response body path $.tags.category should be mobile
		And response body path $.outputMetrics[0] should be int:ghg:scope1
		Given I set body to {"name":"int:ghg:scope1:stationary","summary":"GHG Scope 1 direct emissions from stationary combustion.","aggregationType":"sum","outputMetrics":["int:ghg:scope1"],"tags":{"standard":"ghg","scope":"1","category":"stationary"}}
		When I POST to /metrics
		Then response code should be 201
		And response body should contain id
		And I store the value of body path $.id as metric_scope1_stationary_id in global scope
		And response body path $.name should be int:ghg:scope1:stationary
		And response body path $.summary should be GHG Scope 1 direct emissions from stationary combustion.
		And response body path $.aggregationType should be sum
		And response body path $.tags.standard should be ghg
		And response body path $.tags.scope should be 1
		And response body path $.tags.category should be stationary
		And response body path $.outputMetrics[0] should be int:ghg:scope1

	Scenario: Create Reference Datasets
		Given I'm using the referenceDatasets api
		And I authenticate using email e2e_tests_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /e2e
		When I create a reference dataset in group context /e2e with name ZipcodeToState tags {"type":"E2E"} and rows
			| zipcode | state |
			| 80238   | CO    |
			| 98116   | WA    |
			| 55432   | MN    |
			| 52172   | IA    |
			| 75001   | TX    |
		And I create a reference dataset in group context /e2e with name StatePrimaryGen tags {"type":"E2E"} and rows
			| state | primary_gen |
			| CO    | gas         |
			| WA    | hydro       |
			| MN    | nuclear     |
			| IA    | wind        |
			| TX    | coal        |
		And I create a reference dataset in group context /e2e with name GenToImpact tags {"type":"E2E"} and rows
			| gen     | if                     |
			| gas     | us:electricity:gas     |
			| hydro   | us:electricity:hydro   |
			| nuclear | us:electricity:nuclear |
			| wind    | us:electricity:wind    |
			| coal    | us:electricity:coal    |
		And I GET /referenceDatasets
		Then response code should be 200
		And response body path $.referenceDatasets.length should be 3

	Scenario: Create Activities
		Given I'm using the impacts api
		And I authenticate using email e2e_tests_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /e2e
		And I set body to {"name":"us:electricity:hydro","attributes":{"refUnit":"kwh"},"tags":{"type":"E2E"},"impacts":{"co2e":{"name":"co2e","attributes":{"refUnit":"kwh","outUnit":"kg CO2eq"},"components":{"co2":{"key":"co2","value":2,"type":"pollutant"},"ch4":{"key":"ch4","value":1,"type":"pollutant"}}}}}
		When I POST to /activities
		Then response code should be 201
		And response body should contain id
		And I store the value of body path $.id as e2e_activities_hydro_id in global scope
		When I set body to {"name":"us:electricity:gas","attributes":{"refUnit":"kwh"},"tags":{"type":"E2E"},"impacts":{"co2e":{"name":"co2e","attributes":{"refUnit":"kwh","outUnit":"kg CO2eq"},"components":{"co2":{"key":"co2","value":40,"type":"pollutant"},"ch4":{"key":"ch4","value":20,"type":"pollutant"}}}}}
		When I POST to /activities
		Then response code should be 201
		And response body should contain id
		And I store the value of body path $.id as e2e_activities_gas_id in global scope
		When I set body to {"name":"us:electricity:nuclear","attributes":{"refUnit":"kwh"},"tags":{"type":"E2E"},"impacts":{"co2e":{"name":"co2e","attributes":{"refUnit":"kwh","outUnit":"kg CO2eq"},"components":{"co2":{"key":"co2","value":10,"type":"pollutant"},"ch4":{"key":"ch4","value":50,"type":"pollutant"}}}}}
		When I POST to /activities
		Then response code should be 201
		And response body should contain id
		And I store the value of body path $.id as e2e_activities_nuclear_id in global scope
		When I set body to {"name":"us:electricity:wind","attributes":{"refUnit":"kwh"},"tags":{"type":"E2E"},"impacts":{"co2e":{"name":"co2e","attributes":{"refUnit":"kwh","outUnit":"kg CO2eq"},"components":{"co2":{"key":"co2","value":1,"type":"pollutant"},"ch4":{"key":"ch4","value":1,"type":"pollutant"}}}}}
		When I POST to /activities
		Then response code should be 201
		And response body should contain id
		And I store the value of body path $.id as e2e_activities_wind_id in global scope
		When I set body to {"name":"us:electricity:coal","attributes":{"refUnit":"kwh"},"tags":{"type":"E2E"},"impacts":{"co2e":{"name":"co2e","attributes":{"refUnit":"kwh","outUnit":"kg CO2eq"},"components":{"co2":{"key":"co2","value":120,"type":"pollutant"},"ch4":{"key":"ch4","value":80,"type":"pollutant"}}}}}
		When I POST to /activities
		Then response code should be 201
		And I store the value of body path $.id as e2e_activities_coal_id in global scope
		When I GET /activities
		Then response code should be 200
		And response body path $.activities.length should be 5

	Scenario: Create Calculation
		Given I'm using the calculations api
		And I authenticate using email e2e_tests_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /e2e
		And I set body to {"name": "electricity_emissions","summary": "Calculates the emissions from electricity consumption","formula": ":kwh*:ef","parameters": [{"index": 0,"key": "kwh","label": "kWh","description": "Kilowatt hours of electricity consumed","type": "number"},{"index": 1,"key": "ef","label": "Emissions Factor","description": "CO2e of polutant per kilowatt hour","type": "number"}],"outputs": [{"name": "co2e","description": "CO2 equivalent in tonnes","type": "number"}],"tags": {"type": "E2E"}}
		When I POST to /calculations
		Then response code should be 201
		And response body should contain id
		And I store the value of body path $.id as electricity_emissions_calculation in global scope
		When I GET /calculations
		Then response code should be 200
		And response body path $.calculations.length should be 1

	Scenario: Create Pipeline
		Given I'm using the pipelines api
		And I authenticate using email e2e_tests_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /e2e
		And I set body to {"connectorConfig":{"input": [{"name": "sif-csv-pipeline-input-connector"}]},"attributes":{"type":"E2E"},"name":"Household Electricity Carbon Footprint","description":"E2E test pipeline","transformer":{"transforms":[{"index":0,"formula":"AS_TIMESTAMP(:reading date,'M/d/yy')","outputs":[{"description":"Timestamp of business activity.","index":0,"key":"time","label":"Time","type":"timestamp"}]},{"index":1,"formula":":zipcode","outputs":[{"description":"Zipcode where electricity consumption occurred","index":0,"key":"zipcode","label":"Zip","type":"string"}]},{"index":2,"formula":":month","outputs":[{"description":"Month of electricity consumption","index":0,"key":"month","label":"Month","type":"string"}]},{"index":3,"formula":":kwh","outputs":[{"description":"kWh of electricity consumption in the month","index":0,"key":"kwh","label":"kWh","type":"number"}]},{"index":4,"formula":"#electricity_emissions(:kwh,IMPACT(LOOKUP(LOOKUP(LOOKUP(:zipcode, 'ZipcodeToState', 'zipcode', 'state'), 'StatePrimaryGen', 'state', 'primary_gen'), 'GenToImpact', 'gen', 'if'), 'co2e', 'co2'))","outputs":[{"description":"CO2e of electricty generation (in tonnes)","index":0,"key":"co2e","label":"CO2e","type":"number"}]}],"parameters":[{"index":0,"key":"reading date","type":"string"},{"index":1,"key":"zipcode","label":"Zipcode","description":"Zipcode of electricity consumption","type":"string"},{"index":2,"key":"month","label":"Month","description":"Month of electricity generation","type":"string"},{"index":3,"key":"kwh","label":"kWh","description":"kWh of electricity generation in the month","type":"number"}]}}
		When I POST to /pipelines
		Then response code should be 201
		And response body should contain id
		And I store the value of body path $.id as e2e_pipeline_id in global scope

	Scenario: Upload Input File for Pipeline Processing
		Given I'm using the pipelineProcessor api
		And I authenticate using email e2e_tests_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /e2e
		And I set body to { "expiration" : 300}
		When I POST to /pipelines/`e2e_pipeline_id`/executions
		Then response code should be 201
		And response body should contain id
		And response body path $.pipelineId should be `e2e_pipeline_id`
		And response body should contain inputUploadUrl
		And I store the value of body path $.inputUploadUrl as e2e_upload_url in global scope
		And I store the value of body path $.id as household_electricity_carbon_footprint_pipeline_execution_id in global scope
		When I GET /pipelines/`e2e_pipeline_id`/executions/`household_electricity_carbon_footprint_pipeline_execution_id`
		And response body path $.pipelineId should be `e2e_pipeline_id`
		And response body path $.id should be `household_electricity_carbon_footprint_pipeline_execution_id`
		And response body path $.status should be waiting
		Then response code should be 200
		When I upload an input CSV file to url stored at global variable e2e_upload_url with rows
			| reading date | zipcode | month | kwh   |
			| 1/1/22       | 80238   | JUN   | 100.2 |
			| 2/1/22       | 98116   | JUN   | 102.1 |
			| 3/1/22       | 55432   | JUL   | 120.2 |
			| 4/1/22       | 52172   | AUG   | 98.7  |
			| 5/1/22       | 75001   | AUG   | 153.8 |
		Then I pause for 20000ms
		When I GET /pipelines/`e2e_pipeline_id`/executions/`household_electricity_carbon_footprint_pipeline_execution_id`
		Then response code should be 200
		And response body path $.status should be success

	Scenario: Should return 409 when trying to retrieve outputDownloadUrl
		Given I'm using the pipelineProcessor api
		And I authenticate using email e2e_tests_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /e2e
		And I set body to { "expiration" : 300}
		When I POST to /pipelines/`e2e_pipeline_id`/executions/`household_electricity_carbon_footprint_pipeline_execution_id`/outputDownloadUrl
		Then response code should be 409
		And response body path $.message should be `e2e_pipeline_id` does not generate raw output file.

	Scenario: Retrieve and Validate Output
		Given I'm using the pipelineProcessor api
		And I authenticate using email e2e_tests_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /e2e
		# This should return the result from the latest value table because we do not specify execution id
		When I GET /activities?timeUnit=day&dateFrom=1/1/22&pipelineId=`e2e_pipeline_id`
		And response body path $.activities[?(@.zipcode=='80238')].month should be JUN
		And response body path $.activities[?(@.zipcode=='80238')].kwh should be 100.2
		And response body path $.activities[?(@.zipcode=='80238')].co2e should be 4008
		And response body path $.activities[?(@.zipcode=='98116')].month should be JUN
		And response body path $.activities[?(@.zipcode=='98116')].kwh should be 102.1
		And response body path $.activities[?(@.zipcode=='98116')].co2e should be 204.2
		And response body path $.activities[?(@.zipcode=='55432')].month should be JUL
		And response body path $.activities[?(@.zipcode=='55432')].kwh should be 120.2
		And response body path $.activities[?(@.zipcode=='55432')].co2e should be 1202
		And response body path $.activities[?(@.zipcode=='52172')].month should be AUG
		And response body path $.activities[?(@.zipcode=='52172')].kwh should be 98.7
		And response body path $.activities[?(@.zipcode=='52172')].co2e should be 98.7
		And response body path $.activities[?(@.zipcode=='75001')].month should be AUG
		And response body path $.activities[?(@.zipcode=='75001')].kwh should be 153.8
		And response body path $.activities[?(@.zipcode=='75001')].co2e should be 18456
		# This should return the result from the value table since user has specified execution id
		When I GET /activities?timeUnit=day&dateFrom=1/1/22&executionId=`household_electricity_carbon_footprint_pipeline_execution_id`&pipelineId=`e2e_pipeline_id`
		And response body path $.activities[?(@.zipcode=='80238')].month should be JUN
		And response body path $.activities[?(@.zipcode=='80238')].kwh should be 100.2
		And response body path $.activities[?(@.zipcode=='80238')].co2e should be 4008
		And response body path $.activities[?(@.zipcode=='98116')].month should be JUN
		And response body path $.activities[?(@.zipcode=='98116')].kwh should be 102.1
		And response body path $.activities[?(@.zipcode=='98116')].co2e should be 204.2
		And response body path $.activities[?(@.zipcode=='55432')].month should be JUL
		And response body path $.activities[?(@.zipcode=='55432')].kwh should be 120.2
		And response body path $.activities[?(@.zipcode=='55432')].co2e should be 1202
		And response body path $.activities[?(@.zipcode=='52172')].month should be AUG
		And response body path $.activities[?(@.zipcode=='52172')].kwh should be 98.7
		And response body path $.activities[?(@.zipcode=='52172')].co2e should be 98.7
		And response body path $.activities[?(@.zipcode=='75001')].month should be AUG
		And response body path $.activities[?(@.zipcode=='75001')].kwh should be 153.8
		And response body path $.activities[?(@.zipcode=='75001')].co2e should be 18456

	Scenario: Teardown - Pipeline
		When I'm using the pipelines api
		And I authenticate using email e2e_tests_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /e2e
		When I remove header Content-Type
		When I DELETE /pipelines/`e2e_pipeline_id`
		Then response code should be 204
		When I GET /pipelines
		Then response code should be 200
		And response body path $.pipelines.length should be 0
		# Delete Metric
		When I DELETE /metrics/`metric_scope1_stationary_id`
		Then response code should be 204
		When I GET /metrics/`metric_scope1_stationary_id`
		Then response code should be 404
		When I DELETE /metrics/`metric_scope1_mobile_id`
		Then response code should be 204
		When I GET /metrics/`metric_scope1_mobile_id`
		Then response code should be 404
		When I DELETE /metrics/`metric_scope1_id`
		Then response code should be 204
		When I GET /metrics/`metric_scope1_id`
		Then response code should be 404

	Scenario: Teardown - Calculation
		When I'm using the calculations api
		And I authenticate using email e2e_tests_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /e2e
		When I remove header Content-Type
		When I DELETE /calculations/`electricity_emissions_calculation`
		Then response code should be 204
		When I GET /calculations
		Then response code should be 200
		And response body path $.calculations.length should be 0

	Scenario: Teardown - Activities
		Given I'm using the impacts api
		And I authenticate using email e2e_tests_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /e2e
		When I remove header Content-Type
		When I DELETE /activities/`e2e_activities_hydro_id`
		Then response code should be 204
		When I DELETE /activities/`e2e_activities_gas_id`
		Then response code should be 204
		When I DELETE /activities/`e2e_activities_nuclear_id`
		Then response code should be 204
		When I DELETE /activities/`e2e_activities_wind_id`
		Then response code should be 204
		When I DELETE /activities/`e2e_activities_coal_id`
		Then response code should be 204
		When I GET /activities
		Then response code should be 200
		And response body path $.activities.length should be 0

	Scenario: Teardown - Reference Datasets
		When I'm using the referenceDatasets api
		And I authenticate using email e2e_tests_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /e2e
		And I GET /referenceDatasets
		Then response code should be 200
		And response body path $.referenceDatasets.length should be 3
		And I store the value of body path $.referenceDatasets[0].id as datasetId0 in global scope
		And I store the value of body path $.referenceDatasets[1].id as datasetId1 in global scope
		And I store the value of body path $.referenceDatasets[2].id as datasetId2 in global scope
		When I remove header Content-Type
		When I DELETE /referenceDatasets/`datasetId0`
		Then response code should be 204
		When I remove header Content-Type
		And I DELETE /referenceDatasets/`datasetId1`
		Then response code should be 204
		When I remove header Content-Type
		And I DELETE /referenceDatasets/`datasetId2`
		Then response code should be 204
		When I GET /referenceDatasets
		Then response code should be 200
		And response body path $.referenceDatasets.length should be 0

	Scenario: Revoke access to connector from group e2e
		When I'm using the pipelines api
		Given I authenticate using email e2e_tests_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		And I DELETE /connectors/`connector_id`/groups/%2fe2e
		Then response code should be 204

	Scenario: Teardown - Cleanup users
		When I'm using the accessManagement api
		And group / has user e2e_tests_admin@amazon.com revoked
		And group /e2e has been removed



