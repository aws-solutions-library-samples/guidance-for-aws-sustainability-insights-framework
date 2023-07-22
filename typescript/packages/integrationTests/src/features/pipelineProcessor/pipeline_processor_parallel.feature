@setup_endToEnd
Feature: Pipeline Processors API - Load Testing

	Scenario: Setup groups
	Creates 12 subgroup so that a pipelien can be processed at each.

		Given group /pipelineProcessorsParallel exists
		And group /pipelineProcessorsParallel/a exists
		And group /pipelineProcessorsParallel/a/d exists
		And group /pipelineProcessorsParallel/a/d/a exists
		And group /pipelineProcessorsParallel/a/d/b exists
		And group /pipelineProcessorsParallel/a/d/c exists
		And group /pipelineProcessorsParallel/a/e exists
		And group /pipelineProcessorsParallel/a/e/a exists
		And group /pipelineProcessorsParallel/a/e/b exists
		And group /pipelineProcessorsParallel/a/e/c exists
		And group /pipelineProcessorsParallel/b exists
		And group /pipelineProcessorsParallel/b/d exists
		And group /pipelineProcessorsParallel/b/d/a exists
		And group /pipelineProcessorsParallel/b/d/b exists
		And group /pipelineProcessorsParallel/b/d/c exists
		And group /pipelineProcessorsParallel/b/e exists
		And group /pipelineProcessorsParallel/b/e/a exists
		And group /pipelineProcessorsParallel/b/e/b exists
		And group /pipelineProcessorsParallel/b/e/c exists

		Given group /pipelineProcessorsParallel has user pipeline_processors_parallel_admin2@amazon.com with role admin and password p@ssword1

	Scenario: Teardown: Pipelines with tag testSource:pipelineProcessorsParallel
	Cleans up any pipelines remaining from a previous test run associated with this test.

		Given I'm using the pipelines api
		And I authenticate using email pipeline_processors_parallel_admin2@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /pipelineProcessorsParallel
		And no pipeline exists with tags testSource:pipelineProcessorsParallel

	Scenario: Teardown: Metrics with tag testSource:pipelineProcessorsParallel
	Cleans up any tags remaining from a previous test run associated with this test.

		Given I'm using the pipelines api
		And I authenticate using email pipeline_processors_parallel_admin2@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /pipelineProcessorsParallel
		And no metric exists with tags testSource:pipelineProcessorsParallel

	Scenario: Create multiple metrics
	Creates 20 metrics that will be contributed to by the pipeline.

		Given I'm using the pipelines api
		And I authenticate using email pipeline_processors_parallel_admin2@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /pipelineProcessorsParallel
		When I create 20 metrics with prefix pipelineProcessorsParallel and tags testSource:pipelineProcessorsParallel

	Scenario: Create pipeline
	Creates a pipeline using the metrics created above (name of metric started from, e.g pipelineProcessorsParallel1, pipelineProcessorsParallel2).

		Given I'm using the pipelines api
		And I authenticate using email pipeline_processors_parallel_admin2@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /pipelineProcessorsParallel
		And I set body to {"name":"pipelineProcessorsParallel","processorOptions":{"chunkSize":5},"connectorConfig":{"input":[{"name":"sif-csv-pipeline-input-connector"}]}, "tags": {"testSource":"pipelineProcessorsParallel"}, "transformer":{"transforms":[{"index":0,"formula":"AS_TIMESTAMP(:activitydate,'M/d/yyyy')","outputs":[{"description":"NA","index":0,"key":"timestamp","type":"timestamp","includeAsUnique":true,"metrics":[]}]},{"index":1,"formula":":filename","outputs":[{"description":"NA","index":0,"key":"filenameout","type":"string","includeAsUnique":true,"metrics":[]}]},{"index":2,"formula":":row","outputs":[{"description":"NA","index":0,"key":"rowout","type":"string","includeAsUnique":true,"metrics":[]}]},{"index":3,"formula":"5*:Qty","outputs":[{"description":"NA","index":0,"key":"transform3","type":"number","includeAsUnique":false,"metrics":[]}]},{"index":4,"formula":"IF(:Year==2021,'NA',IF(:Year==2022,'NA','lookup-dataset1-col1-col7'))","outputs":[{"description":"NA","index":0,"key":"transform4","type":"string","includeAsUnique":false,"metrics":[]}]},{"index":5,"formula":"IF(:Year==2021,'NA',IF(:Year==2022,'NA',CONCAT('USEPA_','impact_name','|','lookup-dataset1-col1-col17')))","outputs":[{"description":"NA","index":0,"key":"transform5","type":"string","includeAsUnique":false,"metrics":[]}]},{"index":6,"formula":"IF(:Year==2021,'units1',IF(:Year==2022,'units1','units2')))","outputs":[{"description":"NA","index":0,"key":"transform6","type":"string","includeAsUnique":false,"metrics":[]}]},{"index":7,"formula":"IF(:Year==2021,22,IF(:Year==2022,23,24))","outputs":[{"description":"NA","index":0,"key":"transform7","type":"number","includeAsUnique":false,"metrics":[]}]},{"index":8,"formula":"IF(:Year==2021,77,IF(:Year==2022,78,79))","outputs":[{"description":"NA","index":0,"key":"transform8","type":"number","includeAsUnique":false,"metrics":[]}]},{"index":9,"formula":"IF(:Year==2021,11,IF(:Year==2022,12,13))","outputs":[{"description":"NA","index":0,"key":"transform9","type":"number","includeAsUnique":false,"metrics":[]}]},{"index":10,"formula":"IF(:Year==2021,2,IF(:Year==2022,3,4))","outputs":[{"description":"NA","index":0,"key":"transform10","type":"number","includeAsUnique":false,"metrics":[]}]},{"index":11,"formula":"IF(:Year==2021,40,IF(:Year==2022,41,44))","outputs":[{"description":"NA","index":0,"key":"transform11","type":"number","includeAsUnique":false,"metrics":[]}]},{"index":12,"formula":"IF(:Year==2021,12,IF(:Year==2022,13,0))","outputs":[{"description":"NA","index":0,"key":"transform12","type":"number","includeAsUnique":false,"metrics":[]}]},{"index":13,"formula":"IF(:Year==2021,5,IF(:Year==2022,6,0))","outputs":[{"description":"NA","index":0,"key":"transform13","type":"number","includeAsUnique":false,"metrics":[]}]},{"index":14,"formula":"IF(:Year==2021,10,IF(:Year==2022,20,0))","outputs":[{"description":"NA","index":0,"key":"transform14","type":"number","includeAsUnique":false,"metrics":[]}]},{"index":15,"formula":"IF(:Year==2021,100,IF(:Year==2022,200,0))","outputs":[{"description":"NA","index":0,"key":"transform15","type":"number","includeAsUnique":false,"metrics":["pipelineProcessorsParallel1","pipelineProcessorsParallel2","pipelineProcessorsParallel3"]}]},{"index":16,"formula":"IF(:Year==2021,:Qty*8, IF(:Year==2022,:Qty*8,3*8))","outputs":[{"description":"NA","index":0,"key":"transform16","type":"number","includeAsUnique":false,"metrics":["pipelineProcessorsParallel4","pipelineProcessorsParallel5","pipelineProcessorsParallel6"]}]},{"index":17,"formula":"IF(:Year==2021,:Qty*9, IF(:Year==2022,:Qty*9,3*9))","outputs":[{"description":"NA","index":0,"key":"transform17","type":"number","includeAsUnique":false,"metrics":["pipelineProcessorsParallel7","pipelineProcessorsParallel19","pipelineProcessorsParallel20"]}]},{"index":18,"formula":"IF(:Year==2021,:Qty*10, IF(:Year==2022,:Qty*10,3*10))","outputs":[{"description":"NA","index":0,"key":"transform18","type":"number","includeAsUnique":false,"metrics":["pipelineProcessorsParallel10","pipelineProcessorsParallel11","pipelineProcessorsParallel12"]}]},{"index":19,"formula":"IF(:Year==2021,:Qty*11, IF(:Year==2022,:Qty*11,3*11))","outputs":[{"description":"NA","index":0,"key":"transform19","type":"number","includeAsUnique":false,"metrics":["pipelineProcessorsParallel1","pipelineProcessorsParallel13","pipelineProcessorsParallel14"]}]},{"index":20,"formula":"IF(:Year==2021,:Qty*12, IF(:Year==2022,:Qty*12,3*12))","outputs":[{"description":"NA","index":0,"key":"transform20","type":"number","includeAsUnique":false,"metrics":["pipelineProcessorsParallel4","pipelineProcessorsParallel15","pipelineProcessorsParallel16"]}]},{"index":21,"formula":"IF(:Year==2021,:Qty*13, IF(:Year==2022,:Qty*13,3*13))","outputs":[{"description":"NA","index":0,"key":"transform21","type":"number","includeAsUnique":false,"metrics":["pipelineProcessorsParallel7","pipelineProcessorsParallel8","pipelineProcessorsParallel9"]}]},{"index":22,"formula":"IF(:Year==2021,:Qty*14, IF(:Year==2022,:Qty*14,3*14))","outputs":[{"description":"NA","index":0,"key":"transform22","type":"number","includeAsUnique":false,"metrics":["pipelineProcessorsParallel10","pipelineProcessorsParallel17","pipelineProcessorsParallel18"]}]},{"index":23,"formula":"REF('transform15')+REF('transform19')","outputs":[{"description":"NA","index":0,"key":"transform23","type":"number","includeAsUnique":false,"metrics":["pipelineProcessorsParallel19"]}]}],"parameters":[{"index":0,"key":"activitydate","label":"","description":"","type":"string"},{"index":1,"key":"filename","label":"","description":"","type":"string"},{"index":2,"key":"row","label":"","description":"","type":"string"},{"index":3,"key":"Type","label":"","description":"","type":"string"},{"index":4,"key":"Qty","label":"","description":"","type":"number"},{"index":5,"key":"Unit","label":"","description":"","type":"string"},{"index":6,"key":"Year","label":"","description":"","type":"number"}]}}
		When I POST to /pipelines
		Then response code should be 201
		And I store the value of body path $.id as pipeline_id in global scope

	Scenario: Upload input to pipelines concurrently across different groups
		Given I'm using the pipelineProcessor api
		And I authenticate using email pipeline_processors_parallel_admin2@amazon.com and password p@ssword1
		# To upload using a file ( useful for 1000 rows test )
