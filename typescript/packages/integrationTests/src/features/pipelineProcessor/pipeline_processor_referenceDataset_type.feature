@setup_endToEnd @pipelineProcessor
Feature:
  Pipeline Processor Reference Dataset Type Integration Test

  Scenario: Setup users
    Given I'm using the accessManagement api
    And group /pipelineProcessorReferenceDatasetsTest exists
    And group / has user pipeline_processor_referenceDatasets_admin@amazon.com with role admin and password p@ssword1
    And group /pipelineProcessorReferenceDatasetsTest has user pipeline_processor_referenceDatasets_admin@amazon.com granted access with role admin

  Scenario: Grant group /e2e access to sif-csv-pipeline-input-connector processor
    Given I'm using the pipelines api
    And I authenticate using email pipeline_processor_referenceDatasets_admin@amazon.com and password p@ssword1
    When I GET /connectors?name=sif-csv-pipeline-input-connector
    Then response code should be 200
    And I store the value of body path $.connectors[0].id as connector_id in global scope
    When I remove header Content-Type
    When I PUT /connectors/`connector_id`/groups/%2fpipelineProcessorReferenceDatasetsTest
    Then response code should be 204

  Scenario: Teardown: Reference Dataset with tag testSource:pipelineProcessorsReferenceDatasetsType
  Cleans up any activities remaining from a previous test run associated with this test.
    Given I'm using the referenceDatasets api
    And I authenticate using email pipeline_processor_referenceDatasets_admin@amazon.com and password p@ssword1
    And I set x-groupcontextid header to /pipelineProcessorReferenceDatasetsTest
    And no referenceDatasets exists with tags testSource:pipelineProcessorsReferenceDatasetsType

  Scenario: Teardown: Pipelines with tag testSource:pipelineProcessorsReferenceDatasetsType
  Cleans up any pipelines remaining from a previous test run associated with this test.
    Given I'm using the pipelines api
    And I authenticate using email pipeline_processor_referenceDatasets_admin@amazon.com and password p@ssword1
    And I set x-groupcontextid header to /pipelineProcessorReferenceDatasetsTest
    And no pipeline exists with tags testSource:pipelineProcessorsReferenceDatasetsType

  Scenario: Create Pipeline with type referenceDatasets should should success
    Given I'm using the pipelines api
    And I authenticate using email pipeline_processor_referenceDatasets_admin@amazon.com and password p@ssword1
    And I set x-groupcontextid header to /pipelineProcessorReferenceDatasetsTest
    And I set body to {"tags":{"testSource":"pipelineProcessorsReferenceDatasetsType"},"connectorConfig":{"input":[{"name":"sif-csv-pipeline-input-connector"}]},"attributes":{"type":"integration"},"type":"referenceDatasets","name":"Simple Reference Dataset Pipeline Type","description":"Simple pipeline that creates reference dataset","transformer":{"transforms":[{"index":0,"formula":"'integration test reference dataset'","outputs":[{"description":"Name of reference dataset.","index":0,"key":"name","label":"Name","type":"string"}]},{"index":1,"formula":"'integration test reference dataset description'","outputs":[{"index":0,"key":"description","label":"Description","description":"Description of reference dataset.","type":"string"}]},{"index":2,"formula":"'usepa'","outputs":[{"index":0,"key":"tag_source","label":"Source Tag","description":"Tag with key source included in the reference dataset.","type":"string"}]}],"parameters":[]}}
    When I POST to /pipelines
    Then response code should be 201
    And response body should contain id
    And I store the value of body path $.id as pipeline_processor_reference_dataset_pipeline_id in global scope

  Scenario: Execute inline pipeline execution is not supported
    Given I'm using the pipelineProcessor api
    And I authenticate using email pipeline_processor_referenceDatasets_admin@amazon.com and password p@ssword1
    And I set x-groupcontextid header to /pipelineProcessorReferenceDatasetsTest
    And I set body to {"actionType":"create","mode":"inline","inlineExecutionOptions":{"inputs":[{"gas":"co2", "gwp":1},{"gas":"ch4", "gwp":25},{"gas":"n2o", "gwp":298}]}}
    When I POST to /pipelines/`pipeline_processor_reference_dataset_pipeline_id`/executions
    Then response code should be 400
    And response body should contain Inline execution does not support referenceDatasets pipeline type

  Scenario: Upload Input File for the created pipeline
    Given I'm using the pipelineProcessor api
    And I authenticate using email pipeline_processor_referenceDatasets_admin@amazon.com and password p@ssword1
    And I set x-groupcontextid header to /pipelineProcessorReferenceDatasetsTest
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
    And the latest execution status should be success

  Scenario: Retrieve and Validate Output
    Given I'm using the pipelineProcessor api
    And I authenticate using email pipeline_processor_referenceDatasets_admin@amazon.com and password p@ssword1 in group //pipelineProcessorReferenceDatasetsTest
    And I set x-groupcontextid header to /pipelineProcessorReferenceDatasetsTest
    And I set body to { "expiration" : 300}
    When I POST to /pipelines/`pipeline_processor_reference_dataset_pipeline_id`/executions/`success_upload_execution_id`/outputDownloadUrl
    Then response code should be 201
    And I store the value of body path $.url as success_download_url in global scope
    When I download the output CSV file from the url stored at global variable success_download_url it will match rows
      | name                                 | description                                      | tag_source |
      | "integration test reference dataset" | "integration test reference dataset description" | "usepa"    |

  Scenario: Retrieve created referenceDataset using pipeline id as tag value
    Given I'm using the referenceDatasets api
    And I authenticate using email pipeline_processor_referenceDatasets_admin@amazon.com and password p@ssword1
    And I set x-groupcontextid header to /pipelineProcessorReferenceDatasetsTest
    And I set query parameters to
      | parameter  | value                                              |
      | pipelineId | `pipeline_processor_reference_dataset_pipeline_id` |
    When I GET /referenceDatasets
    Then response code should be 200
    And response body path $.referenceDatasets[0].name should be integration test reference dataset
    And response body path $.referenceDatasets[0].status should be success
    And response body path $.referenceDatasets[0].tags.source should be usepa
    And response body path $.referenceDatasets[0].tags.pipelineId should be `pipeline_processor_reference_dataset_pipeline_id`

  Scenario: Revoke access to connector from group /pipelineProcessorReferenceDatasetsTest
    When I'm using the pipelines api
    Given I authenticate using email pipeline_processor_referenceDatasets_admin@amazon.com and password p@ssword1
    When I remove header Content-Type
    And I DELETE /connectors/`connector_id`/groups/%2fpipelineProcessorReferenceDatasetsTest
    Then response code should be 204

  Scenario: Teardown - Cleanup users
    When I'm using the accessManagement api
    And group /pipelineProcessorReferenceDatasetsTest has user pipeline_processor_referenceDatasets_admin@amazon.com revoked
    And group / has user pipeline_processor_referenceDatasets_admin@amazon.com revoked
    And group /pipelineProcessorReferenceDatasetsTest has been removed
