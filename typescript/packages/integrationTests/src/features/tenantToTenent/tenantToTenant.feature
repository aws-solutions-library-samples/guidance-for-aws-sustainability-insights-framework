@setup_tenantToTenant
# Tenant to Tenant scenarios to test data sharing across tenants
# requesting-tenant: refers to the tenant that proxies GET requests for activity and reference dataset to the shared-tenant
# shared-tenant: refers to the tenant that holds the activity and reference dataset resources
Feature:
	tenant to tenant data sharing features.

	Scenario: Dummy scenario to setup global variables for the shared tenant
		Given I'm using the sharedImpacts api
		And I store the shared tenant info in variables in global scope

	Scenario: Setup groups and user in both tenants
		Given group /unshared exists
		And group /shared exists in tenant `shared-tenant`
		And group /unshared exists in tenant `shared-tenant`
		And group /unshared has user request_tenant_contributor@amazon.com with role contributor and password p@ssword1
		And group /unshared has user request_tenant_admin@amazon.com with role admin and password p@ssword1
		And tenant `shared-tenant` has group /shared has user shared_tenant_admin@amazon.com with role admin and password p@ssword1
		And tenant `shared-tenant` has group /shared has user shared_tenant_contributor@amazon.com with role contributor and password p@ssword1
		And tenant `shared-tenant` has group /unshared has user unshared_tenant_admin@amazon.com with role admin and password p@ssword1
		And tenant `shared-tenant` has group /unshared has user unshared_tenant_contributor@amazon.com with role contributor and password p@ssword1

	# Reference Dataset
	Scenario: Create Reference Dataset in a group that is not shared by the shared-tenant
		Given I'm using the sharedReferenceDatasets api
		And Using tenant `shared-tenant` I authenticate with email unshared_tenant_contributor@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /unshared
		And I set body to {"name":"unshared_referencedataset","description":"Lookup table to find a state from a zipcode","datasetHeaders":["zipcode","state"],"data":"zipcode,state\n80238,CO\n98116,WA\n55432,MN\n52172,IA\n75001,TX","tags":{"source":"usgeo"}}
		When I POST to /referenceDatasets
		Then response code should be 201
		And response body should contain id
		And I store the value of body path $.id as un-shared-referencedataset-id in global scope

	Scenario: Cannot get a Reference Dataset resource that is not in the shared group of the shared-tenant
		Given I'm using the referenceDatasets api
		And I set x-tenant header to `shared-tenant`
		And I set x-groupcontextid header to /unshared
		And I authenticate using email request_tenant_contributor@amazon.com and password p@ssword1
		When I GET /referenceDatasets/`un-shared-calculation-id`
		Then response code should be 403
		And response body path $.message should be Not authorized to access tenant path `shared-tenant`:/unshared

	Scenario: Create Reference Datasets in the shared-tenant
		Given I'm using the sharedReferenceDatasets api
		And Using tenant `shared-tenant` I authenticate with email shared_tenant_contributor@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /shared
		When I create a reference dataset in tenant `shared-tenant` with group context /shared with name ZipcodeToState tags {"type":"T2T"} and rows
			| zipcode | state |
			| 80238   | CO    |
			| 98116   | WA    |
			| 55432   | MN    |
			| 52172   | IA    |
			| 75001   | TX    |
		And I create a reference dataset in tenant `shared-tenant` with group context /shared with name StatePrimaryGen tags {"type":"T2T"} and rows
			| state | primary_gen |
			| CO    | gas         |
			| WA    | hydro       |
			| MN    | nuclear     |
			| IA    | wind        |
			| TX    | coal        |
		And I create a reference dataset in tenant `shared-tenant` with group context /shared with name GenToImpact tags {"type":"T2T"} and rows
			| gen     | if                     |
			| gas     | us:electricity:gas     |
			| hydro   | us:electricity:hydro   |
			| nuclear | us:electricity:nuclear |
			| wind    | us:electricity:wind    |
			| coal    | us:electricity:coal    |
		And I GET /referenceDatasets
		Then response code should be 200
		And response body path $.referenceDatasets.length should be 3

	Scenario: Get Reference Datasets from shared-tenant via proxied request
		Given I'm using the referenceDatasets api
		And I authenticate using email request_tenant_contributor@amazon.com and password p@ssword1
		And I set x-tenant header to `shared-tenant`
		And I set x-groupcontextid header to /shared
		When I GET /referenceDatasets
		Then response code should be 200
		And response body path $.referenceDatasets.length should be 3

	Scenario: Get Reference Datasets from shared-tenant via proxied requires both x-tenant and x-groupcontextid headers
		Given I'm using the referenceDatasets api
		And I authenticate using email request_tenant_contributor@amazon.com and password p@ssword1
		And I set x-tenant header to `shared-tenant`
		When I GET /referenceDatasets
		Then response code should be 403
		And response body path $.message should be x-groupcontextid header needs to be specified for cross tenant referencing

	Scenario: requesting-tenant should not able to PUT,PATCH and DELETE referenceDataset in the shared-tenant
		Given I'm using the calculations api
		And I authenticate using email request_tenant_contributor@amazon.com and password p@ssword1
		And I set x-tenant header to `shared-tenant`
		And I set x-groupcontextid header to /shared
		And I set body to {"name":"ZipcodeToState2","description":"Lookup table to find a state from a zipcode","datasetHeaders":["zipcode","state"],"data":"zipcode,state\n80238,CO\n98116,WA\n55432,MN\n52172,IA\n75001,TX","tags":{"source":"usgeo"}}
		When I POST to /referenceDatasets
		Then response code should be 403
		And response body path $.message should be Only GET and OPTIONS requests are supported
		When I PATCH /referenceDatasets/`un-shared-calculation-id`
		Then response code should be 403
		And response body path $.message should be Only GET and OPTIONS requests are supported
		When I remove header Content-Type
		When I DELETE /referenceDatasets/`un-shared-referencedataset-id`
		Then response code should be 403
		And response body path $.message should be Only GET and OPTIONS requests are supported

  	# ACTIVITIES
	Scenario: Create an activity in a group that is not shared by the shared-tenant
		Given I'm using the sharedImpacts api
		And Using tenant `shared-tenant` I authenticate with email unshared_tenant_contributor@amazon.com and password p@ssword1
		And I set body to {"name":"activity_unshared","description":"excludes carbon sequestration","attributes":{"ref_unit":"therm"},"tags":{"division":"purchasing","type":"material/metal/steel"},"groups":["/usa/northwest"],"impacts":{"co2e":{"name":"CO2e","attributes":{"unit":"kg"},"components":{"co2e":{"key":"co2","value":5.304733389,"type":"pollutant","description":"","label":""}}}}}
		And I set x-groupcontextid header to /unshared
		When I POST to /activities
		Then response code should be 201
		And I store the value of body path $.id as un-shared-activity-id in global scope

	Scenario: Cannot get a resource that is not in the shared group of the shared-tenant
		Given I'm using the impacts api
		And I set x-tenant header to `shared-tenant`
		And I set x-groupcontextid header to /unshared
		And I authenticate using email request_tenant_contributor@amazon.com and password p@ssword1
		When I GET /activities/`un-shared-activity-id`
		Then response code should be 403
		And response body path $.message should be Not authorized to access tenant path `shared-tenant`:/unshared

	Scenario: Create Activities in the shared-tenant
		Given I'm using the sharedImpacts api
		And Using tenant `shared-tenant` I authenticate with email shared_tenant_contributor@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /shared
		And I set body to {"name":"us:electricity:hydro","attributes":{"refUnit":"kwh"},"tags":{"type":"T2T"},"impacts":{"co2e":{"name":"co2e","attributes":{"refUnit":"kwh","outUnit":"kg CO2eq"},"components":{"co2":{"key":"co2","value":2,"type":"pollutant"},"ch4":{"key":"ch4","value":1,"type":"pollutant"}}}}}
		When I POST to /activities
		Then response code should be 201
		And response body should contain id
		And I store the value of body path $.id as t2t_activities_hydro_id in global scope
		When I set body to {"name":"us:electricity:gas","attributes":{"refUnit":"kwh"},"tags":{"type":"T2T"},"impacts":{"co2e":{"name":"co2e","attributes":{"refUnit":"kwh","outUnit":"kg CO2eq"},"components":{"co2":{"key":"co2","value":40,"type":"pollutant"},"ch4":{"key":"ch4","value":20,"type":"pollutant"}}}}}
		When I POST to /activities
		Then response code should be 201
		And response body should contain id
		And I store the value of body path $.id as t2t_activities_gas_id in global scope
		When I set body to {"name":"us:electricity:nuclear","attributes":{"refUnit":"kwh"},"tags":{"type":"T2T"},"impacts":{"co2e":{"name":"co2e","attributes":{"refUnit":"kwh","outUnit":"kg CO2eq"},"components":{"co2":{"key":"co2","value":10,"type":"pollutant"},"ch4":{"key":"ch4","value":50,"type":"pollutant"}}}}}
		When I POST to /activities
		Then response code should be 201
		And response body should contain id
		And I store the value of body path $.id as t2t_activities_nuclear_id in global scope
		When I set body to {"name":"us:electricity:wind","attributes":{"refUnit":"kwh"},"tags":{"type":"T2T"},"impacts":{"co2e":{"name":"co2e","attributes":{"refUnit":"kwh","outUnit":"kg CO2eq"},"components":{"co2":{"key":"co2","value":1,"type":"pollutant"},"ch4":{"key":"ch4","value":1,"type":"pollutant"}}}}}
		When I POST to /activities
		Then response code should be 201
		And response body should contain id
		And I store the value of body path $.id as t2t_activities_wind_id in global scope
		When I set body to {"name":"us:electricity:coal","attributes":{"refUnit":"kwh"},"tags":{"type":"T2T"},"impacts":{"co2e":{"name":"co2e","attributes":{"refUnit":"kwh","outUnit":"kg CO2eq"},"components":{"co2":{"key":"co2","value":120,"type":"pollutant"},"ch4":{"key":"ch4","value":80,"type":"pollutant"}}}}}
		When I POST to /activities
		Then response code should be 201
		And I store the value of body path $.id as t2t_activities_coal_id in global scope
		When I GET /activities
		Then response code should be 200
		And response body path $.activities.length should be 5

	Scenario: requesting-tenant should not able to PUT,PATCH and DELETE activity in the shared-tenant
		Given I'm using the impacts api
		And I authenticate using email request_tenant_contributor@amazon.com and password p@ssword1
		And I set x-tenant header to `shared-tenant`
		And I set x-groupcontextid header to /shared
		And I set body to {"name":"activity_shared_2","description":"excludes carbon sequestration","attributes":{"ref_unit":"therm"},"tags":{"division":"purchasing","type":"material/metal/steel"},"groups":["/usa/northwest"],"impacts":{"co2e":{"name":"CO2e","attributes":{"unit":"kg"},"components":{"co2e":{"key":"co2","value":5.304733389,"type":"pollutant","description":"","label":""}}}}}
		When I POST to /activities
		Then response code should be 403
		And response body path $.message should be Only GET and OPTIONS requests are supported
		When I POST to /activities/
		Then response code should be 403
		And response body path $.message should be Only GET and OPTIONS requests are supported
		When I remove header Content-Type
		When I DELETE /activities/`t2t_activities_hydro_id`
		Then response code should be 403
		And response body path $.message should be Only GET and OPTIONS requests are supported

	Scenario: Get Activity from shared-tenant via proxied request
		Given I'm using the impacts api
		And I authenticate using email request_tenant_contributor@amazon.com and password p@ssword1
		And I set x-tenant header to `shared-tenant`
		And I set x-groupcontextid header to /shared
		When I GET /activities
		Then response code should be 200
		And response body path $.activities.length should be 5

	Scenario: Get Activity from shared-tenant via proxied request requires both x-tenant and x-groupcontextid headers
		Given I'm using the impacts api
		And I authenticate using email request_tenant_contributor@amazon.com and password p@ssword1
		And I set x-tenant header to `shared-tenant`
		When I GET /activities
		Then response code should be 403
		And response body path $.message should be x-groupcontextid header needs to be specified for cross tenant referencing

  	# Calculations
	Scenario: Create Calculation in a group that is not shared by the shared-tenant
		Given I'm using the sharedCalculations api
		And Using tenant `shared-tenant` I authenticate with email unshared_tenant_contributor@amazon.com and password p@ssword1
		And I set body to {"name": "calculation_unshared","summary": "Calculates the emissions from electricity consumption","formula": ":kwh*:ef","parameters": [{"index": 0,"key": "kwh","label": "kWh","description": "Kilowatt hours of electricity consumed","type": "number"},{"index": 1,"key": "ef","label": "Emissions Factor","description": "CO2e of polutant per kilowatt hour","type": "number"}],"outputs": [{"name": "co2e","description": "CO2 equivalent in tonnes","type": "number"}],"tags": {"type": "T2T"}}
		And I set x-groupcontextid header to /unshared
		When I POST to /calculations
		Then response code should be 201
		And I store the value of body path $.id as un-shared-calculation-id in global scope

	Scenario: Cannot get a calculation resource that is not in the shared group of the shared-tenant
		Given I'm using the calculations api
		And I set x-tenant header to `shared-tenant`
		And I set x-groupcontextid header to /unshared
		And I authenticate using email request_tenant_contributor@amazon.com and password p@ssword1
		When I GET /calculations/`un-shared-calculation-id`
		Then response code should be 403
		And response body path $.message should be Not authorized to access tenant path `shared-tenant`:/unshared

	Scenario: Create Calculations in the shared-tenant
		Given I'm using the sharedCalculations api
		And Using tenant `shared-tenant` I authenticate with email shared_tenant_contributor@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /shared
		And I set body to {"name": "electricity_emissions","summary": "Calculates the emissions from electricity consumption","formula": ":kwh*:ef","parameters": [{"index": 0,"key": "kwh","label": "kWh","description": "Kilowatt hours of electricity consumed","type": "number"},{"index": 1,"key": "ef","label": "Emissions Factor","description": "CO2e of polutant per kilowatt hour","type": "number"}],"outputs": [{"name": "co2e","description": "CO2 equivalent in tonnes","type": "number"}],"tags": {"type": "T2T"}}
		When I POST to /calculations
		Then response code should be 201
		And response body should contain id
		And I store the value of body path $.id as t2t_calculations_electricity_emissions_id in global scope

	Scenario: Get Calculation from shared-tenant via proxied request requires both x-tenant and x-groupcontextid headers
		Given I'm using the calculations api
		And I authenticate using email request_tenant_contributor@amazon.com and password p@ssword1
		And I set x-tenant header to `shared-tenant`
		When I GET /calculations
		Then response code should be 403
		And response body path $.message should be x-groupcontextid header needs to be specified for cross tenant referencing

	Scenario: requesting-tenant should not able to PUT,PATCH and DELETE calculation in the shared-tenant
		Given I'm using the calculations api
		And I authenticate using email request_tenant_contributor@amazon.com and password p@ssword1
		And I set x-tenant header to `shared-tenant`
		And I set x-groupcontextid header to /shared
		And I set body to {"name": "electricity_emissions_v2","summary": "Calculates the emissions from electricity consumption","formula": ":kwh*:ef","parameters": [{"index": 0,"key": "kwh","label": "kWh","description": "Kilowatt hours of electricity consumed","type": "number"},{"index": 1,"key": "ef","label": "Emissions Factor","description": "CO2e of polutant per kilowatt hour","type": "number"}],"outputs": [{"name": "co2e","description": "CO2 equivalent in tonnes","type": "number"}],"tags": {"type": "T2T"}}
		When I POST to /activities
		Then response code should be 403
		And response body path $.message should be Only GET and OPTIONS requests are supported
		When I PATCH /calculations/`un-shared-calculation-id`
		Then response code should be 403
		And response body path $.message should be Only GET and OPTIONS requests are supported
		When I remove header Content-Type
		When I DELETE /calculations/`un-shared-calculation-id`
		Then response code should be 403
		And response body path $.message should be Only GET and OPTIONS requests are supported

	Scenario: Get Calculation from shared-tenant via proxied request
		Given I'm using the calculations api
		And I authenticate using email request_tenant_contributor@amazon.com and password p@ssword1
		And I set x-tenant header to `shared-tenant`
		And I set x-groupcontextid header to /shared
		When I GET /calculations
		Then response code should be 200
		And response body path $.calculations.length should be 1

	Scenario: Create Calculation in requesting-tenant
		Given I'm using the calculations api
		And I authenticate using email request_tenant_contributor@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /unshared
		And I set body to {"name": "electricity_emissions","summary": "Calculates the emissions from electricity consumption","formula": ":kwh*:ef","parameters": [{"index": 0,"key": "kwh","label": "kWh","description": "Kilowatt hours of electricity consumed","type": "number"},{"index": 1,"key": "ef","label": "Emissions Factor","description": "CO2e of polutant per kilowatt hour","type": "number"}],"outputs": [{"name": "co2e","description": "CO2 equivalent in tonnes","type": "number"}],"tags": {"type": "T2T"}}
		When I POST to /calculations
		Then response code should be 201
		And response body should contain id
		And I store the value of body path $.id as electricity_emissions_calculation in global scope
		When I GET /calculations
		Then response code should be 200
		And response body path $.calculations.length should be 1


	# Pipeline
	Scenario: Create Pipeline in requesting-tenant
		Given I'm using the pipelines api
		And I authenticate using email request_tenant_contributor@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /unshared
		And I set body to {"connectorConfig":{"input": [{"name": "sif-csv-pipeline-input-connector"}]},"attributes":{"type":"E2E"},"name":"Household Electricity Carbon Footprint","description":"E2E test pipeline","transformer":{"transforms":[{"index":0,"formula":"AS_TIMESTAMP(:reading date,'M/d/yy')","outputs":[{"description":"Timestamp of business activity.","index":0,"key":"time","label":"Time","type":"timestamp"}]},{"index":1,"formula":":zipcode","outputs":[{"description":"Zipcode where electricity consumption occurred","index":0,"key":"zipcode","label":"Zip","type":"string"}]},{"index":2,"formula":":month","outputs":[{"description":"Month of electricity consumption","index":0,"key":"month","label":"Month","type":"string"}]},{"index":3,"formula":":kwh","outputs":[{"description":"kWh of electricity consumption in the month","index":0,"key":"kwh","label":"kWh","type":"number"}]},{"index":4,"formula":"#electricity_emissions(:kwh,IMPACT(LOOKUP(LOOKUP(LOOKUP(:zipcode, 'ZipcodeToState','zipcode', 'state', group='/shared', tenant='`shared-tenant`'), 'StatePrimaryGen', 'state', 'primary_gen', group='/shared', tenant='`shared-tenant`'), 'GenToImpact', 'gen', 'if', group='/shared', tenant='`shared-tenant`'), 'co2e', 'co2', group='/shared', tenant='`shared-tenant`'))","outputs":[{"description":"CO2e of electricty generation (in tonnes)","index":0,"key":"co2e","label":"CO2e","type":"number"}]}],"parameters":[{"index":0,"key":"reading date","type":"string"},{"index":1,"key":"zipcode","label":"Zipcode","description":"Zipcode of electricity consumption","type":"string"},{"index":2,"key":"month","label":"Month","description":"Month of electricity generation","type":"string"},{"index":3,"key":"kwh","label":"kWh","description":"kWh of electricity generation in the month","type":"number"}]}}
		When I POST to /pipelines
		Then response code should be 201
		And response body should contain id
		And I store the value of body path $.id as t2t_pipeline_id in global scope

	# TODO: Once calculator is fixed, the pipeline definition needs to be updated to use the new syntax and also you can reference the calculations in the shared tenant now that we're exposing that functionality
	Scenario: Upload Input File for Pipeline Processing in requesting-tenant
		Given I'm using the pipelineProcessor api
		And I authenticate using email request_tenant_contributor@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /unshared
		And I set body to { "expiration" : 300}
		When I POST to /pipelines/`t2t_pipeline_id`/executions
		Then response code should be 201
		And response body should contain id
		And response body path $.pipelineId should be `t2t_pipeline_id`
		And response body should contain inputUploadUrl
		And I store the value of body path $.inputUploadUrl as t2t_upload_url in global scope
		And I store the value of body path $.id as household_electricity_carbon_footprint_pipeline_execution_id in global scope
		When I GET /pipelines/`t2t_pipeline_id`/executions/`household_electricity_carbon_footprint_pipeline_execution_id`
		And response body path $.pipelineId should be `t2t_pipeline_id`
		And response body path $.id should be `household_electricity_carbon_footprint_pipeline_execution_id`
		And response body path $.status should be waiting
		Then response code should be 200
		When I upload an input CSV file to url stored at global variable t2t_upload_url with rows
			| reading date | zipcode | month | kwh   |
			| 1/1/22       | 80238   | JUN   | 100.2 |
			| 2/1/22       | 98116   | JUN   | 102.1 |
			| 3/1/22       | 55432   | JUL   | 120.2 |
			| 4/1/22       | 52172   | AUG   | 98.7  |
			| 5/1/22       | 75001   | AUG   | 153.8 |
		Then I pause for 30000ms
		When I GET /pipelines/`t2t_pipeline_id`/executions/`household_electricity_carbon_footprint_pipeline_execution_id`
		Then response code should be 200
		And response body path $.status should be success

	Scenario: Retrieve and Validate Output from requesting-tenant
		Given I'm using the pipelineProcessor api
		And I authenticate using email request_tenant_contributor@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /unshared
		When I GET /activities?timeUnit=day&dateFrom=1/1/22&executionId=`household_electricity_carbon_footprint_pipeline_execution_id`&pipelineId=`t2t_pipeline_id`
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

	Scenario: Teardown - Pipeline in requesting-tenant
		When I'm using the pipelines api
		And I authenticate using email request_tenant_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /unshared
		When I remove header Content-Type
		When I DELETE /pipelines/`t2t_pipeline_id`
		Then response code should be 204
		When I GET /pipelines
		Then response code should be 200
		And response body path $.pipelines.length should be 0

	Scenario: Teardown - Calculation in requesting-tenant
		When I'm using the calculations api
		And I authenticate using email request_tenant_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /unshared
		When I remove header Content-Type
		When I DELETE /calculations/`electricity_emissions_calculation`
		Then response code should be 204
		When I GET /calculations
		Then response code should be 200
		And response body path $.calculations.length should be 0

	Scenario: Teardown - Calculations in shared-tenant
		Given I'm using the sharedCalculations api
		And Using tenant `shared-tenant` I authenticate with email shared_tenant_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /shared
		When I remove header Content-Type
		When I DELETE /calculations/`t2t_calculations_electricity_emissions_id`
		Then response code should be 204
		And Using tenant `shared-tenant` I authenticate with email unshared_tenant_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		And I remove header x-groupcontextid
		And I set x-groupcontextid header to /unshared
		When I DELETE /calculations/`un-shared-calculation-id`
		Then response code should be 204
		And Using tenant shared-tenant I authenticate with email shared_tenant_admin@amazon.com and password p@ssword1
		And I remove header x-groupcontextid
		And I set x-groupcontextid header to /shared
		When I GET /calculations
		Then response code should be 200
		And response body path $.calculations.length should be 0

	Scenario: Teardown - Activities in shared-tenant
		Given I'm using the sharedImpacts api
		And Using tenant `shared-tenant` I authenticate with email shared_tenant_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /shared
		When I remove header Content-Type
		When I DELETE /activities/`t2t_activities_hydro_id`
		Then response code should be 204
		When I DELETE /activities/`t2t_activities_gas_id`
		Then response code should be 204
		When I DELETE /activities/`t2t_activities_nuclear_id`
		Then response code should be 204
		When I DELETE /activities/`t2t_activities_wind_id`
		Then response code should be 204
		When I DELETE /activities/`t2t_activities_coal_id`
		Then response code should be 204
		And Using tenant `shared-tenant` I authenticate with email unshared_tenant_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		And I remove header x-groupcontextid
		And I set x-groupcontextid header to /unshared
		When I DELETE /activities/`un-shared-activity-id`
		Then response code should be 204
		And Using tenant shared-tenant I authenticate with email shared_tenant_admin@amazon.com and password p@ssword1
		And I remove header x-groupcontextid
		And I set x-groupcontextid header to /shared
		When I GET /activities
		Then response code should be 200
		And response body path $.activities.length should be 0

	Scenario: Teardown - Reference Datasets in shared-tenant
		When I'm using the sharedReferenceDatasets api
		And Using tenant shared-tenant I authenticate with email shared_tenant_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /shared
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
		And Using tenant `shared-tenant` I authenticate with email unshared_tenant_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		And I remove header x-groupcontextid
		And I set x-groupcontextid header to /unshared
		When I DELETE /referenceDatasets/`un-shared-referencedataset-id`
		Then response code should be 204

	Scenario: Teardown: Revoke users for both tenants
		And group /unshared has user request_tenant_contributor@amazon.com revoked
		And group /shared has user shared_tenant_contributor@amazon.com revoked in tenant shared-tenant
		And group /unshared has user unshared_tenant_contributor@amazon.com revoked in tenant shared-tenant
		And group /unshared has user request_tenant_admin@amazon.com revoked
		And group /shared has user shared_tenant_admin@amazon.com revoked in tenant shared-tenant
		And group /unshared has user unshared_tenant_admin@amazon.com revoked in tenant shared-tenant

	Scenario: Teardown: Delete groups for both tenants
		Given group /unshared has been removed
		And group /shared has been removed from tenant shared-tenant
		And group /unshared has been removed from tenant shared-tenant
