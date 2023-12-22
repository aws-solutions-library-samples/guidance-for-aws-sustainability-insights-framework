@setup_connectors @connectors
Feature:
	Kinesis Input Connector Integration Test

	Scenario: Setup users
		Given I'm using the accessManagement api
		And group /inputConnectorKinesisTest exists
		And group / has user input_connector_kinesis_admin@amazon.com with role admin and password p@ssword1
		And group /inputConnectorKinesisTest has user input_connector_kinesis_admin@amazon.com granted access with role admin

	Scenario: Grant group /inputConnectorKinesisTest access to sif-kinesis-pipeline-input-connector processor
		Given I'm using the pipelines api
		And I authenticate using email input_connector_kinesis_admin@amazon.com and password p@ssword1
		When I GET /connectors?name=sif-kinesis-pipeline-input-connector
		Then response code should be 200
		And I store the value of body path $.connectors[0].id as connector_id in global scope
		When I remove header Content-Type
		When I PUT /connectors/`connector_id`/groups/%2finputConnectorKinesisTest
		Then response code should be 204

	Scenario: Create Pipeline
		Given I'm using the pipelines api
		And I authenticate using email input_connector_kinesis_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /inputConnectorKinesisTest
		And I set body to {"connectorConfig":{"input": [{"name": "sif-kinesis-pipeline-input-connector","parameters": {"deploymentMethod": "managed-pipeline","useExistingDataStream": false,"bufferSize": 0.2,"bufferInterval": 60, "handlebarsTemplate": "{ \"reading date\":  \"{{'reading date'}}\", \"a\": \"{{data}}\", \"b\": {{b}}, \"c\": {{c}} }\n"}}]},"attributes":{"type":"integration"},"name":"Simple Pipeline","description":"Pipeline processor test pipeline","transformer":{"transforms":[{"index":0,"formula":"AS_TIMESTAMP(:reading date,'M/d/yy')","outputs":[{"description":"Timestamp of business activity.","index":0,"key":"time","label":"Time","type":"timestamp"}]},{"index":1,"formula":"AS_TIMESTAMP(:reading date,'M/d/yy', roundDownTo='month')","outputs":[{"description":"Transform date to beginning of month.","index":0,"key":"month","label":"Month","type":"timestamp","aggregate":"groupBy"}]},{"index":2,"formula":":a","outputs":[{"description":"Column A","index":0,"key":"a","label":"Column A","type":"string","includeAsUnique":true}]},{"index":3,"formula":":b*:c","outputs":[{"description":"Column B multiplied by Column C","index":0,"key":"b*c","label":"B x C","type":"number","aggregate":"sum"}]}],"parameters":[{"index":0,"key":"reading date","type":"string"},{"index":1,"key":"a","label":"A","description":"Column A","type":"string"},{"index":2,"key":"b","label":"Column B","description":"Column B","type":"number"},{"index":3,"key":"c","label":"Column C","description":"Column C","type":"number"}]},"tags":{"testSource":"connectorKinesis"}}
		When I POST to /pipelines
		Then response code should be 201
		And response body should contain id
		And response body path $.state should be disabled
		And I store the value of body path $.id as input_connector_kinesis_pipeline_id in global scope
		And I wait until cloudformation stack for pipeline `input_connector_kinesis_pipeline_id` status CREATE_COMPLETE with 240s timeout
		When I GET /pipelines/`input_connector_kinesis_pipeline_id`
		Then I pause for 2000ms
		And response body path $.connectorConfig.input.[0].parameters.deploymentStatus should be deployed

	Scenario: Stream traffic to kinesis
		Given I'm using the accessManagement api
		And I stream data for pipeline `input_connector_kinesis_pipeline_id` from [{"reading date":"1/4/22","data":"A","b":10,"c":1},{"reading date":"1/4/22","data":"A","b":10,"c":1},{"reading date":"1/4/22","data":"C","b":30,"c":3},{"reading date":"1/4/22","data":"D","b":40,"c":4},{"reading date":"1/4/22","data":"E","b":50,"c":5},{"reading date":"1/4/22","data":"F","b":60,"c":6}]
		Then I pause for 240000ms

	Scenario: List executions and get executionId
		Given I'm using the pipelineProcessor api
		And I authenticate using email input_connector_kinesis_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /inputConnectorKinesisTest
		When I GET /pipelines/`input_connector_kinesis_pipeline_id`/executions
		And response body path $.executions should be of type array with length 1
		And I store the value of body path $.executions.[0].id as success_execution_id in global scope
		Then I pause for 10000ms

	# Validate pipeline execution results
	Scenario: Retrieve and Validate Successful Output
		Given I'm using the pipelineProcessor api
		And I authenticate using email input_connector_kinesis_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /inputConnectorKinesisTest
		When I GET /activities?date=1/4/22&executionId=`success_execution_id`&pipelineId=`input_connector_kinesis_pipeline_id`&showHistory=true&uniqueKeyAttributes=a:A
		And I store the value of body path $.activities[?(@.a=='A')]['activityId'] as activity_id_1 in global scope
		And I store the value of body path $.activities[?(@.a=='A')]['createdAt'] as activity_id_1_created_at_1 in global scope
		And response body path $.activities[?(@.a=='A')]['b*c'] should be 10
		And response body path $.activities should be of type array with length 2
		# Sleep for 50 seconds to ensure aggregation task finishes
		Then I pause for 5000ms
		When I GET /activities?date=1/1/22&executionId=`success_execution_id`&pipelineId=`input_connector_kinesis_pipeline_id`&showAggregate=true
		And response body path $.activities[?(@.date=='2022-01-01T00:00:00.000Z')]['b*c'] should be 870
		And response body path $.activities should be of type array with length 1
		# validating pagination
		When I GET /activities?date=1/4/22&executionId=`success_execution_id`&count=2
		And response body path $.activities should be of type array with length 2
		And response body path $.pagination.lastEvaluatedToken should be 2
		When I GET /activities?date=1/4/22&executionId=`success_execution_id`&count=10
		And response body path $.activities should be of type array with length 6
		And response body should not contain $.pagination

	Scenario: Create and verify download file output for activity query
		Given I'm using the pipelineProcessor api
		And I authenticate using email input_connector_kinesis_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /inputConnectorKinesisTest
		And I set body to {}
		When I POST to /activities/download?dateFrom=1/1/22&executionId=`success_execution_id`&pipelineId=`input_connector_kinesis_pipeline_id`&uniqueKeyAttributes=a:A
		Then response code should be 202
		And I store the value of body path $.id as activity_download_id in global scope
		Then I pause for 30000ms
		When I GET /activities/download/`activity_download_id`
		Then response code should be 200
		And I store the value of body path $.downloads[0].url as activity_download_url in global scope
		When I download the output CSV file from the url stored at global variable activity_download_url it will match rows
			| a | date                     | b*c |
			| A | 2022-01-04T00:00:00.000Z | 10  |
			| A | 2022-01-04T00:00:00.000Z | 10  |
			| C | 2022-01-04T00:00:00.000Z | 90  |
			| D | 2022-01-04T00:00:00.000Z | 160 |
			| E | 2022-01-04T00:00:00.000Z | 250 |
			| F | 2022-01-04T00:00:00.000Z | 360 |


	Scenario: Teardown: Pipelines with tag testSource:connectorKinesis
	# Cleans up any pipelines remaining from a previous test run associated with this test.
		Given I'm using the pipelines api
		And I authenticate using email input_connector_kinesis_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /inputConnectorKinesisTest
		And no pipeline exists with tags testSource:connectorKinesis
		And I wait until cloudformation stack for pipeline `input_connector_kinesis_pipeline_id` status DELETE_COMPLETE with 240s timeout

	Scenario: Teardown - Cleanup users
		When I'm using the accessManagement api
		And group /inputConnectorKinesisTest has user input_connector_kinesis_admin@amazon.com revoked
		And group / has user input_connector_kinesis_admin@amazon.com revoked
		And group /inputConnectorKinesisTest has been removed