#		And I upload to pipeline `pipeline_id` across groups /pipelineProcessorsParallel/a/d/a concurrently with this file /Users/willsia/Development/sif-mock-data/large_load_test_0_1000.csv
#		And I upload to pipeline `pipeline_id` across groups /pipelineProcessorsParallel/a/d/a,/pipelineProcessorsParallel/a/d/b,/pipelineProcessorsParallel/a/d/c,/pipelineProcessorsParallel/a/e/a,/pipelineProcessorsParallel/a/e/b,/pipelineProcessorsParallel/a/e/c,/pipelineProcessorsParallel/b/d/a,/pipelineProcessorsParallel/b/d/b,/pipelineProcessorsParallel/b/d/c,/pipelineProcessorsParallel/b/e/a,/pipelineProcessorsParallel/b/e/b,/pipelineProcessorsParallel/b/e/c,/pipelineProcessorsParallel/a/d/a,/pipelineProcessorsParallel/a/d/b,/pipelineProcessorsParallel/a/d/c,/pipelineProcessorsParallel/a/e/a,/pipelineProcessorsParallel/a/e/b,/pipelineProcessorsParallel/a/e/c,/pipelineProcessorsParallel/b/d/a,/pipelineProcessorsParallel/b/d/b,/pipelineProcessorsParallel/b/d/c,/pipelineProcessorsParallel/b/e/a,/pipelineProcessorsParallel/b/e/b,/pipelineProcessorsParallel/b/e/c,/pipelineProcessorsParallel/a/d/a,/pipelineProcessorsParallel/a/d/b,/pipelineProcessorsParallel/a/d/c,/pipelineProcessorsParallel/a/e/a,/pipelineProcessorsParallel/a/e/b,/pipelineProcessorsParallel/a/e/c,/pipelineProcessorsParallel/b/d/a,/pipelineProcessorsParallel/b/d/b,/pipelineProcessorsParallel/b/d/c,/pipelineProcessorsParallel/b/e/a,/pipelineProcessorsParallel/b/e/b,/pipelineProcessorsParallel/b/e/c,/pipelineProcessorsParallel/a/d/a,/pipelineProcessorsParallel/a/d/b,/pipelineProcessorsParallel/a/d/c,/pipelineProcessorsParallel/a/e/a,/pipelineProcessorsParallel/a/e/b,/pipelineProcessorsParallel/a/e/c,/pipelineProcessorsParallel/b/d/a,/pipelineProcessorsParallel/b/d/b,/pipelineProcessorsParallel/b/d/c,/pipelineProcessorsParallel/b/e/a,/pipelineProcessorsParallel/b/e/b,/pipelineProcessorsParallel/b/e/c,/pipelineProcessorsParallel/a/d/a,/pipelineProcessorsParallel/a/d/b,/pipelineProcessorsParallel/a/d/c,/pipelineProcessorsParallel/a/e/a,/pipelineProcessorsParallel/a/e/b,/pipelineProcessorsParallel/a/e/c,/pipelineProcessorsParallel/b/d/a,/pipelineProcessorsParallel/b/d/b,/pipelineProcessorsParallel/b/d/c,/pipelineProcessorsParallel/b/e/a,/pipelineProcessorsParallel/b/e/b,/pipelineProcessorsParallel/b/e/c concurrently with this file /Users/willsia/Development/sif-mock-data/large_load_test_0_1000.csv
	  	# To upload using rows
		And I upload to pipeline `pipeline_id` across groups /pipelineProcessorsParallel/a/d/a,/pipelineProcessorsParallel/a/d/b,/pipelineProcessorsParallel/a/d/c,/pipelineProcessorsParallel/a/e/a,/pipelineProcessorsParallel/a/e/b,/pipelineProcessorsParallel/a/e/c,/pipelineProcessorsParallel/b/d/a,/pipelineProcessorsParallel/b/d/b,/pipelineProcessorsParallel/b/d/c,/pipelineProcessorsParallel/b/e/a,/pipelineProcessorsParallel/b/e/b,/pipelineProcessorsParallel/b/e/c concurrently with these rows
