@setup_pipelines
Feature:

	This feature tests the tagging of resources, therefore only focuses on testing responses and attributes specific to it.

	Scenario: Setup users
		Given group /pipelinesTagTests exists
		And group /pipelinesTagTests/a exists
		And group /pipelinesTagTests/a has user pipelinesTagTests_a_admin@amazon.com with role admin and password p@ssword1
		And group /pipelinesTagTests/a has user pipelinesTagTests_a_reader@amazon.com with role reader and password p@ssword1
		And group /pipelinesTagTests/a/a exists
		And group /pipelinesTagTests/a/a/a exists
		And group /pipelinesTagTests/a/a/a/a exists
		And group /pipelinesTagTests/a/a/a/a has user pipelinesTagTests_a_a_a_a_reader@amazon.com with role reader and password p@ssword1
		And group /pipelinesTagTests/b exists
		And group /pipelinesTagTests/b has user pipelinesTagTests_b_admin@amazon.com with role admin and password p@ssword1

	Scenario: Setup: Admin can create new resource (1) with tags

	New resource is created with a tag 'datasource' of 'GHG Protocol' and a hierarhical tag 'type' of 'Material/Metal/Steel'.

		Given I authenticate using email pipelinesTagTests_a_admin@amazon.com and password p@ssword1
		And I set body to {"connectorConfig":{"input": [{"name": "sif-csv-pipeline-input-connector"}]},"name":"pipeline_1","transformer":{"transforms":[{"index":0,"formula":"AS_TIMESTAMP(:reading date,'M/d/yy')","outputs":[{"description":"Timestamp of business activity.","index":0,"key":"time","label":"Time","type":"timestamp"}]},{"index":1,"formula":"#VEHCILE_EMISSIONS('vehicle_type', IN(:pin24))","outputs":[{"index":0,"key":"vehicle","label":"Vehicle","description":"some description about pin24","type":"number"}]}],"parameters":[{"index":0,"key":"reading date","type":"string"},{"index":1,"key":"pin24","label":"pin 24","description":"some description about pin24","type":"string"}]},"tags":{"datasource":"GHG Protocol","type":"Material/Metal/Steel"},"attributes":{"key1":"val","key2":"val"},"processorOptions":{"chunkSize":1}}
		When I POST to /pipelines
		Then response code should be 201
		And response body should contain id
		And response body path $.tags.datasource should be GHG Protocol
		And response body path $.tags.type should be Material/Metal/Steel
		And I store the value of body path $.id as pipeline_1_id in global scope

	Scenario: Setup: Admin can create new resource (2) with tags

	New resource is created with a tag 'datasource' of 'GHG Protocol' and a hierarhical tag 'type' of 'Material/Metal/Iron'.

		Given I authenticate using email pipelinesTagTests_a_admin@amazon.com and password p@ssword1
		And I set body to {"connectorConfig":{"input": [{"name": "sif-csv-pipeline-input-connector"}]},"name":"pipeline_2","transformer":{"transforms":[{"index":0,"formula":"AS_TIMESTAMP(:reading date,'M/d/yy')","outputs":[{"description":"Timestamp of business activity.","index":0,"key":"time","label":"Time","type":"timestamp"}]},{"index":1,"formula":"#VEHCILE_EMISSIONS('vehicle_type', IN(:pin24))","outputs":[{"index":0,"key":"vehicle","label":"Vehicle","description":"some description about pin24","type":"number"}]}],"parameters":[{"index":0,"key":"reading date","type":"string"},{"index":1,"key":"pin24","label":"pin 24","description":"some description about pin24","type":"string"}]},"tags":{"datasource":"GHG Protocol","type":"Material/Metal/Iron"},"attributes":{"key1":"val","key2":"val"},"processorOptions":{"chunkSize":1}}
		When I POST to /pipelines
		Then response code should be 201
		And response body should contain id
		And response body path $.tags.datasource should be GHG Protocol
		And response body path $.tags.type should be Material/Metal/Iron
		And I store the value of body path $.id as pipeline_2_id in global scope

	Scenario: Setup: Admin can create new resource (3) with tags

	New resource is created with a tag 'datasource' of 'Green Button Alliance' and a hierarhical tag 'type' of 'Material/Metal/Iron'.

		Given I authenticate using email pipelinesTagTests_a_admin@amazon.com and password p@ssword1
		And I set body to {"connectorConfig":{"input": [{"name": "sif-csv-pipeline-input-connector"}]},"name":"pipeline_3","transformer":{"transforms":[{"index":0,"formula":"AS_TIMESTAMP(:reading date,'M/d/yy')","outputs":[{"description":"Timestamp of business activity.","index":0,"key":"time","label":"Time","type":"timestamp"}]},{"index":1,"formula":"#VEHCILE_EMISSIONS('vehicle_type', IN(:pin24))","outputs":[{"index":0,"key":"vehicle","label":"Vehicle","description":"some description about pin24","type":"number"}]}],"parameters":[{"index":0,"key":"reading date","type":"string"},{"index":1,"key":"pin24","label":"pin 24","description":"some description about pin24","type":"string"}]},"tags":{"datasource":"Green Button Alliance","type":"Material/Metal/Iron"},"attributes":{"key1":"val","key2":"val"},"processorOptions":{"chunkSize":1}}
		When I POST to /pipelines
		Then response code should be 201
		And response body should contain id
		And response body path $.tags.datasource should be Green Button Alliance
		And response body path $.tags.type should be Material/Metal/Iron
		And I store the value of body path $.id as pipeline_3_id in global scope

	Scenario: Setup: Admin can create new resource (4) with tags

	New resource is created with a tag 'datasource' of 'Green Button Alliance' and a hierarhical tag 'type' of 'Material/Plastic/ABS'.

		Given I authenticate using email pipelinesTagTests_a_admin@amazon.com and password p@ssword1
		And I set body to {"connectorConfig":{"input": [{"name": "sif-csv-pipeline-input-connector"}]},"name":"pipeline_4","transformer":{"transforms":[{"index":0,"formula":"AS_TIMESTAMP(:reading date,'M/d/yy')","outputs":[{"description":"Timestamp of business activity.","index":0,"key":"time","label":"Time","type":"timestamp"}]},{"index":1,"formula":"#VEHCILE_EMISSIONS('vehicle_type', IN(:pin24))","outputs":[{"index":0,"key":"vehicle","label":"Vehicle","description":"some description about pin24","type":"number"}]}],"parameters":[{"index":0,"key":"reading date","type":"string"},{"index":1,"key":"pin24","label":"pin 24","description":"some description about pin24","type":"string"}]},"tags":{"datasource":"Green Button Alliance","type":"Material/Plastic/ABS"},"attributes":{"key1":"val","key2":"val"},"processorOptions":{"chunkSize":1}}
		When I POST to /pipelines
		Then response code should be 201
		And response body should contain id
		And response body path $.tags.datasource should be Green Button Alliance
		And response body path $.tags.type should be Material/Plastic/ABS
		And I store the value of body path $.id as pipeline_4_id in global scope

	Scenario: Setup: Admin can create new resource (5) with tags

	New resource is created with a tag 'datasource' of 'GHG Protocol' and a hierarchical tag 'type' of 'Material/Metal/Steel'
	but associated with group '/pipelinesTagTests/b' therefore should not be returned in any results in the scenario.

		Given I authenticate using email pipelinesTagTests_b_admin@amazon.com and password p@ssword1
		And I set body to {"connectorConfig":{"input": [{"name": "sif-csv-pipeline-input-connector"}]},"name":"pipeline_5","transformer":{"transforms":[{"index":0,"formula":"AS_TIMESTAMP(:reading date,'M/d/yy')","outputs":[{"description":"Timestamp of business activity.","index":0,"key":"time","label":"Time","type":"timestamp"}]},{"index":1,"formula":"#VEHCILE_EMISSIONS('vehicle_type', IN(:pin24))","outputs":[{"index":0,"key":"vehicle","label":"Vehicle","description":"some description about pin24","type":"number"}]}],"parameters":[{"index":0,"key":"reading date","type":"string"},{"index":1,"key":"pin24","label":"pin 24","description":"some description about pin24","type":"string"}]},"tags":{"datasource":"GHG Protocol","type":"Material/Metal/Steel"},"attributes":{"key1":"val","key2":"val"},"processorOptions":{"chunkSize":1}}
		When I POST to /pipelines
		Then response code should be 201
		And response body should contain id
		And response body path $.tags.datasource should be GHG Protocol
		And response body path $.tags.type should be Material/Metal/Steel
		And I store the value of body path $.id as pipeline_5_id in global scope

	Scenario: Reader can retrieve resource 1 and has expected tags
		Given I authenticate using email pipelinesTagTests_a_reader@amazon.com and password p@ssword1
		When I GET /pipelines/`pipeline_1_id`
		Then response code should be 200
		And response body path $.tags.datasource should be GHG Protocol
		And response body path $.tags.type should be Material/Metal/Steel

	Scenario: Reader can list resources and filter by tags (example 1)

	Filtering by group '/pipelinesTagTests/a' and 'datasource' = 'GHG Protocol'.

		Given I authenticate using email pipelinesTagTests_a_reader@amazon.com and password p@ssword1
		And I set query parameters to
			| parameter    | value                   |
			| tags         | datasource:GHG Protocol |
			| resourceType | pipeline                |
		When I GET /pipelines
		Then response code should be 200
		And response body path $.pipelines.length should be 2
		And pipelines response should contain pipeline pipeline_1_id
		And pipelines response should contain pipeline pipeline_2_id

	Scenario: Reader can list resources and filter by tags (example 2)

	Filtering by group '/pipelinesTagTests/a' and 'datasource' = 'GHG Protocol' and 'type' = 'Material/Metal/Steel'.

		Given I authenticate using email pipelinesTagTests_a_reader@amazon.com and password p@ssword1
		And I set query parameters to
			| parameter    | value                     |
			| tags         | datasource:GHG Protocol   |
			| tags         | type:Material/Metal/Steel |
			| resourceType | pipeline                  |
		When I GET /pipelines
		Then response code should be 200
		And response body path $.pipelines.length should be 1
		And response body path $.pipelines[0].id should be `pipeline_1_id`

	Scenario: Reader can list resources and filter by tags (example 3)

	Filtering by group '/pipelinesTagTests/a' and 'type' = 'Material/Plastic'.

		Given I authenticate using email pipelinesTagTests_a_reader@amazon.com and password p@ssword1
		And I set query parameters to
			| parameter    | value                 |
			| tags         | type:Material/Plastic |
			| resourceType | pipeline              |
		When I GET /pipelines
		Then response code should be 200
		And response body path $.pipelines.length should be 1
		And response body path $.pipelines[0].id should be `pipeline_4_id`

	Scenario: Reader can list tag values for a given key (example 1)

	Filtering by group '/pipelinesTagTests/a' and listing values for 'datasource' tag.

		Given I authenticate using email pipelinesTagTests_a_reader@amazon.com and password p@ssword1
		When I GET /tags/datasource?resourceType=pipeline
		Then response code should be 200
		And response body path $.values.["ghg protocol"] should be GHG Protocol
		And response body path $.values.["green button alliance"] should be Green Button Alliance

	Scenario: Reader can list tag values for a given key (example 2)

	Filtering by group '/pipelinesTagTests/b' and listing values for 'datasource' tag.

		Given I authenticate using email pipelinesTagTests_b_admin@amazon.com and password p@ssword1
		When I GET /tags/datasource?resourceType=pipeline
		Then response code should be 200
		And response body path $.values.["ghg protocol"] should be GHG Protocol
		And response body should not contain values.["green button alliance"]

	Scenario: Reader can list tag values for a given key (example 3)

	Filtering by group '/pipelinesTagTests/a' and listing values for 'type' tag.

		Given I authenticate using email pipelinesTagTests_a_admin@amazon.com and password p@ssword1
		When I GET /tags/type?resourceType=pipeline
		Then response code should be 200
		And response body path $.values.material should be Material

	Scenario: Reader can list tag values for a given key (example 4)

	Filtering by group '/pipelinesTagTests/a' and listing values for 'type' tag and parent value 'Material'.

		Given I authenticate using email pipelinesTagTests_a_admin@amazon.com and password p@ssword1
		When I GET /tags/type?parentValue=material&resourceType=pipeline
		Then response code should be 200
		And response body path $.values.["material/metal"] should be Metal
		And response body path $.values.["material/plastic"] should be Plastic

	Scenario: Reader can list tag values for a given key (example 5)

	Filtering by group '/pipelinesTagTests/a' and listing values for 'type' tag and parent value 'material/metal'.

		Given I authenticate using email pipelinesTagTests_a_admin@amazon.com and password p@ssword1
		When I GET /tags/type?parentValue=material%2fmetal&resourceType=pipeline
		Then response code should be 200
		And response body path $.values.["material/metal/steel"] should be Steel

	Scenario: Reader of sub group can list tag values for a given key

	Filtering by group '/pipelinesTagTests/a/a/a/a' and listing values for 'type' tag and parent value 'Material'.

		Given I authenticate using email pipelinesTagTests_a_a_a_a_reader@amazon.com and password p@ssword1
		And I pause for 2000ms
		When I GET /tags/type?parentValue=material&resourceType=pipeline
		Then response code should be 200
		And response body path $.values.["material/metal"] should be Metal
		And response body path $.values.["material/plastic"] should be Plastic

	Scenario: Admin can update resource with tags

	Existing resource is updated so 'datasource' tag is removed and hierarhical tag 'type' changed from 'Material/Plastic/ABS' to 'Material/Metal/Iron'.

		Given I authenticate using email pipelinesTagTests_a_admin@amazon.com and password p@ssword1
		And I set body to {"tags":{"datasource":null,"type":"Material/Metal/Iron"}}
		When I PATCH /pipelines/`pipeline_4_id`
		Then response code should be 200
		And response body should not contain tags.datasource
		And response body path $.tags.type should be Material/Metal/Iron

	Scenario: Reader of sub group listing tag values should see updated tags summarized

	Filtering by group '/pipelinesTagTests/a/a/a/a' and listing values for 'type' tag and parent value 'Material'.

		Given I authenticate using email pipelinesTagTests_a_a_a_a_reader@amazon.com and password p@ssword1
		And I pause for 2000ms
		When I GET /tags/type?parentValue=material&resourceType=pipeline
		Then response code should be 200
		And response body path $.values.["material/metal"] should be Metal
		And response body should not contain tags.["material/plastic"]

	Scenario: Teardown: Delete pipeline `pipeline_1_id`
		Given I authenticate using email pipelinesTagTests_a_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		When I DELETE /pipelines/`pipeline_1_id`
		Then response code should be 204
		When I GET /pipelines/`pipeline_1_id`
		Then response code should be 404

	Scenario: Teardown: Delete pipeline `pipeline_2_id`
		Given I authenticate using email pipelinesTagTests_a_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		When I DELETE /pipelines/`pipeline_2_id`
		Then response code should be 204
		When I GET /pipelines/`pipeline_2_id`
		Then response code should be 404

	Scenario: Teardown: Delete pipeline `pipeline_3_id`
		Given I authenticate using email pipelinesTagTests_a_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		When I DELETE /pipelines/`pipeline_3_id`
		Then response code should be 204
		When I GET /pipelines/`pipeline_3_id`
		Then response code should be 404

	Scenario: Teardown: Delete pipeline `pipeline_4_id`
		Given I authenticate using email pipelinesTagTests_a_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		When I DELETE /pipelines/`pipeline_4_id`
		Then response code should be 204
		When I GET /pipelines/`pipeline_4_id`
		Then response code should be 404

	Scenario: Teardown: Delete pipeline `pipeline_5_id`
		Given I authenticate using email pipelinesTagTests_b_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		When I DELETE /pipelines/`pipeline_5_id`
		Then response code should be 204
		When I GET /pipelines/`pipeline_5_id`
		Then response code should be 404

	Scenario: Teardown: Revoke users
		Given group /pipelinesTagTests/a has user pipelinesTagTests_a_admin@amazon.com revoked
		And group /pipelinesTagTests/a has user pipelinesTagTests_a_reader@amazon.com revoked
		And group /pipelinesTagTests/a/a/a/a has user pipelinesTagTests_a_a_a_a_reader@amazon.com revoked
		And group /pipelinesTagTests/b has user pipelinesTagTests_b_admin@amazon.com revoked

	Scenario: Teardown: Delete groups
		Given group /pipelinesTagTests/a/a/a/a has been removed
		And group /pipelinesTagTests/a/a/a has been removed
		And group /pipelinesTagTests/a/a has been removed
		And group /pipelinesTagTests/a has been removed
		And group /pipelinesTagTests/b has been removed
		And group /pipelinesTagTests has been removed
