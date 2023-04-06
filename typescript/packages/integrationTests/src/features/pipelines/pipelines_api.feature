@setup_pipelines
Feature:
	This feature tests the general usage of the pipelines api within the context of a single group.

	Scenario: Setup users
		Given group /pipelinesApiTests exists
		And group /pipelinesApiTests has user pipelinesApiTests_admin@amazon.com with role admin and password p@ssword1
		And group /pipelinesApiTests has user pipelinesApiTests_contributor@amazon.com with role contributor and password p@ssword1
		And group /pipelinesApiTests has user pipelinesApiTests_reader@amazon.com with role reader and password p@ssword1

	Scenario: Admin can create new input connector
		Given I authenticate using email pipelinesApiTests_admin@amazon.com and password p@ssword1
		And I set body to {"name":"pipeline_input_connector1","description":"input connector that will be used by pipeline","type":"input","tags":{"source":"sap"},"parameters":[{"name":"endpoint","description":"some endpoint which my connector will nee to utilize","required":true,"defaultValue":"https://..."}]}
		When I POST to /connectors
		Then response code should be 201
		And response body should contain id
		And I store the value of body path $.id as pipeline_input_connector1_id in global scope

	Scenario: Admin can create new output connector
		Given I authenticate using email pipelinesApiTests_admin@amazon.com and password p@ssword1
		And I set body to {"name":"pipeline_output_connector1","description":"input connector that will be used by pipeline","type":"output","tags":{"source":"sap"},"parameters":[{"name":"endpoint","description":"some endpoint which my connector will nee to utilize","required":true,"defaultValue":"https://..."}]}
		When I POST to /connectors
		Then response code should be 201
		And response body should contain id
		And I store the value of body path $.id as pipeline_output_connector1_id in global scope

	Scenario: Admin cannot create pipeline that specify output connector as the input connector
		Given I authenticate using email pipelinesApiTests_admin@amazon.com and password p@ssword1
		And I set body to {"name":"pipeline1_configured_with_input_connector1","connectorConfig":{"input":[{"name":"pipeline_output_connector1","parameters":{}}]},"transformer":{"transforms":[{"index":0,"formula":"AS_TIMESTAMP(:reading date,'M/d/yy')","outputs":[{"description":"Timestamp of business activity.","index":0,"key":"time","label":"Time","type":"timestamp"}]},{"index":1,"formula":":value_1","outputs":[{"index":0,"key":"sum","label":"sum","description":"copied value of value_1","type":"number"}]}],"parameters":[{"index":0,"key":"reading date","type":"string"},{"index":1,"key":"value_1","label":"value 1","description":"a value ","type":"number"}]},"tags":{"source":"sap"},"attributes":{"key1":"val","key2":"val"}}
		When I POST to /pipelines
		Then response code should be 400
		And response body path $.message should be Only connectors of type input can be specified in the input configuration section of the pipeline

	Scenario: Admin can create new pipeline that has pipeline_connector1 as the input connector
		Given I authenticate using email pipelinesApiTests_admin@amazon.com and password p@ssword1
		And I set body to {"name":"pipeline1_configured_with_input_connector1","connectorConfig":{"input":[{"name":"pipeline_input_connector1","parameters":{}}]},"transformer":{"transforms":[{"index":0,"formula":"AS_TIMESTAMP(:reading date,'M/d/yy')","outputs":[{"description":"Timestamp of business activity.","index":0,"key":"time","label":"Time","type":"timestamp"}]},{"index":1,"formula":":value_1","outputs":[{"index":0,"key":"sum","label":"sum","description":"copied value of value_1","type":"number"}]}],"parameters":[{"index":0,"key":"reading date","type":"string"},{"index":1,"key":"value_1","label":"value 1","description":"a value ","type":"number"}]},"tags":{"source":"sap"},"attributes":{"key1":"val","key2":"val"}}
		When I POST to /pipelines
		Then response code should be 201
		And response body should contain id
		And response body should contain createdAt
		And I store the value of body path $.id as pipeline1_configured_with_input_connector1_id in global scope
		And response body path $.name should be pipeline1_configured_with_input_connector1
		And response body path $.state should be enabled

	Scenario: Admin can create new metric
		Given I authenticate using email pipelinesApiTests_admin@amazon.com and password p@ssword1
		And I set body to {"name":"ghg:scope1","summary":"GHG Scope 1 direct emissions.","aggregationType":"sum","tags":{"standard":"ghg","scope":"1"}}
		When I POST to /metrics
		Then response code should be 201
		And response body should contain id
		And I store the value of body path $.id as metric_scope1_id in global scope
		And I set body to {"name":"ghg:scope1:mobile","summary":"GHG Scope 1 direct emissions from mobile combustion.","aggregationType":"sum","outputMetrics":["ghg:scope1"],"tags":{"standard":"ghg","scope":"1","category":"mobile"}}
		When I POST to /metrics
		Then response code should be 201
		And response body should contain id
		And I store the value of body path $.id as metric_scope1_mobile_id in global scope

	Scenario: Should throw error when activeAt is not set to the right date time format
		Given I authenticate using email pipelinesApiTests_admin@amazon.com and password p@ssword1
		And I set body to {"connectorConfig":{"input": [{"name": "sif-csv-pipeline-input-connector"}]},"name":"pipeline1", "activeAt": "invalidDate", "transformer":{"transforms":[{"index":0,"formula":"AS_TIMESTAMP(:reading date,'M/d/yy')","outputs":[{"description":"Timestamp of business activity.","index":0,"key":"time","label":"Time","type":"timestamp"}]},{"index":1,"formula":":value_1+:value_2","outputs":[{"index":0,"key":"sum","label":"sum","description":"sum of value one and two","type":"number", "metrics":["ghg:scope1:mobile"]}]}],"parameters":[{"index":0,"key":"reading date","type":"string"},{"index":1,"key":"value_1","label":"value 1","description":"a value ","type":"number"},{"index":2,"key":"value_2","label":"value 2","description":"a value ","type":"number"}]},"tags":{"source":"sap"},"attributes":{"key1":"val","key2":"val"},"processorOptions":{"chunkSize":1}}
		When I POST to /pipelines
		Then response code should be 400
		And response body path $.message should be body/activeAt must match format "date-time"

	Scenario: Admin can create new pipeline with configuration that aggregates to the pipeline output
		Given I authenticate using email pipelinesApiTests_admin@amazon.com and password p@ssword1
		And I set body to {"connectorConfig":{"input": [{"name": "sif-csv-pipeline-input-connector"}]},"name":"aggregated_pipeline" , "transformer":{"transforms":[{"index":0,"formula":"AS_TIMESTAMP(:reading date,'M/d/yy')","outputs":[{"description":"Timestamp of business activity.","index":0,"key":"time","label":"Time","type":"timestamp", "aggregate": "groupBy"}]},{"index":1,"formula":":value_1+:value_2","outputs":[{"index":0,"key":"sum","label":"sum","description":"sum of value one and two","type":"number", "aggregate": "sum"}]}],"parameters":[{"index":0,"key":"reading date","type":"string"},{"index":1,"key":"value_1","label":"value 1","description":"a value ","type":"number"},{"index":2,"key":"value_2","label":"value 2","description":"a value ","type":"number"}]},"tags":{"source":"sap"},"attributes":{"key1":"val","key2":"val"}}
		When I POST to /pipelines
		Then response code should be 201
		And response body should contain id
		And response body should contain createdAt
		And I store the value of body path $.id as aggregated_pipeline_id in global scope
		And response body path $.name should be aggregated_pipeline
		And response body path $.state should be enabled
		And response body path $.version should be 1
		And response body path $.groups[0] should be /pipelinesapitests
		And response body path $.transformer.transforms should be of type array with length 2
		And response body path $.transformer.transforms[1].index should be 1
		And response body path $.transformer.transforms[1].outputs should be of type array with length 1
		And response body path $.transformer.transforms[1].outputs[0].index should be 0
		And response body path $.transformer.transforms[1].outputs[0].key should be sum
		And response body path $.transformer.transforms[1].outputs[0].aggregate should be sum
		And response body path $.transformer.transforms[1].outputs[0].label should be sum
		And response body path $.transformer.transforms[1].outputs[0].description should be sum of value one and two
		And response body path $.transformer.transforms[1].outputs[0].type should be number
		And response body path $.transformer.parameters should be of type array with length 3
		And response body path $.transformer.parameters[1].index should be 1
		And response body path $.transformer.parameters[1].key should be value_1
		And response body path $.transformer.parameters[1].label should be value 1
		And response body path $.transformer.parameters[1].description should be a value
		And response body path $.transformer.parameters[1].type should be number
		And response body path $.tags.source should be sap
		And response body path $.attributes.key1 should be val
		And response body path $.attributes.key2 should be val
		And response body path $.createdBy should be pipelinesapitests_admin@amazon.com

	Scenario: Admin cannot create pipeline that contains multiple timestamp fields to be aggregated
		Given I authenticate using email pipelinesApiTests_admin@amazon.com and password p@ssword1
		And I set body to {"connectorConfig":{"input": [{"name": "sif-csv-pipeline-input-connector"}]},"name":"multiple_aggregate_timestamp_pipeline","transformer":{"transforms":[{"index":0,"formula":"AS_TIMESTAMP(:reading date,'M/d/yy')","outputs":[{"description":"Timestamp of business activity.","index":0,"key":"time","label":"Time","type":"timestamp","aggregate":"groupBy"}]},{"index":1,"formula":":value_1+:value_2","outputs":[{"index":0,"key":"sum","label":"sum","description":"sum of value one and two","type":"number","aggregate":"sum"}]},{"index":2,"formula":"AS_TIMESTAMP(:reading date,'M/d/yy',roundDownTo='month')","outputs":[{"description":"Duplicate time field.","index":0,"key":"duplicate_time","label":"Time","type":"timestamp","aggregate":"groupBy"}]}],"parameters":[{"index":0,"key":"reading date","type":"string"},{"index":1,"key":"value_1","label":"value 1","description":"a value ","type":"number"},{"index":2,"key":"value_2","label":"value 2","description":"a value ","type":"number"}]},"tags":{"source":"sap"},"attributes":{"key1":"val","key2":"val"}}
		When I POST to /pipelines
		Then response code should be 400
		And response body path $.message should be Only 1 timestamp field can be aggregated, the field will be used as date field for the aggregated output.

	Scenario: Admin cannot create pipeline that aggregates non number field using aggregation function other than groupBy
		Given I authenticate using email pipelinesApiTests_admin@amazon.com and password p@ssword1
		And I set body to {"connectorConfig":{"input": [{"name": "sif-csv-pipeline-input-connector"}]},"name":"invalid_string_field_pipeline","transformer":{"transforms":[{"index":0,"formula":"AS_TIMESTAMP(:reading date,'M/d/yy')","outputs":[{"description":"Timestamp of business activity.","index":0,"key":"time","label":"Time","type":"timestamp","aggregate":"groupBy"}]},{"index":1,"formula":":value_1+:value_2","outputs":[{"index":0,"key":"sum","label":"sum","description":"sum of value one and two","type":"number","aggregate":"sum"}]},{"index":2,"formula":":value_3","outputs":[{"description":"String field cannot be aggregated using function other than groupBy.","index":0,"key":"invalid_field","label":"Invalid Field","type":"string","aggregate":"mean"}]}],"parameters":[{"index":0,"key":"reading date","type":"string"},{"index":1,"key":"value_1","label":"value 1","description":"a value ","type":"number"},{"index":2,"key":"value_2","label":"value 2","description":"a value ","type":"number"},{"index":3,"key":"value_3","label":"value 3","description":"a string value ","type":"string"}]},"tags":{"source":"sap"},"attributes":{"key1":"val","key2":"val"}}
		When I POST to /pipelines
		Then response code should be 400
		And response body path $.message should be Only fields with number type can be aggregated using aggregation functions other than groupBy.

	Scenario: Admin can create new pipeline that output to ghg:scope1:mobile metric
		Given I authenticate using email pipelinesApiTests_admin@amazon.com and password p@ssword1
		And I set body to {"connectorConfig":{"input": [{"name": "sif-csv-pipeline-input-connector"}]},"name":"pipeline1", "activeAt": "2023-02-21T14:48:00.000Z", "transformer":{"transforms":[{"index":0,"formula":"AS_TIMESTAMP(:reading date,'M/d/yy')","outputs":[{"description":"Timestamp of business activity.","index":0,"key":"time","label":"Time","type":"timestamp"}]},{"index":1,"formula":":value_1+:value_2","outputs":[{"index":0,"key":"sum","label":"sum","description":"sum of value one and two","type":"number", "metrics":["ghg:scope1:mobile"]}]}],"parameters":[{"index":0,"key":"reading date","type":"string"},{"index":1,"key":"value_1","label":"value 1","description":"a value ","type":"number"},{"index":2,"key":"value_2","label":"value 2","description":"a value ","type":"number"}]},"tags":{"source":"sap"},"attributes":{"key1":"val","key2":"val"},"processorOptions":{"chunkSize":1}}
		When I POST to /pipelines
		Then response code should be 201
		And response body should contain id
		And response body should contain createdAt
		And I store the value of body path $.id as pipeline1_pipeline_id in global scope
		And I store the value of body path $.createdAt as pipeline1_pipeline_createdAt in global scope
		And response body path $.name should be pipeline1
		And response body path $.state should be enabled
		And response body path $.version should be 1
		And response body path $.groups[0] should be /pipelinesapitests
		And response body path $.transformer.transforms should be of type array with length 2
		And response body path $.transformer.transforms[1].index should be 1
		And response body path $.transformer.transforms[1].outputs should be of type array with length 1
		And response body path $.transformer.transforms[1].outputs[0].index should be 0
		And response body path $.transformer.transforms[1].outputs[0].key should be sum
		And response body path $.transformer.transforms[1].outputs[0].metrics[0] should be ghg:scope1:mobile
		And response body path $.transformer.transforms[1].outputs[0].label should be sum
		And response body path $.transformer.transforms[1].outputs[0].description should be sum of value one and two
		And response body path $.transformer.transforms[1].outputs[0].type should be number
		And response body path $.transformer.parameters should be of type array with length 3
		And response body path $.transformer.parameters[1].index should be 1
		And response body path $.transformer.parameters[1].key should be value_1
		And response body path $.transformer.parameters[1].label should be value 1
		And response body path $.transformer.parameters[1].description should be a value
		And response body path $.transformer.parameters[1].type should be number
		And response body path $.tags.source should be sap
		And response body path $.attributes.key1 should be val
		And response body path $.attributes.key2 should be val
		And response body path $.processorOptions.chunkSize should be 1
		And response body path $.createdBy should be pipelinesapitests_admin@amazon.com

	Scenario: Admin can dry run a calculation before updating
		Given I authenticate using email pipelinesApiTests_admin@amazon.com and password p@ssword1
		And I set body to {"dryRunOptions":{"data":[{"reading date":"1/1/22","value_1":"10","value_2":"10"}]}}
		When I PATCH /pipelines/`pipeline1_pipeline_id`?dryRun=true
		Then response code should be 200
		And response body should contain headers
		And response body should contain data
		And response body path $.headers[0] should be time
		And response body path $.headers[1] should be sum
		And response body path $.data[0] should be {"time":1640995200000,"sum":20}

	Scenario: Admin cannot create new pipeline with metric that had been setup with other metric as an input
		Given I authenticate using email pipelinesApiTests_admin@amazon.com and password p@ssword1
		And I set body to {"connectorConfig":{"input": [{"name": "sif-csv-pipeline-input-connector"}]},"name":"pipeline_metric_not_allowed","transformer":{"transforms":[{"index":0,"formula":"AS_TIMESTAMP(:reading date,'M/d/yy')","outputs":[{"description":"Timestamp of business activity.","index":0,"key":"time","label":"Time","type":"timestamp"}]},{"index":1,"formula":"#VEHCILE_EMISSIONS('vehicle_type', IN(:pin24))","outputs":[{"index":0,"key":"vehicle","label":"Vehicle","description":"some description about pin24","type":"number","metrics":["ghg:scope1"]}]}],"parameters":[{"index":0,"key":"reading date","type":"string"},{"index":1,"key":"pin24","label":"pin 24","description":"some description about pin24","type":"string"}]},"tags":{"source":"sap"},"attributes":{"key1":"val","key2":"val"},"processorOptions":{"chunkSize":1}}
		When I POST to /pipelines
		Then response code should be 400
		And response body path $.message should be These output metrics \[ghg\:scope1\] has metric as an input

	Scenario: Admin cannot create metric other than the sum type
		Given I authenticate using email pipelinesApiTests_admin@amazon.com and password p@ssword1
		And I set body to {"name":"ghg:invalid:aggregation","summary":"GHG Scope 1 direct emissions.","aggregationType":"min","tags":{"standard":"ghg","scope":"1"}}
		When I POST to /metrics
		Then response code should be 501
		And response body path $.message should be Only sum aggregation type is supported for now.
		And I set body to {"name":"ghg:invalid:aggregation","summary":"GHG Scope 1 direct emissions.","aggregationType":"max","tags":{"standard":"ghg","scope":"1"}}
		When I POST to /metrics
		Then response code should be 501
		And response body path $.message should be Only sum aggregation type is supported for now.
		And I set body to {"name":"ghg:invalid:aggregation","summary":"GHG Scope 1 direct emissions.","aggregationType":"count","tags":{"standard":"ghg","scope":"1"}}
		When I POST to /metrics
		Then response code should be 501
		And response body path $.message should be Only sum aggregation type is supported for now.
		And I set body to {"name":"ghg:invalid:aggregation","summary":"GHG Scope 1 direct emissions.","aggregationType":"mean","tags":{"standard":"ghg","scope":"1"}}
		When I POST to /metrics
		Then response code should be 501
		And response body path $.message should be Only sum aggregation type is supported for now.

	Scenario: Contributor can create new pipeline
		Given I authenticate using email pipelinesApiTests_contributor@amazon.com and password p@ssword1
		And I set body to {"connectorConfig":{"input": [{"name": "sif-csv-pipeline-input-connector"}]},"name":"contr_allowed","transformer":{"transforms":[{"index":0,"formula":"AS_TIMESTAMP(:reading date,'M/d/yy')","outputs":[{"description":"Timestamp of business activity.","index":0,"key":"time","label":"Time","type":"timestamp"}]},{"index":1,"formula":"#VEHCILE_EMISSIONS('vehicle_type', IN(:pin24))","outputs":[{"index":0,"key":"vehicle","label":"Vehicle","description":"some description about pin24","type":"number"}]}],"parameters":[{"index":0,"key":"reading date","type":"string"},{"index":1,"key":"pin24","label":"pin 24","description":"some description about pin24","type":"string"}]},"tags":{"source":"sap"},"attributes":{"key1":"val","key2":"val"},"processorOptions":{"chunkSize":1}}
		When I POST to /pipelines
		Then response code should be 201
		And I store the value of body path $.id as contr_pipeline_id in global scope

	Scenario: Reader cannot create new pipeline
		Given I authenticate using email pipelinesApiTests_reader@amazon.com and password p@ssword1
		And I set body to {"connectorConfig":{"input": [{"name": "sif-csv-pipeline-input-connector"}]},"name":"reader_not_allowed","transformer":{"transforms":[{"index":0,"formula":"AS_TIMESTAMP(:reading date,'M/d/yy')","outputs":[{"description":"Timestamp of business activity.","index":0,"key":"time","label":"Time","type":"timestamp"}]},{"index":1,"formula":"#VEHCILE_EMISSIONS('vehicle_type', IN(:pin24))","outputs":[{"index":0,"key":"vehicle","label":"Vehicle","description":"some description about pin24","type":"number"}]}],"parameters":[{"index":0,"key":"reading date","type":"string"},{"index":1,"key":"pin24","label":"pin 24","description":"some description about pin24","type":"string"}]},"tags":{"source":"sap"},"attributes":{"key1":"val","key2":"val"},"processorOptions":{"chunkSize":1}}
		When I POST to /pipelines
		Then response code should be 403

	Scenario: Admin can create a new version of a pipeline
		Given I authenticate using email pipelinesApiTests_admin@amazon.com and password p@ssword1
		And I set body to {"description":"the description is updated", "activeAt": "2023-02-21T15:48:00.000Z", "attributes": {"key3":"val","key1": null}, "processorOptions":{"chunkSize": 2}}
		When I PATCH /pipelines/`pipeline1_pipeline_id`
		And response body path $.name should be pipeline1
		And response body path $.state should be enabled
		And response body path $.version should be 2
		And response body path $.groups[0] should be /pipelinesapitests
		And response body path $.transformer.transforms should be of type array with length 2
		And response body path $.transformer.transforms[1].index should be 1
		And response body path $.transformer.transforms[1].outputs should be of type array with length 1
		And response body path $.transformer.transforms[1].outputs[0].index should be 0
		And response body path $.transformer.transforms[1].outputs[0].key should be sum
		And response body path $.transformer.transforms[1].outputs[0].label should be sum
		And response body path $.transformer.transforms[1].outputs[0].description should be sum of value one and two
		And response body path $.transformer.transforms[1].outputs[0].type should be number
		And response body path $.transformer.parameters should be of type array with length 3
		And response body path $.transformer.parameters[1].index should be 1
		And response body path $.transformer.parameters[1].key should be value_1
		And response body path $.transformer.parameters[1].label should be value 1
		And response body path $.transformer.parameters[1].description should be a value
		And response body path $.transformer.parameters[1].type should be number
		And response body path $.tags.source should be sap
		And response body path $.attributes.key1 should be null
		And response body path $.attributes.key3 should be val
		And response body path $.attributes.key2 should be val
		And response body path $.processorOptions.chunkSize should be 2
		And response body should contain createdAt
		And response body path $.createdBy should be pipelinesapitests_admin@amazon.com
		And response body should contain updatedAt
		And I store the value of body path $.updatedAt as pipeline1_pipeline_updatedAt in global scope

	Scenario: Admin can list all versions of a pipeline
		Given I authenticate using email pipelinesApiTests_admin@amazon.com and password p@ssword1
		When I GET /pipelines/`pipeline1_pipeline_id`/versions
		Then response code should be 200
		And response body path $.pipelines.length should be 2
		# Original Pipeline
		And response body path $.pipelines[?(@.version==1)].id should be `pipeline1_pipeline_id`
		And response body path $.pipelines[?(@.version==1)].name should be pipeline1
		And response body path $.pipelines[?(@.version==1)].state should be enabled
		And response body path $.pipelines[?(@.version==1)].version should be 1
		And response body path $.pipelines[?(@.version==1)].groups[0] should be /pipelinesapitests
		And response body path $.pipelines[?(@.version==1)].transformer.transforms should be of type array with length 2
		And response body path $.pipelines[?(@.version==1)].transformer.transforms[1].index should be 1
		And response body path $.pipelines[?(@.version==1)].transformer.transforms[1].outputs should be of type array with length 1
		And response body path $.pipelines[?(@.version==1)].transformer.transforms[1].outputs[0].index should be 0
		And response body path $.pipelines[?(@.version==1)].transformer.transforms[1].outputs[0].key should be sum
		And response body path $.pipelines[?(@.version==1)].transformer.transforms[1].outputs[0].label should be sum
		And response body path $.pipelines[?(@.version==1)].transformer.transforms[1].outputs[0].description should be sum of value one and two
		And response body path $.pipelines[?(@.version==1)].transformer.transforms[1].outputs[0].type should be number
		And response body path $.pipelines[?(@.version==1)].transformer.parameters should be of type array with length 3
		And response body path $.pipelines[?(@.version==1)].transformer.parameters[1].index should be 1
		And response body path $.pipelines[?(@.version==1)].transformer.parameters[1].key should be value_1
		And response body path $.pipelines[?(@.version==1)].transformer.parameters[1].label should be value 1
		And response body path $.pipelines[?(@.version==1)].transformer.parameters[1].description should be a value
		And response body path $.pipelines[?(@.version==1)].transformer.parameters[1].type should be number
		And response body path $.pipelines[?(@.version==1)].tags.source should be sap
		And response body path $.pipelines[?(@.version==1)].attributes.key1 should be val
		And response body path $.pipelines[?(@.version==1)].attributes.key2 should be val
		And response body path $.pipelines[?(@.version==1)].processorOptions.chunkSize should be 1
		And response body path $.pipelines[?(@.version==1)].createdBy should be pipelinesapitests_admin@amazon.com
		And response body path $.pipelines[?(@.version==1)].createdAt should be `pipeline1_pipeline_createdAt`
		# Updated pipeline
		And response body path $.pipelines[?(@.version==2)].id should be `pipeline1_pipeline_id`
		And response body path $.pipelines[?(@.version==2)].name should be pipeline1
		And response body path $.pipelines[?(@.version==2)].state should be enabled
		And response body path $.pipelines[?(@.version==2)].version should be 2
		And response body path $.pipelines[?(@.version==2)].groups[0] should be /pipelinesapitests
		And response body path $.pipelines[?(@.version==2)].transformer.transforms should be of type array with length 2
		And response body path $.pipelines[?(@.version==2)].transformer.transforms[1].index should be 1
		And response body path $.pipelines[?(@.version==2)].transformer.transforms[1].outputs should be of type array with length 1
		And response body path $.pipelines[?(@.version==2)].transformer.transforms[1].outputs[0].index should be 0
		And response body path $.pipelines[?(@.version==2)].transformer.transforms[1].outputs[0].key should be sum
		And response body path $.pipelines[?(@.version==2)].transformer.transforms[1].outputs[0].label should be sum
		And response body path $.pipelines[?(@.version==2)].transformer.transforms[1].outputs[0].description should be sum of value one and two
		And response body path $.pipelines[?(@.version==2)].transformer.transforms[1].outputs[0].type should be number
		And response body path $.pipelines[?(@.version==2)].transformer.parameters should be of type array with length 3
		And response body path $.pipelines[?(@.version==2)].transformer.parameters[1].index should be 1
		And response body path $.pipelines[?(@.version==2)].transformer.parameters[1].key should be value_1
		And response body path $.pipelines[?(@.version==2)].transformer.parameters[1].label should be value 1
		And response body path $.pipelines[?(@.version==2)].transformer.parameters[1].description should be a value
		And response body path $.pipelines[?(@.version==2)].transformer.parameters[1].type should be number
		And response body path $.pipelines[?(@.version==2)].tags.source should be sap
		And response body path $.pipelines[?(@.version==2)].attributes.key1 should be null
		And response body path $.pipelines[?(@.version==2)].attributes.key2 should be val
		And response body path $.pipelines[?(@.version==2)].attributes.key3 should be val
		And response body path $.pipelines[?(@.version==2)].processorOptions.chunkSize should be 2
		And response body path $.pipelines[?(@.version==2)].createdBy should be pipelinesapitests_admin@amazon.com
		And response body path $.pipelines[?(@.version==2)].createdAt should be `pipeline1_pipeline_createdAt`
		And response body path $.pipelines[?(@.version==2)].updatedBy should be pipelinesapitests_admin@amazon.com
		And response body path $.pipelines[?(@.version==2)].updatedAt should be `pipeline1_pipeline_updatedAt`

	Scenario: Should be able to list pipeline versions based on activation date
		Given I authenticate using email pipelinesApiTests_admin@amazon.com and password p@ssword1
		# should throw error if both versionAsAt and count/fromVersion are specified
		When I GET /pipelines/`pipeline1_pipeline_id`/versions?versionAsAt=2023-02-21T14:48:00.000Z&count=2
		Then response code should be 400
		And response body path $.message should be request can only contain versionAsAt or count/fromVersion query parameter, but not both
		When I GET /pipelines/`pipeline1_pipeline_id`/versions?versionAsAt=2023-02-21T14:48:00.000Z
		Then response code should be 200
		And response body path $.pipelines should be of type array with length 1
		And response body path $.pipelines[0].groups[0] should be /pipelinesapitests
		And response body path $.pipelines[0].name should be pipeline1
		And response body path $.pipelines[0].version should be 1
		When I GET /pipelines/`pipeline1_pipeline_id`/versions?versionAsAt=2023-02-21T15:48:00.000Z
		Then response code should be 200
		And response body path $.pipelines should be of type array with length 1
		And response body path $.pipelines[0].groups[0] should be /pipelinesapitests
		And response body path $.pipelines[0].name should be pipeline1
		And response body path $.pipelines[0].version should be 2

	Scenario: Contributor can list all versions of a pipeline
		Given I authenticate using email pipelinesApiTests_contributor@amazon.com and password p@ssword1
		When I GET /pipelines/`pipeline1_pipeline_id`/versions
		Then response code should be 200
		And response body path $.pipelines.length should be 2

	Scenario: Reader can list all versions of a pipeline
		Given I authenticate using email pipelinesApiTests_reader@amazon.com and password p@ssword1
		When I GET /pipelines/`pipeline1_pipeline_id`/versions
		Then response code should be 200
		And response body path $.pipelines.length should be 2

	Scenario: Admin can get latest version of a pipeline
		Given I authenticate using email pipelinesApiTests_admin@amazon.com and password p@ssword1
		When I GET /pipelines/`pipeline1_pipeline_id`
		Then response code should be 200
		And response body path $.id should be `pipeline1_pipeline_id`
		And response body path $.name should be pipeline1
		And response body path $.state should be enabled
		And response body path $.version should be 2
		And response body path $.groups[0] should be /pipelinesapitests
		And response body path $.transformer.transforms should be of type array with length 2
		And response body path $.transformer.transforms[1].index should be 1
		And response body path $.transformer.transforms[1].outputs should be of type array with length 1
		And response body path $.transformer.transforms[1].outputs[0].index should be 0
		And response body path $.transformer.transforms[1].outputs[0].key should be sum
		And response body path $.transformer.transforms[1].outputs[0].label should be sum
		And response body path $.transformer.transforms[1].outputs[0].description should be sum of value one and two
		And response body path $.transformer.transforms[1].outputs[0].type should be number
		And response body path $.transformer.parameters should be of type array with length 3
		And response body path $.transformer.parameters[1].index should be 1
		And response body path $.transformer.parameters[1].key should be value_1
		And response body path $.transformer.parameters[1].label should be value 1
		And response body path $.transformer.parameters[1].description should be a value
		And response body path $.transformer.parameters[1].type should be number
		And response body path $.tags.source should be sap
		And response body path $.attributes.key1 should be null
		And response body path $.attributes.key3 should be val
		And response body path $.attributes.key2 should be val
		And response body path $.processorOptions.chunkSize should be 2
		And response body path $.createdAt should be `pipeline1_pipeline_createdAt`
		And response body path $.createdBy should be pipelinesapitests_admin@amazon.com
		And response body path $.updatedAt should be `pipeline1_pipeline_updatedAt`

	Scenario: Contributor can get latest version of a pipeline
		Given I authenticate using email pipelinesApiTests_contributor@amazon.com and password p@ssword1
		When I GET /pipelines/`pipeline1_pipeline_id`
		Then response code should be 200
		And response body path $.id should be `pipeline1_pipeline_id`
		And response body path $.name should be pipeline1
		And response body path $.version should be 2

	Scenario: Reader can get latest version of a pipeline
		Given I authenticate using email pipelinesApiTests_reader@amazon.com and password p@ssword1
		When I GET /pipelines/`pipeline1_pipeline_id`
		Then response code should be 200
		And response body path $.id should be `pipeline1_pipeline_id`
		And response body path $.name should be pipeline1
		And response body path $.version should be 2

	Scenario: Admin can get specific version of a pipeline
		Given I authenticate using email pipelinesApiTests_admin@amazon.com and password p@ssword1
		When I GET /pipelines/`pipeline1_pipeline_id`/versions/1
		Then response code should be 200
		And response body path $.id should be `pipeline1_pipeline_id`
		And response body path $.name should be pipeline1
		And response body path $.state should be enabled
		And response body path $.version should be 1
		And response body path $.groups[0] should be /pipelinesapitests
		And response body path $.transformer.transforms should be of type array with length 2
		And response body path $.transformer.transforms[1].index should be 1
		And response body path $.transformer.transforms[1].outputs should be of type array with length 1
		And response body path $.transformer.transforms[1].outputs[0].index should be 0
		And response body path $.transformer.transforms[1].outputs[0].key should be sum
		And response body path $.transformer.transforms[1].outputs[0].label should be sum
		And response body path $.transformer.transforms[1].outputs[0].description should be sum of value one and two
		And response body path $.transformer.transforms[1].outputs[0].type should be number
		And response body path $.transformer.parameters should be of type array with length 3
		And response body path $.transformer.parameters[1].index should be 1
		And response body path $.transformer.parameters[1].key should be value_1
		And response body path $.transformer.parameters[1].label should be value 1
		And response body path $.transformer.parameters[1].description should be a value
		And response body path $.transformer.parameters[1].type should be number
		And response body path $.tags.source should be sap
		And response body path $.attributes.key1 should be val
		And response body path $.attributes.key2 should be val
		And response body path $.processorOptions.chunkSize should be 1
		And response body path $.createdBy should be pipelinesapitests_admin@amazon.com
		And response body path $.createdAt should be `pipeline1_pipeline_createdAt`

	Scenario: Contributor can get specific version of a pipeline
		Given I authenticate using email pipelinesApiTests_contributor@amazon.com and password p@ssword1
		When I GET /pipelines/`pipeline1_pipeline_id`/versions/1
		Then response code should be 200
		And response body path $.id should be `pipeline1_pipeline_id`
		And response body path $.name should be pipeline1
		And response body path $.version should be 1

	Scenario: Reader can get specific version of a pipeline
		Given I authenticate using email pipelinesApiTests_reader@amazon.com and password p@ssword1
		When I GET /pipelines/`pipeline1_pipeline_id`/versions/1
		Then response code should be 200
		And response body path $.id should be `pipeline1_pipeline_id`
		And response body path $.name should be pipeline1
		And response body path $.version should be 1

	Scenario: Setup: Admin can create another pipeline (to help test list api)
		Given I authenticate using email pipelinesApiTests_admin@amazon.com and password p@ssword1
		And I set body to {"connectorConfig":{"input": [{"name": "sif-csv-pipeline-input-connector"}]},"name":"pipeline2","transformer":{"transforms":[{"index":0,"formula":"AS_TIMESTAMP(:reading date,'M/d/yy')","outputs":[{"description":"Timestamp of business activity.","index":0,"key":"time","label":"Time","type":"timestamp"}]},{"index":1,"formula":"#VEHCILE_EMISSIONS('vehicle_type', IN(:pin24))","outputs":[{"index":0,"key":"vehicle","label":"Vehicle","description":"some description about pin24","type":"number"}]}],"parameters":[{"index": 0,"key":"reading date","type":"string"},{"index":1,"key":"pin24","label":"pin 24","description":"some description about pin24","type":"string"}]},"tags":{"source":"sap","category":"A"},"attributes":{"key":"val"}}
		When I POST to /pipelines
		Then response code should be 201
		And response body should contain id
		And response body path $.name should be pipeline2
		And response body path $.version should be 1
		And response body path $.createdBy should be pipelinesapitests_admin@amazon.com
		And response body should contain createdAt
		And I store the value of body path $.id as pipeline2_pipeline_id in global scope

	Scenario: Admin can find pipeline by name
		Given I authenticate using email pipelinesApiTests_admin@amazon.com and password p@ssword1
		When I GET /pipelines?name=pipeline1
		Then response code should be 200
		And response body path $.pipelines.length should be 1
		And response body path $.pipelines[?(@.version==2)].id should be `pipeline1_pipeline_id`
		And response body path $.pipelines[?(@.version==2)].name should be pipeline1
		And response body path $.pipelines[?(@.version==2)].state should be enabled
		And response body path $.pipelines[?(@.version==2)].version should be 2
		And response body path $.pipelines[?(@.version==2)].groups[0] should be /pipelinesapitests
		And response body path $.pipelines[?(@.version==2)].transformer.transforms should be of type array with length 2
		And response body path $.pipelines[?(@.version==2)].transformer.transforms[1].index should be 1
		And response body path $.pipelines[?(@.version==2)].transformer.transforms[1].outputs should be of type array with length 1
		And response body path $.pipelines[?(@.version==2)].transformer.transforms[1].outputs[0].index should be 0
		And response body path $.pipelines[?(@.version==2)].transformer.transforms[1].outputs[0].key should be sum
		And response body path $.pipelines[?(@.version==2)].transformer.transforms[1].outputs[0].label should be sum
		And response body path $.pipelines[?(@.version==2)].transformer.transforms[1].outputs[0].description should be sum of value one and two
		And response body path $.pipelines[?(@.version==2)].transformer.transforms[1].outputs[0].type should be number
		And response body path $.pipelines[?(@.version==2)].transformer.parameters should be of type array with length 3
		And response body path $.pipelines[?(@.version==2)].transformer.parameters[1].index should be 1
		And response body path $.pipelines[?(@.version==2)].transformer.parameters[1].key should be value_1
		And response body path $.pipelines[?(@.version==2)].transformer.parameters[1].label should be value 1
		And response body path $.pipelines[?(@.version==2)].transformer.parameters[1].description should be a value
		And response body path $.pipelines[?(@.version==2)].transformer.parameters[1].type should be number
		And response body path $.pipelines[?(@.version==2)].tags.source should be sap
		And response body path $.pipelines[?(@.version==2)].attributes.key1 should be null
		And response body path $.pipelines[?(@.version==2)].attributes.key2 should be val
		And response body path $.pipelines[?(@.version==2)].attributes.key3 should be val
		And response body path $.pipelines[?(@.version==2)].processorOptions.chunkSize should be 2
		And response body path $.pipelines[?(@.version==2)].createdBy should be pipelinesapitests_admin@amazon.com
		And response body path $.pipelines[?(@.version==2)].createdAt should be `pipeline1_pipeline_createdAt`
		And response body path $.pipelines[?(@.version==2)].updatedBy should be pipelinesapitests_admin@amazon.com
		And response body path $.pipelines[?(@.version==2)].updatedAt should be `pipeline1_pipeline_updatedAt`

	Scenario: Contributor can find pipeline by name
		Given I authenticate using email pipelinesApiTests_contributor@amazon.com and password p@ssword1
		When I GET /pipelines?name=pipeline1
		Then response code should be 200
		And response body path $.pipelines.length should be 1
		And response body path $.pipelines[?(@.version==2)].id should be `pipeline1_pipeline_id`
		And response body path $.pipelines[?(@.version==2)].name should be pipeline1

	Scenario: Reader can find pipeline by name
		Given I authenticate using email pipelinesApiTests_reader@amazon.com and password p@ssword1
		When I GET /pipelines?name=pipeline1
		Then response code should be 200
		And response body path $.pipelines.length should be 1
		And response body path $.pipelines[?(@.version==2)].id should be `pipeline1_pipeline_id`
		And response body path $.pipelines[?(@.version==2)].name should be pipeline1

	Scenario: Updating state to dsiabled should override all versions
		When I pause for 1000ms
		Given I authenticate using email pipelinesApiTests_admin@amazon.com and password p@ssword1
		And I set body to {"state":"disabled"}
		When I PATCH /pipelines/`pipeline1_pipeline_id`
		Then response code should be 200
		And response body path $.state should be disabled
		And response body path $.version should be 3
		When I GET /pipelines/`pipeline1_pipeline_id`/versions/1
		Then response code should be 200
		And response body path $.state should be disabled
		And response body path $.version should be 1

	Scenario: Updating state to frozen should override all versions
		When I pause for 1000ms
		Given I authenticate using email pipelinesApiTests_admin@amazon.com and password p@ssword1
		And I set body to {"state":"frozen"}
		When I PATCH /pipelines/`pipeline1_pipeline_id`
		Then response code should be 200
		And response body path $.state should be frozen
		And response body path $.version should be 4
		When I GET /pipelines/`pipeline1_pipeline_id`/versions/1
		Then response code should be 200
		And response body path $.state should be frozen
		And response body path $.version should be 1

	Scenario: Reader cannot delete a pipeline
		Given I authenticate using email pipelinesApiTests_reader@amazon.com and password p@ssword1
		When I remove header Content-Type
		And I DELETE /pipelines/`pipeline1_pipeline_id`
		Then response code should be 403

	Scenario: Contributor cannot delete a pipeline
		Given I authenticate using email pipelinesApiTests_contributor@amazon.com and password p@ssword1
		When I remove header Content-Type
		And I DELETE /pipelines/`pipeline1_pipeline_id`
		Then response code should be 403

	Scenario: updating activities with extraneous attributes should not persist those attributes
		Given I authenticate using email pipelinesApiTests_admin@amazon.com and password p@ssword1
		And I set body to {"hello": "world"}
		When I PATCH /pipelines/`pipeline1_pipeline_id`
		Then response code should be 200
		And response body should not contain $.hello

	Scenario: Contributor can create a new version of a pipeline
		Given I authenticate using email pipelinesApiTests_admin@amazon.com and password p@ssword1
		And I set body to {"description":"the description is updated", "attributes": {"key3":"val","key1": null}, "processorOptions":{"chunkSize": 2}}
		When I PATCH /pipelines/`pipeline1_pipeline_id`
		Then response code should be 200

	Scenario: Should return error when formula has invalid syntax
		Given I authenticate using email pipelinesApiTests_admin@amazon.com and password p@ssword1
		And I set body to {"connectorConfig":{"input": [{"name": "sif-csv-pipeline-input-connector"}]},"name":"invalid_pipeline_syntax","transformer":{"transforms":[{"index":0,"formula":"AS_TIMESTAMP(:reading date,'M/d/yy')","outputs":[{"description":"Timestamp of business activity.","index":0,"key":"time","label":"Time","type":"timestamp"}]},{"index":1,"formula":":value_1+:value_2+#invalid_formula(:value_1)","outputs":[{"index":0,"key":"sum","label":"sum","description":"sum of value one and two","type":"number"}]}],"parameters":[{"index":0,"key":"reading date","type":"string"},{"index":1,"key":"value_1","label":"value 1","description":"a value ","type":"number"},{"index":2,"key":"value_2","label":"value 2","description":"a value ","type":"number"}]},"tags":{"source":"sap"},"attributes":{"key1":"val","key2":"val"},"processorOptions":{"chunkSize":1},"dryRunOptions":{"data":[{"reading date":"1/1/22","value_1":"10","value_2":"10"}]}}
		When I POST to /pipelines
		Then response code should be 400
		And I set body to {"connectorConfig":{"input": [{"name": "sif-csv-pipeline-input-connector"}]},"name":"invalid_pipeline_syntax","transformer":{"transforms":[{"index":0,"formula":"AS_TIMESTAMP(:reading date,'M/d/yy')","outputs":[{"description":"Timestamp of business activity.","index":0,"key":"time","label":"Time","type":"timestamp"}]},{"index":1,"formula":":value_1+:value_2+:invalid_value","outputs":[{"index":0,"key":"sum","label":"sum","description":"sum of value one and two","type":"number"}]}],"parameters":[{"index":0,"key":"reading date","type":"string"},{"index":1,"key":"value_1","label":"value 1","description":"a value ","type":"number"},{"index":2,"key":"value_2","label":"value 2","description":"a value ","type":"number"}]},"tags":{"source":"sap"},"attributes":{"key1":"val","key2":"val"},"processorOptions":{"chunkSize":1},"dryRunOptions":{"data":[{"reading date":"1/1/22","value_1":"10","value_2":"10"}]}}
		When I POST to /pipelines
		Then response code should be 400

	Scenario: Should skip calculator validation if dryRunOptions is not specified
		Given I authenticate using email pipelinesApiTests_admin@amazon.com and password p@ssword1
		And I set body to {"connectorConfig":{"input": [{"name": "sif-csv-pipeline-input-connector"}]},"name":"skip_validation_pipeline","transformer":{"transforms":[{"index":0,"formula":"AS_TIMESTAMP(:reading date,'M/d/yy')","outputs":[{"description":"Timestamp of business activity.","index":0,"key":"time","label":"Time","type":"timestamp"}]},{"index":1,"formula":":value_1+:value_2+#invalid_formula(:value1)","outputs":[{"index":0,"key":"sum","label":"sum","description":"sum of value one and two","type":"number"}]}],"parameters":[{"index":0,"key":"reading date","type":"string"},{"index":1,"key":"value_1","label":"value 1","description":"a value ","type":"number"},{"index":2,"key":"value_2","label":"value 2","description":"a value ","type":"number"}]},"tags":{"source":"sap"},"attributes":{"key1":"val","key2":"val"},"processorOptions":{"chunkSize":1}}
		When I POST to /pipelines
		Then response code should be 201
		And I store the value of body path $.id as skip_validation_pipeline_id in global scope

	Scenario: Admin Can dry run a pipeline successfully before creating
		Given I authenticate using email pipelinesApiTests_admin@amazon.com and password p@ssword1
		And I set body to {"name":"pipeline1","transformer":{"transforms":[{"index":0,"formula":"AS_TIMESTAMP(:reading date,'M/d/yy')","outputs":[{"description":"Timestamp of business activity.","index":0,"key":"time","label":"Time","type":"timestamp"}]},{"index":1,"formula":":value_1+:value_2","outputs":[{"index":0,"key":"sum","label":"sum","description":"sum of value one and two","type":"number"}]}],"parameters":[{"index":0,"key":"reading date","type":"string"},{"index":1,"key":"value_1","label":"value 1","description":"a value ","type":"number"},{"index":2,"key":"value_2","label":"value 2","description":"a value ","type":"number"}]},"tags":{"source":"sap"},"attributes":{"key1":"val","key2":"val"},"processorOptions":{"chunkSize":1},"dryRunOptions":{"data":[{"reading date":"1/1/22","value_1": "10","value_2":"10"}]}}
		When I POST to /pipelines?dryRun=true
		Then response code should be 200
		And response body should contain headers
		And response body should contain data
		And response body path $.headers[0] should be time
		And response body path $.headers[1] should be sum
		And response body path $.data[0] should be {"time":1640995200000,"sum":20}

	Scenario: Admin Can dry run a pipeline unsuccessfully before creating
		Given I authenticate using email pipelinesApiTests_admin@amazon.com and password p@ssword1
		And I set body to {"name":"pipeline1","transformer":{"transforms":[{"index":0,"formula":"AS_TIMESTAMP(:reading date,'M/d/yy')","outputs":[{"description":"Timestamp of business activity.","index":0,"key":"time","label":"Time","type":"timestamp"}]},{"index":1,"formula":":value_1+:value_2","outputs":[{"index":0,"key":"sum","label":"sum","description":"sum of value one and two","type":"number"}]}],"parameters":[{"index":0,"key":"reading date","type":"string"},{"index":1,"key":"value_1","label":"value 1","description":"a value ","type":"number"},{"index":2,"key":"value_2","label":"value 2","description":"a value ","type":"number"}]},"tags":{"source":"sap"},"attributes":{"key1":"val","key2":"val"},"processorOptions":{"chunkSize":1},"dryRunOptions":{"data":[{"reading date":"1/1/22","value_1": "10","value_2":"A"}]}}
		When I POST to /pipelines?dryRun=true
		Then response code should be 400
		And response body should contain message

	Scenario: Admin can delete a pipeline
		Given I authenticate using email pipelinesApiTests_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		When I DELETE /pipelines/`pipeline1_pipeline_id`
		Then response code should be 204
		When I GET /pipelines/`pipeline1_pipeline_id`
		Then response code should be 404

		When I DELETE /pipelines/`pipeline1_configured_with_input_connector1_id`
		Then response code should be 204
		When I GET /pipelines/`pipeline1_configured_with_input_connector1_id`
		Then response code should be 404

		When I DELETE /pipelines/`skip_validation_pipeline_id`
		Then response code should be 204
		When I GET /pipelines/`skip_validation_pipeline_id`
		Then response code should be 404

		When I DELETE /pipelines/`pipeline2_pipeline_id`
		Then response code should be 204
		When I GET /pipelines/`pipeline2_pipeline_id`
		Then response code should be 404

		When I DELETE /pipelines/`contr_pipeline_id`
		Then response code should be 204
		When I GET /pipelines/`contr_pipeline_id`
		Then response code should be 404

		When I DELETE /metrics/`metric_scope1_mobile_id`
		Then response code should be 204
		When I GET /metrics/`metric_scope1_mobile_id`
		Then response code should be 404

		When I DELETE /metrics/`metric_scope1_id`
		Then response code should be 204
		When I GET /metrics/`metric_scope1_id`
		Then response code should be 404

		When I DELETE /pipelines/`aggregated_pipeline_id`
		Then response code should be 204
		When I GET /pipelines/`aggregated_pipeline_id`
		Then response code should be 404

		When I DELETE /connectors/`pipeline_output_connector1_id`
		Then response code should be 204
		When I GET /connectors/`pipeline_output_connector1_id`
		Then response code should be 404

		When I DELETE /connectors/`pipeline_input_connector1_id`
		Then response code should be 204
		When I GET /connectors/`pipeline_input_connector1_id`
		Then response code should be 404

	Scenario: Teardown: delete users and group
		Given group /pipelinesApiTests has user pipelinesApiTests_admin@amazon.com revoked
		And group /pipelinesApiTests has user pipelinesApiTests_contributor@amazon.com revoked
		And group /pipelinesApiTests has user pipelinesApiTests_reader@amazon.com revoked
		And group /pipelinesApiTests has been removed

