@setup_endToEnd @pipelineProcessor
Feature:
	Pipeline Processor Data Fabric Connector Integration Test

	Scenario: Setup users
		Given I'm using the accessManagement api
		And group /pipelineProcessorDataFabricTest exists
		And group / has user pipeline_processor_datafabric_admin@amazon.com with role admin and password p@ssword1
		And group /pipelineProcessorDataFabricTest has user pipeline_processor_datafabric_admin@amazon.com granted access with role admin

	Scenario: Grant group /pipelineProcessorDataFabricTest access to sif-csv-pipeline-input-connector processor
		Given I'm using the pipelines api
		And I authenticate using email pipeline_processor_datafabric_admin@amazon.com and password p@ssword1
		When I GET /connectors?name=sif-csv-pipeline-input-connector
		Then response code should be 200
		And I store the value of body path $.connectors[0].id as connector_id in global scope
		When I remove header Content-Type
		When I PUT /connectors/`connector_id`/groups/%2fpipelineProcessorDataFabricTest
		Then response code should be 204

	Scenario: Grant group /pipelineProcessorDataFabricTest access to sif-dataFabric-pipeline-output-connector processor
		Given I'm using the pipelines api
		And I authenticate using email pipeline_processor_datafabric_admin@amazon.com and password p@ssword1
		When I GET /connectors?name=sif-dataFabric-pipeline-output-connector
		Then response code should be 200
		And I store the value of body path $.connectors[0].id as datafabric_output_connector_id in global scope
		When I remove header Content-Type
		When I PUT /connectors/`datafabric_output_connector_id`/groups/%2fpipelineProcessorDataFabricTest
		Then response code should be 204

	Scenario: Teardown: Activities with tag testSource:pipelineProcessorDataFabricTest
	Cleans up any activities remaining from a previous test run associated with this test.
		Given I'm using the impacts api
		And I authenticate using email pipeline_processor_datafabric_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /pipelineProcessorDataFabricTest
		And no activities exists with tags testSource:pipelineProcessorDataFabricTest

	Scenario: Teardown: Pipelines with tag testSource:pipelineProcessorDataFabricTest
	Cleans up any pipelines remaining from a previous test run associated with this test.
		Given I'm using the pipelines api
		And I authenticate using email pipeline_processor_datafabric_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /pipelineProcessorDataFabricTest
		And no pipeline exists with tags testSource:pipelineProcessorDataFabricTest

	# Activity Pipeline
	Scenario: Create Pipeline
		Given I'm using the pipelines api
		And I authenticate using email pipeline_processor_datafabric_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /pipelineProcessorDataFabricTest
		And I set body to {"tags":{"testSource":"pipelineProcessorDataFabricTest"},"connectorConfig":{"input": [{"name": "sif-csv-pipeline-input-connector"}],"output":[{"name":"sif-dataFabric-pipeline-output-connector", "parameters": {"domainId":"1111","environmentId":"2222"}}]},"attributes":{"type":"integration"},"name":"Simple Pipeline","description":"Pipeline processor test pipeline","transformer":{"transforms":[{"index":0,"formula":"AS_TIMESTAMP(:reading_date,'M/d/yy')","outputs":[{"description":"Timestamp of business activity.","index":0,"key":"time","label":"Time","type":"timestamp"}]},{"index":1,"formula":"AS_TIMESTAMP(:reading_date,'M/d/yy', roundDownTo='month')","outputs":[{"description":"Transform date to beginning of month.","index":0,"key":"month","label":"Month","type":"timestamp","aggregate":"groupBy"}]},{"index":2,"formula":":a","outputs":[{"description":"Column A","index":0,"key":"a","label":"Column A","type":"string","includeAsUnique":true}]},{"index":3,"formula":":b*:c","outputs":[{"description":"Column B multiplied by Column C","index":0,"key":"b_times_c","label":"B x C","type":"number","aggregate":"sum"}]}],"parameters":[{"index":0,"key":"reading_date","type":"string"},{"index":1,"key":"a","label":"a","description":"Column A","type":"string"},{"index":2,"key":"b","label":"b","description":"Column B","type":"number"},{"index":3,"key":"c","label":"c","description":"Column C","type":"number"}]}}
		When I POST to /pipelines
		Then response code should be 201
		And response body should contain id
		And I store the value of body path $.id as activity_pipeline_id in global scope

	Scenario: Upload Input File for Pipeline Processing
		Given I'm using the pipelineProcessor api
		And I authenticate using email pipeline_processor_datafabric_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /pipelineProcessorDataFabricTest
		And I set body to { "tags": { "source":"pipelineProcessorDataFabricTest", "source:df:data1": "dddd:1111:1" }, "expiration" : 300}
		When I POST to /pipelines/`activity_pipeline_id`/executions
		Then response code should be 201
		And I store the value of body path $.inputUploadUrl as updated_success_upload_url in global scope
		When I upload an input CSV file to url stored at global variable updated_success_upload_url with rows
			| reading_date | a | b  | c |
			# yearweek=202201
			| 1/8/22       | A | 10 | 1 |
			| 1/8/22       | B | 20 | 2 |
			| 1/8/22       | C | 30 | 3 |
			# yearweek=202210
			| 3/8/22       | D | 40 | 4 |
			| 3/8/22       | E | 50 | 5 |
			| 3/8/22       | F | 60 | 6 |
		Then I pause for 50000ms
		When I GET /pipelines/`activity_pipeline_id`/executions
		Then response code should be 200
		And the latest execution status should be in_progress
		And file with key datafabric/pipeline=`activity_pipeline_id`/groupId=%2Fpipelineprocessordatafabrictest/yearweek=202201/data.parquet should exists in s3
		And file with key datafabric/pipeline=`activity_pipeline_id`/groupId=%2Fpipelineprocessordatafabrictest/yearweek=202210/data.parquet should exists in s3

	# Impact Pipeline
	Scenario: Create Pipeline with type impacts should should success
		Given I'm using the pipelines api
		And I authenticate using email pipeline_processor_datafabric_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /pipelineProcessorDataFabricTest
		And I set body to {"tags":{"testSource":"pipelineProcessorDataFabricTest"},"connectorConfig":{"input":[{"name":"sif-csv-pipeline-input-connector"}],"output":[{"name":"sif-dataFabric-pipeline-output-connector","parameters":{"domainId":"1111","environmentId":"2222"}}]},"attributes":{"type":"integration"},"type":"impacts","name":"Simple Impact Pipeline Type","description":"Simple pipeline that creates impact","transformer":{"transforms":[{"index":0,"formula":":activityName","outputs":[{"description":"Activity Name","index":0,"key":"activity:name","label":"Column A","type":"string"}]},{"index":1,"formula":":impactName","outputs":[{"description":"Impact Name","index":0,"key":"impact:impactKey:name","label":"Column A","type":"string"}]},{"index":2,"formula":":componentKey","outputs":[{"description":"Component Key","index":0,"key":"impact:impactKey:component:co2e:key","label":"Column A","type":"string"}]},{"index":3,"formula":":componentValue","outputs":[{"description":"Component Value","index":0,"key":"impact:impactKey:component:co2e:value","label":"Column A","type":"number"}]},{"index":4,"formula":":componentType","outputs":[{"description":"Component Type","index":0,"key":"impact:impactKey:component:co2e:type","label":"Column A","type":"string"}]},{"index":5,"formula":":tagValue","outputs":[{"description":"Tag Value","index":0,"key":"activity:tag:testSource","label":"Column A","type":"string"}]}],"parameters":[{"index":0,"key":"activityName","label":"activityName","description":"Activity Name","type":"string"},{"index":1,"key":"impactName","label":"impactName","description":"Impact Name","type":"string"},{"index":2,"key":"componentKey","label":"componentKey","description":"Component Key","type":"string"},{"index":3,"key":"componentValue","label":"componentValue","description":"Component Value","type":"number"},{"index":4,"key":"componentType","label":"componentType","description":"Component Type","type":"string"},{"index":5,"key":"tagValue","label":"tagValue","description":"Tag Value","type":"string"}]}}
		When I POST to /pipelines
		Then response code should be 201
		And response body should contain id
		And I store the value of body path $.id as pipeline_processor_impact_pipeline_id in global scope

	Scenario: Upload Input File for the created pipeline
		Given I'm using the pipelineProcessor api
		And I authenticate using email pipeline_processor_datafabric_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /pipelineProcessorDataFabricTest
		And I set body to { "expiration" : 300}
		When I POST to /pipelines/`pipeline_processor_impact_pipeline_id`/executions
		Then response code should be 201
		And I store the value of body path $.inputUploadUrl as success_upload_url in global scope
		When I upload an input CSV file to url stored at global variable success_upload_url with rows
			| activityName | impactName | componentKey | componentValue | componentType | tagValue                      |
			| testActivity | testImpact | co2e         | 2              | carbon        | pipelineProcessorDataFabricTest |
		Then I pause for 20000ms
		When I GET /pipelines/`pipeline_processor_impact_pipeline_id`/executions
		Then response code should be 200
		And I store the id of the latest execution in variable success_upload_execution_id in global scope
		And the latest execution status should be in_progress
		And I download file from s3 with key datafabric/pipeline=`pipeline_processor_impact_pipeline_id`/result.csv it will match rows
			| impact:impactKey:component:co2e:type | impact:impactKey:component:co2e:value | activity:name   | activity_tag_testSource         | impact:impactKey:name   | impact:impactKey:component:co2e:key |
			| "carbon"      | 2              | "testActivity" | "pipelineProcessorsImpactsType" | "testImpact" | "co2e"       |

	# Reference Dataset Pipeline
	Scenario: Create Pipeline with type referenceDatasets should should success
		Given I'm using the pipelines api
		And I authenticate using email pipeline_processor_datafabric_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /pipelineProcessorDataFabricTest
		And I set body to {"tags":{"testSource":"pipelineProcessorDataFabricTest"},"connectorConfig":{"input":[{"name":"sif-csv-pipeline-input-connector"}], "output":[{"name":"sif-dataFabric-pipeline-output-connector", "parameters": {"domainId":"1111","environmentId":"2222"}}]},"attributes":{"type":"integration"},"type":"referenceDatasets","name":"Simple Reference Dataset Pipeline Type","description":"Simple pipeline that creates reference dataset","transformer":{"transforms":[{"index":0,"formula":"'integration test reference dataset'","outputs":[{"description":"Name of reference dataset.","index":0,"key":"name","label":"Name","type":"string"}]},{"index":1,"formula":"'integration test reference dataset description'","outputs":[{"index":0,"key":"description","label":"Description","description":"Description of reference dataset.","type":"string"}]},{"index":2,"formula":"'usepa'","outputs":[{"index":0,"key":"tag_source","label":"Source Tag","description":"Tag with key source included in the reference dataset.","type":"string"}]}],"parameters":[]}}
		When I POST to /pipelines
		Then response code should be 201
		And response body should contain id
		And I store the value of body path $.id as pipeline_processor_reference_dataset_pipeline_id in global scope

	Scenario: Upload Input File for the created pipeline
		Given I'm using the pipelineProcessor api
		And I authenticate using email pipeline_processor_datafabric_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /pipelineProcessorDataFabricTest
		And I set body to { "expiration" : 300}
		When I POST to /pipelines/`pipeline_processor_reference_dataset_pipeline_id`/executions
		Then response code should be 201
		And I store the value of body path $.inputUploadUrl as success_upload_url in global scope
		When I upload an input CSV file to url stored at global variable success_upload_url with rows
			| gas | gwp |
			| co2 | 1   |
			| ch4 | 25  |
			| n2o | 298 |
		Then I pause for 30000ms
		When I GET /pipelines/`pipeline_processor_reference_dataset_pipeline_id`/executions
		Then response code should be 200
		And response body path $.executions should be of type array with length 1
		And I store the id of the latest execution in variable success_upload_execution_id in global scope
		And the latest execution status should be in_progress
		And I download file from s3 with key datafabric/pipeline=`pipeline_processor_reference_dataset_pipeline_id`/result.csv it will match rows
			| name                                 | description                                      | tag_source |
			| "integration test reference dataset" | "integration test reference dataset description" | "usepa"    |


  	# Testing Data Pipeline
	Scenario: Create Pipeline with type data should should success
		Given I'm using the pipelines api
		And I authenticate using email pipeline_processor_datafabric_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /pipelineProcessorDataFabricTest
		And I set body to { "tags": {"testSource":"pipelineProcessorDataFabricTest"}, "type":"data","connectorConfig":{"input":[{"name":"sif-csv-pipeline-input-connector"}], "output":[{"name":"sif-dataFabric-pipeline-output-connector", "parameters": {"domainId":"1111","environmentId":"2222"}}]},"attributes":{"type":"integration"},"name":"Simple Pipeline that output result as file","description":"Pipeline processor data test pipeline","transformer":{"transforms":[{"index":0,"formula":":z","outputs":[{"description":"Column Z.","index":0,"key":"z","label":"Z","type":"string"}]},{"index":1,"formula":":a","outputs":[{"description":"Column A","index":0,"key":"a","label":"Column A","type":"string","includeAsUnique":true}]},{"index":2,"formula":":b*:c","outputs":[{"description":"Column B multiplied by Column C","index":0,"key":"b*c","label":"B x C","type":"number"}]}],"parameters":[{"index":0,"key":"z","label":"z","description":"Column Z","type":"string"},{"index":1,"key":"a","label":"a","description":"Column A","type":"string"},{"index":2,"key":"b","label":"b","description":"Column B","type":"number"},{"index":3,"key":"c","label":"c","description":"Column C","type":"number"}]}}
		When I POST to /pipelines
		Then response code should be 201
		And response body should contain id
		And I store the value of body path $.id as pipeline_processor_data_pipeline_id in global scope

	Scenario: Upload Input File for the created pipeline
		Given I'm using the pipelineProcessor api
		And I authenticate using email pipeline_processor_datafabric_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /pipelineProcessorDataFabricTest
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
		And response body path $.executions should be of type array with length 1
		And I store the id of the latest execution in variable success_upload_execution_id in global scope
		And the latest execution status should be in_progress
		And I download file from s3 with key datafabric/pipeline=`pipeline_processor_data_pipeline_id`/result.csv it will match rows
			| a   | z        | b*c |
			| "A" | "first"  | 10  |
			| "B" | "second" | 40  |
			| "C" | "third"  | 90  |
			| "D" | "fourth" | 160 |

	Scenario: Revoke access to connector from group /pipelineProcessorDataFabricTest
		When I'm using the pipelines api
		Given I authenticate using email pipeline_processor_datafabric_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		And I DELETE /connectors/`connector_id`/groups/%2fpipelineProcessorDataFabricTest
		Then response code should be 204
		And I DELETE /connectors/`datafabric_output_connector_id`/groups/%2fpipelineProcessorDataFabricTest
		Then response code should be 204

	Scenario: Teardown - Cleanup users
		When I'm using the accessManagement api
		And group /pipelineProcessorDataFabricTest has user pipeline_processor_datafabric_admin@amazon.com revoked
		And group / has user pipeline_processor_datafabric_admin@amazon.com revoked
		And group /pipelineProcessorDataFabricTest has been removed
