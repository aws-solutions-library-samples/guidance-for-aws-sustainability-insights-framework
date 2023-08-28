@setup_impacts @impacts
Feature:

	This feature tests the granting/revocation of access to activities between groups, therefore only focuses on testing
	responses related to that workflow and not general API permissions or activity resource attributes.

	Scenario: Setup users

	Sets up test data which results in 2 group hierarchies `/activitiesGroupTests/a/b/c` and `/activitiesGroupTests/d/e/f`, with
	users of varying roles created at the different groups. Each user is an explicit member of 1 group wiht the exception of
	`activitiesGroupTests_a_admin@amazon.com` who has access to both group `/activitiesGroupTests/a` and `/activitiesGroupTests/d`.

		Given group /activitiesGroupTests exists
		And group /activitiesGroupTests has user activitiesGroupTests_admin@amazon.com with role admin and password p@ssword1
		And group /activitiesGroupTests/a exists
		And group /activitiesGroupTests/a has user activitiesGroupTests_a_admin@amazon.com with role admin and password p@ssword1
		And group /activitiesGroupTests/a has user activitiesGroupTests_a_contributor@amazon.com with role contributor and password p@ssword1
		And group /activitiesGroupTests/a/b exists
		And group /activitiesGroupTests/a/b/c exists
		And group /activitiesGroupTests/a/b/c has user activitiesGroupTests_a_b_c_admin@amazon.com with role admin and password p@ssword1
		And group /activitiesGroupTests/a/b/c has user activitiesGroupTests_a_b_c_contributor@amazon.com with role contributor and password p@ssword1
		And group /activitiesGroupTests/d exists
		And group /activitiesGroupTests/d has user activitiesGroupTests_a_admin@amazon.com granted access with role admin
		And group /activitiesGroupTests/d has user activitiesGroupTests_d_admin@amazon.com with role admin and password p@ssword1
		And group /activitiesGroupTests/d has user activitiesGroupTests_d_contributor@amazon.com with role contributor and password p@ssword1
		And group /activitiesGroupTests/d/e exists
		And group /activitiesGroupTests/d/e/f exists
		And group /activitiesGroupTests/d/e/f has user activitiesGroupTests_d_e_f_admin@amazon.com with role admin and password p@ssword1

	Scenario: Setup: Admin creates new resource at level /activitiesGroupTests
		Given I authenticate using email activitiesGroupTests_admin@amazon.com and password p@ssword1
		And I set body to {"name": "minimum","description": "excludes carbon sequestration","attributes": {"ref_unit":"therm"},"impacts": {"co2e":{"name": "CO2e","attributes": {"unit": "kg"},"components": {"co2":{"key": "co2","value": 5.304733389,"type": "pollutant","description": "","label": ""}}}}}
		When I POST to /activities
		Then response code should be 201
		And I store the value of body path $.id as minimum_id in global scope

	Scenario: Contributor member of leaf group /activitiesGroupTests/a/b/c can access resource created at higher level /activitiesGroupTests
		Given I authenticate using email activitiesGroupTests_a_b_c_contributor@amazon.com and password p@ssword1
		When I GET /activities/`minimum_id`
		Then response code should be 200
		And response body path $.id should be `minimum_id`

	Scenario: Setup: Admin creates new resource at level /activitiesGroupTests/a
		Given I authenticate using email activitiesGroupTests_a_admin@amazon.com and password p@ssword1
		And I set body to {"name": "minimum_a","description": "excludes carbon sequestration","attributes": {"ref_unit":"therm"},"impacts": {"co2e":{"name": "CO2e","attributes": {"unit": "kg"},"components": {"co2":{"key": "co2","value": 5.304733389,"type": "pollutant","description": "","label": ""}}}}}
		When I POST to /activities
		Then response code should be 201
		And I store the value of body path $.id as minimum_a_id in global scope

	Scenario: Admin member of sibling group /activitiesGroupTests/d cannot access resource created at level /activitiesGroupTests/a
		Given I authenticate using email activitiesGroupTests_d_admin@amazon.com and password p@ssword1
		When I GET /activities/`minimum_a_id`
		Then response code should be 403

	Scenario: Admin member of parent group /activitiesGroupTests cannot access resource created at level /activitiesGroupTests/a
		Given I authenticate using email activitiesGroupTests_admin@amazon.com and password p@ssword1
		When I GET /activities/`minimum_a_id`
		Then response code should be 403

	Scenario: Admin of another group hierarchy cannot create new activity
		Given I authenticate using email activitiesGroupTests_d_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /activitiesGroupTests/a
		And I set body to {"name": "minimum_invalid","description": "excludes carbon sequestration","attributes": {"ref_unit":"therm"},"impacts": {"co2e":{"name": "CO2e","attributes": {"unit": "kg"},"components": {"co2":{"key": "co2","value": 5.304733389,"type": "pollutant","description": "","label": ""}}}}}
		When I POST to /activities
		Then response code should be 403

	Scenario: Creating activities with duplicate names within the same group hierarchy is allowed
		Given I authenticate using email activitiesGroupTests_a_b_c_admin@amazon.com and password p@ssword1
		And I set body to {"name": "minimum","description": "excludes carbon sequestration","attributes": {"ref_unit":"therm"},"impacts": {"co2e":{"name": "CO2e","attributes": {"unit": "kg"},"components": {"co2":{"key": "co2","value": 5.304733389,"type": "pollutant","description": "","label": ""}}}}}
		When I POST to /activities
		Then response code should be 201
		And I store the value of body path $.id as minimum_a_b_c_id in global scope

	Scenario: Creating activities with duplicate names within the same group hierarchy is allowed
		Given I authenticate using email activitiesGroupTests_a_admin@amazon.com and password p@ssword1
		And I set body to {"name": "minimum","description": "excludes carbon sequestration","attributes": {"ref_unit":"therm"},"impacts": {"co2e":{"name": "CO2e","attributes": {"unit": "kg"},"components": {"co2":{"key": "co2","value": 5.304733389,"type": "pollutant","description": "","label": ""}}}}}
		When I POST to /activities
		Then response code should be 201
		And I store the value of body path $.id as minimum_a_alias_id in global scope

	Scenario: Creating activities with a globally duplicate name but unique within a different group hierarchy is allowed
		Given I authenticate using email activitiesGroupTests_d_admin@amazon.com and password p@ssword1
		And I set body to {"name": "minimum_a","description": "excludes carbon sequestration","attributes": {"ref_unit":"therm"},"impacts": {"co2e":{"name": "CO2e","attributes": {"unit": "kg"},"components": {"co2":{"key": "co2","value": 5.304733389,"type": "pollutant","description": "","label": ""}}}}}
		When I POST to /activities
		Then response code should be 201
		And I store the value of body path $.id as minimum_d_id in global scope

	Scenario: Retrieving activities with a globally duplicate name should returns the results from the specified group context
	Should return results created in current group /activitiesgrouptests/a
		Given I authenticate using email activitiesGroupTests_a_admin@amazon.com and password p@ssword1
		When I GET /activities?name=minimum_a
		Then response code should be 200
		And response body path $.activities.length should be 1
		And response body path $.activities[0].groups[0] should be /activitiesgrouptests/a

	Scenario: Retrieving activities with a globally duplicate name should returns the results from the specified group context
	Should return results created in current group /activitiesgrouptests/d
		Given I authenticate using email activitiesGroupTests_d_admin@amazon.com and password p@ssword1
		When I GET /activities?name=minimum_a
		Then response code should be 200
		And response body path $.activities.length should be 1
		And response body path $.activities[0].groups[0] should be /activitiesgrouptests/d

	# Listing resources by alias test
	Scenario: Retrieving activities with a globally duplicate name and includeChildGroups/includeParentGroups should return resources up and down the hierarchy.
		Given I authenticate using email activitiesGroupTests_a_admin@amazon.com and password p@ssword1
		# should only return resource in current group context
		When I GET /activities?name=minimum
		Then response code should be 200
		And response body path $.activities.length should be 1
		And response body path $.activities[?(@.id=='`minimum_a_alias_id`')].id should be `minimum_a_alias_id`
		# should return resource in current group context and parent groups
		When I GET /activities?name=minimum&includeParentGroups=true
		Then response code should be 200
		And response body path $.activities.length should be 2
		And response body path $.activities[?(@.id=='`minimum_id`')].id should be `minimum_id`
		And response body path $.activities[?(@.id=='`minimum_a_alias_id`')].id should be `minimum_a_alias_id`
		# should return resource in current group context and child groups
		When I GET /activities?name=minimum&includeChildGroups=true
		Then response code should be 200
		And response body path $.activities.length should be 2
		And response body path $.activities[?(@.id=='`minimum_a_alias_id`')].id should be `minimum_a_alias_id`
		And response body path $.activities[?(@.id=='`minimum_a_b_c_id`')].id should be `minimum_a_b_c_id`
		# should return resource in current group context, child groups and parent groups
		When I GET /activities?name=minimum&includeParentGroups=true&includeChildGroups=true
		Then response code should be 200
		And response body path $.activities.length should be 3
		And response body path $.activities[?(@.id=='`minimum_id`')].id should be `minimum_id`
		And response body path $.activities[?(@.id=='`minimum_a_alias_id`')].id should be `minimum_a_alias_id`
		And response body path $.activities[?(@.id=='`minimum_a_b_c_id`')].id should be `minimum_a_b_c_id`

  # Listing resources tests
	Scenario: Retrieving activities with includeParentGroups and includeChildGroups should return resources up and down the hierarchy.
		Given I authenticate using email activitiesGroupTests_a_admin@amazon.com and password p@ssword1
		# should only return resource in current group context
		When I GET /activities
		Then response code should be 200
		And response body path $.activities.length should be 2
		And response body path $.activities[?(@.id=='`minimum_a_alias_id`')].id should be `minimum_a_alias_id`
		And response body path $.activities[?(@.id=='`minimum_a_id`')].id should be `minimum_a_id`
		# should return resource in current group context and parent groups
		When I GET /activities?includeParentGroups=true
		Then response code should be 200
		And response body path $.activities.length should be 3
		And response body path $.activities[?(@.id=='`minimum_id`')].id should be `minimum_id`
		And response body path $.activities[?(@.id=='`minimum_a_id`')].id should be `minimum_a_id`
		And response body path $.activities[?(@.id=='`minimum_a_alias_id`')].id should be `minimum_a_alias_id`
		# should return resource in current group context and child groups
		When I GET /activities?includeChildGroups=true
		Then response code should be 200
		And response body path $.activities.length should be 3
		And response body path $.activities[?(@.id=='`minimum_a_id`')].id should be `minimum_a_id`
		And response body path $.activities[?(@.id=='`minimum_a_alias_id`')].id should be `minimum_a_alias_id`
		And response body path $.activities[?(@.id=='`minimum_a_b_c_id`')].id should be `minimum_a_b_c_id`
		# should return resource in current group context, child groups and parent groups
		When I GET /activities?includeParentGroups=true&includeChildGroups=true
		Then response code should be 200
		And response body path $.activities.length should be 4
		And response body path $.activities[?(@.id=='`minimum_a_id`')].id should be `minimum_a_id`
		And response body path $.activities[?(@.id=='`minimum_id`')].id should be `minimum_id`
		And response body path $.activities[?(@.id=='`minimum_a_alias_id`')].id should be `minimum_a_alias_id`

	Scenario: Admin of group /activitiesGroupTests/a can grant access of a resource to /activitiesGroupTests/d
		Given I authenticate using email activitiesGroupTests_a_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		And I PUT /activities/`minimum_a_id`/groups/%2factivitiesGroupTests%2fd
		Then response code should be 204

	Scenario: Contributor of group /activitiesGroupTests/d can access resource from /activitiesGroupTests/a once granted
		Given I authenticate using email activitiesGroupTests_d_contributor@amazon.com and password p@ssword1
		When I GET /activities/`minimum_a_id`
		Then response code should be 200
		And response body path $.id should be `minimum_a_id`

	Scenario: Admin of /activitiesGroupTests/d/e/f cannot revoke access to higher group /activitiesGroupTests/d
		Given I authenticate using email activitiesGroupTests_d_e_f_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		And I DELETE /activities/`minimum_a_id`/groups/%2factivitiesGroupTests%2fd
		Then response code should be 403

	Scenario: Admin of /activitiesGroupTests/d can revoke access to /activitiesGroupTests/d
		Given I authenticate using email activitiesGroupTests_d_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		And I DELETE /activities/`minimum_a_id`/groups/%2factivitiesGroupTests%2fd
		Then response code should be 204

	Scenario: Admin of /activitiesGroupTests/d cannot access resource once revoked from /activitiesGroupTests/d
		Given I authenticate using email activitiesGroupTests_d_admin@amazon.com and password p@ssword1
		When I GET /activities/`minimum_a_id`
		Then response code should be 403

	Scenario: Contributor of /activitiesGroupTests/a can still access resource after revocation from /activitiesGroupTests/d
		Given I authenticate using email activitiesGroupTests_a_contributor@amazon.com and password p@ssword1
		When I GET /activities/`minimum_a_id`
		Then response code should be 200
		And response body path $.id should be `minimum_a_id`

	Scenario: Teardown: Delete activity `minimum_id`
		Given I authenticate using email activitiesGroupTests_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		When I DELETE /activities/`minimum_id`
		Then response code should be 204
		When I GET /activities/`minimum_id`
		Then response code should be 404

	Scenario: Teardown: Delete activity `minimum_a_id`
		Given I authenticate using email activitiesGroupTests_a_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		When I DELETE /activities/`minimum_a_id`
		Then response code should be 204
		When I GET /activities/`minimum_a_id`
		Then response code should be 404
		When I DELETE /activities/`minimum_a_alias_id`
		Then response code should be 204
		When I GET /activities/`minimum_a_alias_id`
		Then response code should be 404

	Scenario: Teardown: Delete activity `minimum_d_id`
		Given I authenticate using email activitiesGroupTests_d_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		When I DELETE /activities/`minimum_d_id`
		Then response code should be 204
		When I GET /activities/`minimum_d_id`
		Then response code should be 404

	Scenario: Teardown: Delete activity `minimum_a_b_c_id`
		Given I authenticate using email activitiesGroupTests_a_b_c_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		When I DELETE /activities/`minimum_a_b_c_id`
		Then response code should be 204
		When I GET /activities/`minimum_a_b_c_id`
		Then response code should be 404

	Scenario: Teardown: Revoke users
		Given group /activitiesGroupTests has user activitiesGroupTests_admin@amazon.com revoked
		And group /activitiesGroupTests/a has user activitiesGroupTests_a_admin@amazon.com revoked
		And group /activitiesGroupTests/a has user activitiesGroupTests_a_contributor@amazon.com revoked
		And group /activitiesGroupTests/a/b/c has user activitiesGroupTests_a_b_c_admin@amazon.com revoked
		And group /activitiesGroupTests/a/b/c has user activitiesGroupTests_a_b_c_contributor@amazon.com revoked
		And group /activitiesGroupTests/d has user activitiesGroupTests_a_admin@amazon.com revoked
		And group /activitiesGroupTests/d has user activitiesGroupTests_d_admin@amazon.com revoked
		And group /activitiesGroupTests/d has user activitiesGroupTests_d_contributor@amazon.com revoked
		And group /activitiesGroupTests/d/e/f has user activitiesGroupTests_d_e_f_admin@amazon.com revoked

	Scenario: Teardown: Delete groups
		Given group /activitiesGroupTests/a/b/c has been removed
		And group /activitiesGroupTests/a/b has been removed
		And group /activitiesGroupTests/a has been removed
		And group /activitiesGroupTests/d/e/f has been removed
		And group /activitiesGroupTests/d/e has been removed
		And group /activitiesGroupTests/d has been removed
		And group /activitiesGroupTests has been removed
