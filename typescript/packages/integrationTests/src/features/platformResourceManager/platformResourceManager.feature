@setup_endToEnd @platformTest
Feature:
	Platform Resource Manager Test

	Scenario: Setup users
		Given I'm using the accessManagement api
		And group /platformResourceManagerTest exists
		And group / has user platform_resource_manager_admin@amazon.com with role admin and password p@ssword1
		And group /platformResourceManagerTest has user platform_resource_manager_admin@amazon.com granted access with role admin

	Scenario: Create Metrics on group /metricsAggregationTests
		Given I'm using the pipelines api
		And I authenticate using email platform_resource_manager_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /platformResourceManagerTest
		And I set body to {"name":"platform:test","summary":"GHG Scope 1 direct emissions.","aggregationType":"sum","tags":{"standard":"ghg","scope":"1"}}
		When I POST to /metrics
		Then response code should be 201
		And response body should contain id
		And I store the value of body path $.id as platform_test_metric_id in global scope

	Scenario: Create Pipeline
		Given I'm using the pipelines api
		And I authenticate using email platform_resource_manager_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /platformResourceManagerTest
		And I set body to {"connectorConfig":{"input": [{"name": "sif-csv-pipeline-input-connector"}]},"attributes":{"type":"integration"},"name":"Simple Pipeline","description":"Pipeline processor test pipeline","transformer":{"transforms":[{"index":0,"formula":"AS_TIMESTAMP(:reading date,'M/d/yy')","outputs":[{"description":"Timestamp of business activity.","index":0,"key":"time","label":"Time","type":"timestamp"}]},{"index":1,"formula":"AS_TIMESTAMP(:reading date,'M/d/yy', roundDownTo='month')","outputs":[{"description":"Transform date to beginning of month.","index":0,"key":"month","label":"Month","type":"timestamp","aggregate":"groupBy"}]},{"index":2,"formula":":a","outputs":[{"description":"Column A","index":0,"key":"a","label":"Column A","type":"string","includeAsUnique":true}]},{"index":3,"formula":":b*:c","outputs":[{"description":"Column B multiplied by Column C","index":0,"key":"b*c","label":"B x C","type":"number","aggregate":"sum"}]}],"parameters":[{"index":0,"key":"reading date","type":"string"},{"index":1,"key":"a","label":"A","description":"Column A","type":"string"},{"index":2,"key":"b","label":"Column B","description":"Column B","type":"number"},{"index":3,"key":"c","label":"Column C","description":"Column C","type":"number"}]}}
		When I POST to /pipelines
		Then response code should be 201
		And response body should contain id
		And I store the value of body path $.id as pipeline_processor_pipeline_id in global scope

	Scenario: Execute Inline Pipeline Execution
		Given I'm using the pipelineProcessor api
		And I authenticate using email platform_resource_manager_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /platformResourceManagerTest
		And I set body to { "tags": { "source":"platformResourceManagerTest", "sequence":"1" }, "actionType":"create","mode":"inline","inlineExecutionOptions":{"inputs":[{"reading date":"1/4/22","a":"A","b":10,"c":1},{"reading date":"1/4/22","a":"A","b":10,"c":1},{"reading date":"1/4/22","a":"C","b":30,"c":3},{"reading date":"1/4/22","a":"D","b":40,"c":4},{"reading date":"1/4/22","a":"E","b":50,"c":5},{"reading date":"1/4/22","a":"F","b":60,"c":6}]}}
		# Should be able to create pipeline execution
		When I POST to /pipelines/`pipeline_processor_pipeline_id`/executions
		Then response code should be 201
		And response body should contain id
		And I store the value of body path $.id as success_execution_id in global scope
		And response body path $.status should be success
		And response body should not contain $.inlineExecutionOutputs.errors
		And response body path $.inlineExecutionOutputs.outputs.length should be 6
		# Should be able to retrieve activities
		When I GET /activities?date=1/4/22&executionId=`success_execution_id`&pipelineId=`pipeline_processor_pipeline_id`&showHistory=true&uniqueKeyAttributes=a:A
		Then response code should be 200
		# Should be able to retrieve metrics
		When I GET /metrics?timeUnit=day&name=platform:test&dateFrom=1/1/2022
		Then response code should be 200

	Scenario: Turn Off Aurora Cluster
		Given I perform action stop on platform resource aurora-cluster
		Then I wait until platform resource aurora-cluster status are stopped with 900s timeout
		And I'm using the pipelineProcessor api
		And I authenticate using email platform_resource_manager_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /platformResourceManagerTest
		# Should not be able to create pipeline execution
		And I set body to { "tags": { "source":"platformResourceManagerTest", "sequence":"1" }, "actionType":"create","mode":"inline","inlineExecutionOptions":{"inputs":[{"reading date":"1/4/22","a":"A","b":10,"c":1},{"reading date":"1/4/22","a":"A","b":10,"c":1},{"reading date":"1/4/22","a":"C","b":30,"c":3},{"reading date":"1/4/22","a":"D","b":40,"c":4},{"reading date":"1/4/22","a":"E","b":50,"c":5},{"reading date":"1/4/22","a":"F","b":60,"c":6}]}}
		When I POST to /pipelines/`pipeline_processor_pipeline_id`/executions
		Then response code should be 503
		# Should not be able to retrieve activities
		When I GET /activities?date=1/4/22&executionId=`success_execution_id`&pipelineId=`pipeline_processor_pipeline_id`&showHistory=true&uniqueKeyAttributes=a:A
		Then response code should be 503
		# Should not be able to retrieve metrics
		When I GET /metrics?timeUnit=day&name=platform:test&dateFrom=1/1/2022
		Then response code should be 503

	Scenario: Teardown - Pipeline
		When I'm using the pipelines api
		And I authenticate using email platform_resource_manager_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /platformResourceManagerTest
		When I remove header Content-Type
		When I DELETE /pipelines/`pipeline_processor_pipeline_id`
		Then response code should be 204
		When I GET /pipelines
		Then response code should be 200
		And response body path $.pipelines.length should be 0

	Scenario: Teardown - Metrics
		When I'm using the pipelines api
		And I authenticate using email platform_resource_manager_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /platformResourceManagerTest
		When I remove header Content-Type
		# Delete Metric
		When I DELETE /metrics/`platform_test_metric_id`
		Then response code should be 204
		When I GET /metrics/`platform_test_metric_id`
		Then response code should be 404

	Scenario: Teardown - Cleanup users
		When I'm using the accessManagement api
		And group /platformResourceManagerTest has user platform_resource_manager_admin@amazon.com revoked
		And group / has user platform_resource_manager_admin@amazon.com revoked
		And group /platformResourceManagerTest has been removed

	Scenario: Turn On Aurora Cluster
		Given I perform action start on platform resource aurora-cluster
		Then I wait until platform resource aurora-cluster status are available with 900s timeout
