@setup_endToEnd @pipelineProcessor
Feature:
	Assign to Group Integration Test

	Scenario: Setup user and groups
		Given I'm using the accessManagement api
		And group /assign-to-group exists
		And group /assign-to-group/anytown exists
		And group /assign-to-group/bakerberg exists
		And group /assign-to-group/cityville exists
		And group /assign-to-group/downtown exists
		And group /assign-to-group has user assign_to_group_admin@amazon.com with role admin and password p@ssword1

	Scenario: Teardown: Pipelines with tag testSource:assign-to-group
	Cleans up any pipelines remaining from a previous test run associated with this test.
		Given I'm using the pipelines api
		And I authenticate using email assign_to_group_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /assign-to-group
		And no pipeline exists with tags testSource:assign-to-group

	Scenario: Teardown: Metrics with tag testSource:assignToGroup
	Cleans up any tags remaining from a previous test run associated with this test.
		Given I'm using the pipelines api
		And I authenticate using email assign_to_group_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /assign-to-group
		And no metric exists with tags testSource:assign-to-group

	Scenario: Create Metrics
		Given I'm using the pipelines api
		And I authenticate using email assign_to_group_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /assign-to-group
		And I set body to {"name": "assign-to-group:kwh:total","summary": "Total of kWh","aggregationType": "sum","tags":{"testSource":"assign-to-group"}}
		When I POST to /metrics
		Then response code should be 201
		And response body should contain id
		And I store the value of body path $.id as metric_kwh_total_id in global scope
		And response body path $.name should be assign-to-group:kwh:total
		And response body path $.summary should be Total of kWh
		And response body path $.aggregationType should be sum
		Given I set body to {"name": "assign-to-group:kwh:household","summary": "Total of kWh for household sources","aggregationType": "sum","outputMetrics": ["assign-to-group:kwh:total"],"tags":{"testSource":"assign-to-group"}}
		When I POST to /metrics
		Then response code should be 201
		And response body should contain id
		And I store the value of body path $.id as metric_kwh_household_id in global scope
		And response body path $.name should be assign-to-group:kwh:household
		And response body path $.summary should be Total of kWh for household sources
		And response body path $.aggregationType should be sum
		And response body path $.outputMetrics[0] should be assign-to-group:kwh:total

	Scenario: Create Pipeline
		Given I'm using the pipelines api
		And I authenticate using email assign_to_group_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /assign-to-group
		And I set body to {"name": "Assign to Groups Integration Test - Metrics Aggregation","tags":{"testSource":"assign-to-group"},"description": "Test pipeline for Assign to Groups","processorOptions": {"chunkSize": 1},"connectorConfig": {"input": [{"name": "sif-csv-pipeline-input-connector"}]},"transformer": {"transforms": [{"index": 0,"formula": "AS_TIMESTAMP(:timestamp, 'yyyy-MM-dd\\'T\\'HH:mm:ss.SSSXXX')","outputs": [{"description": "Time of electricity consumption","index": 0,"key": "timestamp","label": "Timestamp","type": "timestamp"}]},{"index": 1,"formula": "ASSIGN_TO_GROUP(CONCAT('/assign-to-group/',:city))","outputs": [{"description": "Output group for activity","index": 0,"key": "output_group","label": "Output Group","type": "string"}]},{"index": 2,"formula": ":kwh","outputs": [{"description": "kWh of electricity consumption in the month","index": 0,"key": "kwh","label": "kWh","type": "number","metrics": ["assign-to-group:kwh:household"]}]}],"parameters": [{"index": 0,"key": "timestamp","label": "timestamp","description": "Timestamp of electicity consumption","type": "string"},{"index": 1,"key": "city","label": "city","description": "City where electricity was consumed","type": "string"},{"index": 2,"key": "kwh","label": "kwh","description": "kWh of electricity consumed","type": "number"}]}}
		When I POST to /pipelines
		Then response code should be 201
		And response body should contain id
		And I store the value of body path $.id as pipeline_kwh_household_id in global scope

	Scenario: Pipeline Processor Job Mode
		Given I'm using the pipelineProcessor api
		And I authenticate using email assign_to_group_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /assign-to-group
		And I set body to { "expiration" : 300}
		When I POST to /pipelines/`pipeline_kwh_household_id`/executions
		Then response code should be 201
		And I store the value of body path $.inputUploadUrl as pipeline_kwh_household_upload_url in global scope
		When I upload an input CSV file to url stored at global variable pipeline_kwh_household_upload_url with rows
			| timestamp							| city 			| kwh  	|
			| 2022-01-02T16:33:01.000+00:00     | Anytown 		|  1 	|
			| 2022-02-02T15:22:02.000+00:00     | Bakerberg 	|  2 	|
			| 2022-03-02T14:11:03.000+00:00     | Cityville 	|  3 	|
			| 2022-04-02T13:04:04.000+00:00     | Anytown 		|  4 	|
			| 2022-05-02T12:52:05.000+00:00     | Bakerberg 	|  5 	|
			| 2022-06-02T11:51:05.000+00:00     | Cityville 	|  6 	|
			| 2022-07-02T10:22:04.000+00:00     | Anytown 		|  7 	|
			| 2022-08-02T21:01:03.000+00:00     | Bakerberg 	|  8 	|
			| 2022-09-02T06:48:02.000+00:00     | Cityville 	|  9 	|
			| 2022-10-02T05:31:01.000+00:00     | Anytown 		| 10 	|
			| 2022-11-02T12:29:11.000+00:00     | Bakerberg 	| 11 	|
			| 2022-12-02T16:10:44.000+00:00     | Cityville 	| 12 	|
		Then I pause for 35000ms
		When I GET /pipelines/`pipeline_kwh_household_id`/executions
		Then response code should be 200
		And response body path $.executions should be of type array with length 1
		And the latest execution status should be success
		And I store the id of the latest execution in variable pipeline_kwh_household_execution_id in global scope

		## ACTIVITIES
		# no activities at /assign-to-group level
		When I remove header x-groupcontextid
		And I set x-groupcontextid header to /assign-to-group
		When I GET /activities?dateFrom=1/1/22&dateTo=12/31/22&pipelineId=`pipeline_kwh_household_id`
		Then response code should be 200
		And response body path $.activities should be of type array with length 0
		# should be activities at /assign-to-group/anytown level
		When I remove header x-groupcontextid
		And I set x-groupcontextid header to /assign-to-group/anytown
		When I GET /activities?dateFrom=1/1/22&dateTo=12/31/22&pipelineId=`pipeline_kwh_household_id`
		Then response code should be 200
		And response body path $.activities should be of type array with length 4
		And response body path $.activities[?(@.date=='2022-01-02T16:33:01.000Z')]['kwh'] should be 1
		And response body path $.activities[?(@.date=='2022-04-02T13:04:04.000Z')]['kwh'] should be 4
		And response body path $.activities[?(@.date=='2022-07-02T10:22:04.000Z')]['kwh'] should be 7
		And response body path $.activities[?(@.date=='2022-10-02T05:31:01.000Z')]['kwh'] should be 10
		# should be activities at /assign-to-group/bakerberg level
		When I remove header x-groupcontextid
		And I set x-groupcontextid header to /assign-to-group/bakerberg
		When I GET /activities?dateFrom=1/1/22&dateTo=12/31/22&pipelineId=`pipeline_kwh_household_id`
		Then response code should be 200
		And response body path $.activities should be of type array with length 4
		And response body path $.activities[?(@.date=='2022-02-02T15:22:02.000Z')]['kwh'] should be 2
		And response body path $.activities[?(@.date=='2022-05-02T12:52:05.000Z')]['kwh'] should be 5
		And response body path $.activities[?(@.date=='2022-08-02T21:01:03.000Z')]['kwh'] should be 8
		And response body path $.activities[?(@.date=='2022-11-02T12:29:11.000Z')]['kwh'] should be 11
		# should be activities at /assign-to-group/cityville level
		When I remove header x-groupcontextid
		And I set x-groupcontextid header to /assign-to-group/cityville
		When I GET /activities?dateFrom=1/1/22&dateTo=12/31/22&pipelineId=`pipeline_kwh_household_id`
		Then response code should be 200
		And response body path $.activities should be of type array with length 4
		And response body path $.activities[?(@.date=='2022-03-02T14:11:03.000Z')]['kwh'] should be 3
		And response body path $.activities[?(@.date=='2022-06-02T11:51:05.000Z')]['kwh'] should be 6
		And response body path $.activities[?(@.date=='2022-09-02T06:48:02.000Z')]['kwh'] should be 9
		And response body path $.activities[?(@.date=='2022-12-02T16:10:44.000Z')]['kwh'] should be 12

		## METRICS
		##### metrics at each leaf group
		When I remove header x-groupcontextid
		And I set x-groupcontextid header to /assign-to-group/anytown
		When I GET /metrics?timeUnit=month&name=assign-to-group:kwh:household&dateFrom=1/1/2022&dateTo=12/31/2022
		Then response code should be 200
		And response body path $.metrics should be of type array with length 4
		And response body path $.metrics[?(@.month=='1')].hierarchyValue should be 1
		And response body path $.metrics[?(@.month=='4')].hierarchyValue should be 4
		And response body path $.metrics[?(@.month=='7')].hierarchyValue should be 7
		And response body path $.metrics[?(@.month=='10')].hierarchyValue should be 10
		When I GET /metrics?timeUnit=month&name=assign-to-group:kwh:total&dateFrom=1/1/2022&dateTo=12/31/2022
		Then response code should be 200
		And response body path $.metrics should be of type array with length 4
		And response body path $.metrics[?(@.month=='1')].hierarchyValue should be 1
		And response body path $.metrics[?(@.month=='4')].hierarchyValue should be 4
		And response body path $.metrics[?(@.month=='7')].hierarchyValue should be 7
		And response body path $.metrics[?(@.month=='10')].hierarchyValue should be 10
		When I GET /metrics?timeUnit=year&name=assign-to-group:kwh:household&dateFrom=1/1/2022&dateTo=12/31/2022
		Then response code should be 200
		And response body path $.metrics should be of type array with length 1
		And response body path $.metrics[?(@.year=='2022')].hierarchyValue should be 22
		When I GET /metrics?timeUnit=year&name=assign-to-group:kwh:total&dateFrom=1/1/2022&dateTo=12/31/2022
		Then response code should be 200
		And response body path $.metrics should be of type array with length 1
		And response body path $.metrics[?(@.year=='2022')].hierarchyValue should be 22
		When I remove header x-groupcontextid
		And I set x-groupcontextid header to /assign-to-group/bakerberg
		When I GET /metrics?timeUnit=month&name=assign-to-group:kwh:household&dateFrom=1/1/2022&dateTo=12/31/2022
		Then response code should be 200
		And response body path $.metrics should be of type array with length 4
		And response body path $.metrics[?(@.month=='2')].hierarchyValue should be 2
		And response body path $.metrics[?(@.month=='5')].hierarchyValue should be 5
		And response body path $.metrics[?(@.month=='8')].hierarchyValue should be 8
		And response body path $.metrics[?(@.month=='11')].hierarchyValue should be 11
		When I GET /metrics?timeUnit=month&name=assign-to-group:kwh:total&dateFrom=1/1/2022&dateTo=12/31/2022
		Then response code should be 200
		And response body path $.metrics should be of type array with length 4
		And response body path $.metrics[?(@.month=='2')].hierarchyValue should be 2
		And response body path $.metrics[?(@.month=='5')].hierarchyValue should be 5
		And response body path $.metrics[?(@.month=='8')].hierarchyValue should be 8
		And response body path $.metrics[?(@.month=='11')].hierarchyValue should be 11
		When I GET /metrics?timeUnit=year&name=assign-to-group:kwh:household&dateFrom=1/1/2022&dateTo=12/31/2022
		Then response code should be 200
		And response body path $.metrics should be of type array with length 1
		And response body path $.metrics[?(@.year=='2022')].hierarchyValue should be 26
		When I GET /metrics?timeUnit=year&name=assign-to-group:kwh:total&dateFrom=1/1/2022&dateTo=12/31/2022
		Then response code should be 200
		And response body path $.metrics should be of type array with length 1
		And response body path $.metrics[?(@.year=='2022')].hierarchyValue should be 26
		When I remove header x-groupcontextid
		And I set x-groupcontextid header to /assign-to-group/cityville
		When I GET /metrics?timeUnit=month&name=assign-to-group:kwh:household&dateFrom=1/1/2022&dateTo=12/31/2022
		Then response code should be 200
		And response body path $.metrics should be of type array with length 4
		And response body path $.metrics[?(@.month=='3')].hierarchyValue should be 3
		And response body path $.metrics[?(@.month=='6')].hierarchyValue should be 6
		And response body path $.metrics[?(@.month=='9')].hierarchyValue should be 9
		And response body path $.metrics[?(@.month=='12')].hierarchyValue should be 12
		When I GET /metrics?timeUnit=month&name=assign-to-group:kwh:total&dateFrom=1/1/2022&dateTo=12/31/2022
		Then response code should be 200
		And response body path $.metrics should be of type array with length 4
		And response body path $.metrics[?(@.month=='3')].hierarchyValue should be 3
		And response body path $.metrics[?(@.month=='6')].hierarchyValue should be 6
		And response body path $.metrics[?(@.month=='9')].hierarchyValue should be 9
		And response body path $.metrics[?(@.month=='12')].hierarchyValue should be 12
		When I GET /metrics?timeUnit=year&name=assign-to-group:kwh:household&dateFrom=1/1/2022&dateTo=12/31/2022
		Then response code should be 200
		And response body path $.metrics should be of type array with length 1
		And response body path $.metrics[?(@.year=='2022')].hierarchyValue should be 30
		When I GET /metrics?timeUnit=year&name=assign-to-group:kwh:total&dateFrom=1/1/2022&dateTo=12/31/2022
		Then response code should be 200
		And response body path $.metrics should be of type array with length 1
		And response body path $.metrics[?(@.year=='2022')].hierarchyValue should be 30
		#### metrics are rolled-up to /assign-to-group
		When I remove header x-groupcontextid
		And I set x-groupcontextid header to /assign-to-group
		When I GET /metrics?timeUnit=month&name=assign-to-group:kwh:household&dateFrom=1/1/2022&dateTo=12/31/2022
		Then response code should be 200
		And response body path $.metrics should be of type array with length 12
		And response body path $.metrics[?(@.month=='1')].hierarchyValue should be 1
		And response body path $.metrics[?(@.month=='2')].hierarchyValue should be 2
		And response body path $.metrics[?(@.month=='3')].hierarchyValue should be 3
		And response body path $.metrics[?(@.month=='4')].hierarchyValue should be 4
		And response body path $.metrics[?(@.month=='5')].hierarchyValue should be 5
		And response body path $.metrics[?(@.month=='6')].hierarchyValue should be 6
		And response body path $.metrics[?(@.month=='7')].hierarchyValue should be 7
		And response body path $.metrics[?(@.month=='8')].hierarchyValue should be 8
		And response body path $.metrics[?(@.month=='9')].hierarchyValue should be 9
		And response body path $.metrics[?(@.month=='10')].hierarchyValue should be 10
		And response body path $.metrics[?(@.month=='11')].hierarchyValue should be 11
		And response body path $.metrics[?(@.month=='12')].hierarchyValue should be 12
		When I GET /metrics?timeUnit=month&name=assign-to-group:kwh:total&dateFrom=1/1/2022&dateTo=12/31/2022
		Then response code should be 200
		And response body path $.metrics should be of type array with length 12
		And response body path $.metrics[?(@.month=='1')].hierarchyValue should be 1
		And response body path $.metrics[?(@.month=='2')].hierarchyValue should be 2
		And response body path $.metrics[?(@.month=='3')].hierarchyValue should be 3
		And response body path $.metrics[?(@.month=='4')].hierarchyValue should be 4
		And response body path $.metrics[?(@.month=='5')].hierarchyValue should be 5
		And response body path $.metrics[?(@.month=='6')].hierarchyValue should be 6
		And response body path $.metrics[?(@.month=='7')].hierarchyValue should be 7
		And response body path $.metrics[?(@.month=='8')].hierarchyValue should be 8
		And response body path $.metrics[?(@.month=='9')].hierarchyValue should be 9
		And response body path $.metrics[?(@.month=='10')].hierarchyValue should be 10
		And response body path $.metrics[?(@.month=='11')].hierarchyValue should be 11
		And response body path $.metrics[?(@.month=='12')].hierarchyValue should be 12
		When I GET /metrics?timeUnit=year&name=assign-to-group:kwh:household&dateFrom=1/1/2022&dateTo=12/31/2022
		Then response code should be 200
		And response body path $.metrics should be of type array with length 1
		And response body path $.metrics[?(@.year=='2022')].hierarchyValue should be 78
		When I GET /metrics?timeUnit=year&name=assign-to-group:kwh:total&dateFrom=1/1/2022&dateTo=12/31/2022
		Then response code should be 200
		And response body path $.metrics should be of type array with length 1
		And response body path $.metrics[?(@.year=='2022')].hierarchyValue should be 78

	Scenario: Pipeline Processor Inline Mode
		Given I'm using the pipelineProcessor api
		And I authenticate using email assign_to_group_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /assign-to-group
		And I set body to {"actionType":"create","mode":"inline","tags":{"testSource":"assign-to-group"},"inlineExecutionOptions":{"inputs":[{"timestamp":"2023-01-02T18:01:31.000+00:00","city":"Downtown","kwh":100},{"timestamp":"2023-02-03T17:13:54.000+00:00","city":"Downtown","kwh":200},{"timestamp":"2023-03-03T03:22:19.000+00:00","city":"Downtown","kwh":300}]}}
		When I POST to /pipelines/`pipeline_kwh_household_id`/executions
		Then response code should be 201
		# Activities are returned as part of inline execution response
		And response body path $.inlineExecutionOutputs.outputs[0][timestamp] should be 2023-01-02T18:01:31.000Z
		And response body path $.inlineExecutionOutputs.outputs[0][output_group] should be /assign-to-group/downtown
		And response body path $.inlineExecutionOutputs.outputs[0][kwh] should be 100
		And response body path $.inlineExecutionOutputs.outputs[1][timestamp] should be 2023-02-03T17:13:54.000Z
		And response body path $.inlineExecutionOutputs.outputs[1][output_group] should be /assign-to-group/downtown
		And response body path $.inlineExecutionOutputs.outputs[1][kwh] should be 200
		And response body path $.inlineExecutionOutputs.outputs[2][timestamp] should be 2023-03-03T03:22:19.000Z
		And response body path $.inlineExecutionOutputs.outputs[2][output_group] should be /assign-to-group/downtown
		And response body path $.inlineExecutionOutputs.outputs[2][kwh] should be 300
		# allow remainder of inline pipeline to complete
		Then I pause for 20000ms
		When I remove header x-groupcontextid
		And I set x-groupcontextid header to /assign-to-group/downtown
		When I GET /activities?dateFrom=1/1/23&dateTo=12/31/23&pipelineId=`pipeline_kwh_household_id`
		Then response code should be 200
		And response body path $.activities should be of type array with length 3
		And response body path $.activities[?(@.date=='2023-01-02T18:01:31.000Z')]['kwh'] should be 100
		And response body path $.activities[?(@.date=='2023-02-03T17:13:54.000Z')]['kwh'] should be 200
		And response body path $.activities[?(@.date=='2023-03-03T03:22:19.000Z')]['kwh'] should be 300
		When I GET /metrics?timeUnit=month&name=assign-to-group:kwh:household&dateFrom=1/1/2023&dateTo=12/31/2023
		Then response code should be 200
		And response body path $.metrics should be of type array with length 3
		And response body path $.metrics[?(@.month=='1')].hierarchyValue should be 100
		And response body path $.metrics[?(@.month=='2')].hierarchyValue should be 200
		And response body path $.metrics[?(@.month=='3')].hierarchyValue should be 300
		When I GET /metrics?timeUnit=month&name=assign-to-group:kwh:total&dateFrom=1/1/2023&dateTo=12/31/2023
		Then response code should be 200
		And response body path $.metrics should be of type array with length 3
		And response body path $.metrics[?(@.month=='1')].hierarchyValue should be 100
		And response body path $.metrics[?(@.month=='2')].hierarchyValue should be 200
		And response body path $.metrics[?(@.month=='3')].hierarchyValue should be 300
		When I remove header x-groupcontextid
		And I set x-groupcontextid header to /assign-to-group
		When I GET /metrics?timeUnit=year&name=assign-to-group:kwh:household&dateFrom=1/1/2023&dateTo=12/31/2023
		Then response code should be 200
		And response body path $.metrics should be of type array with length 1
		And response body path $.metrics[?(@.year=='2023')].hierarchyValue should be 600
		When I GET /metrics?timeUnit=year&name=assign-to-group:kwh:total&dateFrom=1/1/2023&dateTo=12/31/2023
		Then response code should be 200
		And response body path $.metrics should be of type array with length 1
		And response body path $.metrics[?(@.year=='2023')].hierarchyValue should be 600

	Scenario: Assign to an Invalid Group
		Given I'm using the pipelineProcessor api
		And I authenticate using email assign_to_group_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /assign-to-group
		And I set body to {"actionType":"create","mode":"inline","tags":{"testSource":"assign-to-group"},"inlineExecutionOptions":{"inputs":[{"timestamp":"2023-01-02T18:01:31.000+00:00","city":"notacityname","kwh":100}]}}
		When I POST to /pipelines/`pipeline_kwh_household_id`/executions
		Then response code should be 201
		And response body path $.status should be failed
		And response body should contain ASSIGN_TO_GROUP

	Scenario: Assign to not a Child Group of the Execution Group
		Given I'm using the pipelineProcessor api
		And I authenticate using email assign_to_group_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /assign-to-group/downtown
		And I set body to {"actionType":"create","mode":"inline","tags":{"testSource":"assign-to-group"},"inlineExecutionOptions":{"inputs":[{"timestamp":"2023-01-02T18:01:31.000+00:00","city":"anytown","kwh":5}]}}
		When I POST to /pipelines/`pipeline_kwh_household_id`/executions
		Then response code should be 201
		And response body path $.status should be failed
		And response body should contain ASSIGN_TO_GROUP

	Scenario: Create Pipeline with Pipeline Aggregation
		Given I'm using the pipelines api
		And I authenticate using email assign_to_group_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /assign-to-group
		And I set body to {"name":"Assign to Groups - Pipeline Aggregation","tags":{"testSource":"assign-to-group"},"description":"Test pipeline for Assign to Groups - Pipeline Aggregation","processorOptions":{"chunkSize":1},"connectorConfig":{"input":[{"name":"sif-csv-pipeline-input-connector"}]},"transformer":{"transforms":[{"index":0,"formula":"AS_TIMESTAMP(:timestamp, 'yyyy-MM-dd\\'T\\'HH:mm:ss.SSSXXX')","outputs":[{"description":"Time of electricity consumption","index":0,"key":"timestamp","label":"Timestamp","type":"timestamp"}]},{"index":1,"formula":"ASSIGN_TO_GROUP(CONCAT('/assign-to-group/',:city))","outputs":[{"description":"Output group for activity","index":0,"key":"outputGroup","label":"Output Group","type":"string"}]},{"index":2,"formula":":city","outputs":[{"description":"City of activity","index":0,"key":"city","label":"City","type":"string"}]},{"index":3,"formula":"AS_TIMESTAMP(:timestamp, 'yyyy-MM-dd\\'T\\'HH:mm:ss.SSSXXX', roundDownTo='month')","outputs":[{"description":"Time of electricity consumption","index":0,"key":"month","label":"Month","type":"timestamp","aggregate":"groupBy"}]},{"index":4,"formula":":kwh","outputs":[{"description":"kWh of electricity consumption in the month","index":0,"key":"kwh","label":"kWh","type":"number","aggregate":"sum"}]}],"parameters":[{"index":0,"key":"timestamp","label":"timestamp","description":"Timestamp of electicity consumption","type":"string"},{"index":1,"key":"city","label":"city","description":"City where electricity was consumed","type":"string"},{"index":2,"key":"kwh","label":"kwh","description":"kWh of electricity consumed","type":"number"}]}}
		When I POST to /pipelines
		Then response code should be 201
		And response body should contain id
		And I store the value of body path $.id as pipeline_kwh_household_pipeline_aggregation_id in global scope

	Scenario: Pipeline Aggregation Job Mode
		Given I'm using the pipelineProcessor api
		And I authenticate using email assign_to_group_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /assign-to-group
		And I set body to { "expiration" : 300}
		When I POST to /pipelines/`pipeline_kwh_household_pipeline_aggregation_id`/executions
		Then response code should be 201
		And I store the value of body path $.inputUploadUrl as pipeline_kwh_household_pipeline_aggregation_upload_url in global scope
		When I upload an input CSV file to url stored at global variable pipeline_kwh_household_pipeline_aggregation_upload_url with rows
			| timestamp							| city 			| kwh  	|
			| 2022-01-01T16:33:01.000+00:00     | Anytown 		|  1 	|
			| 2022-01-02T15:22:02.000+00:00     | Bakerberg 	|  2 	|
			| 2022-01-03T14:11:03.000+00:00     | Cityville 	|  3 	|
			| 2022-01-04T13:04:04.000+00:00     | Anytown 		|  4 	|
			| 2022-02-01T12:52:05.000+00:00     | Bakerberg 	|  5 	|
			| 2022-02-02T11:51:05.000+00:00     | Cityville 	|  6 	|
			| 2022-02-03T10:22:04.000+00:00     | Anytown 		|  7 	|
			| 2022-02-04T21:01:03.000+00:00     | Bakerberg 	|  8 	|
			| 2022-02-01T06:48:02.000+00:00     | Cityville 	|  9 	|
			| 2022-03-02T05:31:01.000+00:00     | Anytown 		| 10 	|
			| 2022-03-03T12:29:11.000+00:00     | Bakerberg 	| 11 	|
			| 2022-03-04T16:10:44.000+00:00     | Cityville 	| 12 	|
		Then I pause for 35000ms
		When I GET /pipelines/`pipeline_kwh_household_pipeline_aggregation_id`/executions
		Then response code should be 200
		And response body path $.executions should be of type array with length 1
		And the latest execution status should be success
		And I store the id of the latest execution in variable pipeline_kwh_household_pipeline_aggregation_execution_id in global scope

		## ACTIVITIES
		# no activities at /assign-to-group level
		When I remove header x-groupcontextid
		And I set x-groupcontextid header to /assign-to-group
		When I GET /activities?dateFrom=1/1/22&dateTo=12/31/22&pipelineId=`pipeline_kwh_household_pipeline_aggregation_id`
		Then response code should be 200
		And response body path $.activities should be of type array with length 0
		# should be activities at /assign-to-group/anytown level
		When I remove header x-groupcontextid
		And I set x-groupcontextid header to /assign-to-group/anytown
		When I GET /activities?dateFrom=1/1/22&dateTo=12/31/22&pipelineId=`pipeline_kwh_household_pipeline_aggregation_id`
		Then response code should be 200
		And response body path $.activities should be of type array with length 4
		And response body path $.activities[?(@.date=='2022-01-01T16:33:01.000Z')]['kwh'] should be 1
		And response body path $.activities[?(@.date=='2022-01-04T13:04:04.000Z')]['kwh'] should be 4
		And response body path $.activities[?(@.date=='2022-02-03T10:22:04.000Z')]['kwh'] should be 7
		And response body path $.activities[?(@.date=='2022-03-02T05:31:01.000Z')]['kwh'] should be 10
		# should be activities at /assign-to-group/bakerberg level
		When I remove header x-groupcontextid
		And I set x-groupcontextid header to /assign-to-group/bakerberg
		When I GET /activities?dateFrom=1/1/22&dateTo=12/31/22&pipelineId=`pipeline_kwh_household_pipeline_aggregation_id`
		Then response code should be 200
		And response body path $.activities should be of type array with length 4
		And response body path $.activities[?(@.date=='2022-01-02T15:22:02.000Z')]['kwh'] should be 2
		And response body path $.activities[?(@.date=='2022-02-01T12:52:05.000Z')]['kwh'] should be 5
		And response body path $.activities[?(@.date=='2022-02-04T21:01:03.000Z')]['kwh'] should be 8
		And response body path $.activities[?(@.date=='2022-03-03T12:29:11.000Z')]['kwh'] should be 11
		# should be activities at /assign-to-group/cityville level
		When I remove header x-groupcontextid
		And I set x-groupcontextid header to /assign-to-group/cityville
		When I GET /activities?dateFrom=1/1/22&dateTo=12/31/22&pipelineId=`pipeline_kwh_household_pipeline_aggregation_id`
		Then response code should be 200
		And response body path $.activities should be of type array with length 4
		And response body path $.activities[?(@.date=='2022-01-03T14:11:03.000Z')]['kwh'] should be 3
		And response body path $.activities[?(@.date=='2022-02-02T11:51:05.000Z')]['kwh'] should be 6
		And response body path $.activities[?(@.date=='2022-02-01T06:48:02.000Z')]['kwh'] should be 9
		And response body path $.activities[?(@.date=='2022-03-04T16:10:44.000Z')]['kwh'] should be 12
		# should be aggregate activities at /assign-to-group/anytown level
		When I remove header x-groupcontextid
		And I set x-groupcontextid header to /assign-to-group/anytown
		When I GET /activities?dateFrom=1/1/22&dateTo=12/31/22&pipelineId=`pipeline_kwh_household_pipeline_aggregation_id`&showAggregate=true
		Then response code should be 200
		And response body path $.activities should be of type array with length 3
		And response body path $.activities[?(@.date=='2022-01-01T00:00:00.000Z')]['kwh'] should be 5
		And response body path $.activities[?(@.date=='2022-02-01T00:00:00.000Z')]['kwh'] should be 7
		And response body path $.activities[?(@.date=='2022-03-01T00:00:00.000Z')]['kwh'] should be 10
		When I remove header x-groupcontextid
		# should be aggregate activities at /assign-to-group/bakerberg level
		And I set x-groupcontextid header to /assign-to-group/bakerberg
		When I GET /activities?dateFrom=1/1/22&dateTo=12/31/22&pipelineId=`pipeline_kwh_household_pipeline_aggregation_id`&showAggregate=true
		Then response code should be 200
		And response body path $.activities should be of type array with length 3
		And response body path $.activities[?(@.date=='2022-01-01T00:00:00.000Z')]['kwh'] should be 2
		And response body path $.activities[?(@.date=='2022-02-01T00:00:00.000Z')]['kwh'] should be 13
		And response body path $.activities[?(@.date=='2022-03-01T00:00:00.000Z')]['kwh'] should be 11
		When I remove header x-groupcontextid
		# should be aggregate activities at /assign-to-group/cityville level
		And I set x-groupcontextid header to /assign-to-group/cityville
		When I GET /activities?dateFrom=1/1/22&dateTo=12/31/22&pipelineId=`pipeline_kwh_household_pipeline_aggregation_id`&showAggregate=true
		Then response code should be 200
		And response body path $.activities should be of type array with length 3
		And response body path $.activities[?(@.date=='2022-01-01T00:00:00.000Z')]['kwh'] should be 3
		And response body path $.activities[?(@.date=='2022-02-01T00:00:00.000Z')]['kwh'] should be 15
		And response body path $.activities[?(@.date=='2022-03-01T00:00:00.000Z')]['kwh'] should be 12

	Scenario: Teardown: Pipelines with tag testSource:assign-to-group
	Cleans up any pipelines remaining from a previous test run associated with this test.
		Given I'm using the pipelines api
		And I authenticate using email assign_to_group_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /assign-to-group
		And no pipeline exists with tags testSource:assign-to-group

	Scenario: Teardown: Metrics with tag testSource:assignToGroup
	Cleans up any tags remaining from a previous test run associated with this test.
		Given I'm using the pipelines api
		And I authenticate using email assign_to_group_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /assign-to-group
		And no metric exists with tags testSource:assign-to-group

	Scenario: Teardown - Cleanup user and groups
		When I'm using the accessManagement api
		And group /assign-to-group has user assign_to_group_admin@amazon.com revoked
		And group /assign-to-group/anytown has been removed
		And group /assign-to-group/bakerberg has been removed
		And group /assign-to-group/cityville has been removed
		And group /assign-to-group/downtown has been removed
		And group /assign-to-group has been removed
