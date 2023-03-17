@setup_endToEnd
Feature:
	Pipeline Processor Integration Test

	Scenario: Setup users
		Given I'm using the accessManagement api
		And group /pipelineProcessorTest exists
		And group / has user pipeline_processor_admin@amazon.com with role admin and password p@ssword1

	Scenario: Create Pipeline
		Given I'm using the pipelines api
		And I authenticate using email pipeline_processor_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /pipelineProcessorTest
		And I set body to {"attributes":{"type":"integration"},"name":"Simple Pipeline","description":"Pipeline processor test pipeline","transformer":{"transforms":[{"index":0,"formula":"AS_TIMESTAMP(:reading date,'M/d/yy')","outputs":[{"description":"Timestamp of business activity.","index":0,"key":"time","label":"Time","type":"timestamp"}]},{"index":1,"formula":"AS_TIMESTAMP(:reading date,'M/d/yy', roundDownTo='month')","outputs":[{"description":"Transform date to beginning of month.","index":0,"key":"month","label":"Month","type":"timestamp","aggregate":"groupBy"}]},{"index":2,"formula":":a","outputs":[{"description":"Column A","index":0,"key":"a","label":"Column A","type":"string","includeAsUnique":true}]},{"index":3,"formula":":b*:c","outputs":[{"description":"Column B multiplied by Column C","index":0,"key":"b*c","label":"B x C","type":"number","aggregate":"sum"}]}],"parameters":[{"index":0,"key":"reading date","type":"string"},{"index":1,"key":"a","label":"A","description":"Column A","type":"string"},{"index":2,"key":"b","label":"Column B","description":"Column B","type":"number"},{"index":3,"key":"c","label":"Column C","description":"Column C","type":"number"}]}}
		When I POST to /pipelines
		Then response code should be 201
		And response body should contain id
		And I store the value of body path $.id as pipeline_processor_pipeline_id in global scope

	Scenario: Request Upload URL from Nonexistent Pipeline
		Given I'm using the pipelineProcessor api
		And I authenticate using email pipeline_processor_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /pipelineProcessorTest
		And I set body to { "expiration" : 300}
		When I POST to /pipelines/notactuallyapipeline/inputUploadUrl
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

	Scenario: Upload Input File for Pipeline Processing
		Given I'm using the pipelineProcessor api
		And I authenticate using email pipeline_processor_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /pipelineProcessorTest
		And I set body to { "expiration" : 300}
		When I POST to /pipelines/`pipeline_processor_pipeline_id`/inputUploadUrl
		Then response code should be 201
		And I store the value of body path $.url as success_upload_url in global scope
		When I upload an input CSV file to url stored at global variable success_upload_url with rows
			| reading date | a | b  | c |
			| 1/4/22       | A | 10 | 1 |
			| 1/4/22       | A | 10 | 1 |
			| 1/4/22       | C | 30 | 3 |
			| 1/4/22       | D | 40 | 4 |
			| 1/4/22       | E | 50 | 5 |
			| 1/4/22       | F | 60 | 6 |
		Then I pause for 20000ms
		When I GET /pipelines/`pipeline_processor_pipeline_id`/executions
		Then response code should be 200
		And response body path $.executions should be of type array with length 1
		And the latest execution status should be success
		And I store the id of the latest execution in variable success_execution_id in global scope

	Scenario: Retrieve and Validate Successful Output
		Given I'm using the pipelineProcessor api
		And I authenticate using email pipeline_processor_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /pipelineProcessorTest
		When I GET /activities?date=1/4/22&executionId=`success_execution_id`&pipelineId=`pipeline_processor_pipeline_id`&showHistory=true&uniqueKeyAttributes=a:A
		And response body path $.activities[?(@.a=='A')]['b*c'] should be 10
		And response body path $.activities should be of type array with length 2
		When I GET /activities?date=1/1/22&executionId=`success_execution_id`&pipelineId=`pipeline_processor_pipeline_id`&showAggregate=true
		And response body path $.activities[?(@.date=='2022-01-01T00:00:00.000Z')]['b*c'] should be 870
		And response body path $.activities should be of type array with length 1

	Scenario: Upload Input File with all delete actionType for Pipeline Processing
		Given I'm using the pipelineProcessor api
		And I authenticate using email pipeline_processor_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /pipelineProcessorTest
		And I set body to { "expiration" : 300 ,"actionType":"delete"}
		When I POST to /pipelines/`pipeline_processor_pipeline_id`/inputUploadUrl
		Then response code should be 201
		And I store the value of body path $.url as delete_upload_url in global scope
		When I upload an input CSV file to url stored at global variable delete_upload_url with rows
			| reading date | a | b | c |
			| 1/4/22       | A |   |   |
		Then I pause for 20000ms
		When I GET /pipelines/`pipeline_processor_pipeline_id`/executions
		Then response code should be 200
		And response body path $.executions should be of type array with length 2
		And the latest execution status should be success
		And I store the id of the latest execution in variable delete_execution_id in global scope

	Scenario: Retrieve and Validate Deleted Output
		Given I'm using the pipelineProcessor api
		And I authenticate using email pipeline_processor_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /pipelineProcessorTest
		When I GET /activities?date=1/4/22&executionId=`delete_execution_id`&pipelineId=`pipeline_processor_pipeline_id`&showHistory=true&uniqueKeyAttributes=a:A
		And response body path $.activities should be of type array with length 1
		When I GET /activities?date=1/4/22&pipelineId=`pipeline_processor_pipeline_id`&showHistory=true&uniqueKeyAttributes=a:A
		And response body path $.activities should be of type array with length 3
		And response body path $.activities[?(@.a==null)]['b*c'] should be null
		When I GET /activities?date=1/1/22&executionId=`delete_execution_id`&pipelineId=`pipeline_processor_pipeline_id`&showAggregate=true
		And response body path $.activities[?(@.date=='2022-01-01T00:00:00.000Z')]['b*c'] should be 860
		And response body path $.activities should be of type array with length 1

	Scenario: Retrieve audit output url should return 404 while it's being processed
		Given I'm using the pipelineProcessor api
		And I authenticate using email pipeline_processor_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /pipelineProcessorTest
		When I set body to { "expiration" : 300}
		And I POST to /pipelines/`pipeline_processor_pipeline_id`/executions/`success_execution_id`/auditDownloadUrl
		# takes a while before audit log is generated
		Then response code should be 409
		And response body path $.message should be audit files are still being processed.

	Scenario: Upload Input File with All Errors for Pipeline Processing
		Given I'm using the pipelineProcessor api
		And I authenticate using email pipeline_processor_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /pipelineProcessorTest
		And I set body to { "expiration" : 300}
		When I POST to /pipelines/`pipeline_processor_pipeline_id`/inputUploadUrl
		Then response code should be 201
		And I store the value of body path $.url as all_errors_upload_url in global scope
		When I upload an input CSV file to url stored at global variable all_errors_upload_url with rows
			| reading date | a | b  | c     |
			| 1/4/22       | A | 10 | One   |
			| 1/4/22       | B | 20 | Two   |
			| 1/4/22       | C | 30 | Three |
			| 1/4/22       | D | 40 | Four  |
			| 1/4/22       | E | 50 | Five  |
			| 1/4/22       | F | 60 | Six   |
			| 1/4/22       |   |    |       |
		Then I pause for 20000ms
		When I GET /pipelines/`pipeline_processor_pipeline_id`/executions
		Then response code should be 200
		And response body path $.executions should be of type array with length 3
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
			| Failed processing row [1/4/22, A, 10, One], err: Character O is neither a decimal digit number, decimal point, nor "e" notation exponential mark.   |
			| Failed processing row [1/4/22, B, 20, Two], err: Character T is neither a decimal digit number, decimal point, nor "e" notation exponential mark.   |
			| Failed processing row [1/4/22, C, 30, Three], err: Character T is neither a decimal digit number, decimal point, nor "e" notation exponential mark. |
			| Failed processing row [1/4/22, D, 40, Four], err: Character F is neither a decimal digit number, decimal point, nor "e" notation exponential mark.  |
			| Failed processing row [1/4/22, E, 50, Five], err: Character F is neither a decimal digit number, decimal point, nor "e" notation exponential mark.  |
			| Failed processing row [1/4/22, F, 60, Six], err: Character S is neither a decimal digit number, decimal point, nor "e" notation exponential mark.   |

	Scenario: Upload Input File with Some Success and Some Errors for Pipeline Processing
		Given I'm using the pipelineProcessor api
		And I authenticate using email pipeline_processor_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /pipelineProcessorTest
		And I set body to { "expiration" : 300}
		When I POST to /pipelines/`pipeline_processor_pipeline_id`/inputUploadUrl
		Then response code should be 201
		And I store the value of body path $.url as some_success_some_errors_upload_url in global scope
		When I upload an input CSV file to url stored at global variable some_success_some_errors_upload_url with rows
			| reading date | a | b  | c     |
			| 1/4/22       | A | 10 | 1     |
			| 1/4/22       | B | 20 | Two   |
			| 1/4/22       | C | 30 | Three |
			| 1/4/22       | D | 40 | 4     |
			| 1/4/22       | E | 50 | 5     |
			| 1/4/22       | F | 60 | Six   |
		Then I pause for 20000ms
		When I GET /pipelines/`pipeline_processor_pipeline_id`/executions
		Then response code should be 200
		And response body path $.executions should be of type array with length 4
		And the latest execution status should be failed
		And I store the id of the latest execution in variable some_success_some_errors_execution_id in global scope

	Scenario: Retrieve and Validate Some Success and Some Errors Output
		Given I'm using the pipelineProcessor api
		And I authenticate using email pipeline_processor_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /pipelineProcessorTest
		When I GET /activities?date=1/4/22&executionId=`some_success_some_errors_execution_id`&pipelineId=`pipeline_processor_pipeline_id`
		And response body path $.activities[?(@.a=='A')]['b*c'] should be 10
		And response body path $.activities[?(@.a=='D')]['b*c'] should be 160
		And response body path $.activities[?(@.a=='E')]['b*c'] should be 250
		When I set body to { "expiration" : 300}
		And I POST to /pipelines/`pipeline_processor_pipeline_id`/executions/`some_success_some_errors_execution_id`/errorDownloadUrl
		Then response code should be 201
		And I store the value of body path $.url as some_success_some_errors_error_download_url in global scope
		When I download the output text file from the url stored at global variable some_success_some_errors_error_download_url it will match rows
			| Failed processing row [1/4/22, B, 20, Two], err: Character T is neither a decimal digit number, decimal point, nor "e" notation exponential mark.   |
			| Failed processing row [1/4/22, C, 30, Three], err: Character T is neither a decimal digit number, decimal point, nor "e" notation exponential mark. |
			| Failed processing row [1/4/22, F, 60, Six], err: Character S is neither a decimal digit number, decimal point, nor "e" notation exponential mark.   |

	Scenario: Patching Pipeline to modify one of its field
		Given I'm using the pipelines api
		And I authenticate using email pipeline_processor_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /pipelineProcessorTest
		And I set body to {"attributes":{"type":"integration"},"name":"Simple Pipeline","description":"Pipeline processor test pipeline","transformer":{"transforms":[{"index":0,"formula":"AS_TIMESTAMP(:reading date,'M/d/yy')","outputs":[{"description":"Timestamp of business activity.","index":0,"key":"time","label":"Time","type":"timestamp"}]},{"index":1,"formula":"AS_TIMESTAMP(:reading date,'M/d/yy', roundDownTo='month')","outputs":[{"description":"Transform date to beginning of month.","index":0,"key":"month","label":"Month","type":"timestamp","aggregate":"groupBy"}]},{"index":2,"formula":":a","outputs":[{"description":"Column A","index":0,"key":"a","label":"Column A","type":"string","includeAsUnique":true}]},{"index":3,"formula":":b+:c","outputs":[{"description":"Column B multiplied by Column C","index":0,"key":"b+c","label":"B + C","type":"number", "aggregate": "sum"}]}],"parameters":[{"index":0,"key":"reading date","type":"string"},{"index":1,"key":"a","label":"A","description":"Column A","type":"string"},{"index":2,"key":"b","label":"Column B","description":"Column B","type":"number"},{"index":3,"key":"c","label":"Column C","description":"Column C","type":"number"}]}}
		When I PATCH /pipelines/`pipeline_processor_pipeline_id`
		Then response code should be 200

	Scenario: Upload Input File for Pipeline Processing
		Given I'm using the pipelineProcessor api
		And I authenticate using email pipeline_processor_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /pipelineProcessorTest
		And I set body to { "expiration" : 300}
		When I POST to /pipelines/`pipeline_processor_pipeline_id`/inputUploadUrl
		Then response code should be 201
		And I store the value of body path $.url as updated_success_upload_url in global scope
		When I upload an input CSV file to url stored at global variable updated_success_upload_url with rows
			| reading date | a | b  | c |
			| 1/8/22       | A | 10 | 1 |
			| 1/8/22       | B | 20 | 2 |
			| 1/8/22       | C | 30 | 3 |
			| 1/8/22       | D | 40 | 4 |
			| 1/8/22       | E | 50 | 5 |
			| 1/8/22       | F | 60 | 6 |
		Then I pause for 20000ms
		When I GET /pipelines/`pipeline_processor_pipeline_id`/executions
		Then response code should be 200
		And response body path $.executions should be of type array with length 5
		And the latest execution status should be success
		And I store the id of the latest execution in variable updated_success_execution_id in global scope

	Scenario: Retrieve and Validate Successful Output
		Given I'm using the pipelineProcessor api
		And I authenticate using email pipeline_processor_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /pipelineProcessorTest
		When I GET /activities?date=1/8/22&executionId=`updated_success_execution_id`&pipelineId=`pipeline_processor_pipeline_id`&showHistory=true&uniqueKeyAttributes=a:A
		And response body path $.activities[?(@.a=='A')]['b+c'] should be 11
		And response body path $.activities should be of type array with length 1
		When I GET /activities?date=1/1/22&executionId=`updated_success_execution_id`&pipelineId=`pipeline_processor_pipeline_id`&showAggregate=true
		And response body path $.activities[?(@.date=='2022-01-01T00:00:00.000Z')]['b+c'] should be 231
		# The previous value should no longer be returned
		When I GET /activities?date=1/1/22&pipelineId=`pipeline_processor_pipeline_id`&showAggregate=true
		And response body path $.activities[?(@.date=='2022-01-01T00:00:00.000Z')]['b+c'] should be 231
		And response body path $.activities should be of type array with length 1
		When I GET /activities?date=1/1/22&pipelineId=`pipeline_processor_pipeline_id`&showAggregate=true&showHistory=true&uniqueKeyAttributes=month:A
		And response body path $.activities should be of type array with length 5
		# Aggregated history for the first pipeline execution
		And response body path $.activities[?(@.executionId=='`success_execution_id`')]['b*c'] should be 870
		And response body path $.activities[?(@.executionId=='`success_execution_id`')]['b+c'] should be null
		# Aggregated history for the pipeline execution where we deleted couple rows
		And response body path $.activities[?(@.executionId=='`delete_execution_id`')]['b*c'] should be 860
		And response body path $.activities[?(@.executionId=='`delete_execution_id`')]['b+c'] should be null
		# Aggregated history for the pipeline execution where we modify the pipeline formula from multiplication to addition
		And response body path $.activities[?(@.executionId=='`updated_success_execution_id`')]['b+c'] should be 231
		And response body path $.activities[?(@.executionId=='`updated_success_execution_id`')]['b*c'] should be null

	Scenario: Retrieve and Validate Output From Multiple Pipeline Configuration
		Given I'm using the pipelineProcessor api
		And I authenticate using email pipeline_processor_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /pipelineProcessorTest
		When I GET /activities?dateFrom=1/4/22&pipelineId=`pipeline_processor_pipeline_id`
		And response body path $.activities should be of type array with length 11
		# Result for pipeline version 1
		And response body path $.activities[?(@.a=='A' && @.date=='2022-01-04T00:00:00.000Z')]['b*c'] should be 10
		And response body path $.activities[?(@.a=='C' && @.date=='2022-01-04T00:00:00.000Z')]['b*c'] should be 90
		And response body path $.activities[?(@.a=='D' && @.date=='2022-01-04T00:00:00.000Z')]['b*c'] should be 160
		And response body path $.activities[?(@.a=='E' && @.date=='2022-01-04T00:00:00.000Z')]['b*c'] should be 250
		And response body path $.activities[?(@.a=='F' && @.date=='2022-01-04T00:00:00.000Z')]['b*c'] should be 360
		# Should not contain output of the latest version
		And response body path $.activities[?(@.a=='A' && @.date=='2022-01-04T00:00:00.000Z')]['b+c'] should be null
		And response body path $.activities[?(@.a=='B' && @.date=='2022-01-04T00:00:00.000Z')]['b+c'] should be null
		And response body path $.activities[?(@.a=='C' && @.date=='2022-01-04T00:00:00.000Z')]['b+c'] should be null
		And response body path $.activities[?(@.a=='D' && @.date=='2022-01-04T00:00:00.000Z')]['b+c'] should be null
		And response body path $.activities[?(@.a=='E' && @.date=='2022-01-04T00:00:00.000Z')]['b+c'] should be null
		And response body path $.activities[?(@.a=='F' && @.date=='2022-01-04T00:00:00.000Z')]['b+c'] should be null
		# Result for pipeline version 2
		And response body path $.activities[?(@.a=='A' && @.date=='2022-01-08T00:00:00.000Z')]['b+c'] should be 11
		And response body path $.activities[?(@.a=='B' && @.date=='2022-01-08T00:00:00.000Z')]['b+c'] should be 22
		And response body path $.activities[?(@.a=='C' && @.date=='2022-01-08T00:00:00.000Z')]['b+c'] should be 33
		And response body path $.activities[?(@.a=='D' && @.date=='2022-01-08T00:00:00.000Z')]['b+c'] should be 44
		And response body path $.activities[?(@.a=='E' && @.date=='2022-01-08T00:00:00.000Z')]['b+c'] should be 55
		And response body path $.activities[?(@.a=='F' && @.date=='2022-01-08T00:00:00.000Z')]['b+c'] should be 66
		# Should not contain output of the previous version
		And response body path $.activities[?(@.a=='A' && @.date=='2022-01-08T00:00:00.000Z')]['b*c'] should be null
		And response body path $.activities[?(@.a=='B' && @.date=='2022-01-08T00:00:00.000Z')]['b*c'] should be null
		And response body path $.activities[?(@.a=='C' && @.date=='2022-01-08T00:00:00.000Z')]['b*c'] should be null
		And response body path $.activities[?(@.a=='D' && @.date=='2022-01-08T00:00:00.000Z')]['b*c'] should be null
		And response body path $.activities[?(@.a=='E' && @.date=='2022-01-08T00:00:00.000Z')]['b*c'] should be null
		And response body path $.activities[?(@.a=='F' && @.date=='2022-01-08T00:00:00.000Z')]['b*c'] should be null

	Scenario: Retrieve and Validate All Audit Output
		Given I'm using the pipelineProcessor api
		And I authenticate using email pipeline_processor_admin@amazon.com and password p@ssword1
		Then I pause for 90000ms
		And I set x-groupcontextid header to /pipelineProcessorTest
		When I set body to { "expiration" : 300}
		And I POST to /pipelines/`pipeline_processor_pipeline_id`/executions/`success_execution_id`/auditDownloadUrl
		Then response code should be 201
		And I store the value of body path $.urls[0] as success_audit_download_url in global scope
		When I download the output audit file from the url stored at global variable success_audit_download_url it will match rows
			| {"pipelineId":"`pipeline_processor_pipeline_id`","executionId":"`success_execution_id`","executionNo":0,"rowId":"1/4/22","outputs":[{"index":0,"name":"time","formula":"AS_TIMESTAMP(:reading date,\u0027M/d/yy\u0027)","evaluated":{"AS_TIMESTAMP(:reading date,\u0027M/d/yy\u0027)":"1641254400000",":reading date":"1/4/22"},"result":"1641254400000"},{"index":1,"name":"month","formula":"AS_TIMESTAMP(:reading date,\u0027M/d/yy\u0027, roundDownTo\u003d\u0027month\u0027)","evaluated":{"AS_TIMESTAMP(:reading date,\u0027M/d/yy\u0027, roundDownTo\u003d\u0027month\u0027)":"1640995200000",":reading date":"1/4/22"},"result":"1640995200000"},{"index":2,"name":"a","formula":":a","evaluated":{":a":"D"},"result":"D"},{"index":3,"name":"b*c","formula":":b*:c","evaluated":{":b":"40",":c":"4"},"result":"160"}]} |
			| {"pipelineId":"`pipeline_processor_pipeline_id`","executionId":"`success_execution_id`","executionNo":0,"rowId":"1/4/22","outputs":[{"index":0,"name":"time","formula":"AS_TIMESTAMP(:reading date,\u0027M/d/yy\u0027)","evaluated":{"AS_TIMESTAMP(:reading date,\u0027M/d/yy\u0027)":"1641254400000",":reading date":"1/4/22"},"result":"1641254400000"},{"index":1,"name":"month","formula":"AS_TIMESTAMP(:reading date,\u0027M/d/yy\u0027, roundDownTo\u003d\u0027month\u0027)","evaluated":{"AS_TIMESTAMP(:reading date,\u0027M/d/yy\u0027, roundDownTo\u003d\u0027month\u0027)":"1640995200000",":reading date":"1/4/22"},"result":"1640995200000"},{"index":2,"name":"a","formula":":a","evaluated":{":a":"E"},"result":"E"},{"index":3,"name":"b*c","formula":":b*:c","evaluated":{":b":"50",":c":"5"},"result":"250"}]} |
			| {"pipelineId":"`pipeline_processor_pipeline_id`","executionId":"`success_execution_id`","executionNo":0,"rowId":"1/4/22","outputs":[{"index":0,"name":"time","formula":"AS_TIMESTAMP(:reading date,\u0027M/d/yy\u0027)","evaluated":{"AS_TIMESTAMP(:reading date,\u0027M/d/yy\u0027)":"1641254400000",":reading date":"1/4/22"},"result":"1641254400000"},{"index":1,"name":"month","formula":"AS_TIMESTAMP(:reading date,\u0027M/d/yy\u0027, roundDownTo\u003d\u0027month\u0027)","evaluated":{"AS_TIMESTAMP(:reading date,\u0027M/d/yy\u0027, roundDownTo\u003d\u0027month\u0027)":"1640995200000",":reading date":"1/4/22"},"result":"1640995200000"},{"index":2,"name":"a","formula":":a","evaluated":{":a":"F"},"result":"F"},{"index":3,"name":"b*c","formula":":b*:c","evaluated":{":b":"60",":c":"6"},"result":"360"}]} |
			| {"pipelineId":"`pipeline_processor_pipeline_id`","executionId":"`success_execution_id`","executionNo":0,"rowId":"1/4/22","outputs":[{"index":0,"name":"time","formula":"AS_TIMESTAMP(:reading date,\u0027M/d/yy\u0027)","evaluated":{"AS_TIMESTAMP(:reading date,\u0027M/d/yy\u0027)":"1641254400000",":reading date":"1/4/22"},"result":"1641254400000"},{"index":1,"name":"month","formula":"AS_TIMESTAMP(:reading date,\u0027M/d/yy\u0027, roundDownTo\u003d\u0027month\u0027)","evaluated":{"AS_TIMESTAMP(:reading date,\u0027M/d/yy\u0027, roundDownTo\u003d\u0027month\u0027)":"1640995200000",":reading date":"1/4/22"},"result":"1640995200000"},{"index":2,"name":"a","formula":":a","evaluated":{":a":"A"},"result":"A"},{"index":3,"name":"b*c","formula":":b*:c","evaluated":{":b":"10",":c":"1"},"result":"10"}]}  |
			| {"pipelineId":"`pipeline_processor_pipeline_id`","executionId":"`success_execution_id`","executionNo":0,"rowId":"1/4/22","outputs":[{"index":0,"name":"time","formula":"AS_TIMESTAMP(:reading date,\u0027M/d/yy\u0027)","evaluated":{"AS_TIMESTAMP(:reading date,\u0027M/d/yy\u0027)":"1641254400000",":reading date":"1/4/22"},"result":"1641254400000"},{"index":1,"name":"month","formula":"AS_TIMESTAMP(:reading date,\u0027M/d/yy\u0027, roundDownTo\u003d\u0027month\u0027)","evaluated":{"AS_TIMESTAMP(:reading date,\u0027M/d/yy\u0027, roundDownTo\u003d\u0027month\u0027)":"1640995200000",":reading date":"1/4/22"},"result":"1640995200000"},{"index":2,"name":"a","formula":":a","evaluated":{":a":"A"},"result":"A"},{"index":3,"name":"b*c","formula":":b*:c","evaluated":{":b":"10",":c":"1"},"result":"10"}]}  |
			| {"pipelineId":"`pipeline_processor_pipeline_id`","executionId":"`success_execution_id`","executionNo":0,"rowId":"1/4/22","outputs":[{"index":0,"name":"time","formula":"AS_TIMESTAMP(:reading date,\u0027M/d/yy\u0027)","evaluated":{"AS_TIMESTAMP(:reading date,\u0027M/d/yy\u0027)":"1641254400000",":reading date":"1/4/22"},"result":"1641254400000"},{"index":1,"name":"month","formula":"AS_TIMESTAMP(:reading date,\u0027M/d/yy\u0027, roundDownTo\u003d\u0027month\u0027)","evaluated":{"AS_TIMESTAMP(:reading date,\u0027M/d/yy\u0027, roundDownTo\u003d\u0027month\u0027)":"1640995200000",":reading date":"1/4/22"},"result":"1640995200000"},{"index":2,"name":"a","formula":":a","evaluated":{":a":"C"},"result":"C"},{"index":3,"name":"b*c","formula":":b*:c","evaluated":{":b":"30",":c":"3"},"result":"90"}]}  |

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

	Scenario: Teardown - Cleanup users
		When I'm using the accessManagement api
		And group / has user pipeline_processor_admin@amazon.com revoked
		And group /pipelineProcessorTest has been removed

