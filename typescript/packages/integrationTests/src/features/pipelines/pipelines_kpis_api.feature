@setup_pipelines
Feature:
	This feature tests the general usage of the metrics api within the context of a single group.

	Scenario: Setup users
		Given group /metricsApiTests exists
		And group /metricsApiTests has user metricsApiTests_admin@amazon.com with role admin and password p@ssword1

	Scenario: Admin can create new metric
		Given I authenticate using email metricsApiTests_admin@amazon.com and password p@ssword1
		And I set body to {"name":"int:ghg:scope1","summary":"GHG Scope 1 direct emissions.","aggregationType":"sum","tags":{"standard":"ghg","scope":"1"}}
		When I POST to /metrics
		Then response code should be 201
		And response body should contain id
		And I store the value of body path $.id as metric_scope1_id in global scope
		And response body path $.name should be int:ghg:scope1
		And response body path $.summary should be GHG Scope 1 direct emissions.
		And response body path $.aggregationType should be sum
		And response body path $.tags.standard should be ghg
		And response body path $.tags.scope should be 1
		And I set body to {"name":"int:ghg:scope1:mobile","summary":"GHG Scope 1 direct emissions from mobile combustion.","aggregationType":"sum","outputMetrics":["int:ghg:scope1"],"tags":{"standard":"ghg","scope":"1","category":"mobile"}}
		When I POST to /metrics
		Then response code should be 201
		And response body should contain id
		And I store the value of body path $.id as metric_scope1_mobile_id in global scope
		And response body path $.name should be int:ghg:scope1:mobile
		And response body path $.summary should be GHG Scope 1 direct emissions from mobile combustion.
		And response body path $.aggregationType should be sum
		And response body path $.tags.standard should be ghg
		And response body path $.tags.scope should be 1
		And response body path $.tags.category should be mobile
		And response body path $.outputMetrics[0] should be int:ghg:scope1
		And I set body to {"name":"int:ghg:scope1:mobile:site1","summary":"GHG Scope 1 direct emissions from mobile combustion in site1.","aggregationType":"sum","outputMetrics":["int:ghg:scope1:mobile"],"tags":{"standard":"ghg","scope":"1","category":"mobile", "site": "site1"}}
		When I POST to /metrics
		Then response code should be 201
		And response body should contain id
		And I store the value of body path $.id as metric_scope1_mobile_site1_id in global scope
		And response body path $.name should be int:ghg:scope1:mobile:site1
		And response body path $.summary should be GHG Scope 1 direct emissions from mobile combustion in site1.
		And response body path $.aggregationType should be sum
		And response body path $.tags.standard should be ghg
		And response body path $.tags.scope should be 1
		And response body path $.tags.category should be mobile
		And response body path $.tags.site should be site1
		And response body path $.outputMetrics[0] should be int:ghg:scope1:mobile
		And I set body to {"name":"ghg:pipeline:metric","summary":"this metric depends on pipeline1.","aggregationType":"sum","tags":{"standard":"ghg","scope":"1"}}
		When I POST to /metrics
		Then response code should be 201
		And response body should contain id
		And I store the value of body path $.id as metric_pipeline_id in global scope
		And response body path $.name should be ghg:pipeline:metric
		And response body path $.summary should be this metric depends on pipeline1.
		And response body path $.aggregationType should be sum
		And response body path $.tags.standard should be ghg
		And response body path $.tags.scope should be 1

	Scenario: Admin cannot modify metric output that resulted in circular dependency
		Given I authenticate using email metricsApiTests_admin@amazon.com and password p@ssword1
		And I set body to {"name":"int:ghg:scope1","summary":"GHG Scope 1 direct emissions.","aggregationType":"sum","tags":{"standard":"ghg","scope":"1"}, "outputMetrics":["int:ghg:scope1:mobile:site1"]}
		When I PATCH /metrics/`metric_scope1_id`
		Then response code should be 400
		And response body path $.message should be There is circular reference pointing back to metric int:ghg:scope1 from int:ghg:scope1:mobile

	Scenario: Admin can create new pipeline that output to int:ghg:scope1:mobile metric
		Given I authenticate using email metricsApiTests_admin@amazon.com and password p@ssword1
		And I set body to {"connectorConfig":{"input": [{"name": "sif-csv-pipeline-input-connector"}]},"name":"pipeline1","transformer":{"transforms":[{"index":0,"formula":"AS_TIMESTAMP(:reading date,'M/d/yy')","outputs":[{"description":"Timestamp of business activity.","index":0,"key":"time","label":"Time","type":"timestamp"}]},{"index":1,"formula":":value_1+:value_2","outputs":[{"index":0,"key":"sum","label":"sum","description":"sum of value one and two","type":"number", "metrics":["ghg:pipeline:metric"]}]}],"parameters":[{"index":0,"key":"reading date","type":"string"},{"index":1,"key":"value_1","label":"value 1","description":"a value ","type":"number"},{"index":2,"key":"value_2","label":"value 2","description":"a value ","type":"number"}]},"tags":{"source":"sap"},"attributes":{"key1":"val","key2":"val"},"processorOptions":{"chunkSize":1}}
		When I POST to /pipelines
		Then response code should be 201
		And response body should contain id
		And response body should contain createdAt
		And I store the value of body path $.id as pipeline1_pipeline_id in global scope
		And I store the value of body path $.createdAt as pipeline1_pipeline_createdAt in global scope

	Scenario: Admin cannot create metric with output metrics the resolves to same metrics in multiple path
	For example, if we have int:ghg:scope1:mobile:site1 -> int:ghg:scope1:mobile -> int:ghg:scope1
	then we should not be able to create metric that output to int:ghg:scope1:mobile:site1 and int:ghg:scope1:mobile
		Given I authenticate using email metricsApiTests_admin@amazon.com and password p@ssword1
		And I set body to {"name":"ghg:invalid:multiple:metrics","summary":"GHG Scope 1 direct emissions.","aggregationType":"sum","tags":{"standard":"ghg","scope":"1"}, "outputMetrics":["int:ghg:scope1:mobile:site1", "int:ghg:scope1:mobile"]}
		When I POST to /metrics
		Then response code should be 400
		And response body path $.message should be This metric int\:ghg\:scope1\:mobile exists in multiple path

	Scenario: Admin cannot create a new metric that output to another metric that has pipeline as an input
		Given I authenticate using email metricsApiTests_admin@amazon.com and password p@ssword1
		And I set body to {"name":"ghg:pipeline:metric:input","summary":"GHG Scope 1 direct emissions.","aggregationType":"sum","tags":{"standard":"ghg","scope":"1"}, "outputMetrics":["ghg:pipeline:metric"]}
		When I POST to /metrics
		Then response code should be 400
		And response body path $.message should be These output metrics \[ghg\:pipeline\:metric\] has pipeline as an input

	Scenario: Admin cannot delete metric if it is configured as an output of another metric
		Given I authenticate using email metricsApiTests_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		When I DELETE /metrics/`metric_scope1_mobile_id`
		Then response code should be 400
		And response body path $.message should be metric int:ghg:scope1:mobile cannot be deleted because it is an output metric of another metric or pipeline

	Scenario: Admin cannot delete metric if it is configured as an output of pipeline pipeline1
		Given I authenticate using email metricsApiTests_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		When I DELETE /metrics/`metric_pipeline_id`
		Then response code should be 400
		And response body path $.message should be metric ghg:pipeline:metric cannot be deleted because it is an output metric of another metric or pipeline

	Scenario: Admin can delete a pipeline
		Given I authenticate using email metricsApiTests_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		# Delete Pipeline
		When I DELETE /pipelines/`pipeline1_pipeline_id`
		Then response code should be 204
		When I GET /pipelines/`pipeline1_pipeline_id`
		Then response code should be 404
		# Delete Metric
		When I DELETE /metrics/`metric_pipeline_id`
		Then response code should be 204
		When I GET /metrics/`metric_pipeline_id`
		Then response code should be 404
		When I DELETE /metrics/`metric_scope1_mobile_site1_id`
		Then response code should be 204
		When I GET /metrics/`metric_scope1_mobile_site1_id`
		Then response code should be 404
		When I DELETE /metrics/`metric_scope1_mobile_id`
		Then response code should be 204
		When I GET /metrics/`metric_scope1_mobile_id`
		Then response code should be 404
		When I DELETE /metrics/`metric_scope1_id`
		Then response code should be 204
		When I GET /metrics/`metric_scope1_id`
		Then response code should be 404

	Scenario: Teardown: delete users and group
		Given group /metricsApiTests has user metricsApiTests_admin@amazon.com revoked
		And group /metricsApiTests has been removed