#		And I upload to pipeline `pipeline_id` across groups /pipelineProcessorsParallel/a/d/a concurrently with these rows
			| activitydate | filename | row   | Type        | Qty | Unit | Year |
			| 1/2/2022     | 9        | row1  | electricity | 1   | kwh  | 2021 |
			| 2/2/2022     | 9        | row2  | electricity | 1   | kwh  | 2021 |
			| 3/2/2022     | 9        | row3  | heating     | 1   | scf  | 2021 |
			| 4/2/2022     | 1        | row4  | electricity | 1   | kwh  | 2022 |
			| 5/2/2022     | 9        | row5  | electricity | 1   | kwh  | 2019 |
			| 6/2/2022     | 9        | row6  | heating     | 1   | scf  | 2021 |
			| 7/2/2022     | 2        | row7  | heating     | 1   | kwh  | 2020 |
			| 8/2/2022     | 9        | row8  | electricity | 1   | kwh  | 2021 |
			| 9/2/2022     | 3        | row9  | electricity | 1   | kwh  | 2020 |
			| 10/2/2022    | 4        | row10 | heating     | 1   | kwh  | 2021 |
			| 11/2/2022    | 9        | row11 | heating     | 1   | scf  | 2022 |
			| 12/2/2022    | 9        | row12 | heating     | 1   | kwh  | 2022 |
		Then I pause for 180000ms

	# TODO: this test needs updating to check hierarchyValue, groupValue, and colleectionValue, for the metric at each group level to ensure it has rolled up correctly
	Scenario: Query the multiple metrics which should aggregate from the multiple pipelines
		Given I'm using the pipelineProcessor api
		And I authenticate using email pipeline_processors_parallel_admin2@amazon.com and password p@ssword1

		# Group  /pipelineProcessorsParallel/a and its descendant
		And I set x-groupcontextid header to /pipelineProcessorsParallel/a/d/a
		When I GET /metrics?timeUnit=year&dateFrom=1/1/2022&name=pipelineProcessorsParallel1
		Then response code should be 200
		And response body path $.metrics[0].groupValue should be 1398
		And response body path $.metrics[0].subGroupsValue should be 0

		When I remove header x-groupcontextid
		And I set x-groupcontextid header to /pipelineProcessorsParallel/a/d
		When I GET /metrics?timeUnit=year&dateFrom=1/1/2022&name=pipelineProcessorsParallel1
		Then response code should be 200
		And response body path $.metrics[0].groupValue should be 0
		And response body path $.metrics[0].subGroupsValue should be 4194

		When I remove header x-groupcontextid
		And I set x-groupcontextid header to /pipelineProcessorsParallel/a
		When I GET /metrics?timeUnit=year&dateFrom=1/1/2022&name=pipelineProcessorsParallel1
		Then response code should be 200
		And response body path $.metrics[0].groupValue should be 0
		And response body path $.metrics[0].subGroupsValue should be 8388

		# Group  /pipelineProcessorsParallel/b and its descendant
		When I remove header x-groupcontextid
		And I set x-groupcontextid header to /pipelineProcessorsParallel/b/d/a
		When I GET /metrics?timeUnit=year&dateFrom=1/1/2022&name=pipelineProcessorsParallel1
		Then response code should be 200
		And response body path $.metrics[0].groupValue should be 1398
		And response body path $.metrics[0].subGroupsValue should be 0

		When I remove header x-groupcontextid
		And I set x-groupcontextid header to /pipelineProcessorsParallel/b/d
		When I GET /metrics?timeUnit=year&dateFrom=1/1/2022&name=pipelineProcessorsParallel1
		Then response code should be 200
		And response body path $.metrics[0].groupValue should be 0
		And response body path $.metrics[0].subGroupsValue should be 4194

		When I remove header x-groupcontextid
		And I set x-groupcontextid header to /pipelineProcessorsParallel/b
		When I GET /metrics?timeUnit=year&dateFrom=1/1/2022&name=pipelineProcessorsParallel1
		Then response code should be 200
		And response body path $.metrics[0].groupValue should be 0
		And response body path $.metrics[0].subGroupsValue should be 8388

		# Group /pipelineProcessorsParallel should aggregate results from its descendant /a and /b
		When I remove header x-groupcontextid
		And I set x-groupcontextid header to /pipelineProcessorsParallel
		When I GET /metrics?timeUnit=year&dateFrom=1/1/2022&name=pipelineProcessorsParallel1
		Then response code should be 200
		And response body path $.metrics[0].groupValue should be 0
		And response body path $.metrics[0].subGroupsValue should be 16776

	Scenario: Teardown: Revoke users
		Given group /pipelineProcessorsParallel has user pipeline_processors_parallel_admin2@amazon.com revoked

	Scenario: Teardown: Delete groups
		And group /pipelineProcessorsParallel/b/e/a has been removed
		And group /pipelineProcessorsParallel/b/e/b has been removed
		And group /pipelineProcessorsParallel/b/e/c has been removed
		And group /pipelineProcessorsParallel/b/e has been removed
		And group /pipelineProcessorsParallel/b/d/a has been removed
		And group /pipelineProcessorsParallel/b/d/b has been removed
		And group /pipelineProcessorsParallel/b/d/c has been removed
		And group /pipelineProcessorsParallel/b/d has been removed
		And group /pipelineProcessorsParallel/a/e/a has been removed
		And group /pipelineProcessorsParallel/a/e/b has been removed
		And group /pipelineProcessorsParallel/a/e/c has been removed
		And group /pipelineProcessorsParallel/a/e has been removed
		And group /pipelineProcessorsParallel/a/d/a has been removed
		And group /pipelineProcessorsParallel/a/d/b has been removed
		And group /pipelineProcessorsParallel/a/d/c has been removed
		And group /pipelineProcessorsParallel/a/d has been removed
		And group /pipelineProcessorsParallel/a has been removed
		And group /pipelineProcessorsParallel/b has been removed
		And group /pipelineProcessorsParallel has been removed
