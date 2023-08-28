@setup_endToEnd @pipelineProcessor
Feature:
	Pipeline Processor Data Type Integration Test

	Scenario: Setup users
		Given I'm using the accessManagement api
		And group /pipelineProcessorDataTest exists
		And group / has user pipeline_processor_data_admin@amazon.com with role admin and password p@ssword1
		And group /pipelineProcessorDataTest has user pipeline_processor_data_admin@amazon.com granted access with role admin

	Scenario: Grant group /e2e access to sif-csv-pipeline-input-connector processor
		Given I'm using the pipelines api
		And I authenticate using email pipeline_processor_data_admin@amazon.com and password p@ssword1
		When I GET /connectors?name=sif-csv-pipeline-input-connector
		Then response code should be 200
		And I store the value of body path $.connectors[0].id as connector_id in global scope
		When I remove header Content-Type
		When I PUT /connectors/`connector_id`/groups/%2fpipelineProcessorDataTest
		Then response code should be 204

	Scenario: Teardown: Pipelines with tag testSource:pipelineProcessorsDataType
	Cleans up any pipelines remaining from a previous test run associated with this test.
		Given I'm using the pipelines api
		And I authenticate using email pipeline_processor_data_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /pipelineProcessorDataTest
		And no pipeline exists with tags testSource:pipelineProcessorsDataType

	Scenario: Create Pipeline with type data should should success
		Given I'm using the pipelines api
		And I authenticate using email pipeline_processor_data_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /pipelineProcessorDataTest
		And I set body to { "tags": {"testSource":"pipelineProcessorsDataType"}, "type":"data","connectorConfig":{"input":[{"name":"sif-csv-pipeline-input-connector"}]},"attributes":{"type":"integration"},"name":"Simple Pipeline that output result as file","description":"Pipeline processor data test pipeline","transformer":{"transforms":[{"index":0,"formula":":z","outputs":[{"description":"Column Z.","index":0,"key":"z","label":"Z","type":"string"}]},{"index":1,"formula":":a","outputs":[{"description":"Column A","index":0,"key":"a","label":"Column A","type":"string","includeAsUnique":true}]},{"index":2,"formula":":b*:c","outputs":[{"description":"Column B multiplied by Column C","index":0,"key":"b*c","label":"B x C","type":"number"}]}],"parameters":[{"index":0,"key":"z","label":"Z","description":"Column Z","type":"string"},{"index":1,"key":"a","label":"A","description":"Column A","type":"string"},{"index":2,"key":"b","label":"Column B","description":"Column B","type":"number"},{"index":3,"key":"c","label":"Column C","description":"Column C","type":"number"}]}}
		When I POST to /pipelines
		Then response code should be 201
		And response body should contain id
		And I store the value of body path $.id as pipeline_processor_data_pipeline_id in global scope

	Scenario: Execute Inline Pipeline Execution
		Given I'm using the pipelineProcessor api
		And I authenticate using email pipeline_processor_data_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /pipelineProcessorDataTest
		And I set body to {"actionType":"create","mode":"inline","inlineExecutionOptions":{"inputs":[{"z":"inlineFirst","a":"inlineA","b":1000,"c":1000}]}}
		When I POST to /pipelines/`pipeline_processor_data_pipeline_id`/executions
		Then response code should be 201
		And response body should contain id
		And I store the value of body path $.id as inline_success_execution_id in global scope
		And response body path $.status should be success
		And response body should not contain $.inlineExecutionOutputs.errors
		# Activities are returned as part of inline execution response
		And response body path $.inlineExecutionOutputs.outputs[0][z] should be inlineFirst
		And response body path $.inlineExecutionOutputs.outputs[0][a] should be inlineA
		And response body path $.inlineExecutionOutputs.outputs[0]['b*c'] should be 1000000

	Scenario: Upload Input File for the created pipeline
		Given I'm using the pipelineProcessor api
		And I authenticate using email pipeline_processor_data_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /pipelineProcessorDataTest
		And I set body to { "expiration" : 300}
		When I POST to /pipelines/`pipeline_processor_data_pipeline_id`/executions
		Then response code should be 201
		And I store the value of body path $.inputUploadUrl as success_upload_url in global scope
		When I upload an input CSV file to url stored at global variable success_upload_url with rows
			| z      | a | b  | c |
			| first  | A | 10 | 1 |
			| second | B | 20 | 2 |
			| third  | C | 30 | 3 |
			| fourth | D | 40 | 4 |
		Then I pause for 20000ms
		When I GET /pipelines/`pipeline_processor_data_pipeline_id`/executions
		Then response code should be 200
		And response body path $.executions should be of type array with length 2
		And the latest execution status should be success
		And I store the id of the latest execution in variable success_upload_execution_id in global scope

	Scenario: Retrieve and Validate Output
		Given I'm using the pipelineProcessor api
		And I authenticate using email pipeline_processor_data_admin@amazon.com and password p@ssword1 in group /pipelineProcessorDataTest
		And I set x-groupcontextid header to /pipelineProcessorDataTest
		And I set body to { "expiration" : 300}
		When I POST to /pipelines/`pipeline_processor_data_pipeline_id`/executions/`success_upload_execution_id`/outputDownloadUrl
		Then response code should be 201
		And I store the value of body path $.url as success_download_url in global scope
		When I download the output CSV file from the url stored at global variable success_download_url it will match rows
			| a   | z        | b*c |
			| "A" | "first"  | 10  |
			| "B" | "second" | 40  |
			| "C" | "third"  | 90  |
			| "D" | "fourth" | 160 |

	Scenario: Revoke access to connector from group /pipelineProcessorDataTest
		When I'm using the pipelines api
		Given I authenticate using email pipeline_processor_data_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		And I DELETE /connectors/`connector_id`/groups/%2fpipelineProcessorDataTest
		Then response code should be 204

	Scenario: Teardown - Cleanup users
		When I'm using the accessManagement api
		And group /pipelineProcessorDataTest has user pipeline_processor_data_admin@amazon.com revoked
		And group / has user pipeline_processor_data_admin@amazon.com revoked
		And group /pipelineProcessorDataTest has been removed
