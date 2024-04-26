@setup_endToEnd @pipelineProcessor
Feature:
	Pipeline Processor Integration Test

	Scenario: Setup users
		Given I'm using the accessManagement api
		And group /pipelineProcessorTest exists
		And group / has user pipeline_processor_admin@amazon.com with role admin and password p@ssword1
		And group /pipelineProcessorTest has user pipeline_processor_admin@amazon.com granted access with role admin

	Scenario: Grant group /e2e access to sif-csv-pipeline-input-connector processor
		Given I'm using the pipelines api
		And I authenticate using email pipeline_processor_admin@amazon.com and password p@ssword1
		When I GET /connectors?name=sif-csv-pipeline-input-connector
		Then response code should be 200
		And I store the value of body path $.connectors[0].id as connector_id in global scope
		When I remove header Content-Type
		When I PUT /connectors/`connector_id`/groups/%2fpipelineProcessorTest
		Then response code should be 204

	Scenario: Create Pipeline
		Given I'm using the pipelines api
		And I authenticate using email pipeline_processor_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /pipelineProcessorTest
		And I set body to {"connectorConfig":{"input": [{"name": "sif-csv-pipeline-input-connector"}]},"attributes":{"type":"integration"},"name":"Simple Pipeline","description":"Pipeline processor test pipeline","transformer":{"transforms":[{"index":0,"formula":"AS_TIMESTAMP(:reading_date,'M/d/yy')","outputs":[{"description":"Timestamp of business activity.","index":0,"key":"time","label":"Time","type":"timestamp"}]},{"index":1,"formula":"AS_TIMESTAMP(:reading_date,'M/d/yy', roundDownTo='month')","outputs":[{"description":"Transform date to beginning of month.","index":0,"key":"month","label":"Month","type":"timestamp","aggregate":"groupBy"}]},{"index":2,"formula":":a","outputs":[{"description":"Column A","index":0,"key":"a","label":"Column A","type":"string","includeAsUnique":true}]},{"index":3,"formula":":b*:c","outputs":[{"description":"Column B multiplied by Column C","index":0,"key":"b_times_c","label":"B x C","type":"number","aggregate":"sum"}]}],"parameters":[{"index":0,"key":"reading_date","type":"string"},{"index":1,"key":"a","label":"A","description":"Column A","type":"string"},{"index":2,"key":"b","label":"Column B","description":"Column B","type":"number"},{"index":3,"key":"c","label":"Column C","description":"Column C","type":"number"}]}}
		When I POST to /pipelines
		Then response code should be 201
		And response body should contain id
		And I store the value of body path $.id as pipeline_processor_pipeline_id in global scope

	Scenario: Request Upload URL from Nonexistent Pipeline
		Given I'm using the pipelineProcessor api
		And I authenticate using email pipeline_processor_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /pipelineProcessorTest
		And I set body to { "expiration" : 300}
		When I POST to /pipelines/notactuallyapipeline/executions
		Then response code should be 404

	Scenario: Request Output Download URL from Nonexistent Pipeline
		Given I'm using the pipelineProcessor api
		And I authenticate using email pipeline_processor_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /pipelineProcessorTest
		And I set body to { "expiration" : 300}
		When I POST to /pipelines/notactuallyapipeline/executions/notactuallyanexecution/outputDownloadUrl
		Then response code should be 404

	Scenario: Request Error Download URL from Nonexistent Pipeline
		Given I'm using the pipelineProcessor api
		And I authenticate using email pipeline_processor_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /pipelineProcessorTest
		And I set body to { "expiration" : 300}
		When I POST to /pipelines/notactuallyapipeline/executions/notactuallyanexecution/errorDownloadUrl
		Then response code should be 404

	Scenario: Execute Inline Pipeline Execution
		Given I'm using the pipelineProcessor api
		And I authenticate using email pipeline_processor_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /pipelineProcessorTest
		And I set body to { "tags": { "source":"pipelineProcessorsTest", "sequence":"1" }, "actionType":"create","mode":"inline","inlineExecutionOptions":{"inputs":[{"reading_date":"1/4/22","A":"A","Column B":10,"Column C":1},{"reading_date":"1/4/22","A":"A","Column B":10,"Column C":1},{"reading_date":"1/4/22","A":"C","Column B":30,"Column C":3},{"reading_date":"1/4/22","A":"D","Column B":40,"Column C":4},{"reading_date":"1/4/22","A":"E","Column B":50,"Column C":5},{"reading_date":"1/4/22","A":"F","Column B":60,"Column C":6}]}}
		When I POST to /pipelines/`pipeline_processor_pipeline_id`/executions
		Then response code should be 201
		And response body should contain id
		And I store the value of body path $.id as success_execution_id in global scope
		And response body path $.status should be calculating_metrics
		And response body should not contain $.inlineExecutionOutputs.errors
		# Activities are returned as part of inline execution response
		And response body path $.inlineExecutionOutputs.outputs[0][time] should be 2022-01-04T00:00:00.000Z
		And response body path $.inlineExecutionOutputs.outputs[0][month] should be 2022-01-01T00:00:00.000Z
		And response body path $.inlineExecutionOutputs.outputs[0]['a'] should be A
		And response body path $.inlineExecutionOutputs.outputs[0][b_times_c'] should be 10
		And response body path $.inlineExecutionOutputs.outputs[1][time] should be 2022-01-04T00:00:00.000Z
		And response body path $.inlineExecutionOutputs.outputs[1][month] should be 2022-01-01T00:00:00.000Z
		And response body path $.inlineExecutionOutputs.outputs[1]['a'] should be A
		And response body path $.inlineExecutionOutputs.outputs[1][b_times_c'] should be 10
		And response body path $.inlineExecutionOutputs.outputs[2][time] should be 2022-01-04T00:00:00.000Z
		And response body path $.inlineExecutionOutputs.outputs[2][month] should be 2022-01-01T00:00:00.000Z
		And response body path $.inlineExecutionOutputs.outputs[2]['a'] should be C
		And response body path $.inlineExecutionOutputs.outputs[2][b_times_c'] should be 90
		And response body path $.inlineExecutionOutputs.outputs[3][time] should be 2022-01-04T00:00:00.000Z
		And response body path $.inlineExecutionOutputs.outputs[3][month] should be 2022-01-01T00:00:00.000Z
		And response body path $.inlineExecutionOutputs.outputs[3]['a'] should be D
		And response body path $.inlineExecutionOutputs.outputs[3][b_times_c'] should be 160
		And response body path $.inlineExecutionOutputs.outputs[4][time] should be 2022-01-04T00:00:00.000Z
		And response body path $.inlineExecutionOutputs.outputs[4][month] should be 2022-01-01T00:00:00.000Z
		And response body path $.inlineExecutionOutputs.outputs[4]['a'] should be E
		And response body path $.inlineExecutionOutputs.outputs[4][b_times_c'] should be 250
		And response body path $.inlineExecutionOutputs.outputs[5][time] should be 2022-01-04T00:00:00.000Z
		And response body path $.inlineExecutionOutputs.outputs[5][month] should be 2022-01-01T00:00:00.000Z
		And response body path $.inlineExecutionOutputs.outputs[5]['a'] should be F
		And response body path $.inlineExecutionOutputs.outputs[5][b_times_c'] should be 360
	   	# Sleep for 2 seconds
		Then I pause for 20000ms

	Scenario: Execute Inline Pipeline Execution With Invalid Data
		Given I'm using the pipelineProcessor api
		And I authenticate using email pipeline_processor_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /pipelineProcessorTest
		And I set body to {"tags": { "source":"pipelineProcessorsTest", "sequence":"2" }, "actionType":"create","mode":"inline","inlineExecutionOptions":{"inputs":[{"reading_date":"1/4/22","A":"A","Column B":"WRONG_TYPE","Column C":1},{"reading_date":"1/4/22","A":"A","Column B":10,"Column C":"WRONG_TYPE"}]}}
		When I POST to /pipelines/`pipeline_processor_pipeline_id`/executions
		Then response code should be 201
		And response body should contain id
		And I store the value of body path $.id as inline_failed_execution_id in global scope
		And response body path $.status should be failed
		# The error output is returned as part of the http response payload
		And response body should not contain $.inlineExecutionOutputs.outputs
		And response body path $.inlineExecutionOutputs.errors.length should be 2
		And response body path $.inlineExecutionOutputs.errors[0] should be Failed processing row {reading_date=1/4/22, a=A, b=WRONG_TYPE, c=1}, err: Character W is neither a decimal digit number, decimal point, nor \"e\" notation exponential mark.
		And response body path $.inlineExecutionOutputs.errors[1] should be Failed processing row {reading_date=1/4/22, a=A, b=10, c=WRONG_TYPE}, err: Character W is neither a decimal digit number, decimal point, nor \"e\" notation exponential mark.

	Scenario: Retrieve Errors Output From Inline Pipeline Execution
		Given I'm using the pipelineProcessor api
		And I authenticate using email pipeline_processor_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /pipelineProcessorTest
		When I set body to { "expiration" : 300}
		And I POST to /pipelines/`pipeline_processor_pipeline_id`/executions/`inline_failed_execution_id`/errorDownloadUrl
		Then response code should be 201
		And I store the value of body path $.url as inline_error_download_url in global scope
		# User can also query the error output from the previous failed inline pipeline execution using signed url
		When I download the output text file from the url stored at global variable inline_error_download_url it will match rows
			| Failed processing row {reading_date=1/4/22, a=A, b=WRONG_TYPE, c=1}, err: Character W is neither a decimal digit number, decimal point, nor "e" notation exponential mark.  |
			| Failed processing row {reading_date=1/4/22, a=A, b=10, c=WRONG_TYPE}, err: Character W is neither a decimal digit number, decimal point, nor "e" notation exponential mark. |

	Scenario: Retrieve and Validate Successful Output
		Given I'm using the pipelineProcessor api
		And I authenticate using email pipeline_processor_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /pipelineProcessorTest
		When I GET /activities?date=1/4/22&executionId=`success_execution_id`&pipelineId=`pipeline_processor_pipeline_id`&showHistory=true&uniqueKeyAttributes=a:A
		And I store the value of body path $.activities[?(@.a=='A')]['activityId'] as activity_id_1 in global scope
		And I store the value of body path $.activities[?(@.a=='A')]['createdAt'] as activity_id_1_created_at_1 in global scope
		And response body path $.activities[?(@.a=='A')]['b_times_c'] should be 10
		And response body path $.activities should be of type array with length 2
		# Sleep for 10 seconds to ensure aggregation task finishes
		Then I pause for 50000ms
		When I GET /activities?date=1/1/22&executionId=`success_execution_id`&pipelineId=`pipeline_processor_pipeline_id`&showAggregate=true
		And response body path $.activities[?(@.date=='2022-01-01T00:00:00.000Z')]['b_times_c'] should be 870
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
		And I authenticate using email pipeline_processor_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /pipelineProcessorTest
		And I set body to {}
		When I POST to /activities/download?dateFrom=1/1/22&executionId=`success_execution_id`&pipelineId=`pipeline_processor_pipeline_id`&uniqueKeyAttributes=a:A
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


	Scenario: Upload Input File with all delete actionType for Pipeline Processing
		Given I'm using the pipelineProcessor api
		And I authenticate using email pipeline_processor_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /pipelineProcessorTest
		And I set body to {"tags": { "source":"pipelineProcessorsTest", "sequence":"3" },  "expiration" : 300 ,"actionType":"delete"}
		When I POST to /pipelines/`pipeline_processor_pipeline_id`/executions
		Then response code should be 201
		And I store the value of body path $.inputUploadUrl as delete_upload_url in global scope
		When I upload an input CSV file to url stored at global variable delete_upload_url with rows
			| reading_date | A | Column B | Column C |
			| 1/4/22       | A |          |          |
		Then I pause for 50000ms
		When I GET /pipelines/`pipeline_processor_pipeline_id`/executions
		Then response code should be 200
		And response body path $.executions should be of type array with length 3
		And I store the id of the latest execution in variable delete_execution_id in global scope
		And the latest execution status should be success

	Scenario: Retrieve and Validate Deleted Output
		Given I'm using the pipelineProcessor api
		And I authenticate using email pipeline_processor_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /pipelineProcessorTest
		When I GET /activities?date=1/4/22&executionId=`delete_execution_id`&pipelineId=`pipeline_processor_pipeline_id`&showHistory=true&uniqueKeyAttributes=a:A
		And response body path $.activities should be of type array with length 1
		When I GET /activities?date=1/4/22&pipelineId=`pipeline_processor_pipeline_id`&showHistory=true&uniqueKeyAttributes=a:A
		And response body path $.activities should be of type array with length 3
		And response body path $.activities[?(@.a==null)]['b_times_c'] should be null
		And response body path $.activities[?(@.a==null)]['activityId'] should be `activity_id_1`
		And I store the value of body path $.activities[?(@.a==null)]['createdAt'] as activity_id_1_created_at_2 in global scope
		When I GET /activities?date=1/1/22&executionId=`delete_execution_id`&pipelineId=`pipeline_processor_pipeline_id`&showAggregate=true
		And response body path $.activities[?(@.date=='2022-01-01T00:00:00.000Z')]['b_times_c'] should be 860
		And response body path $.activities should be of type array with length 1

	Scenario: Upload Input File with All Errors for Pipeline Processing
		Given I'm using the pipelineProcessor api
		And I authenticate using email pipeline_processor_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /pipelineProcessorTest
		And I set body to { "tags": { "source":"pipelineProcessorsTest", "sequence":"4" }, "expiration" : 300}
		When I POST to /pipelines/`pipeline_processor_pipeline_id`/executions
		Then response code should be 201
		And I store the value of body path $.inputUploadUrl as all_errors_upload_url in global scope
		When I upload an input CSV file to url stored at global variable all_errors_upload_url with rows
			| reading_date | A | Column B | Column C |
			| 1/4/22       | A | 10       | One      |
			| 1/4/22       | B | 20       | Two      |
			| 1/4/22       | C | 30       | Three    |
			| 1/4/22       | D | 40       | Four     |
			| 1/4/22       | E | 50       | Five     |
			| 1/4/22       | F | 60       | Six      |
			| 1/4/22       |   |          |          |
		Then I pause for 50000ms
		When I GET /pipelines/`pipeline_processor_pipeline_id`/executions
		Then response code should be 200
		And response body path $.executions should be of type array with length 4
		And the latest execution status should be failed
		And I store the id of the latest execution in variable all_errors_execution_id in global scope

	Scenario: Retrieve and Validate All Errors Output
		Given I'm using the pipelineProcessor api
		And I authenticate using email pipeline_processor_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /pipelineProcessorTest
		When I GET /activities?date=1/4/22&executionId=`all_errors_execution_id`&pipelineId=`pipeline_processor_pipeline_id`
		And response body path $.activities.length should be 0
		When I set body to { "expiration" : 300}
		And I POST to /pipelines/`pipeline_processor_pipeline_id`/executions/`all_errors_execution_id`/errorDownloadUrl
		Then response code should be 201
		And I store the value of body path $.url as all_errors_error_download_url in global scope
		When I download the output text file from the url stored at global variable all_errors_error_download_url it will match rows
			| Failed processing row {reading_date=1/4/22, a=A, b=10, c=One}, err: Character O is neither a decimal digit number, decimal point, nor "e" notation exponential mark.   |
			| Failed processing row {reading_date=1/4/22, a=B, b=20, c=Two}, err: Character T is neither a decimal digit number, decimal point, nor "e" notation exponential mark.   |
			| Failed processing row {reading_date=1/4/22, a=C, b=30, c=Three}, err: Character T is neither a decimal digit number, decimal point, nor "e" notation exponential mark. |
			| Failed processing row {reading_date=1/4/22, a=D, b=40, c=Four}, err: Character F is neither a decimal digit number, decimal point, nor "e" notation exponential mark.  |
			| Failed processing row {reading_date=1/4/22, a=E, b=50, c=Five}, err: Character F is neither a decimal digit number, decimal point, nor "e" notation exponential mark.  |
			| Failed processing row {reading_date=1/4/22, a=F, b=60, c=Six}, err: Character S is neither a decimal digit number, decimal point, nor "e" notation exponential mark.   |


	Scenario: Upload Input File with Some Success and Some Errors for Pipeline Processing
		Given I'm using the pipelineProcessor api
		And I authenticate using email pipeline_processor_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /pipelineProcessorTest
		And I set body to { "tags": { "source":"pipelineProcessorsTest", "sequence":"5" }, "expiration" : 300}
		When I POST to /pipelines/`pipeline_processor_pipeline_id`/executions
		Then response code should be 201
		And I store the value of body path $.inputUploadUrl as some_success_some_errors_upload_url in global scope
		When I upload an input CSV file to url stored at global variable some_success_some_errors_upload_url with rows
			| reading_date | A | Column B | Column C |
			| 1/4/22       | A | 10       | 1        |
			| 1/4/22       | B | 20       | Two      |
			| 1/4/22       | C | 30       | Three    |
			| 1/4/22       | D | 40       | 4        |
			| 1/4/22       | E | 50       | 5        |
			| 1/4/22       | F | 60       | Six      |
		Then I pause for 50000ms
		When I GET /pipelines/`pipeline_processor_pipeline_id`/executions
		Then response code should be 200
		And response body path $.executions should be of type array with length 5
		And the latest execution status should be failed
		And I store the id of the latest execution in variable some_success_some_errors_execution_id in global scope

	Scenario: Retrieve and Validate Some Success and Some Errors Output
		Given I'm using the pipelineProcessor api
		And I authenticate using email pipeline_processor_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /pipelineProcessorTest
		When I GET /activities?date=1/4/22&executionId=`some_success_some_errors_execution_id`&pipelineId=`pipeline_processor_pipeline_id`
		And response body path $.activities[?(@.a=='A')]['b_times_c'] should be 10
		And response body path $.activities[?(@.a=='A')]['activityId'] should be `activity_id_1`
		And I store the value of body path $.activities[?(@.a=='A')]['createdAt'] as activity_id_1_created_at_3 in global scope
		And response body path $.activities[?(@.a=='D')]['b_times_c'] should be 160
		And response body path $.activities[?(@.a=='E')]['b_times_c'] should be 250
		When I set body to { "expiration" : 300}
		And I POST to /pipelines/`pipeline_processor_pipeline_id`/executions/`some_success_some_errors_execution_id`/errorDownloadUrl
		Then response code should be 201
		And I store the value of body path $.url as some_success_some_errors_error_download_url in global scope
		When I download the output text file from the url stored at global variable some_success_some_errors_error_download_url it will match rows
			| Failed processing row {reading_date=1/4/22, a=B, b=20, c=Two}, err: Character T is neither a decimal digit number, decimal point, nor "e" notation exponential mark.   |
			| Failed processing row {reading_date=1/4/22, a=C, b=30, c=Three}, err: Character T is neither a decimal digit number, decimal point, nor "e" notation exponential mark. |
			| Failed processing row {reading_date=1/4/22, a=F, b=60, c=Six}, err: Character S is neither a decimal digit number, decimal point, nor "e" notation exponential mark.   |


	Scenario: Retrieve raw and aggregated history of activities
		Given I'm using the pipelineProcessor api
		And I authenticate using email pipeline_processor_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /pipelineProcessorTest
		When I GET /activities?date=1/1/22&pipelineId=`pipeline_processor_pipeline_id`&showAggregate=true&showHistory=true&uniqueKeyAttributes=month:A
		And response body path $.activities should be of type array with length 3
		# Aggregated history for the first pipeline execution
		And response body path $.activities[?(@.executionId=='`success_execution_id`')]['b_times_c'] should be 870
		And response body path $.activities[?(@.executionId=='`success_execution_id`')]['b_plus_c'] should be null
		# Aggregated history for the pipeline execution where we deleted couple rows
		And response body path $.activities[?(@.executionId=='`delete_execution_id`')]['b_times_c'] should be 860
		And response body path $.activities[?(@.executionId=='`delete_execution_id`')]['b_plus_c'] should be null

	Scenario: Patching Pipeline to modify one of its field
		Given I'm using the pipelines api
		And I authenticate using email pipeline_processor_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /pipelineProcessorTest
		And I set body to {"connectorConfig":{"input": [{"name": "sif-csv-pipeline-input-connector"}]},"attributes":{"type":"integration"},"name":"Simple Pipeline","description":"Pipeline processor test pipeline","transformer":{"transforms":[{"index":0,"formula":"AS_TIMESTAMP(:reading_date,'M/d/yy')","outputs":[{"description":"Timestamp of business activity.","index":0,"key":"time","label":"Time","type":"timestamp"}]},{"index":1,"formula":"AS_TIMESTAMP(:reading_date,'M/d/yy', roundDownTo='month')","outputs":[{"description":"Transform date to beginning of month.","index":0,"key":"month","label":"Month","type":"timestamp","aggregate":"groupBy"}]},{"index":2,"formula":":a","outputs":[{"description":"Column A","index":0,"key":"a","label":"Column A","type":"string","includeAsUnique":true}]},{"index":3,"formula":":b+:c","outputs":[{"description":"Column B added to Column C","index":0,"key":"b_plus_c","label":"B + C","type":"number", "aggregate": "sum"}]}],"parameters":[{"index":0,"key":"reading_date","type":"string"},{"index":1,"key":"a","label":"A","description":"Column A","type":"string"},{"index":2,"key":"b","label":"Column B","description":"Column B","type":"number"},{"index":3,"key":"c","label":"Column C","description":"Column C","type":"number"}]}}
		When I PATCH /pipelines/`pipeline_processor_pipeline_id`
		Then response code should be 200

	Scenario: Upload Input File for Pipeline Processing
		Given I'm using the pipelineProcessor api
		And I authenticate using email pipeline_processor_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /pipelineProcessorTest
		And I set body to { "tags": { "source":"pipelineProcessorsTest", "sequence":"6" }, "expiration" : 300}
		When I POST to /pipelines/`pipeline_processor_pipeline_id`/executions
		Then response code should be 201
		And I store the value of body path $.inputUploadUrl as updated_success_upload_url in global scope
		When I upload an input CSV file to url stored at global variable updated_success_upload_url with rows
			| reading_date | A | Column B | Column C |
			| 1/8/22       | A | 10       | 1        |
			| 1/8/22       | B | 20       | 2        |
			| 1/8/22       | C | 30       | 3        |
			| 1/8/22       | D | 40       | 4        |
			| 1/8/22       | E | 50       | 5        |
			| 1/8/22       | F | 60       | 6        |
		Then I pause for 50000ms
		When I GET /pipelines/`pipeline_processor_pipeline_id`/executions
		Then response code should be 200
		And response body path $.executions should be of type array with length 6
		And the latest execution status should be success
		And I store the id of the latest execution in variable updated_success_execution_id in global scope

	Scenario: Retrieve pipeline executions filtered by tag(s)
		Given I'm using the pipelineProcessor api
		And I authenticate using email pipeline_processor_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /pipelineProcessorTest
		When I GET /pipelines/`pipeline_processor_pipeline_id`/executions?tags=source:pipelineProcessorsTest
		And response body path $.executions.length should be 6
		And I set query parameters to
			| parameter | value                         |
			| tags      | source:pipelineProcessorsTest |
			| tags      | sequence:1                    |
		Then I pause for 1000ms
		When I GET /pipelines/`pipeline_processor_pipeline_id`/executions
		And response body path $.executions.length should be 1
		And response body path $.executions[0].id should be `success_execution_id`
		And I set query parameters to
			| parameter | value                         |
			| tags      | source:pipelineProcessorsTest |
			| tags      | sequence:2                    |
		When I GET /pipelines/`pipeline_processor_pipeline_id`/executions
		And response body path $.executions.length should be 1
		And response body path $.executions[0].id should be `inline_failed_execution_id`
		And I set query parameters to
			| parameter | value                         |
			| tags      | source:pipelineProcessorsTest |
			| tags      | sequence:3                    |
		When I GET /pipelines/`pipeline_processor_pipeline_id`/executions
		And response body path $.executions.length should be 1
		And response body path $.executions[0].id should be `delete_execution_id`
		And I set query parameters to
			| parameter | value                         |
			| tags      | source:pipelineProcessorsTest |
			| tags      | sequence:4                    |
		When I GET /pipelines/`pipeline_processor_pipeline_id`/executions
		And response body path $.executions.length should be 1
		And response body path $.executions[0].id should be `all_errors_execution_id`
		And I set query parameters to
			| parameter | value                         |
			| tags      | source:pipelineProcessorsTest |
			| tags      | sequence:5                    |
		When I GET /pipelines/`pipeline_processor_pipeline_id`/executions
		And response body path $.executions.length should be 1
		And response body path $.executions[0].id should be `some_success_some_errors_execution_id`
		And I set query parameters to
			| parameter | value                         |
			| tags      | source:pipelineProcessorsTest |
			| tags      | sequence:6                    |
		When I GET /pipelines/`pipeline_processor_pipeline_id`/executions
		And response body path $.executions.length should be 1
		And response body path $.executions[0].id should be `updated_success_execution_id`

	Scenario:Retrieve raw and aggregated history of activities of modified pipeline configuration
		Given I'm using the pipelineProcessor api
		And I authenticate using email pipeline_processor_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /pipelineProcessorTest
		When I GET /activities?date=1/8/22&executionId=`updated_success_execution_id`&pipelineId=`pipeline_processor_pipeline_id`&showHistory=true&uniqueKeyAttributes=a:A
		And response body path $.activities[?(@.a=='A')]['b_plus_c'] should be 11
		And response body path $.activities should be of type array with length 1
		When I GET /activities?date=1/1/22&executionId=`updated_success_execution_id`&pipelineId=`pipeline_processor_pipeline_id`&showAggregate=true
		And response body path $.activities[?(@.date=='2022-01-01T00:00:00.000Z')]['b_plus_c'] should be 231
		# The previous value should no longer be returned
		When I GET /activities?date=1/1/22&pipelineId=`pipeline_processor_pipeline_id`&showAggregate=true
		And response body path $.activities[?(@.date=='2022-01-01T00:00:00.000Z')]['b_plus_c'] should be 231
		And response body path $.activities should be of type array with length 1
		# Show history should only return all history since hte pipeline is modified for pipeline aggregation
		When I GET /activities?date=1/1/22&pipelineId=`pipeline_processor_pipeline_id`&showAggregate=true&showHistory=true&uniqueKeyAttributes=month:A
		And response body path $.activities should be of type array with length 1
		# Aggregated history for the pipeline execution where we modify the pipeline formula from multiplication to addition
		And response body path $.activities[?(@.executionId=='`updated_success_execution_id`')]['b_plus_c'] should be 231
		And response body path $.activities[?(@.executionId=='`updated_success_execution_id`')]['b_times_c'] should be null

	Scenario: Retrieve and Validate Output From Multiple Pipeline Configuration
		Given I'm using the pipelineProcessor api
		And I authenticate using email pipeline_processor_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /pipelineProcessorTest
		When I GET /activities?dateFrom=1/4/22&pipelineId=`pipeline_processor_pipeline_id`
		And response body path $.activities should be of type array with length 11
		# Result for pipeline version 1
		And response body path $.activities[?(@.a=='A' && @.date=='2022-01-04T00:00:00.000Z')]['b_times_c'] should be 10
		And response body path $.activities[?(@.a=='C' && @.date=='2022-01-04T00:00:00.000Z')]['b_times_c'] should be 90
		And response body path $.activities[?(@.a=='D' && @.date=='2022-01-04T00:00:00.000Z')]['b_times_c'] should be 160
		And response body path $.activities[?(@.a=='E' && @.date=='2022-01-04T00:00:00.000Z')]['b_times_c'] should be 250
		And response body path $.activities[?(@.a=='F' && @.date=='2022-01-04T00:00:00.000Z')]['b_times_c'] should be 360
		# Should not contain output of the latest version
		And response body path $.activities[?(@.a=='A' && @.date=='2022-01-04T00:00:00.000Z')]['b_plus_c'] should be null
		And response body path $.activities[?(@.a=='B' && @.date=='2022-01-04T00:00:00.000Z')]['b_plus_c'] should be null
		And response body path $.activities[?(@.a=='C' && @.date=='2022-01-04T00:00:00.000Z')]['b_plus_c'] should be null
		And response body path $.activities[?(@.a=='D' && @.date=='2022-01-04T00:00:00.000Z')]['b_plus_c'] should be null
		And response body path $.activities[?(@.a=='E' && @.date=='2022-01-04T00:00:00.000Z')]['b_plus_c'] should be null
		And response body path $.activities[?(@.a=='F' && @.date=='2022-01-04T00:00:00.000Z')]['b_plus_c'] should be null
		# Result for pipeline version 2
		And response body path $.activities[?(@.a=='A' && @.date=='2022-01-08T00:00:00.000Z')]['b_plus_c'] should be 11
		And response body path $.activities[?(@.a=='B' && @.date=='2022-01-08T00:00:00.000Z')]['b_plus_c'] should be 22
		And response body path $.activities[?(@.a=='C' && @.date=='2022-01-08T00:00:00.000Z')]['b_plus_c'] should be 33
		And response body path $.activities[?(@.a=='D' && @.date=='2022-01-08T00:00:00.000Z')]['b_plus_c'] should be 44
		And response body path $.activities[?(@.a=='E' && @.date=='2022-01-08T00:00:00.000Z')]['b_plus_c'] should be 55
		And response body path $.activities[?(@.a=='F' && @.date=='2022-01-08T00:00:00.000Z')]['b_plus_c'] should be 66
		# Should not contain output of the previous version
		And response body path $.activities[?(@.a=='A' && @.date=='2022-01-08T00:00:00.000Z')]['b_times_c'] should be null
		And response body path $.activities[?(@.a=='B' && @.date=='2022-01-08T00:00:00.000Z')]['b_times_c'] should be null
		And response body path $.activities[?(@.a=='C' && @.date=='2022-01-08T00:00:00.000Z')]['b_times_c'] should be null
		And response body path $.activities[?(@.a=='D' && @.date=='2022-01-08T00:00:00.000Z')]['b_times_c'] should be null
		And response body path $.activities[?(@.a=='E' && @.date=='2022-01-08T00:00:00.000Z')]['b_times_c'] should be null
		And response body path $.activities[?(@.a=='F' && @.date=='2022-01-08T00:00:00.000Z')]['b_times_c'] should be null

	Scenario: Retrieve Audit 1 for Activity 1
		Given I'm using the pipelineProcessor api
		Then I pause for 60000ms
		And I authenticate using email pipeline_processor_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /pipelineProcessorTest
		When I GET /activities/`activity_id_1`/audits?versionAsAt=`activity_id_1_created_at_1`
		And response body path $[0].audits.length should be 1
		And response body path $[0].audits[0].pipelineId should be `pipeline_processor_pipeline_id`
		And response body path $[0].audits[0].executionId should be `success_execution_id`
		And response body path $[0].audits[0].outputs[3]['formula'] should be :b\*:c
		And response body path $[0].audits[0].outputs[3]['result'] should be 10
		And response body path $[0].audits[0].outputs[3]['evaluated'][':b'] should be 10
		And response body path $[0].audits[0].outputs[3]['evaluated'][':c'] should be 1
		When I GET /activities/`activity_id_1`/audits
		And response body path $[0].audits.length should be 4
		And response body path $[0].audits[0].pipelineId should be `pipeline_processor_pipeline_id`
		And response body path $[0].audits[0].executionId should be `success_execution_id`
		And response body path $[0].audits[0].outputs[3]['formula'] should be :b\*:c
		And response body path $[0].audits[0].outputs[3]['result'] should be 10
		And response body path $[0].audits[0].outputs[3]['evaluated'][':b'] should be 10
		And response body path $[0].audits[0].outputs[3]['evaluated'][':c'] should be 1

	Scenario: Retrieve Audit 2 for Activity 1
		Given I'm using the pipelineProcessor api
		And I authenticate using email pipeline_processor_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /pipelineProcessorTest
		When I GET /activities/`activity_id_1`/audits?versionAsAt=`activity_id_1_created_at_2`
		And response body path $[0].audits.length should be 1
		And response body path $[0].audits[0].pipelineId should be `pipeline_processor_pipeline_id`
		And response body path $[0].audits[0].executionId should be `delete_execution_id`
		And response body path $[0].audits[0].outputs[3]['evaluated'] should be null
		And response body path $[0].audits[0].outputs[3]['result'] should be null
		When I GET /activities/`activity_id_1`/audits
		And response body path $[0].audits.length should be 4
		And response body path $[0].audits[2].pipelineId should be `pipeline_processor_pipeline_id`
		And response body path $[0].audits[2].executionId should be `delete_execution_id`
		And response body path $[0].audits[2].outputs[3]['evaluated'] should be null
		And response body path $[0].audits[2].outputs[3]['result'] should be null
		And response body path $[0].audits[2].pipelineId should be `pipeline_processor_pipeline_id`
		And response body path $[0].audits[1].executionId should be `success_execution_id`
		And response body path $[0].audits[1].outputs[3]['formula'] should be :b\*:c
		And response body path $[0].audits[1].outputs[3]['result'] should be 10
		And response body path $[0].audits[1].outputs[3]['evaluated'][':b'] should be 10
		And response body path $[0].audits[1].outputs[3]['evaluated'][':c'] should be 1

	Scenario: Retrieve Audit 3 for Activity 1
		Given I'm using the pipelineProcessor api
		And I authenticate using email pipeline_processor_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /pipelineProcessorTest
		When I GET /activities/`activity_id_1`/audits?versionAsAt=`activity_id_1_created_at_3`
		And response body path $[0].audits.length should be 1
		And response body path $[0].audits[0].pipelineId should be `pipeline_processor_pipeline_id`
		And response body path $[0].audits[0].executionId should be `some_success_some_errors_execution_id`
		And response body path $[0].audits[0].outputs[3]['formula'] should be :b\*:c
		And response body path $[0].audits[0].outputs[3]['result'] should be 10
		And response body path $[0].audits[0].outputs[3]['evaluated'][':b'] should be 10
		And response body path $[0].audits[0].outputs[3]['evaluated'][':c'] should be 1
		When I GET /activities/`activity_id_1`/audits
		And response body path $[0].audits.length should be 4
		And response body path $[0].audits[3].pipelineId should be `pipeline_processor_pipeline_id`
		And response body path $[0].audits[3].executionId should be `some_success_some_errors_execution_id`
		And response body path $[0].audits[3].outputs[3]['formula'] should be :b\*:c
		And response body path $[0].audits[3].outputs[3]['result'] should be 10
		And response body path $[0].audits[3].outputs[3]['evaluated'][':b'] should be 10
		And response body path $[0].audits[3].outputs[3]['evaluated'][':c'] should be 1
		And response body path $[0].audits[1].pipelineId should be `pipeline_processor_pipeline_id`
		And response body path $[0].audits[2].executionId should be `delete_execution_id`
		And response body path $[0].audits[2].outputs[3]['evaluated'] should be null
		And response body path $[0].audits[2].outputs[3]['result'] should be null
		And response body path $[0].audits[1].pipelineId should be `pipeline_processor_pipeline_id`
		And response body path $[0].audits[1].executionId should be `success_execution_id`
		And response body path $[0].audits[1].outputs[3]['formula'] should be :b\*:c
		And response body path $[0].audits[1].outputs[3]['result'] should be 10
		And response body path $[0].audits[1].outputs[3]['evaluated'][':b'] should be 10
		And response body path $[0].audits[1].outputs[3]['evaluated'][':c'] should be 1


	Scenario: Retrieve and validate Audit Export
		Given I'm using the pipelineProcessor api
		And I authenticate using email pipeline_processor_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /pipelineProcessorTest
		And I set body to { "expiration" : 300 }
		When I POST to /pipelines/`pipeline_processor_pipeline_id`/executions
		Then response code should be 201
		And I store the value of body path $.inputUploadUrl as audit_export_upload_url in global scope
		And I store the value of body path $.id as audit_export_execution_id in global scope
		When I upload an input CSV file to url stored at global variable audit_export_upload_url with rows
			| reading_date | A | Column B | Column C |
			| 1/10/22      | A | 10       | 1        |
			| 1/10/22      | B | 20       | 2        |
			| 1/10/22      | C | 30       | 3        |
			| 1/10/22      | D | 40       | 4        |
			| 1/10/22      | E | 50       | 5        |
			| 1/10/22      | F | 60       | 6        |
		Then I pause for 5000ms
		When I GET /pipelines/`pipeline_processor_pipeline_id`/executions/`audit_export_execution_id`
		Then response code should be 200
		And response body path $.status should be in_progress
		And I set body to { "expiration" : 300 }
		When I POST to /pipelines/`pipeline_processor_pipeline_id`/executions/`audit_export_execution_id`/generateAuditExportUrl
		Then response code should be 409
		And response body path $.message should be audit processing is still in progress for execution
		Then I pause for 60000ms
		When I GET /pipelines/`pipeline_processor_pipeline_id`/executions/`audit_export_execution_id`
		Then response code should be 200
		And response body path $.status should be success
		And I set body to { "expiration" : 300 }
		When I POST to /pipelines/`pipeline_processor_pipeline_id`/executions/`audit_export_execution_id`/generateAuditExportUrl
		Then response code should be 409
		And response body path $.message should be audit processing is still in progress for execution
		Then I pause for 120000ms
		And I set body to { "expiration" : 300 }
		When I POST to /pipelines/`pipeline_processor_pipeline_id`/executions/`audit_export_execution_id`/generateAuditExportUrl
		Then response code should be 202
		Then I pause for 10000ms
		And I set body to { "expiration" : 300 }
		When I POST to /pipelines/`pipeline_processor_pipeline_id`/executions/`audit_export_execution_id`/generateAuditExportUrl
		Then response code should be 201
		And I store the value of body path $.url as audit_export_download_url in global scope
		When I download the output audit file from the url stored at global variable audit_export_download_url it will match rows in no specific order
			| "auditId"         | "in_reading_date" | "in_a" | "in_b" | "in_c" | "out_time_formula"                     | "out_time_results" | "out_time_impacts" | "out_time_calculations" | "out_time_referenceDatasets" | "out_month_formula"                                         | "out_month_results" | "out_month_impacts" | "out_month_calculations" | "out_month_referenceDatasets" | "out_a_formula" | "out_a_results" | "out_a_impacts" | "out_a_calculations" | "out_a_referenceDatasets" | "out_b_plus_c_formula" | "out_b_plus_c_results" | "out_b_plus_c_impacts" | "out_b_plus_c_calculations" | "out_b_plus_c_referenceDatasets" |
			| "static_audit_id" | "1/10/22"         | "A"    | "10"   | "1"    | "AS_TIMESTAMP(:reading_date,'M/d/yy')" | "1641772800000"    |                    |                         |                              | "AS_TIMESTAMP(:reading_date,'M/d/yy', roundDownTo='month')" | "1640995200000"     |                     |                          |                               | ":a"            | "A"             |                 |                      |                           | ":b+:c"                | "11"                   |                        |                             |                                  |
			| "static_audit_id" | "1/10/22"         | "B"    | "20"   | "2"    | "AS_TIMESTAMP(:reading_date,'M/d/yy')" | "1641772800000"    |                    |                         |                              | "AS_TIMESTAMP(:reading_date,'M/d/yy', roundDownTo='month')" | "1640995200000"     |                     |                          |                               | ":a"            | "B"             |                 |                      |                           | ":b+:c"                | "22"                   |                        |                             |                                  |
			| "static_audit_id" | "1/10/22"         | "C"    | "30"   | "3"    | "AS_TIMESTAMP(:reading_date,'M/d/yy')" | "1641772800000"    |                    |                         |                              | "AS_TIMESTAMP(:reading_date,'M/d/yy', roundDownTo='month')" | "1640995200000"     |                     |                          |                               | ":a"            | "C"             |                 |                      |                           | ":b+:c"                | "33"                   |                        |                             |                                  |
			| "static_audit_id" | "1/10/22"         | "D"    | "40"   | "4"    | "AS_TIMESTAMP(:reading_date,'M/d/yy')" | "1641772800000"    |                    |                         |                              | "AS_TIMESTAMP(:reading_date,'M/d/yy', roundDownTo='month')" | "1640995200000"     |                     |                          |                               | ":a"            | "D"             |                 |                      |                           | ":b+:c"                | "44"                   |                        |                             |                                  |
			| "static_audit_id" | "1/10/22"         | "E"    | "50"   | "5"    | "AS_TIMESTAMP(:reading_date,'M/d/yy')" | "1641772800000"    |                    |                         |                              | "AS_TIMESTAMP(:reading_date,'M/d/yy', roundDownTo='month')" | "1640995200000"     |                     |                          |                               | ":a"            | "E"             |                 |                      |                           | ":b+:c"                | "55"                   |                        |                             |                                  |
			| "static_audit_id" | "1/10/22"         | "F"    | "60"   | "6"    | "AS_TIMESTAMP(:reading_date,'M/d/yy')" | "1641772800000"    |                    |                         |                              | "AS_TIMESTAMP(:reading_date,'M/d/yy', roundDownTo='month')" | "1640995200000"     |                     |                          |                               | ":a"            | "F"             |                 |                      |                           | ":b+:c"                | "66"                   |                        |                             |                                  |


	Scenario: Teardown - Pipeline
		When I'm using the pipelines api
		And I authenticate using email pipeline_processor_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /pipelineProcessorTest
		When I remove header Content-Type
		When I DELETE /pipelines/`pipeline_processor_pipeline_id`
		Then response code should be 204
		When I GET /pipelines
		Then response code should be 200
		And response body path $.pipelines.length should be 0

	Scenario: Revoke access to connector from group /pipelineProcessorTest
		When I'm using the pipelines api
		Given I authenticate using email pipeline_processor_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		And I DELETE /connectors/`connector_id`/groups/%2fpipelineProcessorTest
		Then response code should be 204

	Scenario: Teardown - Cleanup users
		When I'm using the accessManagement api
		And group /pipelineProcessorTest has user pipeline_processor_admin@amazon.com revoked
		And group / has user pipeline_processor_admin@amazon.com revoked
		And group /pipelineProcessorTest has been removed


