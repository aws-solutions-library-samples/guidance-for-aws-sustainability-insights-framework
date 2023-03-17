@setup_endToEnd
Feature: Pipeline Processors API - aggregation feature

	Scenario: Setup groups
		Given group /metricsAggregationTests exists
		And group /metricsAggregationTests/a exists
		And group /metricsAggregationTests/b exists
		Given group / has user metrics_aggregation_admin@amazon.com with role admin and password p@ssword1
		And group /metricsAggregationTests has user metrics_aggregation_admin@amazon.com granted access with role admin
		And group /metricsAggregationTests/a has user metrics_aggregation_admin@amazon.com granted access with role admin

	Scenario: Create Metrics on group /metricsAggregationTests
		Given I'm using the pipelines api
		And I authenticate using email metrics_aggregation_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /metricsAggregationTests
		And I set body to {"name":"ghg:scope1","summary":"GHG Scope 1 direct emissions.","aggregationType":"sum","tags":{"standard":"ghg","scope":"1"}}
		When I POST to /metrics
		Then response code should be 201
		And response body should contain id
		And I store the value of body path $.id as metric_scope1_id in global scope
		And response body path $.name should be ghg:scope1
		And response body path $.summary should be GHG Scope 1 direct emissions.
		And response body path $.aggregationType should be sum
		And response body path $.tags.standard should be ghg
		And response body path $.tags.scope should be 1
		Given I set body to {"name":"ghg:scope1:mobile","summary":"GHG Scope 1 direct emissions from mobile combustion.","aggregationType":"sum","outputMetrics":["ghg:scope1"],"tags":{"standard":"ghg","scope":"1","category":"mobile"}}
		When I POST to /metrics
		Then response code should be 201
		And response body should contain id
		And I store the value of body path $.id as metric_scope1_mobile_id in global scope
		And response body path $.name should be ghg:scope1:mobile
		And response body path $.summary should be GHG Scope 1 direct emissions from mobile combustion.
		And response body path $.aggregationType should be sum
		And response body path $.tags.standard should be ghg
		And response body path $.tags.scope should be 1
		And response body path $.tags.category should be mobile
		And response body path $.outputMetrics[0] should be ghg:scope1
		And I store the value of body path $.id as metric_scope1_mobile_id in global scope


	Scenario: Create simple pipeline pipeline1 that output to metric ghg:scope1:mobile
		Given I'm using the pipelines api
		And I authenticate using email metrics_aggregation_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /metricsAggregationTests/a
		And I set body to {"attributes":{"type":"E2E"},"name":"first pipeline","description":"E2E test pipeline","transformer":{"transforms":[{"index":0,"formula":"AS_TIMESTAMP(:date,'M/d/yyyy HH:mm:ss')","outputs":[{"description":"Timestamp of business activity.","index":0,"key":"time","label":"Time","type":"timestamp"}]},{"index":1,"formula":":zipcode","outputs":[{"description":"Zipcode where electricity consumption occurred","index":0,"key":"zipcode","label":"Zip","type":"string"}]},{"index":2,"formula":":kwh*10","outputs":[{"description":"input * 10","index":0,"key":"kwh","label":"kWh","type":"number","metrics":["ghg:scope1:mobile"]}]}],"parameters":[{"index":0,"key":"date","type":"string"},{"index":1,"key":"zipcode","label":"Zipcode","description":"Zipcode of electricity consumption","type":"string"},{"index":2,"key":"kwh","label":"kWh","description":"kWh of electricity generation in the month","type":"number"}]}}
		When I POST to /pipelines
		Then response code should be 201
		And response body should contain id
		And I store the value of body path $.id as pipeline_1_a_id in global scope

	Scenario: Upload Input File for Pipeline Processing for Pipeline1
		Given I'm using the pipelineProcessor api
		And I authenticate using email metrics_aggregation_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /metricsAggregationTests/a
		And I set body to { "expiration" : 300}
		When I POST to /pipelines/`pipeline_1_a_id`/inputUploadUrl
		Then response code should be 201
		And response body should contain id
		And response body path $.pipelineId should be `pipeline_1_a_id`
		And response body should contain url
		And I store the value of body path $.url as pipeline_1_a_upload_url in global scope
		And I store the value of body path $.id as pipeline_1_a_execution_id in global scope
		When I GET /pipelines/`pipeline_1_a_id`/executions/`pipeline_1_a_execution_id`
		And response body path $.pipelineId should be `pipeline_1_a_id`
		And response body path $.id should be `pipeline_1_a_execution_id`
		And response body path $.status should be waiting
		Then response code should be 200
		When I upload an input CSV file to url stored at global variable pipeline_1_a_upload_url with rows
			| date              | zipcode | kwh |
			| 1/1/2022 02:02:02 | 80238   | 10  |
			| 1/2/2022 02:02:02 | 98116   | 10  |
			| 1/3/2022 02:02:02 | 55432   | 3   |
			| 1/4/2022 02:02:02 | 52172   | 4   |
			| 1/5/2022 02:02:02 | 75001   | 5   |
		Then I pause for 20000ms
		When I GET /pipelines/`pipeline_1_a_id`/executions/`pipeline_1_a_execution_id`
		Then response code should be 200
		And response body path $.status should be success

	Scenario: Query the ghg:scope1:mobile metric
		Given I'm using the pipelineProcessor api
		And I authenticate using email metrics_aggregation_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /metricsAggregationTests/a
		When I GET /metrics?timeUnit=day&name=ghg:scope1:mobile&dateFrom=1/1/2022
		Then response code should be 200
		And response body path $.metrics[?(@.day=='1')].hierarchyValue should be 100
		And response body path $.metrics[?(@.day=='2')].hierarchyValue should be 100
		And response body path $.metrics[?(@.day=='3')].hierarchyValue should be 30
		And response body path $.metrics[?(@.day=='4')].hierarchyValue should be 40
		And response body path $.metrics[?(@.day=='5')].hierarchyValue should be 50
		When I GET /metrics?timeUnit=month&name=ghg:scope1:mobile&dateFrom=1/1/2022
		Then response code should be 200
		And response body path $.metrics[?(@.month=='1')].hierarchyValue should be 320
		When I GET /metrics?timeUnit=year&name=ghg:scope1:mobile&dateFrom=1/1/2022
		Then response code should be 200
		And response body path $.metrics[?(@.year=='2022')].hierarchyValue should be 320

	Scenario: Upload input file with the same time range for Pipeline Processing for pipeline1
	This will rewrite the previous metric value
		Given I'm using the pipelineProcessor api
		And I authenticate using email metrics_aggregation_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /metricsAggregationTests/a
		And I set body to { "expiration" : 300}
		When I POST to /pipelines/`pipeline_1_a_id`/inputUploadUrl
		Then response code should be 201
		And response body should contain id
		And response body path $.pipelineId should be `pipeline_1_a_id`
		And response body should contain url
		And I store the value of body path $.url as pipeline_1_a_upload_url in global scope
		And I store the value of body path $.id as pipeline_1_a_execution_id in global scope
		When I GET /pipelines/`pipeline_1_a_id`/executions/`pipeline_1_a_execution_id`
		And response body path $.pipelineId should be `pipeline_1_a_id`
		And response body path $.id should be `pipeline_1_a_execution_id`
		And response body path $.status should be waiting
		Then response code should be 200
		When I upload an input CSV file to url stored at global variable pipeline_1_a_upload_url with rows
			# Notice that we have 2 entries with the same day
			| date              | zipcode | kwh |
			# We're adding a new input for 1/1/2022 and 2/2/2022 but on different time
			# the end result should be the aggregation of previous run and this run
			| 1/1/2022 04:02:02 | 77777   | 50  |
			| 1/2/2022 03:02:02 | 98116   | 10  |
			| 1/3/2022 02:02:02 | 55432   | 30  |
			| 1/3/2022 02:06:02 | 55432   | 20  |
			| 1/3/2022 08:10:02 | 88888   | 10  |
			| 1/4/2022 02:02:02 | 52172   | 40  |
			| 1/5/2022 02:02:02 | 75001   | 50  |
			| 1/5/2022 10:55:02 | 11111   | 10  |
		Then I pause for 20000ms
		When I GET /pipelines/`pipeline_1_a_id`/executions/`pipeline_1_a_execution_id`
		Then response code should be 200
		And response body path $.status should be success

	Scenario: Perform another query on ghg:scope1:mobile metric which is now updated using the last csv
		Given I'm using the pipelineProcessor api
		And I authenticate using email metrics_aggregation_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /metricsAggregationTests/a
		When I GET /metrics?timeUnit=day&name=ghg:scope1:mobile&dateFrom=1/1/2022
		Then response code should be 200
		And response body path $.metrics[?(@.day=='1')].hierarchyValue should be 600
		And response body path $.metrics[?(@.day=='2')].hierarchyValue should be 200
		And response body path $.metrics[?(@.day=='3')].hierarchyValue should be 600
		And response body path $.metrics[?(@.day=='4')].hierarchyValue should be 400
		And response body path $.metrics[?(@.day=='5')].hierarchyValue should be 600
		When I GET /metrics?timeUnit=month&name=ghg:scope1:mobile&dateFrom=1/1/2022
		Then response code should be 200
		And response body path $.metrics[?(@.month=='1')].hierarchyValue should be 2400
		When I GET /metrics?timeUnit=year&name=ghg:scope1:mobile&dateFrom=1/1/2022
		Then response code should be 200
		And response body path $.metrics[?(@.year=='2022')].hierarchyValue should be 2400

	Scenario: Create simple pipeline pipeline2 that output to the same metric ghg:scope1:mobile
		Given I'm using the pipelines api
		And I authenticate using email metrics_aggregation_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /metricsAggregationTests/a
		And I set body to {"attributes":{"type":"E2E"},"name":"second pipeline pipeline","description":"E2E test pipeline","transformer":{"transforms":[{"index":0,"formula":"AS_TIMESTAMP(:date,'M/d/yyyy HH:mm:ss')","outputs":[{"description":"Timestamp of business activity.","index":0,"key":"time","label":"Time","type":"timestamp"}]},{"index":1,"formula":":zipcode","outputs":[{"description":"Zipcode where electricity consumption occurred","index":0,"key":"zipcode","label":"Zip","type":"string"}]},{"index":2,"formula":":kwh*100","outputs":[{"description":"input * 10","index":0,"key":"kwh","label":"kWh","type":"number","metrics":["ghg:scope1:mobile"]}]}],"parameters":[{"index":0,"key":"date","type":"string"},{"index":1,"key":"zipcode","label":"Zipcode","description":"Zipcode of electricity consumption","type":"string"},{"index":2,"key":"kwh","label":"kWh","description":"kWh of electricity generation in the month","type":"number"}]}}
		When I POST to /pipelines
		Then response code should be 201
		And response body should contain id
		And I store the value of body path $.id as pipeline_2_a_id in global scope

	Scenario: Upload input file for pipeline processing for pipeline2
		Given I'm using the pipelineProcessor api
		And I authenticate using email metrics_aggregation_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /metricsAggregationTests/a
		And I set body to { "expiration" : 300}
		When I POST to /pipelines/`pipeline_2_a_id`/inputUploadUrl
		Then response code should be 201
		And response body should contain id
		And response body path $.pipelineId should be `pipeline_2_a_id`
		And response body should contain url
		And I store the value of body path $.url as pipeline_2_a_upload_url in global scope
		And I store the value of body path $.id as pipeline_2_a_execution_id in global scope
		When I GET /pipelines/`pipeline_2_a_id`/executions/`pipeline_2_a_execution_id`
		And response body path $.pipelineId should be `pipeline_2_a_id`
		And response body path $.id should be `pipeline_2_a_execution_id`
		And response body path $.status should be waiting
		Then response code should be 200
		When I upload an input CSV file to url stored at global variable pipeline_2_a_upload_url with rows
			| date              | zipcode | kwh |
			| 1/1/2022 02:02:02 | 80238   | 10  |
			| 1/2/2022 02:02:02 | 98116   | 20  |
			| 1/3/2022 02:02:02 | 55432   | 30  |
			| 1/4/2022 02:02:02 | 52172   | 40  |
			| 1/5/2022 02:02:02 | 75001   | 50  |
		Then I pause for 20000ms
		When I GET /pipelines/`pipeline_2_a_id`/executions/`pipeline_2_a_execution_id`
		Then response code should be 200

	Scenario: Query the ghg:scope1:mobile metric which should now aggregate the value from pipeline1 and pipeline2 output
		Given I'm using the pipelineProcessor api
		And I authenticate using email metrics_aggregation_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /metricsAggregationTests/a
		When I GET /metrics?timeUnit=day&name=ghg:scope1:mobile&dateFrom=1/1/2022
		Then response code should be 200
		And response body path $.metrics[?(@.day=='1')].hierarchyValue should be 1600
		And response body path $.metrics[?(@.day=='2')].hierarchyValue should be 2200
		And response body path $.metrics[?(@.day=='3')].hierarchyValue should be 3600
		And response body path $.metrics[?(@.day=='4')].hierarchyValue should be 4400
		And response body path $.metrics[?(@.day=='5')].hierarchyValue should be 5600
		When I GET /metrics?timeUnit=month&name=ghg:scope1:mobile&dateFrom=1/1/2022
		Then response code should be 200
		And response body path $.metrics[?(@.month=='1')].hierarchyValue should be 17400
		When I GET /metrics?timeUnit=year&name=ghg:scope1:mobile&dateFrom=1/1/2022
		Then response code should be 200
		And response body path $.metrics[?(@.year=='2022')].hierarchyValue should be 17400

    # Below are resources created on /metricsAggregationTests/b
	Scenario: Create simple pipeline pipeline1 that output to metric ghg:scope1:mobile
		Given I'm using the pipelines api
		And I authenticate using email metrics_aggregation_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /metricsAggregationTests/b
		And I set body to {"attributes":{"type":"E2E"},"name":"first pipeline","description":"E2E test pipeline","transformer":{"transforms":[{"index":0,"formula":"AS_TIMESTAMP(:date,'M/d/yyyy HH:mm:ss')","outputs":[{"description":"Timestamp of business activity.","index":0,"key":"time","label":"Time","type":"timestamp"}]},{"index":1,"formula":":zipcode","outputs":[{"description":"Zipcode where electricity consumption occurred","index":0,"key":"zipcode","label":"Zip","type":"string"}]},{"index":2,"formula":":kwh*10","outputs":[{"description":"input * 10","index":0,"key":"kwh","label":"kWh","type":"number","metrics":["ghg:scope1:mobile"]}]}],"parameters":[{"index":0,"key":"date","type":"string"},{"index":1,"key":"zipcode","label":"Zipcode","description":"Zipcode of electricity consumption","type":"string"},{"index":2,"key":"kwh","label":"kWh","description":"kWh of electricity generation in the month","type":"number"}]}}
		When I POST to /pipelines
		Then response code should be 201
		And response body should contain id
		And I store the value of body path $.id as pipeline_1_b_id in global scope

	Scenario: Upload input file with the same time range for Pipeline Processing for pipeline1
	This will rewrite the previous metric value
		Given I'm using the pipelineProcessor api
		And I authenticate using email metrics_aggregation_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /metricsAggregationTests/b
		And I set body to { "expiration" : 300}
		When I POST to /pipelines/`pipeline_1_b_id`/inputUploadUrl
		Then response code should be 201
		And response body should contain id
		And response body path $.pipelineId should be `pipeline_1_b_id`
		And response body should contain url
		And I store the value of body path $.url as pipeline_1_b_upload_url in global scope
		And I store the value of body path $.id as pipeline_1_b_execution_id in global scope
		When I GET /pipelines/`pipeline_1_b_id`/executions/`pipeline_1_b_execution_id`
		And response body path $.pipelineId should be `pipeline_1_b_id`
		And response body path $.id should be `pipeline_1_b_execution_id`
		And response body path $.status should be waiting
		Then response code should be 200
		When I upload an input CSV file to url stored at global variable pipeline_1_b_upload_url with rows
			| date               | zipcode | kwh |
			| 1/1/2022 02:02:02  | 80238   | 10  |
			| 1/2/2022 02:02:02  | 98116   | 20  |
			| 1/3/2022 02:02:02  | 55432   | 30  |
			| 1/4/2022 02:02:02  | 52172   | 40  |
			| 1/5/2022 02:02:02  | 75001   | 50  |
			| 2/5/2022 02:02:02  | 44556   | 20  |
			| 3/8/2022 02:02:02  | 22334   | 30  |
			| 4/10/2022 02:02:02 | 75001   | 50  |
		Then I pause for 20000ms
		When I GET /pipelines/`pipeline_1_b_id`/executions/`pipeline_1_b_execution_id`
		Then response code should be 200
		And response body path $.status should be success

	Scenario: Perform another query on ghg:scope1:mobile metric which is now updated using the last csv
		Given I'm using the pipelineProcessor api
		And I authenticate using email metrics_aggregation_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /metricsAggregationTests/b
		When I GET /metrics?timeUnit=day&name=ghg:scope1:mobile&dateFrom=1/1/2022
		Then response code should be 200
		And response body path $.metrics[?(@.day=='1')].hierarchyValue should be 100
		And response body path $.metrics[?(@.day=='2')].hierarchyValue should be 200
		And response body path $.metrics[?(@.day=='3')].hierarchyValue should be 300
		And response body path $.metrics[?(@.day=='4')].hierarchyValue should be 400
		And response body path $.metrics[?(@.day=='5')].hierarchyValue should be 500
		And response body path $.metrics[?(@.day=='67')].hierarchyValue should be 300
		And response body path $.metrics[?(@.day=='100')].hierarchyValue should be 500
		When I GET /metrics?timeUnit=month&name=ghg:scope1:mobile&dateFrom=1/1/2022
		Then response code should be 200
		And response body path $.metrics[?(@.month=='1')].hierarchyValue should be 1500
		And response body path $.metrics[?(@.month=='2')].hierarchyValue should be 200
		And response body path $.metrics[?(@.month=='3')].hierarchyValue should be 300
		And response body path $.metrics[?(@.month=='4')].hierarchyValue should be 500
		When I GET /metrics?timeUnit=year&name=ghg:scope1:mobile&dateFrom=1/1/2022
		Then response code should be 200
		And response body path $.metrics[?(@.year=='2022')].hierarchyValue should be 2500

	# Below is the being done in parent group /metricsAggregationTests
	Scenario: Query the ghg:scope1:mobile metric from parent group /metricsAggregationTests
		Given I'm using the pipelineProcessor api
		And I authenticate using email metrics_aggregation_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /metricsAggregationTests
		When I GET /metrics?timeUnit=day&name=ghg:scope1:mobile&dateFrom=1/1/2022
		Then response code should be 200
		And response body path $.metrics[?(@.day=='1')].subGroupsValue should be 1700
		And response body path $.metrics[?(@.day=='2')].subGroupsValue should be 2400
		And response body path $.metrics[?(@.day=='3')].subGroupsValue should be 3900
		And response body path $.metrics[?(@.day=='4')].subGroupsValue should be 4800
		And response body path $.metrics[?(@.day=='5')].subGroupsValue should be 6100
		When I GET /metrics?timeUnit=month&name=ghg:scope1:mobile&dateFrom=1/1/2022
		Then response code should be 200
		And response body path $.metrics[?(@.month=='1')].subGroupsValue should be 18900
		And response body path $.metrics[?(@.month=='2')].subGroupsValue should be 200
		And response body path $.metrics[?(@.month=='3')].subGroupsValue should be 300
		And response body path $.metrics[?(@.month=='4')].subGroupsValue should be 500
		When I GET /metrics?timeUnit=year&name=ghg:scope1:mobile&dateFrom=1/1/2022
		Then response code should be 200
		And response body path $.metrics[?(@.year=='2022')].subGroupsValue should be 19900

	Scenario: Query the ghg:scope1 metric which is the output of ghg:scope1:mobile from parent group /metricsAggregationTests
		Given I'm using the pipelineProcessor api
		And I authenticate using email metrics_aggregation_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /metricsAggregationTests
		When I GET /metrics?timeUnit=day&name=ghg:scope1&dateFrom=1/1/2022
		Then response code should be 200
		And response body path $.metrics[?(@.day=='1')].subGroupsValue should be 1700
		And response body path $.metrics[?(@.day=='2')].subGroupsValue should be 2400
		And response body path $.metrics[?(@.day=='3')].subGroupsValue should be 3900
		And response body path $.metrics[?(@.day=='4')].subGroupsValue should be 4800
		And response body path $.metrics[?(@.day=='5')].subGroupsValue should be 6100
		When I GET /metrics?timeUnit=month&name=ghg:scope1&dateFrom=1/1/2022
		Then response code should be 200
		And response body path $.metrics[?(@.month=='1')].subGroupsValue should be 18900
		And response body path $.metrics[?(@.month=='2')].subGroupsValue should be 200
		And response body path $.metrics[?(@.month=='3')].subGroupsValue should be 300
		And response body path $.metrics[?(@.month=='4')].subGroupsValue should be 500
		When I GET /metrics?timeUnit=year&name=ghg:scope1&dateFrom=1/1/2022
		Then response code should be 200
		And response body path $.metrics[?(@.year=='2022')].subGroupsValue should be 19900
		When I GET /metrics?timeUnit=year&name=ghg:scope1&dateFrom=1/1/2022&members=true
		Then response code should be 200
		And response body path $.metrics[?(@.groupId=='/metricsaggregationtests/a')].groupValue should be 17400
		And response body path $.metrics[?(@.groupId=='/metricsaggregationtests/b')].groupValue should be 2500

	Scenario: Upload input file that delete 2 rows associated with previous pipeline execution
	This will rewrite the previous metric value
		Given I'm using the pipelineProcessor api
		And I authenticate using email metrics_aggregation_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /metricsAggregationTests/b
		And I set body to { "expiration" : 300, "actionType": "delete"}
		When I POST to /pipelines/`pipeline_1_b_id`/inputUploadUrl
		Then response code should be 201
		And response body should contain id
		And response body path $.pipelineId should be `pipeline_1_b_id`
		And response body should contain url
		And I store the value of body path $.url as pipeline_1_b_delete_upload_url in global scope
		And I store the value of body path $.id as pipeline_1_b_delete_execution_id in global scope
		When I GET /pipelines/`pipeline_1_b_id`/executions/`pipeline_1_b_delete_execution_id`
		And response body path $.pipelineId should be `pipeline_1_b_id`
		And response body path $.id should be `pipeline_1_b_delete_execution_id`
		And response body path $.status should be waiting
		Then response code should be 200
		When I upload an input CSV file to url stored at global variable pipeline_1_b_delete_upload_url with rows
			| date               | zipcode | kwh |
			| 1/5/2022 02:02:02  | 75001   | 50  |
			| 4/10/2022 02:02:02 | 75001   | 50  |
		Then I pause for 10000ms
		When I GET /pipelines/`pipeline_1_b_id`/executions/`pipeline_1_b_delete_execution_id`
		Then response code should be 200
		And response body path $.status should be success

	Scenario: Perform another query on ghg:scope1:mobile metric whose aggregate value excludes the deleted rows
		Given I'm using the pipelineProcessor api
		And I authenticate using email metrics_aggregation_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /metricsAggregationTests/b
		When I GET /metrics?timeUnit=day&name=ghg:scope1:mobile&dateFrom=1/1/2022
		Then response code should be 200
		And response body path $.metrics[?(@.day=='1')].hierarchyValue should be 100
		And response body path $.metrics[?(@.day=='2')].hierarchyValue should be 200
		And response body path $.metrics[?(@.day=='3')].hierarchyValue should be 300
		And response body path $.metrics[?(@.day=='4')].hierarchyValue should be 400
		And response body path $.metrics[?(@.day=='5')].hierarchyValue should be 0
		And response body path $.metrics[?(@.day=='67')].hierarchyValue should be 300
		And response body path $.metrics[?(@.day=='100')].hierarchyValue should be 0
		When I GET /metrics?timeUnit=month&name=ghg:scope1:mobile&dateFrom=1/1/2022
		Then response code should be 200
		And response body path $.metrics[?(@.month=='1')].hierarchyValue should be 1000
		And response body path $.metrics[?(@.month=='2')].hierarchyValue should be 200
		And response body path $.metrics[?(@.month=='3')].hierarchyValue should be 300
		And response body path $.metrics[?(@.month=='4')].hierarchyValue should be 0
		When I GET /metrics?timeUnit=year&name=ghg:scope1:mobile&dateFrom=1/1/2022
		Then response code should be 200
		And response body path $.metrics[?(@.year=='2022')].hierarchyValue should be 1500

    # Below is the being done in parent group /metricsAggregationTests
	Scenario: Query the ghg:scope1:mobile metric from parent group /metricsAggregationTests whose aggregate value excludes the deleted rows
		Given I'm using the pipelineProcessor api
		And I authenticate using email metrics_aggregation_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /metricsAggregationTests
		When I GET /metrics?timeUnit=day&name=ghg:scope1:mobile&dateFrom=1/1/2022
		Then response code should be 200
		And response body path $.metrics[?(@.day=='1')].subGroupsValue should be 1700
		And response body path $.metrics[?(@.day=='2')].subGroupsValue should be 2400
		And response body path $.metrics[?(@.day=='3')].subGroupsValue should be 3900
		And response body path $.metrics[?(@.day=='4')].subGroupsValue should be 4800
		And response body path $.metrics[?(@.day=='5')].subGroupsValue should be 5600
		When I GET /metrics?timeUnit=month&name=ghg:scope1:mobile&dateFrom=1/1/2022
		Then response code should be 200
		And response body path $.metrics[?(@.month=='1')].subGroupsValue should be 18400
		And response body path $.metrics[?(@.month=='2')].subGroupsValue should be 200
		And response body path $.metrics[?(@.month=='3')].subGroupsValue should be 300
		And response body path $.metrics[?(@.month=='4')].subGroupsValue should be 0
		When I GET /metrics?timeUnit=year&name=ghg:scope1:mobile&dateFrom=1/1/2022
		Then response code should be 200
		And response body path $.metrics[?(@.year=='2022')].subGroupsValue should be 18900

	Scenario: Query the ghg:scope1 metric which is the output of ghg:scope1:mobile from parent group /metricsAggregationTests whose aggregate value excludes the deleted rows
		Given I'm using the pipelineProcessor api
		And I authenticate using email metrics_aggregation_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /metricsAggregationTests
		When I GET /metrics?timeUnit=day&name=ghg:scope1&dateFrom=1/1/2022
		Then response code should be 200
		And response body path $.metrics[?(@.day=='1')].subGroupsValue should be 1700
		And response body path $.metrics[?(@.day=='2')].subGroupsValue should be 2400
		And response body path $.metrics[?(@.day=='3')].subGroupsValue should be 3900
		And response body path $.metrics[?(@.day=='4')].subGroupsValue should be 4800
		And response body path $.metrics[?(@.day=='5')].subGroupsValue should be 5600
		When I GET /metrics?timeUnit=month&name=ghg:scope1&dateFrom=1/1/2022
		Then response code should be 200
		And response body path $.metrics[?(@.month=='1')].subGroupsValue should be 18400
		And response body path $.metrics[?(@.month=='2')].subGroupsValue should be 200
		And response body path $.metrics[?(@.month=='3')].subGroupsValue should be 300
		And response body path $.metrics[?(@.month=='4')].subGroupsValue should be 0
		When I GET /metrics?timeUnit=year&name=ghg:scope1&dateFrom=1/1/2022
		Then response code should be 200
		And response body path $.metrics[?(@.year=='2022')].subGroupsValue should be 18900
		When I GET /metrics?timeUnit=year&name=ghg:scope1&dateFrom=1/1/2022&members=true
		Then response code should be 200
		And response body path $.metrics[?(@.groupId=='/metricsaggregationtests/a')].groupValue should be 17400
		And response body path $.metrics[?(@.groupId=='/metricsaggregationtests/b')].groupValue should be 1500

	Scenario: Teardown - Pipeline in /metricsAggregationTests/a
		When I'm using the pipelines api
		And I authenticate using email metrics_aggregation_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /metricsAggregationTests/a
		When I remove header Content-Type
		When I DELETE /pipelines/`pipeline_1_a_id`
		Then response code should be 204
		When I DELETE /pipelines/`pipeline_2_a_id`
		Then response code should be 204
		When I GET /pipelines
		Then response code should be 200
		And response body path $.pipelines.length should be 0

	Scenario: Teardown - Pipeline in /metricsAggregationTests/b
		When I'm using the pipelines api
		And I authenticate using email metrics_aggregation_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /metricsAggregationTests/b
		When I remove header Content-Type
		When I DELETE /pipelines/`pipeline_1_b_id`
		Then response code should be 204
		When I GET /pipelines
		Then response code should be 200
		And response body path $.pipelines.length should be 0

	Scenario: Teardown - Metrics
		When I'm using the pipelines api
		And I authenticate using email metrics_aggregation_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /metricsAggregationTests
		When I remove header Content-Type
		# Delete Metric
		When I DELETE /metrics/`metric_scope1_mobile_id`
		Then response code should be 204
		When I GET /metrics/`metric_scope1_mobile_id`
		Then response code should be 404
		When I DELETE /metrics/`metric_scope1_id`
		Then response code should be 204
		When I GET /metrics/`metric_scope1_id`
		Then response code should be 404

	Scenario: Teardown: Revoke users
		Given group / has user metrics_aggregation_admin@amazon.com revoked
		And group /metricsAggregationTests has user metrics_aggregation_admin@amazon.com revoked
		And group /metricsAggregationTests/a has user metrics_aggregation_admin@amazon.com revoked

	Scenario: Teardown: Delete groups
		And group /metricsAggregationTests/a has been removed
		And group /metricsAggregationTests/b has been removed
		And group /metricsAggregationTests has been removed
