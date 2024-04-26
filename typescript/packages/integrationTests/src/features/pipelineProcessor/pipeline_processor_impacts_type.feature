@setup_endToEnd @pipelineProcessor
Feature:
	Pipeline Processor Impact Type Integration Test

	Scenario: Setup users
		Given I'm using the accessManagement api
		And group /pipelineProcessorImpactsTest exists
		And group / has user pipeline_processor_impacts_admin@amazon.com with role admin and password p@ssword1
		And group /pipelineProcessorImpactsTest has user pipeline_processor_impacts_admin@amazon.com granted access with role admin

	Scenario: Grant group /e2e access to sif-csv-pipeline-input-connector processor
		Given I'm using the pipelines api
		And I authenticate using email pipeline_processor_impacts_admin@amazon.com and password p@ssword1
		When I GET /connectors?name=sif-csv-pipeline-input-connector
		Then response code should be 200
		And I store the value of body path $.connectors[0].id as connector_id in global scope
		When I remove header Content-Type
		When I PUT /connectors/`connector_id`/groups/%2fpipelineProcessorImpactsTest
		Then response code should be 204

	Scenario: Teardown: Activities with tag testSource:pipelineProcessorsImpactsType
	Cleans up any activities remaining from a previous test run associated with this test.
		Given I'm using the impacts api
		And I authenticate using email pipeline_processor_impacts_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /pipelineProcessorImpactsTest
		And no activities exists with tags testSource:pipelineProcessorsImpactsType

	Scenario: Teardown: Pipelines with tag testSource:pipelineProcessorsImpactsType
	Cleans up any pipelines remaining from a previous test run associated with this test.
		Given I'm using the pipelines api
		And I authenticate using email pipeline_processor_impacts_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /pipelineProcessorImpactsTest
		And no pipeline exists with tags testSource:pipelineProcessorsImpactsType

	Scenario: Create Pipeline with type impacts should should success
		Given I'm using the pipelines api
		And I authenticate using email pipeline_processor_impacts_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /pipelineProcessorImpactsTest
		And I set body to {"tags":{"testSource":"pipelineProcessorsImpactsType"},"connectorConfig":{"input":[{"name":"sif-csv-pipeline-input-connector"}]},"attributes":{"type":"integration"},"type":"impacts","name":"Simple Impact Pipeline Type","description":"Simple pipeline that creates impact","transformer":{"transforms":[{"index":0,"formula":":activityName","outputs":[{"description":"Activity Name","index":0,"key":"activity:name","label":"Column A","type":"string"}]},{"index":1,"formula":":impactName","outputs":[{"description":"Impact Name","index":0,"key":"impact:impactKey:name","label":"Column A","type":"string"}]},{"index":2,"formula":":componentKey","outputs":[{"description":"Component Key","index":0,"key":"impact:impactKey:component:co2e:key","label":"Column A","type":"string"}]},{"index":3,"formula":":componentValue","outputs":[{"description":"Component Value","index":0,"key":"impact:impactKey:component:co2e:value","label":"Column A","type":"number"}]},{"index":4,"formula":":componentType","outputs":[{"description":"Component Type","index":0,"key":"impact:impactKey:component:co2e:type","label":"Column A","type":"string"}]},{"index":5,"formula":":tagValue","outputs":[{"description":"Tag Value","index":0,"key":"activity:tag:testSource","label":"Column A","type":"string"}]}],"parameters":[{"index":0,"key":"activityName","label":"activityName","description":"Activity Name","type":"string"},{"index":1,"key":"impactName","label":"impactName","description":"Impact Name","type":"string"},{"index":2,"key":"componentKey","label":"componentKey","description":"Component Key","type":"string"},{"index":3,"key":"componentValue","label":"componentValue","description":"Component Value","type":"number"},{"index":4,"key":"componentType","label":"componentType","description":"Component Type","type":"string"},{"index":5,"key":"tagValue","label":"tagValue","description":"Tag Value","type":"string"}]}}
		When I POST to /pipelines
		Then response code should be 201
		And response body should contain id
		And I store the value of body path $.id as pipeline_processor_data_pipeline_id in global scope

	Scenario: Execute Inline Pipeline Execution
		Given I'm using the pipelineProcessor api
		And I authenticate using email pipeline_processor_impacts_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /pipelineProcessorImpactsTest
		And I set body to {"actionType":"create","mode":"inline","inlineExecutionOptions":{"inputs":[{"activityName":"inlineActivity","impactName":"inlineImpact","componentKey":"co2e","componentValue":10,"componentType":"carbon","tagValue":"pipelineProcessorsImpactsType"}]}}
		When I POST to /pipelines/`pipeline_processor_data_pipeline_id`/executions
		Then response code should be 201
		And response body should contain id
		And I store the value of body path $.id as inline_success_execution_id in global scope
		And response body path $.status should be success
		And response body should not contain $.inlineExecutionOutputs.errors
		# Activities are returned as part of inline execution response
		And response body path $.inlineExecutionOutputs.outputs[0]["activity:name"] should be inlineActivity
		And response body path $.inlineExecutionOutputs.outputs[0]["impact:impactKey:name"] should be inlineImpact
		And response body path $.inlineExecutionOutputs.outputs[0]["impact:impactKey:component:co2e:key"] should be co2e
		And response body path $.inlineExecutionOutputs.outputs[0]["impact:impactKey:component:co2e:value"] should be 10
		And response body path $.inlineExecutionOutputs.outputs[0]["impact:impactKey:component:co2e:type"] should be carbon
		And response body path $.inlineExecutionOutputs.outputs[0]["activity:tag:testSource"] should be pipelineProcessorsImpactsType

	Scenario: Upload Input File for the created pipeline
		Given I'm using the pipelineProcessor api
		And I authenticate using email pipeline_processor_impacts_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /pipelineProcessorImpactsTest
		And I set body to { "expiration" : 300}
		When I POST to /pipelines/`pipeline_processor_data_pipeline_id`/executions
		Then response code should be 201
		And I store the value of body path $.inputUploadUrl as success_upload_url in global scope
		When I upload an input CSV file to url stored at global variable success_upload_url with rows
			| activityName | impactName | componentKey | componentValue | componentType | tagValue                      |
			| testActivity | testImpact | co2e         | 2              | carbon        | pipelineProcessorsImpactsType |
		Then I pause for 20000ms
		When I GET /pipelines/`pipeline_processor_data_pipeline_id`/executions
		Then response code should be 200
		And response body path $.executions should be of type array with length 2
		And I store the id of the latest execution in variable success_upload_execution_id in global scope
		And the latest execution status should be success

	Scenario: Retrieve and Validate Output
		Given I'm using the pipelineProcessor api
		And I authenticate using email pipeline_processor_impacts_admin@amazon.com and password p@ssword1 in group /pipelineProcessorImpactsTest
		And I set x-groupcontextid header to /pipelineProcessorImpactsTest
		And I set body to { "expiration" : 300}
		When I POST to /pipelines/`pipeline_processor_data_pipeline_id`/executions/`success_upload_execution_id`/outputDownloadUrl
		Then response code should be 201
		And I store the value of body path $.url as success_download_url in global scope
		When I download the output CSV file from the url stored at global variable success_download_url it will match rows
			| componentType | componentValue | activityName   | activity_tag_testSource         | impactName   | componentKey |
			| "carbon"      | 2              | "testActivity" | "pipelineProcessorsImpactsType" | "testImpact" | "co2e"       |

	Scenario: Retrieve created activity using pipeline id as tag value
		Given I'm using the impacts api
		And I authenticate using email pipeline_processor_impacts_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /pipelineProcessorImpactsTest
		And I set query parameters to
			| parameter  | value                                 |
			| pipelineId | `pipeline_processor_data_pipeline_id` |
		When I GET /activities
		Then response code should be 200
		And response body path $.activities.length should be 2
		And response body path $.activities[0].name should be inlineActivity
		And response body path $.activities[0].version should be 1
		And response body path $.activities[0].impacts.impactKey.name should be inlineImpact
		And response body path $.activities[0].impacts.impactKey.components.co2e.value should be 10
		And response body path $.activities[0].impacts.impactKey.components.co2e.type should be carbon
		And response body path $.activities[0].impacts.impactKey.components.co2e.key should be co2e
		And response body path $.activities[1].name should be testActivity
		And response body path $.activities[1].version should be 1
		And response body path $.activities[1].impacts.impactKey.name should be testImpact
		And response body path $.activities[1].impacts.impactKey.components.co2e.value should be 2
		And response body path $.activities[1].impacts.impactKey.components.co2e.type should be carbon
		And response body path $.activities[1].impacts.impactKey.components.co2e.key should be co2e

	Scenario: Revoke access to connector from group /pipelineProcessorImpactsTest
		When I'm using the pipelines api
		Given I authenticate using email pipeline_processor_impacts_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		And I DELETE /connectors/`connector_id`/groups/%2fpipelineProcessorImpactsTest
		Then response code should be 204

	Scenario: Teardown - Cleanup users
		When I'm using the accessManagement api
		And group /pipelineProcessorImpactsTest has user pipeline_processor_impacts_admin@amazon.com revoked
		And group / has user pipeline_processor_impacts_admin@amazon.com revoked
		And group /pipelineProcessorImpactsTest has been removed
