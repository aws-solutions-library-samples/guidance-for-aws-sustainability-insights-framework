@setup_impacts @impacts
Feature:

  	This feature tests the tagging of resources, therefore only focuses on testing responses and attributes specific to it.

	Scenario: Setup users
		Given group /activitiesTagTests exists
		And group /activitiesTagTests/a exists
		And group /activitiesTagTests/a has user activitiesTagTests_a_admin@amazon.com with role admin and password p@ssword1
		And group /activitiesTagTests/a has user activitiesTagTests_a_reader@amazon.com with role reader and password p@ssword1
		And group /activitiesTagTests/a/a exists
		And group /activitiesTagTests/a/a/a exists
		And group /activitiesTagTests/a/a/a/a exists
		And group /activitiesTagTests/a/a/a/a has user activitiesTagTests_a_a_a_a_reader@amazon.com with role reader and password p@ssword1
		And group /activitiesTagTests/b exists
		And group /activitiesTagTests/b has user activitiesTagTests_b_admin@amazon.com with role admin and password p@ssword1

	Scenario: Setup: Admin can create new resource (1) with tags

		New resource is created with a tag 'datasource' of 'GHG Protocol' and a hierarhical tag 'type' of 'Material/Metal/Steel'.

		Given I authenticate using email activitiesTagTests_a_admin@amazon.com and password p@ssword1
		And I set body to {"name": "activity_1","description": "excludes carbon sequestration","attributes": {"ref_unit":"therm"},"tags":{"datasource":"GHG Protocol","type":"Material/Metal/Steel"},"groups": ["/usa/northwest"],"impacts": {"co2e":{"name": "CO2e","attributes": {"unit": "kg"},"components": {"co2e":{"key": "co2","value": 5.304733389,"type": "pollutant","description": "","label": ""}}}}}
		When I POST to /activities
		Then response code should be 201
		And response body should contain id
		And response body path $.tags.datasource should be GHG Protocol
		And response body path $.tags.type should be Material/Metal/Steel
		And I store the value of body path $.id as activity_1_id in global scope

	Scenario: Setup: Admin can create new resource (2) with tags

		New resource is created with a tag 'datasource' of 'GHG Protocol' and a hierarhical tag 'type' of 'Material/Metal/Iron'.

		When I pause for 1000ms
		Given I authenticate using email activitiesTagTests_a_admin@amazon.com and password p@ssword1
		And I set body to {"name": "activity_2","description": "excludes carbon sequestration","attributes": {"ref_unit":"therm"},"tags": {"datasource":"GHG Protocol","type":"Material/Metal/Iron"},"groups": ["/usa/northwest"],"impacts": {"co2e":{"name": "CO2e","attributes": {"unit": "kg"},"components": {"co2":{"key": "co2","value": 5.304733389,"type": "pollutant","description": "","label": ""}}}}}
		When I POST to /activities
		Then response code should be 201
		And response body should contain id
		And response body path $.tags.datasource should be GHG Protocol
		And response body path $.tags.type should be Material/Metal/Iron
		And I store the value of body path $.id as activity_2_id in global scope

	Scenario: Setup: Admin can create new resource (3) with tags

		New resource is created with a tag 'datasource' of 'Green Button Alliance' and a hierarhical tag 'type' of 'Material/Metal/Iron'.

		When I pause for 1000ms
		Given I authenticate using email activitiesTagTests_a_admin@amazon.com and password p@ssword1
		And I set body to {"name": "activity_3","description": "excludes carbon sequestration","attributes": {"ref_unit":"therm"},"tags":{"datasource":"Green Button Alliance","type":"Material/Metal/Iron"},"groups": ["/usa/northwest"],"impacts": {"co2e":{"name": "CO2e","attributes": {"unit": "kg"},"components": {"co2":{"key": "co2","value": 5.304733389,"type": "pollutant","description": "","label": ""}}}}}
		When I POST to /activities
		Then response code should be 201
		And response body should contain id
		And response body path $.tags.datasource should be Green Button Alliance
		And response body path $.tags.type should be Material/Metal/Iron
		And I store the value of body path $.id as activity_3_id in global scope

	Scenario: Setup: Admin can create new resource (4) with tags

		New resource is created with a tag 'datasource' of 'Green Button Alliance' and a hierarhical tag 'type' of 'Material/Plastic/ABS'.

		When I pause for 1000ms
		Given I authenticate using email activitiesTagTests_a_admin@amazon.com and password p@ssword1
		And I set body to {"name": "activity_4","description": "excludes carbon sequestration","attributes": {"ref_unit":"therm"}, "tags":{"datasource":"Green Button Alliance","type":"Material/Plastic/ABS"},"groups": ["/usa/northwest"],"impacts": {"co2e":{"name": "CO2e","attributes": {"unit": "kg"},"components": {"co2":{"key": "co2","value": 5.304733389,"type": "pollutant","description": "","label": ""}}}}}
		When I POST to /activities
		Then response code should be 201
		And response body should contain id
		And response body path $.tags.datasource should be Green Button Alliance
		And response body path $.tags.type should be Material/Plastic/ABS
		And I store the value of body path $.id as activity_4_id in global scope

	Scenario: Setup: Admin can create new resource (5) with tags

		New resource is created with a tag 'datasource' of 'GHG Protocol' and a hierarchical tag 'type' of 'Material/Metal/Steel'
		but associated with group '/activitiesTagTests/b' therefore should not be returned in any results in the scenario.

		When I pause for 1000ms
		Given I authenticate using email activitiesTagTests_b_admin@amazon.com and password p@ssword1
		And I set body to {"name": "activity_5","description": "excludes carbon sequestration","attributes": {"ref_unit":"therm"},"tags":{"datasource":"GHG Protocol","type":"Material/Metal/Steel"},"groups": ["/usa/northwest"],"impacts": {"co2e":{"name": "CO2e","attributes": {"unit": "kg"},"components": {"co2":{"key": "co2","value": 5.304733389,"type": "pollutant","description": "","label": ""}}}}}
		When I POST to /activities
		Then response code should be 201
		And response body should contain id
		And response body path $.tags.datasource should be GHG Protocol
		And response body path $.tags.type should be Material/Metal/Steel
		And I store the value of body path $.id as activity_5_id in global scope

	Scenario: Reader can retrieve resource 1 and has expected tags
		When I pause for 1000ms
		Given I authenticate using email activitiesTagTests_a_reader@amazon.com and password p@ssword1
		When I GET /activities/`activity_1_id`
		Then response code should be 200
		And response body path $.tags.datasource should be GHG Protocol
		And response body path $.tags.type should be Material/Metal/Steel

	Scenario: Reader can list resources and filter by tags (example 1)

		Filtering by group '/activitiesTagTests/a' and 'datasource' = 'GHG Protocol'.

		When I pause for 1000ms
		Given I authenticate using email activitiesTagTests_a_reader@amazon.com and password p@ssword1
		And I set query parameters to
			| parameter | value |
			| tags | datasource:GHG Protocol     |
		When I GET /activities
		Then response code should be 200
		And response body path $.activities.length should be 2
		And response body path $.activities[0].id should be `activity_1_id`
		And response body path $.activities[1].id should be `activity_2_id`

	Scenario: Reader can list resources and filter by tags (example 2)

		Filtering by group '/activitiesTagTests/a' and 'datasource' = 'GHG Protocol' and 'type' = 'Material/Metal/Steel'.

		When I pause for 1000ms
		Given I authenticate using email activitiesTagTests_a_reader@amazon.com and password p@ssword1
		And I set query parameters to
			| parameter | value |
			| tags | datasource:GHG Protocol     |
			| tags | type:Material/Metal/Steel  |
		When I GET /activities
		Then response code should be 200
		And response body path $.activities.length should be 1
		And response body path $.activities[0].id should be `activity_1_id`

	Scenario: Reader can list resources and filter by tags (example 3)

		Filtering by group '/activitiesTagTests/a' and 'type' = 'Material/Plastic'.

		When I pause for 1000ms
		Given I authenticate using email activitiesTagTests_a_reader@amazon.com and password p@ssword1
		And I set query parameters to
			| parameter | value |
			| tags | type:Material/Plastic     |
		When I GET /activities
		Then response code should be 200
		And response body path $.activities.length should be 1
		And response body path $.activities[0].id should be `activity_4_id`

	Scenario: Reader can list tag values for a given key (example 1)

		Filtering by group '/activitiesTagTests/a' and listing values for 'datasource' tag.

		When I pause for 1000ms
		Given I authenticate using email activitiesTagTests_a_reader@amazon.com and password p@ssword1
		When I GET /tags/datasource
		Then response code should be 200
		And response body path $.values.["ghg protocol"] should be GHG Protocol
		And response body path $.values.["green button alliance"] should be Green Button Alliance

	Scenario: Reader can list tag values for a given key (example 2)

		Filtering by group '/activitiesTagTests/b' and listing values for 'datasource' tag.

		When I pause for 1000ms
		Given I authenticate using email activitiesTagTests_b_admin@amazon.com and password p@ssword1
		When I GET /tags/datasource
		Then response code should be 200
		And response body path $.values.["ghg protocol"] should be GHG Protocol
		And response body should not contain values.["green button alliance"]

	Scenario: Reader can list tag values for a given key (example 3)

		Filtering by group '/activitiesTagTests/a' and listing values for 'type' tag.

		When I pause for 1000ms
		Given I authenticate using email activitiesTagTests_a_admin@amazon.com and password p@ssword1
		When I GET /tags/type
		Then response code should be 200
		And response body path $.values.material should be Material

	Scenario: Reader can list tag values for a given key (example 4)

		Filtering by group '/activitiesTagTests/a' and listing values for 'type' tag and parent value 'Material'.

		When I pause for 1000ms
		Given I authenticate using email activitiesTagTests_a_admin@amazon.com and password p@ssword1
		When I GET /tags/type?parentValue=material
		Then response code should be 200
		And response body path $.values.["material/metal"] should be Metal
		And response body path $.values.["material/plastic"] should be Plastic

	Scenario: Reader can list tag values for a given key (example 5)

		Filtering by group '/activitiesTagTests/a' and listing values for 'type' tag and parent value 'material/metal'.

		When I pause for 1000ms
		Given I authenticate using email activitiesTagTests_a_admin@amazon.com and password p@ssword1
		When I GET /tags/type?parentValue=material%2fmetal
		Then response code should be 200
		And response body path $.values.["material/metal/steel"] should be Steel

	Scenario: Reader of sub group can list tag values for a given key

		Filtering by group '/activitiesTagTests/a/a/a/a' and listing values for 'type' tag and parent value 'Material'.

		When I pause for 1000ms
		Given I authenticate using email activitiesTagTests_a_a_a_a_reader@amazon.com and password p@ssword1
		And I pause for 2000ms
		When I GET /tags/type?parentValue=material
		Then response code should be 200
		And response body path $.values.["material/metal"] should be Metal
		And response body path $.values.["material/plastic"] should be Plastic

	Scenario: Admin can update resource with tags

		Existing resource is updated so 'datasource' tag is removed and hierarhical tag 'type' changed from 'Material/Plastic/ABS' to 'Material/Metal/Iron'.

		When I pause for 1000ms
		Given I authenticate using email activitiesTagTests_a_admin@amazon.com and password p@ssword1
		And I set body to {"tags":{"datasource":null,"type":"Material/Metal/Iron"}}
		When I PATCH /activities/`activity_4_id`
		Then response code should be 200
		And response body should not contain tags.datasource
		And response body path $.tags.type should be Material/Metal/Iron

	Scenario: Reader of sub group listing tag values should see updated tags summarized

		Filtering by group '/activitiesTagTests/a/a/a/a' and listing values for 'type' tag and parent value 'Material'.

		When I pause for 1000ms
		Given I authenticate using email activitiesTagTests_a_a_a_a_reader@amazon.com and password p@ssword1
		And I pause for 2000ms
		When I GET /tags/type?parentValue=material
		Then response code should be 200
		And response body path $.values.["material/metal"] should be Metal
		And response body should not contain tags.["material/plastic"]

	Scenario: Teardown: Delete activity `activity_1_id`
		Given I authenticate using email activitiesTagTests_a_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		When I DELETE /activities/`activity_1_id`
		Then response code should be 204
		When I GET /activities/`activity_1_id`
		Then response code should be 404

	Scenario: Teardown: Delete activity `activity_2_id`
		Given I authenticate using email activitiesTagTests_a_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		When I DELETE /activities/`activity_2_id`
		Then response code should be 204
		When I GET /activities/`activity_2_id`
		Then response code should be 404

	Scenario: Teardown: Delete activity `activity_3_id`
		Given I authenticate using email activitiesTagTests_a_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		When I DELETE /activities/`activity_3_id`
		Then response code should be 204
		When I GET /activities/`activity_3_id`
		Then response code should be 404

	Scenario: Teardown: Delete activity `activity_4_id`
		Given I authenticate using email activitiesTagTests_a_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		When I DELETE /activities/`activity_4_id`
		Then response code should be 204
		When I GET /activities/`activity_4_id`
		Then response code should be 404

	Scenario: Teardown: Delete activity `activity_5_id`
		Given I authenticate using email activitiesTagTests_b_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		When I DELETE /activities/`activity_5_id`
		Then response code should be 204
		When I GET /activities/`activity_5_id`
		Then response code should be 404

	Scenario: Teardown: Revoke users
		Given group /activitiesTagTests/a has user activitiesTagTests_a_admin@amazon.com revoked
		And group /activitiesTagTests/a has user activitiesTagTests_a_reader@amazon.com revoked
		And group /activitiesTagTests/a/a/a/a has user activitiesTagTests_a_a_a_a_reader@amazon.com revoked
		And group /activitiesTagTests/b has user activitiesTagTests_b_admin@amazon.com revoked

	Scenario: Teardown: Delete groups
		Given group /activitiesTagTests/a/a/a/a has been removed
		And group /activitiesTagTests/a/a/a has been removed
		And group /activitiesTagTests/a/a has been removed
		And group /activitiesTagTests/a has been removed
		And group /activitiesTagTests/b has been removed
		And group /activitiesTagTests has been removed
