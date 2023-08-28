@setup_pipelines @pipelines
Feature:

	This feature tests the tagging of resources, therefore only focuses on testing responses and attributes specific to it.

	Scenario: Setup users
		Given group /pipelinesConnectorsTagTests exists
		And group /pipelinesConnectorsTagTests/a exists
		And group /pipelinesConnectorsTagTests/a has user pipelinesConnectorsTagTests_a_admin@amazon.com with role admin and password p@ssword1
		And group /pipelinesConnectorsTagTests/a has user pipelinesConnectorsTagTests_a_reader@amazon.com with role reader and password p@ssword1
		And group /pipelinesConnectorsTagTests/a/a exists
		And group /pipelinesConnectorsTagTests/a/a/a exists
		And group /pipelinesConnectorsTagTests/a/a/a/a exists
		And group /pipelinesConnectorsTagTests/a/a/a/a has user pipelinesConnectorsTagTests_a_a_a_a_reader@amazon.com with role reader and password p@ssword1
		And group /pipelinesConnectorsTagTests/b exists
		And group /pipelinesConnectorsTagTests/b has user pipelinesConnectorsTagTests_b_admin@amazon.com with role admin and password p@ssword1

	Scenario: Setup: Admin can create new resource (1) with tags

	New resource is created with a tag 'datasource' of 'GHG Protocol' and a hierarchical tag 'type' of 'Material/Metal/Steel'.

		Given I authenticate using email pipelinesConnectorsTagTests_a_admin@amazon.com and password p@ssword1
		And I set body to {"name":"pipeline_connector_1","tags":{"datasource":"GHG Protocol","type":"Material/Metal/Steel"},"type":"input","parameters":[{"name":"endpoint","description":"some endpoint which my connector will nee to utilize","required":true,"defaultValue":"https://..."}],"attributes":{"key1":"val","key2":"val"}}
		When I POST to /connectors
		Then response code should be 201
		And response body should contain id
		And response body path $.tags.datasource should be GHG Protocol
		And response body path $.tags.type should be Material/Metal/Steel
		And I store the value of body path $.id as pipeline_connector_1_id in global scope

	Scenario: Setup: Admin can create new resource (2) with tags

	New resource is created with a tag 'datasource' of 'GHG Protocol' and a hierarchical tag 'type' of 'Material/Metal/Iron'.

		Given I authenticate using email pipelinesConnectorsTagTests_a_admin@amazon.com and password p@ssword1
		And I set body to {"name":"pipeline_connector_2","tags":{"datasource":"GHG Protocol","type":"Material/Metal/Iron"},"type":"input","parameters":[{"name":"endpoint","description":"some endpoint which my connector will nee to utilize","required":true,"defaultValue":"https://..."}],"attributes":{"key1":"val","key2":"val"}}
		When I POST to /connectors
		Then response code should be 201
		And response body should contain id
		And response body path $.tags.datasource should be GHG Protocol
		And response body path $.tags.type should be Material/Metal/Iron
		And I store the value of body path $.id as pipeline_connector_2_id in global scope

	Scenario: Setup: Admin can create new resource (3) with tags

	New resource is created with a tag 'datasource' of 'Green Button Alliance' and a hierarchical tag 'type' of 'Material/Metal/Iron'.

		Given I authenticate using email pipelinesConnectorsTagTests_a_admin@amazon.com and password p@ssword1
		And I set body to {"name":"pipeline_connector_3","tags":{"datasource":"Green Button Alliance","type":"Material/Metal/Iron"},"type":"input","parameters":[{"name":"endpoint","description":"some endpoint which my connector will nee to utilize","required":true,"defaultValue":"https://..."}],"attributes":{"key1":"val","key2":"val"}}
		When I POST to /connectors
		Then response code should be 201
		And response body should contain id
		And response body path $.tags.datasource should be Green Button Alliance
		And response body path $.tags.type should be Material/Metal/Iron
		And I store the value of body path $.id as pipeline_connector_3_id in global scope

	Scenario: Setup: Admin can create new resource (4) with tags

	New resource is created with a tag 'datasource' of 'Green Button Alliance' and a hierarchical tag 'type' of 'Material/Plastic/ABS'.

		Given I authenticate using email pipelinesConnectorsTagTests_a_admin@amazon.com and password p@ssword1
		And I set body to {"name":"pipeline_connector_4","tags":{"datasource":"Green Button Alliance","type":"Material/Plastic/ABS"},"type":"input","parameters":[{"name":"endpoint","description":"some endpoint which my connector will nee to utilize","required":true,"defaultValue":"https://..."}],"attributes":{"key1":"val","key2":"val"}}
		When I POST to /connectors
		Then response code should be 201
		And response body should contain id
		And response body path $.tags.datasource should be Green Button Alliance
		And response body path $.tags.type should be Material/Plastic/ABS
		And I store the value of body path $.id as pipeline_connector_4_id in global scope

	Scenario: Setup: Admin can create new resource (5) with tags

	New resource is created with a tag 'datasource' of 'GHG Protocol' and a hierarchical tag 'type' of 'Material/Metal/Steel'
	but associated with group '/connectorsConnectorsTagTests/b' therefore should not be returned in any results in the scenario.

		Given I authenticate using email pipelinesConnectorsTagTests_b_admin@amazon.com and password p@ssword1
		And I set body to {"name":"pipeline_connector_5","tags":{"datasource":"GHG Protocol","type":"Material/Metal/Steel"},"type":"input","parameters":[{"name":"endpoint","description":"some endpoint which my connector will nee to utilize","required":true,"defaultValue":"https://..."}],"attributes":{"key1":"val","key2":"val"}}
		When I POST to /connectors
		Then response code should be 201
		And response body should contain id
		And response body path $.tags.datasource should be GHG Protocol
		And response body path $.tags.type should be Material/Metal/Steel
		And I store the value of body path $.id as pipeline_connector_5_id in global scope

	Scenario: Reader can retrieve resource 1 and has expected tags
		Given I authenticate using email pipelinesConnectorsTagTests_a_reader@amazon.com and password p@ssword1
		When I GET /connectors/`pipeline_connector_1_id`
		Then response code should be 200
		And response body path $.tags.datasource should be GHG Protocol
		And response body path $.tags.type should be Material/Metal/Steel

	Scenario: Reader can list resources and filter by tags (example 1)

	Filtering by group '/connectorsConnectorsTagTests/a' and 'datasource' = 'GHG Protocol'.

		Given I authenticate using email pipelinesConnectorsTagTests_a_reader@amazon.com and password p@ssword1
		And I set query parameters to
			| parameter    | value                   |
			| tags         | datasource:GHG Protocol |
			| resourceType | connector                  |
		When I GET /connectors
		Then response code should be 200
		And response body path $.connectors.length should be 2
		And response body path $.connectors[0].id should be `pipeline_connector_1_id`
		And response body path $.connectors[0].id should be `pipeline_connector_1_id`

	Scenario: Reader can list resources and filter by tags (example 2)

	Filtering by group '/connectorsConnectorsTagTests/a' and 'datasource' = 'GHG Protocol' and 'type' = 'Material/Metal/Steel'.

		Given I authenticate using email pipelinesConnectorsTagTests_a_reader@amazon.com and password p@ssword1
		And I set query parameters to
			| parameter    | value                     |
			| tags         | datasource:GHG Protocol   |
			| tags         | type:Material/Metal/Steel |
			| resourceType | connector                    |
		When I GET /connectors
		Then response code should be 200
		And response body path $.connectors.length should be 1
		And response body path $.connectors[0].id should be `pipeline_connector_1_id`

	Scenario: Reader can list resources and filter by tags (example 3)

	Filtering by group '/connectorsConnectorsTagTests/a' and 'type' = 'Material/Plastic'.

		Given I authenticate using email pipelinesConnectorsTagTests_a_reader@amazon.com and password p@ssword1
		And I set query parameters to
			| parameter    | value                 |
			| tags         | type:Material/Plastic |
			| resourceType | connector                |
		When I GET /connectors
		Then response code should be 200
		And response body path $.connectors.length should be 1
		And response body path $.connectors[0].id should be `pipeline_connector_4_id`

	Scenario: Reader can list tag values for a given key (example 1)

	Filtering by group '/connectorsConnectorsTagTests/a' and listing values for 'datasource' tag.

		Given I authenticate using email pipelinesConnectorsTagTests_a_reader@amazon.com and password p@ssword1
		When I GET /tags/datasource?resourceType=connector
		Then response code should be 200
		And response body path $.values.["ghg protocol"] should be GHG Protocol
		And response body path $.values.["green button alliance"] should be Green Button Alliance

	Scenario: Reader can list tag values for a given key (example 2)

	Filtering by group '/connectorsConnectorsTagTests/b' and listing values for 'datasource' tag.

		Given I authenticate using email pipelinesConnectorsTagTests_b_admin@amazon.com and password p@ssword1
		When I GET /tags/datasource?resourceType=connector
		Then response code should be 200
		And response body path $.values.["ghg protocol"] should be GHG Protocol
		And response body should not contain values.["green button alliance"]

	Scenario: Reader can list tag values for a given key (example 3)

	Filtering by group '/connectorsConnectorsTagTests/a' and listing values for 'type' tag.

		Given I authenticate using email pipelinesConnectorsTagTests_a_admin@amazon.com and password p@ssword1
		When I GET /tags/type?resourceType=connector
		Then response code should be 200
		And response body path $.values.material should be Material

	Scenario: Reader can list tag values for a given key (example 4)

	Filtering by group '/connectorsConnectorsTagTests/a' and listing values for 'type' tag and parent value 'Material'.

		Given I authenticate using email pipelinesConnectorsTagTests_a_admin@amazon.com and password p@ssword1
		When I GET /tags/type?parentValue=material&resourceType=connector
		Then response code should be 200
		And response body path $.values.["material/metal"] should be Metal
		And response body path $.values.["material/plastic"] should be Plastic

	Scenario: Reader can list tag values for a given key (example 5)

	Filtering by group '/connectorsConnectorsTagTests/a' and listing values for 'type' tag and parent value 'material/metal'.

		Given I authenticate using email pipelinesConnectorsTagTests_a_admin@amazon.com and password p@ssword1
		When I GET /tags/type?parentValue=material%2fmetal&resourceType=connector
		Then response code should be 200
		And response body path $.values.["material/metal/steel"] should be Steel

	Scenario: Reader of sub group can list tag values for a given key

	Filtering by group '/connectorsConnectorsTagTests/a/a/a/a' and listing values for 'type' tag and parent value 'Material'.

		Given I authenticate using email pipelinesConnectorsTagTests_a_a_a_a_reader@amazon.com and password p@ssword1
		And I pause for 2000ms
		When I GET /tags/type?parentValue=material&resourceType=connector
		Then response code should be 200
		And response body path $.values.["material/metal"] should be Metal
		And response body path $.values.["material/plastic"] should be Plastic

	Scenario: Admin can update resource with tags

	Existing resource is updated so 'datasource' tag is removed and hierarchical tag 'type' changed from 'Material/Plastic/ABS' to 'Material/Metal/Iron'.

		Given I authenticate using email pipelinesConnectorsTagTests_a_admin@amazon.com and password p@ssword1
		And I set body to {"tags":{"datasource":null,"type":"Material/Metal/Iron"}}
		When I PATCH /connectors/`pipeline_connector_4_id`
		Then response code should be 200
		And response body should not contain tags.datasource
		And response body path $.tags.type should be Material/Metal/Iron

	Scenario: Reader of sub group listing tag values should see updated tags summarized

	Filtering by group '/connectorsConnectorsTagTests/a/a/a/a' and listing values for 'type' tag and parent value 'Material'.

		Given I authenticate using email pipelinesConnectorsTagTests_a_a_a_a_reader@amazon.com and password p@ssword1
		And I pause for 2000ms
		When I GET /tags/type?parentValue=material&resourceType=connector
		Then response code should be 200
		And response body path $.values.["material/metal"] should be Metal
		And response body should not contain tags.["material/plastic"]

	Scenario: Teardown: Delete pipeline `pipeline_connector_1_id`
		Given I authenticate using email pipelinesConnectorsTagTests_a_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		When I DELETE /connectors/`pipeline_connector_1_id`
		Then response code should be 204
		When I GET /connectors/`pipeline_connector_1_id`
		Then response code should be 404

	Scenario: Teardown: Delete pipeline `pipeline_connector_2_id`
		Given I authenticate using email pipelinesConnectorsTagTests_a_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		When I DELETE /connectors/`pipeline_connector_2_id`
		Then response code should be 204
		When I GET /connectors/`pipeline_connector_2_id`
		Then response code should be 404

	Scenario: Teardown: Delete pipeline `pipeline_connector_3_id`
		Given I authenticate using email pipelinesConnectorsTagTests_a_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		When I DELETE /connectors/`pipeline_connector_3_id`
		Then response code should be 204
		When I GET /connectors/`pipeline_connector_3_id`
		Then response code should be 404

	Scenario: Teardown: Delete pipeline `pipeline_connector_4_id`
		Given I authenticate using email pipelinesConnectorsTagTests_a_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		When I DELETE /connectors/`pipeline_connector_4_id`
		Then response code should be 204
		When I GET /connectors/`pipeline_connector_4_id`
		Then response code should be 404

	Scenario: Teardown: Delete pipeline `pipeline_connector_5_id`
		Given I authenticate using email pipelinesConnectorsTagTests_b_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		When I DELETE /connectors/`pipeline_connector_5_id`
		Then response code should be 204
		When I GET /connectors/`pipeline_connector_5_id`
		Then response code should be 404

	Scenario: Teardown: Revoke users
		Given group /pipelinesConnectorsTagTests/a has user pipelinesConnectorsTagTests_a_admin@amazon.com revoked
		And group /pipelinesConnectorsTagTests/a has user pipelinesConnectorsTagTests_a_reader@amazon.com revoked
		And group /pipelinesConnectorsTagTests/a/a/a/a has user pipelinesConnectorsTagTests_a_a_a_a_reader@amazon.com revoked
		And group /pipelinesConnectorsTagTests/b has user pipelinesConnectorsTagTests_b_admin@amazon.com revoked

	Scenario: Teardown: Delete groups
		Given group /pipelinesConnectorsTagTests/a/a/a/a has been removed
		And group /pipelinesConnectorsTagTests/a/a/a has been removed
		And group /pipelinesConnectorsTagTests/a/a has been removed
		And group /pipelinesConnectorsTagTests/a has been removed
		And group /pipelinesConnectorsTagTests/b has been removed
		And group /pipelinesConnectorsTagTests has been removed
