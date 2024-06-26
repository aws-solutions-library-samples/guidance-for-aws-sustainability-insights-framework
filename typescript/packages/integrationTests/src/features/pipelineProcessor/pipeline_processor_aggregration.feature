@setup_endToEnd @pipelineProcessor
Feature: Pipeline Processors API - aggregation feature

	Scenario: Setup groups
		Given group /metricsAggregationTests exists
		And group /metricsAggregationTests/a exists
		And group /metricsAggregationTests/b exists
		Given group / has user metrics_aggregation_admin@amazon.com with role admin and password p@ssword1
		And group /metricsAggregationTests has user metrics_aggregation_admin@amazon.com granted access with role admin
		And group /metricsAggregationTests/a has user metrics_aggregation_admin@amazon.com granted access with role admin

	Scenario: Teardown: Metric Aggregation Jobs
	Cleans up any aggregation jobs from previous run
		Given I'm using the pipelineProcessor api
		And I authenticate using email metrics_aggregation_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /metricsAggregationTests/a
		And no aggregation jobs exist

	Scenario: Create Metrics on group /metricsAggregationTests
		Given I'm using the pipelines api
		And I authenticate using email metrics_aggregation_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /metricsAggregationTests
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
		And I store the value of body path $.id as metric_scope1_mobile_id in global scope

	Scenario: Create simple pipeline pipeline1 that output to metric int:ghg:scope1:mobile
		Given I'm using the pipelines api
		And I authenticate using email metrics_aggregation_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /metricsAggregationTests/a
		And I set body to {"connectorConfig":{"input": [{"name": "sif-csv-pipeline-input-connector"}]},"attributes":{"type":"E2E"},"name":"first pipeline","description":"E2E test pipeline","transformer":{"transforms":[{"index":0,"formula":"AS_TIMESTAMP(:date,'M/d/yyyy HH:mm:ss')","outputs":[{"description":"Timestamp of business activity.","index":0,"key":"time","label":"Time","type":"timestamp"}]},{"index":1,"formula":":zipcode","outputs":[{"description":"Zipcode where electricity consumption occurred","index":0,"key":"zipcode","label":"Zip","type":"string"}]},{"index":2,"formula":":kwh*10","outputs":[{"description":"input * 10","index":0,"key":"kwh","label":"kwh","type":"number","metrics":["int:ghg:scope1:mobile"]}]}],"parameters":[{"index":0,"key":"date","type":"string"},{"index":1,"key":"zipcode","label":"zipcode","description":"Zipcode of electricity consumption","type":"string"},{"index":2,"key":"kwh","label":"kwh","description":"kWh of electricity generation in the month","type":"number"}]}}
		When I POST to /pipelines
		Then response code should be 201
		And response body should contain id
		And I store the value of body path $.id as pipeline_1_a_id in global scope

	Scenario: Upload Input File To Reset Activities For Pipeline1
		Given I'm using the pipelineProcessor api
		And I authenticate using email metrics_aggregation_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /metricsAggregationTests/a
		And I set body to { "expiration" : 300}
		When I POST to /pipelines/`pipeline_1_a_id`/executions
		Then response code should be 201
		And response body should contain id
		And response body path $.pipelineId should be `pipeline_1_a_id`
		And response body should contain inputUploadUrl
		And I store the value of body path $.inputUploadUrl as pipeline_reset_upload_url in global scope
		And I store the value of body path $.id as pipeline_reset_execution_id in global scope
		When I GET /pipelines/`pipeline_1_a_id`/executions/`pipeline_reset_execution_id`
		And response body path $.pipelineId should be `pipeline_1_a_id`
		And response body path $.id should be `pipeline_reset_execution_id`
		And response body path $.status should be waiting
		Then response code should be 200
		When I upload an input CSV file to url stored at global variable pipeline_reset_upload_url with rows
			| date              | zipcode | kwh |
			| 1/1/2022 02:02:02 | 80238   | 0   |
			| 1/2/2022 02:02:02 | 98116   | 0   |
			| 1/3/2022 02:02:02 | 55432   | 0   |
			| 1/4/2022 02:02:02 | 52172   | 0   |
			| 1/5/2022 02:02:02 | 75001   | 0   |
		Then I pause for 30000ms
		When I GET /pipelines/`pipeline_1_a_id`/executions/`pipeline_reset_execution_id`
		Then response code should be 200
		And response body path $.status should be success

	Scenario: Query the int:ghg:scope1:mobile metric
		Given I'm using the pipelineProcessor api
		And I authenticate using email metrics_aggregation_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /metricsAggregationTests/a
		When I GET /metrics?timeUnit=day&name=int:ghg:scope1:mobile&dateFrom=1/1/2022
		Then response code should be 200
		And response body path $.metrics[?(@.day=='1')].hierarchyValue should be 0
		And response body path $.metrics[?(@.day=='2')].hierarchyValue should be 0
		And response body path $.metrics[?(@.day=='3')].hierarchyValue should be 0
		And response body path $.metrics[?(@.day=='4')].hierarchyValue should be 0
		And response body path $.metrics[?(@.day=='5')].hierarchyValue should be 0
		When I GET /metrics?timeUnit=month&name=int:ghg:scope1:mobile&dateFrom=1/1/2022
		Then response code should be 200
		And response body path $.metrics[?(@.month=='1')].hierarchyValue should be 0
		When I GET /metrics?timeUnit=year&name=int:ghg:scope1:mobile&dateFrom=1/1/2022
		Then response code should be 200
		And response body path $.metrics[?(@.year=='2022')].hierarchyValue should be 0

	Scenario: Upload Input File for Pipeline Processing for Pipeline1 For Time Range 2 January - 4 January
		Given I'm using the pipelineProcessor api
		And I authenticate using email metrics_aggregation_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /metricsAggregationTests/a
		And I set body to { "expiration" : 300, "triggerMetricAggregations": false}
		When I POST to /pipelines/`pipeline_1_a_id`/executions
		Then response code should be 201
		And response body should contain id
		And response body path $.pipelineId should be `pipeline_1_a_id`
		And response body should contain inputUploadUrl
		And I store the value of body path $.inputUploadUrl as pipeline_1_a_upload_url in global scope
		And I store the value of body path $.id as pipeline_1_a_execution_id in global scope
		When I GET /pipelines/`pipeline_1_a_id`/executions/`pipeline_1_a_execution_id`
		And response body path $.pipelineId should be `pipeline_1_a_id`
		And response body path $.id should be `pipeline_1_a_execution_id`
		And response body path $.status should be waiting
		Then response code should be 200
		When I upload an input CSV file to url stored at global variable pipeline_1_a_upload_url with rows
			| date              | zipcode | kwh |
			| 1/2/2022 02:02:02 | 98116   | 10  |
			| 1/3/2022 02:02:02 | 55432   | 3   |
			| 1/4/2022 02:02:02 | 52172   | 4   |
		Then I pause for 15000ms
		When I GET /pipelines/`pipeline_1_a_id`/executions/`pipeline_1_a_execution_id`
		Then response code should be 200
		And response body path $.status should be success

	Scenario: Query the metric aggregation jobs
		Given I'm using the pipelineProcessor api
		And I authenticate using email metrics_aggregation_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /metricsAggregationTests/a
		When I GET /aggregations
		Then response code should be 200
		And response body path $.jobs.length should be 1
		And response body path $.jobs[0].pipelineId should be `pipeline_1_a_id`
		And response body path $.jobs[0].timeRange.from should be 2022-01-02T00:00:00.000Z
		And response body path $.jobs[0].timeRange.to should be 2022-01-04T23:59:59.000Z
		And I store the value of body path $.jobs[0].id as metric_aggregation_job_1_id in global scope

	Scenario: Upload Input File for Pipeline Processing for Pipeline1 For Time Range 1 January - 5 January
		Given I'm using the pipelineProcessor api
		And I authenticate using email metrics_aggregation_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /metricsAggregationTests/a
		And I set body to { "expiration" : 300, "triggerMetricAggregations": false}
		When I POST to /pipelines/`pipeline_1_a_id`/executions
		Then response code should be 201
		And response body should contain id
		And response body path $.pipelineId should be `pipeline_1_a_id`
		And response body should contain inputUploadUrl
		And I store the value of body path $.inputUploadUrl as pipeline_1_a_upload_url in global scope
		And I store the value of body path $.id as pipeline_1_a_execution_id in global scope
		When I GET /pipelines/`pipeline_1_a_id`/executions/`pipeline_1_a_execution_id`
		And response body path $.pipelineId should be `pipeline_1_a_id`
		And response body path $.id should be `pipeline_1_a_execution_id`
		And response body path $.status should be waiting
		Then response code should be 200
		When I upload an input CSV file to url stored at global variable pipeline_1_a_upload_url with rows
			| date              | zipcode | kwh |
			| 1/1/2022 02:02:02 | 80238   | 10  |
			| 1/5/2022 02:02:02 | 75001   | 5   |
		Then I pause for 15000ms
		When I GET /pipelines/`pipeline_1_a_id`/executions/`pipeline_1_a_execution_id`
		Then response code should be 200
		And response body path $.status should be success

	Scenario: Query the metric aggregation jobs with updated timeRange
		Given I'm using the pipelineProcessor api
		And I authenticate using email metrics_aggregation_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /metricsAggregationTests/a
		When I GET /aggregations
		Then response code should be 200
		And response body path $.jobs.length should be 1
		And response body path $.jobs[0].status should be pending
		And response body path $.jobs[0].pipelineId should be `pipeline_1_a_id`
		And response body path $.jobs[0].timeRange.from should be 2022-01-01T00:00:00.000Z
		And response body path $.jobs[0].timeRange.to should be 2022-01-05T23:59:59.000Z
		And I store the value of body path $.jobs[0].id as metric_aggregation_job_1_id in global scope

	Scenario: Metric int:ghg:scope1:mobile value should not changed because aggregation is not triggered
		Given I'm using the pipelineProcessor api
		And I authenticate using email metrics_aggregation_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /metricsAggregationTests/a
		When I GET /metrics?timeUnit=day&name=int:ghg:scope1:mobile&dateFrom=1/1/2022
		Then response code should be 200
		And response body path $.metrics[?(@.day=='1')].hierarchyValue should be 0
		And response body path $.metrics[?(@.day=='5')].hierarchyValue should be 0
		When I GET /metrics?timeUnit=month&name=int:ghg:scope1:mobile&dateFrom=1/1/2022
		Then response code should be 200
		And response body path $.metrics[?(@.month=='1')].hierarchyValue should be 0
		When I GET /metrics?timeUnit=year&name=int:ghg:scope1:mobile&dateFrom=1/1/2022
		Then response code should be 200
		And response body path $.metrics[?(@.year=='2022')].hierarchyValue should be 0

	Scenario: Start the metric aggregation jobs
		Given I'm using the pipelineProcessor api
		And I authenticate using email metrics_aggregation_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /metricsAggregationTests/a
		# Should fail when starting with invalid time range
		When I set body to { "from" : "2024-01-02T00:00:00.000Z" , "to": "2022-01-02T23:59:59.000Z" }
		And I PATCH /aggregations/`metric_aggregation_job_1_id`
		Then response code should be 400
		And response body path $.message should be time range is invalid
		# Should succeeded for valid time range
		When I set body to {}
		And I PATCH /aggregations/`metric_aggregation_job_1_id`
		Then response code should be 200
		And response body path $.status should be running
		Then I pause for 10000ms
		# Should fail when trying to start completed aggregation
		When I set body to {}
		And I PATCH /aggregations/`metric_aggregation_job_1_id`
		Then response code should be 400
		And response body path $.message should be Metric aggregation job cannot be found or status is not in pending state

	Scenario: Query the int:ghg:scope1:mobile metric
		Given I'm using the pipelineProcessor api
		And I authenticate using email metrics_aggregation_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /metricsAggregationTests/a
		When I GET /metrics?timeUnit=day&name=int:ghg:scope1:mobile&dateFrom=1/1/2022
		Then response code should be 200
		And response body path $.metrics[?(@.day=='1')].hierarchyValue should be 100
		And response body path $.metrics[?(@.day=='2')].hierarchyValue should be 100
		And response body path $.metrics[?(@.day=='3')].hierarchyValue should be 30
		And response body path $.metrics[?(@.day=='4')].hierarchyValue should be 40
		And response body path $.metrics[?(@.day=='5')].hierarchyValue should be 50
		When I GET /metrics?timeUnit=month&name=int:ghg:scope1:mobile&dateFrom=1/1/2022
		Then response code should be 200
		And response body path $.metrics[?(@.month=='1')].hierarchyValue should be 320
		When I GET /metrics?timeUnit=year&name=int:ghg:scope1:mobile&dateFrom=1/1/2022
		Then response code should be 200
		And response body path $.metrics[?(@.year=='2022')].hierarchyValue should be 320

	Scenario: Create metric aggregation job
		Given I'm using the pipelineProcessor api
		And I authenticate using email metrics_aggregation_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /metricsAggregationTests/a
		# metric aggregation job with invalid time range
		And I set body to { "pipelineId": "`pipeline_1_a_id`", "timeRange": { "from" : "2025-01-02T00:00:00.000Z" , "to": "2022-01-02T23:59:59.000Z" } }
		When I POST to /aggregations
		Then response code should be 400
		And response body path $.message should be time range is invalid
		# metric aggregation job with valid time range
		When I set body to { "pipelineId": "`pipeline_1_a_id`", "timeRange": { "from" : "2020-01-02T00:00:00.000Z" , "to": "2022-01-02T23:59:59.000Z" } }
		And I POST to /aggregations
		Then response code should be 201
		And response body path $.pipelineId should be `pipeline_1_a_id`
		And response body path $.status should be running
		And response body should contain id
		And I store the value of body path $.id as metric_aggregation_job_2_id in global scope
		Then I pause for 10000ms

	Scenario: Query the metric aggregation jobs
		Given I'm using the pipelineProcessor api
		And I authenticate using email metrics_aggregation_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /metricsAggregationTests/a
		When I GET /aggregations
		Then response code should be 200
		And response body path $.jobs.length should be 2
		# first metric aggregation job
		And response body path $.jobs[?(@.id=='`metric_aggregation_job_1_id`')].status should be succeeded
		And response body path $.jobs[?(@.id=='`metric_aggregation_job_1_id`')].timeRange.from should be 2022-01-01T00:00:00.000Z
		And response body path $.jobs[?(@.id=='`metric_aggregation_job_1_id`')].timeRange.to should be 2022-01-05T23:59:59.000Z
		# second metric aggregation job
		And response body path $.jobs[?(@.id=='`metric_aggregation_job_2_id`')].status should be succeeded
		And response body path $.jobs[?(@.id=='`metric_aggregation_job_2_id`')].timeRange.from should be 2020-01-02T00:00:00.000Z
		And response body path $.jobs[?(@.id=='`metric_aggregation_job_2_id`')].timeRange.to should be 2022-01-02T23:59:59.000Z

	Scenario: Query the int:ghg:scope1:mobile metric
		Given I'm using the pipelineProcessor api
		And I authenticate using email metrics_aggregation_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /metricsAggregationTests/a
		When I GET /metrics?timeUnit=day&name=int:ghg:scope1:mobile&dateFrom=1/1/2022
		Then response code should be 200
		And response body path $.metrics[?(@.day=='1')].hierarchyValue should be 100
		And response body path $.metrics[?(@.day=='2')].hierarchyValue should be 100
		And response body path $.metrics[?(@.day=='3')].hierarchyValue should be 30
		And response body path $.metrics[?(@.day=='4')].hierarchyValue should be 40
		And response body path $.metrics[?(@.day=='5')].hierarchyValue should be 50
		When I GET /metrics?timeUnit=month&name=int:ghg:scope1:mobile&dateFrom=1/1/2022
		Then response code should be 200
		And response body path $.metrics[?(@.month=='1')].hierarchyValue should be 320
		When I GET /metrics?timeUnit=year&name=int:ghg:scope1:mobile&dateFrom=1/1/2022
		Then response code should be 200
		And response body path $.metrics[?(@.year=='2022')].hierarchyValue should be 320

	Scenario: Create and verify download file output for int:ghg:scope1:mobile metric
		Given I'm using the pipelineProcessor api
		And I authenticate using email metrics_aggregation_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /metricsAggregationTests/a
		And I set body to {}
		When I POST to /metrics/download?timeUnit=day&name=int:ghg:scope1:mobile&dateFrom=1/1/2022
		Then response code should be 202
		And I store the value of body path $.id as metric_download_id in global scope
		Then I pause for 20000ms
		When I GET /metrics/download/`metric_download_id`
		Then response code should be 200
		And I store the value of body path $.downloads[0].url as metric_download_url in global scope
		When I download the output CSV file from the url stored at global variable metric_download_url it will match rows
			| name                  | groupId                    | date                     | timeUnit | groupValue | month | year | day | subGroupsValue | hierarchyValue |
			| int:ghg:scope1:mobile | /metricsaggregationtests/a | 2022-01-01T00:00:00.000Z | day      | 100        | 1     | 2022 | 1   | 0              | 100            |
			| int:ghg:scope1:mobile | /metricsaggregationtests/a | 2022-01-02T00:00:00.000Z | day      | 100        | 1     | 2022 | 2   | 0              | 100            |
			| int:ghg:scope1:mobile | /metricsaggregationtests/a | 2022-01-03T00:00:00.000Z | day      | 30         | 1     | 2022 | 3   | 0              | 30             |
			| int:ghg:scope1:mobile | /metricsaggregationtests/a | 2022-01-04T00:00:00.000Z | day      | 40         | 1     | 2022 | 4   | 0              | 40             |
			| int:ghg:scope1:mobile | /metricsaggregationtests/a | 2022-01-05T00:00:00.000Z | day      | 40         | 1     | 2022 | 5   | 0              | 50             |

	Scenario: Upload input file with the same time range for Pipeline Processing for pipeline1
	This will rewrite the previous metric value
		Given I'm using the pipelineProcessor api
		And I authenticate using email metrics_aggregation_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /metricsAggregationTests/a
		And I set body to { "expiration" : 300}
		When I POST to /pipelines/`pipeline_1_a_id`/executions
		Then response code should be 201
		And response body should contain id
		And response body path $.pipelineId should be `pipeline_1_a_id`
		And response body should contain inputUploadUrl
		And I store the value of body path $.inputUploadUrl as pipeline_1_a_upload_url in global scope
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
		Then I pause for 30000ms
		When I GET /pipelines/`pipeline_1_a_id`/executions/`pipeline_1_a_execution_id`
		Then response code should be 200
		And response body path $.status should be success

	Scenario: Perform another query on int:ghg:scope1:mobile metric which is now updated using the last csv
		Given I'm using the pipelineProcessor api
		And I authenticate using email metrics_aggregation_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /metricsAggregationTests/a
		When I GET /metrics?timeUnit=day&name=int:ghg:scope1:mobile&dateFrom=1/1/2022
		Then response code should be 200
		And response body path $.metrics[?(@.day=='1')].hierarchyValue should be 600
		And response body path $.metrics[?(@.day=='2')].hierarchyValue should be 200
		And response body path $.metrics[?(@.day=='3')].hierarchyValue should be 600
		And response body path $.metrics[?(@.day=='4')].hierarchyValue should be 400
		And response body path $.metrics[?(@.day=='5')].hierarchyValue should be 600
		When I GET /metrics?timeUnit=month&name=int:ghg:scope1:mobile&dateFrom=1/1/2022
		Then response code should be 200
		And response body path $.metrics[?(@.month=='1')].hierarchyValue should be 2400
		When I GET /metrics?timeUnit=year&name=int:ghg:scope1:mobile&dateFrom=1/1/2022
		Then response code should be 200
		And response body path $.metrics[?(@.year=='2022')].hierarchyValue should be 2400

	Scenario: Create simple pipeline pipeline2 that output to the same metric int:ghg:scope1:mobile
		Given I'm using the pipelines api
		And I authenticate using email metrics_aggregation_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /metricsAggregationTests/a
		And I set body to {"connectorConfig":{"input": [{"name": "sif-csv-pipeline-input-connector"}]},"attributes":{"type":"E2E"},"name":"second pipeline pipeline","description":"E2E test pipeline","transformer":{"transforms":[{"index":0,"formula":"AS_TIMESTAMP(:date,'M/d/yyyy HH:mm:ss')","outputs":[{"description":"Timestamp of business activity.","index":0,"key":"time","label":"Time","type":"timestamp"}]},{"index":1,"formula":":zipcode","outputs":[{"description":"Zipcode where electricity consumption occurred","index":0,"key":"zipcode","label":"Zip","type":"string"}]},{"index":2,"formula":":kwh*100","outputs":[{"description":"input * 10","index":0,"key":"kwh","label":"kwh","type":"number","metrics":["int:ghg:scope1:mobile"]}]}],"parameters":[{"index":0,"key":"date","type":"string"},{"index":1,"key":"zipcode","label":"zipcode","description":"Zipcode of electricity consumption","type":"string"},{"index":2,"key":"kwh","label":"kwh","description":"kWh of electricity generation in the month","type":"number"}]}}
		When I POST to /pipelines
		Then response code should be 201
		And response body should contain id
		And I store the value of body path $.id as pipeline_2_a_id in global scope

	Scenario: Upload input file for pipeline processing for pipeline2
		Given I'm using the pipelineProcessor api
		And I authenticate using email metrics_aggregation_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /metricsAggregationTests/a
		And I set body to { "expiration" : 300}
		When I POST to /pipelines/`pipeline_2_a_id`/executions
		Then response code should be 201
		And response body should contain id
		And response body path $.pipelineId should be `pipeline_2_a_id`
		And response body should contain inputUploadUrl
		And I store the value of body path $.inputUploadUrl as pipeline_2_a_upload_url in global scope
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
		Then I pause for 30000ms
		When I GET /pipelines/`pipeline_2_a_id`/executions/`pipeline_2_a_execution_id`
		Then response code should be 200

	Scenario: Query the int:ghg:scope1:mobile metric which should now aggregate the value from pipeline1 and pipeline2 output
		Given I'm using the pipelineProcessor api
		And I authenticate using email metrics_aggregation_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /metricsAggregationTests/a
		When I GET /metrics?timeUnit=day&name=int:ghg:scope1:mobile&dateFrom=1/1/2022
		Then response code should be 200
		And response body path $.metrics[?(@.day=='1')].hierarchyValue should be 1600
		And response body path $.metrics[?(@.day=='2')].hierarchyValue should be 2200
		And response body path $.metrics[?(@.day=='3')].hierarchyValue should be 3600
		And response body path $.metrics[?(@.day=='4')].hierarchyValue should be 4400
		And response body path $.metrics[?(@.day=='5')].hierarchyValue should be 5600
		When I GET /metrics?timeUnit=month&name=int:ghg:scope1:mobile&dateFrom=1/1/2022
		Then response code should be 200
		And response body path $.metrics[?(@.month=='1')].hierarchyValue should be 17400
		When I GET /metrics?timeUnit=year&name=int:ghg:scope1:mobile&dateFrom=1/1/2022
		Then response code should be 200
		And response body path $.metrics[?(@.year=='2022')].hierarchyValue should be 17400

	# Below are resources created on /metricsAggregationTests/b
	Scenario: Create simple pipeline pipeline1 that output to metric int:ghg:scope1:mobile
		Given I'm using the pipelines api
		And I authenticate using email metrics_aggregation_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /metricsAggregationTests/b
		And I set body to {"connectorConfig":{"input": [{"name": "sif-csv-pipeline-input-connector"}]},"attributes":{"type":"E2E"},"name":"first pipeline","description":"E2E test pipeline","transformer":{"transforms":[{"index":0,"formula":"AS_TIMESTAMP(:date,'M/d/yyyy HH:mm:ss')","outputs":[{"description":"Timestamp of business activity.","index":0,"key":"time","label":"Time","type":"timestamp"}]},{"index":1,"formula":":zipcode","outputs":[{"description":"Zipcode where electricity consumption occurred","index":0,"key":"zipcode","label":"Zip","type":"string"}]},{"index":2,"formula":":kwh*10","outputs":[{"description":"input * 10","index":0,"key":"kwh","label":"kwh","type":"number","metrics":["int:ghg:scope1:mobile"]}]}],"parameters":[{"index":0,"key":"date","type":"string"},{"index":1,"key":"zipcode","label":"zipcode","description":"Zipcode of electricity consumption","type":"string"},{"index":2,"key":"kwh","label":"kwh","description":"kWh of electricity generation in the month","type":"number"}]}}
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
		When I POST to /pipelines/`pipeline_1_b_id`/executions
		Then response code should be 201
		And response body should contain id
		And response body path $.pipelineId should be `pipeline_1_b_id`
		And response body should contain inputUploadUrl
		And I store the value of body path $.inputUploadUrl as pipeline_1_b_upload_url in global scope
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
		Then I pause for 30000ms
		When I GET /pipelines/`pipeline_1_b_id`/executions/`pipeline_1_b_execution_id`
		Then response code should be 200
		And response body path $.status should be success

	Scenario: Perform another query on int:ghg:scope1:mobile metric which is now updated using the last csv
		Given I'm using the pipelineProcessor api
		And I authenticate using email metrics_aggregation_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /metricsAggregationTests/b
		When I GET /metrics?timeUnit=day&name=int:ghg:scope1:mobile&dateFrom=1/1/2022
		Then response code should be 200
		And response body path $.metrics[?(@.day=='1')].hierarchyValue should be 100
		And response body path $.metrics[?(@.day=='2')].hierarchyValue should be 200
		And response body path $.metrics[?(@.day=='3')].hierarchyValue should be 300
		And response body path $.metrics[?(@.day=='4')].hierarchyValue should be 400
		And response body path $.metrics[?(@.day=='5')].hierarchyValue should be 500
		And response body path $.metrics[?(@.day=='67')].hierarchyValue should be 300
		And response body path $.metrics[?(@.day=='100')].hierarchyValue should be 500
		When I GET /metrics?timeUnit=month&name=int:ghg:scope1:mobile&dateFrom=1/1/2022
		Then response code should be 200
		And response body path $.metrics[?(@.month=='1')].hierarchyValue should be 1500
		And response body path $.metrics[?(@.month=='2')].hierarchyValue should be 200
		And response body path $.metrics[?(@.month=='3')].hierarchyValue should be 300
		And response body path $.metrics[?(@.month=='4')].hierarchyValue should be 500
		When I GET /metrics?timeUnit=year&name=int:ghg:scope1:mobile&dateFrom=1/1/2022
		Then response code should be 200
		And response body path $.metrics[?(@.year=='2022')].hierarchyValue should be 2500

	# Below is the being done in parent group /metricsAggregationTests
	Scenario: Query the int:ghg:scope1:mobile metric from parent group /metricsAggregationTests
		Given I'm using the pipelineProcessor api
		And I authenticate using email metrics_aggregation_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /metricsAggregationTests
		When I GET /metrics?timeUnit=day&name=int:ghg:scope1:mobile&dateFrom=1/1/2022
		Then response code should be 200
		And response body path $.metrics[?(@.day=='1')].subGroupsValue should be 1700
		And response body path $.metrics[?(@.day=='2')].subGroupsValue should be 2400
		And response body path $.metrics[?(@.day=='3')].subGroupsValue should be 3900
		And response body path $.metrics[?(@.day=='4')].subGroupsValue should be 4800
		And response body path $.metrics[?(@.day=='5')].subGroupsValue should be 6100
		When I GET /metrics?timeUnit=month&name=int:ghg:scope1:mobile&dateFrom=1/1/2022
		Then response code should be 200
		And response body path $.metrics[?(@.month=='1')].subGroupsValue should be 18900
		And response body path $.metrics[?(@.month=='2')].subGroupsValue should be 200
		And response body path $.metrics[?(@.month=='3')].subGroupsValue should be 300
		And response body path $.metrics[?(@.month=='4')].subGroupsValue should be 500
		When I GET /metrics?timeUnit=year&name=int:ghg:scope1:mobile&dateFrom=1/1/2022
		Then response code should be 200
		And response body path $.metrics[?(@.year=='2022')].subGroupsValue should be 19900

	Scenario: Query the int:ghg:scope1 metric which is the output of int:ghg:scope1:mobile from parent group /metricsAggregationTests
		Given I'm using the pipelineProcessor api
		And I authenticate using email metrics_aggregation_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /metricsAggregationTests
		When I GET /metrics?timeUnit=day&name=int:ghg:scope1&dateFrom=1/1/2022
		Then response code should be 200
		And response body path $.metrics[?(@.day=='1')].subGroupsValue should be 1700
		And response body path $.metrics[?(@.day=='2')].subGroupsValue should be 2400
		And response body path $.metrics[?(@.day=='3')].subGroupsValue should be 3900
		And response body path $.metrics[?(@.day=='4')].subGroupsValue should be 4800
		And response body path $.metrics[?(@.day=='5')].subGroupsValue should be 6100
		When I GET /metrics?timeUnit=month&name=int:ghg:scope1&dateFrom=1/1/2022
		Then response code should be 200
		And response body path $.metrics[?(@.month=='1')].subGroupsValue should be 18900
		And response body path $.metrics[?(@.month=='2')].subGroupsValue should be 200
		And response body path $.metrics[?(@.month=='3')].subGroupsValue should be 300
		And response body path $.metrics[?(@.month=='4')].subGroupsValue should be 500
		When I GET /metrics?timeUnit=year&name=int:ghg:scope1&dateFrom=1/1/2022
		Then response code should be 200
		And response body path $.metrics[?(@.year=='2022')].subGroupsValue should be 19900
		When I GET /metrics?timeUnit=year&name=int:ghg:scope1&dateFrom=1/1/2022&members=true
		Then response code should be 200
		And response body path $.metrics[?(@.groupId=='/metricsaggregationtests/a')].groupValue should be 17400
		And response body path $.metrics[?(@.groupId=='/metricsaggregationtests/b')].groupValue should be 2500

	Scenario: Upload input file that delete 2 rows associated with previous pipeline execution
	This will rewrite the previous metric value
		Given I'm using the pipelineProcessor api
		And I authenticate using email metrics_aggregation_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /metricsAggregationTests/b
		And I set body to { "expiration" : 300, "actionType": "delete"}
		When I POST to /pipelines/`pipeline_1_b_id`/executions
		Then response code should be 201
		And response body should contain id
		And response body path $.pipelineId should be `pipeline_1_b_id`
		And response body should contain inputUploadUrl
		And I store the value of body path $.inputUploadUrl as pipeline_1_b_delete_upload_url in global scope
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
		Then I pause for 30000ms
		When I GET /pipelines/`pipeline_1_b_id`/executions/`pipeline_1_b_delete_execution_id`
		Then response code should be 200
		And response body path $.status should be success

	Scenario: Perform another query on int:ghg:scope1:mobile metric whose aggregate value excludes the deleted rows
		Given I'm using the pipelineProcessor api
		And I authenticate using email metrics_aggregation_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /metricsAggregationTests/b
		When I GET /metrics?timeUnit=day&name=int:ghg:scope1:mobile&dateFrom=1/1/2022
		Then response code should be 200
		And response body path $.metrics[?(@.day=='1')].hierarchyValue should be 100
		And response body path $.metrics[?(@.day=='2')].hierarchyValue should be 200
		And response body path $.metrics[?(@.day=='3')].hierarchyValue should be 300
		And response body path $.metrics[?(@.day=='4')].hierarchyValue should be 400
		And response body path $.metrics[?(@.day=='5')].hierarchyValue should be 0
		And response body path $.metrics[?(@.day=='67')].hierarchyValue should be 300
		And response body path $.metrics[?(@.day=='100')].hierarchyValue should be 0
		When I GET /metrics?timeUnit=month&name=int:ghg:scope1:mobile&dateFrom=1/1/2022
		Then response code should be 200
		And response body path $.metrics[?(@.month=='1')].hierarchyValue should be 1000
		And response body path $.metrics[?(@.month=='2')].hierarchyValue should be 200
		And response body path $.metrics[?(@.month=='3')].hierarchyValue should be 300
		And response body path $.metrics[?(@.month=='4')].hierarchyValue should be 0
		When I GET /metrics?timeUnit=year&name=int:ghg:scope1:mobile&dateFrom=1/1/2022
		Then response code should be 200
		And response body path $.metrics[?(@.year=='2022')].hierarchyValue should be 1500

	# Below is the being done in parent group /metricsAggregationTests
	Scenario: Query the int:ghg:scope1:mobile metric from parent group /metricsAggregationTests whose aggregate value excludes the deleted rows
		Given I'm using the pipelineProcessor api
		And I authenticate using email metrics_aggregation_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /metricsAggregationTests
		When I GET /metrics?timeUnit=day&name=int:ghg:scope1:mobile&dateFrom=1/1/2022
		Then response code should be 200
		And response body path $.metrics[?(@.day=='1')].subGroupsValue should be 1700
		And response body path $.metrics[?(@.day=='2')].subGroupsValue should be 2400
		And response body path $.metrics[?(@.day=='3')].subGroupsValue should be 3900
		And response body path $.metrics[?(@.day=='4')].subGroupsValue should be 4800
		And response body path $.metrics[?(@.day=='5')].subGroupsValue should be 5600
		When I GET /metrics?timeUnit=month&name=int:ghg:scope1:mobile&dateFrom=1/1/2022
		Then response code should be 200
		And response body path $.metrics[?(@.month=='1')].subGroupsValue should be 18400
		And response body path $.metrics[?(@.month=='2')].subGroupsValue should be 200
		And response body path $.metrics[?(@.month=='3')].subGroupsValue should be 300
		And response body path $.metrics[?(@.month=='4')].subGroupsValue should be 0
		When I GET /metrics?timeUnit=year&name=int:ghg:scope1:mobile&dateFrom=1/1/2022
		Then response code should be 200
		And response body path $.metrics[?(@.year=='2022')].subGroupsValue should be 18900

	Scenario: Query the int:ghg:scope1 metric which is the output of int:ghg:scope1:mobile from parent group /metricsAggregationTests whose aggregate value excludes the deleted rows
		Given I'm using the pipelineProcessor api
		And I authenticate using email metrics_aggregation_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /metricsAggregationTests
		When I GET /metrics?timeUnit=day&name=int:ghg:scope1&dateFrom=1/1/2022
		Then response code should be 200
		And response body path $.metrics[?(@.day=='1')].subGroupsValue should be 1700
		And response body path $.metrics[?(@.day=='2')].subGroupsValue should be 2400
		And response body path $.metrics[?(@.day=='3')].subGroupsValue should be 3900
		And response body path $.metrics[?(@.day=='4')].subGroupsValue should be 4800
		And response body path $.metrics[?(@.day=='5')].subGroupsValue should be 5600
		When I GET /metrics?timeUnit=month&name=int:ghg:scope1&dateFrom=1/1/2022
		Then response code should be 200
		And response body path $.metrics[?(@.month=='1')].subGroupsValue should be 18400
		And response body path $.metrics[?(@.month=='2')].subGroupsValue should be 200
		And response body path $.metrics[?(@.month=='3')].subGroupsValue should be 300
		And response body path $.metrics[?(@.month=='4')].subGroupsValue should be 0
		When I GET /metrics?timeUnit=year&name=int:ghg:scope1&dateFrom=1/1/2022
		Then response code should be 200
		And response body path $.metrics[?(@.year=='2022')].subGroupsValue should be 18900
		When I GET /metrics?timeUnit=year&name=int:ghg:scope1&dateFrom=1/1/2022&members=true
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
