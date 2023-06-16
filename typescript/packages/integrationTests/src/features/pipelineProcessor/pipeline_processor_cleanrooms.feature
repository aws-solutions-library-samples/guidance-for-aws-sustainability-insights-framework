@setup_endToEnd
Feature:
	Pipeline Processor AWS CleanRooms Integration Test

	Scenario: Setup users
		Given I'm using the accessManagement api
		And group /cleanRoomsTest exists
		And group / has user pipeline_processor_admin@amazon.com with role admin and password p@ssword1
		And group /cleanRoomsTest has user pipeline_processor_admin@amazon.com granted access with role admin

	Scenario: Grant group /cleanRoomsTest access to sif-cleanRooms-pipeline-input-connector processor
		Given I'm using the pipelines api
		And I authenticate using email pipeline_processor_admin@amazon.com and password p@ssword1
		When I GET /connectors?name=sif-cleanRooms-pipeline-input-connector
		Then response code should be 200
		And I store the value of body path $.connectors[0].id as connector_id in global scope
		When I remove header Content-Type
		When I PUT /connectors/`connector_id`/groups/%2fcleanRoomsTest

	Scenario: Setup AWS CleanRooms Membership ID
		# Store your AWS CleanRooms Membership ID in the environment variable CLEANROOMS_MEMBERSHIP_ID
		Given I'm using the pipelineProcessor api
		And I store the environment variable CLEANROOMS_MEMBERSHIP_ID as membershipId in global scope

	Scenario: Teardown: Pipelines with tag feature:pipeline_processor_cleanrooms
	Cleans up any pipelines remaining from a previous test run associated with this test.
		Given I'm using the pipelines api
		And I authenticate using email pipeline_processor_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /cleanRoomsTest
		And no pipeline exists with tags feature:pipeline_processor_cleanrooms

	Scenario: Create Pipeline
	   	#  Here is the content of the csv that was crawled by glue into a table that is shared with AWS CleanRooms
	   	#	date,vehicleType,amount
		#	2022-1-1,truck,100
		#	2022-1-2,truck,100
		#	2022-1-3,truck,100
		#	2022-1-4,truck,100
		#	2022-1-1,car,50
		#	2022-1-2,car,50
		#	2022-1-3,car,50
		#	2022-1-4,car,50
		#	2022-1-1,motorcycle,20
		#	2022-1-2,motorcycle,20
		#	2022-1-3,motorcycle,20
		#	2022-1-4,motorcycle,20
		#	2022-1-1,bicycle,5
		#	2022-1-2,bicycle,5
		#	2022-1-3,bicycle,5
		#	2022-1-4,bicycle,5
		Given I'm using the pipelines api
		And I authenticate using email pipeline_processor_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /cleanRoomsTest
		And I set body to {"name":"pipeline_configured_with_input_connector","connectorConfig":{"input":[{"name":"sif-cleanRooms-pipeline-input-connector","parameters":{"query":"SELECT SUM(\"amount\") \"amount\", \"date\" FROM  \"emission\" WHERE \"date\" < '#dateTo' AND \"date\" > '#dateFrom' GROUP BY \"date\""}}]},"transformer":{"transforms":[{"index":0,"formula":"AS_TIMESTAMP(:date,'yyyy-MM-dd')","outputs":[{"description":"Timestamp of business activity.","index":0,"key":"date","label":"date","type":"timestamp"}]},{"index":1,"formula":":amount","outputs":[{"index":0,"key":"sum","label":"sum","description":"sum of amount","type":"number"}]}],"parameters":[{"index":0,"key":"date","type":"string"},{"index":1,"key":"amount","label":"amount","description":"amount value","type":"number"}]},"tags":{"feature":"pipeline_processor_cleanrooms"},"attributes":{"key1":"val","key2":"val"}}
		When I POST to /pipelines
		Then response code should be 201
		And response body should contain id
		And I store the value of body path $.id as pipeline_processor_pipeline_id in global scope

	Scenario: Trigger Pipeline Execution Number 1
		Given I'm using the pipelineProcessor api
		And I authenticate using email pipeline_processor_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /cleanRoomsTest
		And I set body to {"actionType":"create","mode":"job","connectorOverrides":{"sif-cleanRooms-pipeline-input-connector":{"parameters":{"membershipId":"`membershipId`","parameters":{"dateTo":"2022-01-03","dateFrom":"2021-12-31"}}}}}
		When I POST to /pipelines/`pipeline_processor_pipeline_id`/executions
		Then response code should be 201
		And I store the value of body path $.id as pipeline_execution_id_1 in global scope
		# Needs to wait longer for CleanRooms to start up
		Then I pause for 120000ms

	Scenario: Retrieve and Validate Activities
		Given I'm using the pipelineProcessor api
		And I authenticate using email pipeline_processor_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /cleanRoomsTest
		When I GET /activities?dateFrom=1/1/22&pipelineId=`pipeline_processor_pipeline_id`
		And response body path $.activities.length should be 2
		And response body path $.activities[?(@.date=='2022-01-01T00:00:00.000Z')]['sum'] should be 175
		And response body path $.activities[?(@.date=='2022-01-02T00:00:00.000Z')]['sum'] should be 175

	Scenario: Trigger Pipeline Execution Number 1
		Given I'm using the pipelineProcessor api
		And I authenticate using email pipeline_processor_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /cleanRoomsTest
		And I set body to {"actionType":"create","mode":"job","connectorOverrides":{"sif-cleanRooms-pipeline-input-connector":{"parameters":{"membershipId":"`membershipId`","parameters":{"dateTo":"2022-01-05","dateFrom":"2022-01-02"}}}}}
		When I POST to /pipelines/`pipeline_processor_pipeline_id`/executions
		Then response code should be 201
		And I store the value of body path $.id as pipeline_execution_id_2 in global scope
		Then I pause for 60000ms

	Scenario: Retrieve and Validate Activities
		Given I'm using the pipelineProcessor api
		And I authenticate using email pipeline_processor_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /cleanRoomsTest
		When I GET /activities?dateFrom=1/1/22&pipelineId=`pipeline_processor_pipeline_id`
		And response body path $.activities.length should be 4
		And response body path $.activities[?(@.date=='2022-01-01T00:00:00.000Z')]['sum'] should be 175
		And response body path $.activities[?(@.date=='2022-01-02T00:00:00.000Z')]['sum'] should be 175
		And response body path $.activities[?(@.date=='2022-01-03T00:00:00.000Z')]['sum'] should be 175
		And response body path $.activities[?(@.date=='2022-01-04T00:00:00.000Z')]['sum'] should be 175

	Scenario: Trigger Pipeline Execution Number 3 With Missing Parameter dateFrom
		Given I'm using the pipelineProcessor api
		And I authenticate using email pipeline_processor_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /cleanRoomsTest
		And I set body to {"actionType":"create","mode":"job","connectorOverrides":{"sif-cleanRooms-pipeline-input-connector":{"parameters":{"membershipId":"`membershipId`","parameters":{"dateTo":"2022-01-03"}}}}}
		When I POST to /pipelines/`pipeline_processor_pipeline_id`/executions
		Then response code should be 201
		And I store the value of body path $.id as pipeline_execution_id_3 in global scope
		Then I pause for 10000ms
		When I GET /pipelines/`pipeline_processor_pipeline_id`/executions/`pipeline_execution_id_3`
		Then response code should be 200
		And response body path $.status should be failed
		And response body path $.statusMessage should be error: These parameters are not being specified: #dateFrom

	Scenario: Revoke access to connector from group /cleanRoomsTest
		When I'm using the pipelines api
		Given I authenticate using email pipeline_processor_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		And I DELETE /connectors/`connector_id`/groups/%2fcleanRoomsTest
		Then response code should be 204

	Scenario: Teardown - Cleanup users
		When I'm using the accessManagement api
		And group /cleanRoomsTest has user pipeline_processor_admin@amazon.com revoked
		And group / has user pipeline_processor_admin@amazon.com revoked
		And group /cleanRoomsTest has been removed
