@setup_calculations @calculations
Feature:

	This feature tests the granting/revocation of access to calculations between groups, therefore only focuses on testing
	responses related to that workflow and not general API permissions or calculation resource attributes.

	Scenario: Setup users

	Sets up test data which results in 2 group hierarchies `/calculationsGroupTests/a/b/c` and `/calculationsGroupTests/d/e/f`, with
	users of varying roles created at the different groups. Each user is an explicit member of 1 group with the exception of
	`calculationsGroupTests_a_admin@amazon.com` who has access to both group `/calculationsGroupTests/a` and `/calculationsGroupTests/d`.

		Given group /calculationsGroupTests exists
		And group /calculationsGroupTests has user calculationsGroupTests_admin@amazon.com with role admin and password p@ssword1
		And group /calculationsGroupTests/a exists
		And group /calculationsGroupTests/a has user calculationsGroupTests_a_admin@amazon.com with role admin and password p@ssword1
		And group /calculationsGroupTests/a has user calculationsGroupTests_a_contributor@amazon.com with role contributor and password p@ssword1
		And group /calculationsGroupTests/a/b exists
		And group /calculationsGroupTests/a/b/c exists
		And group /calculationsGroupTests/a/b/c has user calculationsGroupTests_a_b_c_admin@amazon.com with role admin and password p@ssword1
		And group /calculationsGroupTests/a/b/c has user calculationsGroupTests_a_b_c_contributor@amazon.com with role contributor and password p@ssword1
		And group /calculationsGroupTests/d exists
		And group /calculationsGroupTests/d has user calculationsGroupTests_a_admin@amazon.com granted access with role admin
		And group /calculationsGroupTests/d has user calculationsGroupTests_d_admin@amazon.com with role admin and password p@ssword1
		And group /calculationsGroupTests/d has user calculationsGroupTests_d_contributor@amazon.com with role contributor and password p@ssword1
		And group /calculationsGroupTests/d/e exists
		And group /calculationsGroupTests/d/e/f exists
		And group /calculationsGroupTests/d/e/f has user calculationsGroupTests_d_e_f_admin@amazon.com with role admin and password p@ssword1

	Scenario: Setup: Admin creates new resource at level /calculationsGroupTests
		Given I authenticate using email calculationsGroupTests_admin@amazon.com and password p@ssword1
		And I set body to {"name":"minimum","summary":"Adds 2 numbers.","formula":":a","parameters":[{"index":0,"key":"a","label":"a","description":"a","type":"string"}],"outputs":[{"name":"b","description":"b","type":"string"}]}
		When I POST to /calculations
		Then response code should be 201
		And I store the value of body path $.id as minimum_id in global scope

	Scenario: Contributor member of leaf group /calculationsGroupTests/a/b/c can access resource created at higher level /calculationsGroupTests
		Given I authenticate using email calculationsGroupTests_a_b_c_contributor@amazon.com and password p@ssword1
		When I GET /calculations/`minimum_id`
		Then response code should be 200
		And response body path $.id should be `minimum_id`

	Scenario: Setup: Admin creates new resource at level /calculationsGroupTests/a
		Given I authenticate using email calculationsGroupTests_a_admin@amazon.com and password p@ssword1
		And I set body to {"name":"minimum_a","summary":"Adds 2 numbers.","formula":":a","parameters":[{"index":0,"key":"a","label":"a","description":"a","type":"string"}],"outputs":[{"name":"b","description":"b","type":"string"}]}
		When I POST to /calculations
		Then response code should be 201
		And I store the value of body path $.id as minimum_a_id in global scope

	Scenario: Admin member of sibling group /calculationsGroupTests/d cannot access resource created at level /calculationsGroupTests/a
		Given I authenticate using email calculationsGroupTests_d_admin@amazon.com and password p@ssword1
		When I GET /calculations/`minimum_a_id`
		Then response code should be 403

	Scenario: Admin member of parent group /calculationsGroupTests cannot access resource created at level /calculationsGroupTests/a
		Given I authenticate using email calculationsGroupTests_admin@amazon.com and password p@ssword1
		When I GET /calculations/`minimum_a_id`
		Then response code should be 403

	Scenario: Admin of another group hierarchy cannot create new calculation
		Given I authenticate using email calculationsGroupTests_d_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /calculationsGroupTests/a
		And I set body to {"name":"minimum_invalid","summary":"Adds 2 numbers.","formula":":a","parameters":[{"index":0,"key":"a","label":"a","description":"a","type":"string"}],"outputs":[{"name":"b","description":"b","type":"string"}]}
		When I POST to /calculations
		Then response code should be 403

	Scenario: Creating calculation with duplicate name on the same group is not allowed
		Given I authenticate using email calculationsGroupTests_admin@amazon.com and password p@ssword1
		And I set body to {"name":"minimum","summary":"Adds 2 numbers.","formula":":a","parameters":[{"index":0,"key":"a","label":"a","description":"a","type":"string"}],"outputs":[{"name":"b","description":"b","type":"string"}]}
		When I POST to /calculations
		Then response code should be 409

	Scenario: Creating calculations with duplicate names in another group hierarchy is allowed
		Given I authenticate using email calculationsGroupTests_a_b_c_admin@amazon.com and password p@ssword1
		And I set body to {"name":"minimum","summary":"Adds 2 numbers.","formula":":a","parameters":[{"index":0,"key":"a","label":"a","description":"a","type":"string"}],"outputs":[{"name":"b","description":"b","type":"string"}]}
		When I POST to /calculations
		Then response code should be 201
		And I store the value of body path $.id as minimum_a_b_c_id in global scope

	Scenario: Creating calculations with duplicate names in another group hierarchy is allowed
		Given I authenticate using email calculationsGroupTests_a_admin@amazon.com and password p@ssword1
		And I set body to {"name":"minimum","summary":"Adds 2 numbers.","formula":":a","parameters":[{"index":0,"key":"a","label":"a","description":"a","type":"string"}],"outputs":[{"name":"b","description":"b","type":"string"}]}
		When I POST to /calculations
		Then response code should be 201
		And I store the value of body path $.id as minimum_a_alias_id in global scope

	Scenario: Creating calculations with a globally duplicate name but unique within a different group hierarchy is allowed
		Given I authenticate using email calculationsGroupTests_d_admin@amazon.com and password p@ssword1
		And I set body to {"name":"minimum_a","summary":"Adds 2 numbers.","formula":":a","parameters":[{"index":0,"key":"a","label":"a","description":"a","type":"string"}],"outputs":[{"name":"b","description":"b","type":"string"}]}
		When I POST to /calculations
		Then response code should be 201
		And I store the value of body path $.id as minimum_d_id in global scope

	Scenario: Retrieving calculation with a globally duplicate name should not return resource created in sibling groups.
	Should return resource created under /calculations/a and not its sibling hierarchy /calculations/d
		Given I authenticate using email calculationsGroupTests_a_admin@amazon.com and password p@ssword1
		When I GET /calculations?name=minimum_a
		Then response code should be 200
		And response body path $.calculations.length should be 1
		And response body path $.calculations[0].groups[0] should be /calculationsgrouptests/a

	Scenario: Retrieving calculation with a globally duplicate name should not return resource created in sibling groups.
	Should return resource created under /calculations/d and not its sibling hierarchy /calculations/a
		Given I authenticate using email calculationsGroupTests_d_admin@amazon.com and password p@ssword1
		When I GET /calculations?name=minimum_a
		Then response code should be 200
		And response body path $.calculations.length should be 1
		And response body path $.calculations[0].groups[0] should be /calculationsgrouptests/d

	Scenario: Retrieving calculations with a globally duplicate name and includeChildGroups/includeParentGroups should return resources up and down the hierarchy.
		Given I authenticate using email calculationsGroupTests_a_admin@amazon.com and password p@ssword1
		# should only return resource in current group context
		When I GET /calculations?name=minimum
		Then response code should be 200
		And response body path $.calculations.length should be 1
		And response body path $.calculations[?(@.id=='`minimum_a_alias_id`')].id should be `minimum_a_alias_id`
		# should return resource in current group context and parent groups
		When I GET /calculations?name=minimum&includeParentGroups=true
		Then response code should be 200
		And response body path $.calculations.length should be 2
		And response body path $.calculations[?(@.id=='`minimum_a_alias_id`')].id should be `minimum_a_alias_id`
		And response body path $.calculations[?(@.id=='`minimum_id`')].id should be `minimum_id`
		# should return resource in current group context and child groups
		When I GET /calculations?name=minimum&includeChildGroups=true
		Then response code should be 200
		And response body path $.calculations.length should be 2
		And response body path $.calculations[?(@.id=='`minimum_a_alias_id`')].id should be `minimum_a_alias_id`
		And response body path $.calculations[?(@.id=='`minimum_a_b_c_id`')].id should be `minimum_a_b_c_id`
		# should return resource in current group context, child groups and parent groups
		When I GET /calculations?name=minimum&includeChildGroups=true&includeParentGroups=true
		And response body path $.calculations.length should be 3
		And response body path $.calculations[?(@.id=='`minimum_a_alias_id`')].id should be `minimum_a_alias_id`
		And response body path $.calculations[?(@.id=='`minimum_id`')].id should be `minimum_id`
		And response body path $.calculations[?(@.id=='`minimum_a_b_c_id`')].id should be `minimum_a_b_c_id`

	# Listing resources tests
	Scenario: Retrieving calculation with includeParentGroups and includeChildGroups should return resources up and down the hierarchy.
		Given I authenticate using email calculationsGroupTests_a_admin@amazon.com and password p@ssword1
		# should only return resource in current group context
		When I GET /calculations
		Then response code should be 200
		And response body path $.calculations.length should be 2
		And response body path $.calculations[?(@.id=='`minimum_a_alias_id`')].id should be `minimum_a_alias_id`
		And response body path $.calculations[?(@.id=='`minimum_a_id`')].id should be `minimum_a_id`
		# should return resource in current group context and parent groups
		When I GET /calculations?includeParentGroups=true
		Then response code should be 200
		And response body path $.calculations.length should be 3
		And response body path $.calculations[?(@.id=='`minimum_a_alias_id`')].id should be `minimum_a_alias_id`
		And response body path $.calculations[?(@.id=='`minimum_a_id`')].id should be `minimum_a_id`
		And response body path $.calculations[?(@.id=='`minimum_id`')].id should be `minimum_id`
		# should return resource in current group context and child groups
		When I GET /calculations?includeChildGroups=true
		Then response code should be 200
		And response body path $.calculations[?(@.id=='`minimum_a_alias_id`')].id should be `minimum_a_alias_id`
		And response body path $.calculations[?(@.id=='`minimum_a_id`')].id should be `minimum_a_id`
		And response body path $.calculations[?(@.id=='`minimum_a_b_c_id`')].id should be `minimum_a_b_c_id`
		# should return resource in current group context, child groups and parent groups
		When I GET /calculations?includeParentGroups=true&includeChildGroups=true
		Then response code should be 200
		And response body path $.calculations.length should be 4
		And response body path $.calculations[?(@.id=='`minimum_a_alias_id`')].id should be `minimum_a_alias_id`
		And response body path $.calculations[?(@.id=='`minimum_a_id`')].id should be `minimum_a_id`
		And response body path $.calculations[?(@.id=='`minimum_id`')].id should be `minimum_id`
		And response body path $.calculations[?(@.id=='`minimum_a_b_c_id`')].id should be `minimum_a_b_c_id`

  	# Granting and revoking access tests
	Scenario: Admin of group /calculationsGroupTests/a can grant access of a resource to /calculationsGroupTests/d
		Given I authenticate using email calculationsGroupTests_a_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		And I PUT /calculations/`minimum_a_id`/groups/%2fcalculationsGroupTests%2fd
		Then response code should be 204

	Scenario: Contributor of group /calculationsGroupTests/d can access resource from /calculationsGroupTests/a once granted
		Given I authenticate using email calculationsGroupTests_d_contributor@amazon.com and password p@ssword1
		When I GET /calculations/`minimum_a_id`
		Then response code should be 200
		And response body path $.id should be `minimum_a_id`

	Scenario: Admin of /calculationsGroupTests/d/e/f cannot revoke access to higher group /calculationsGroupTests/d
		Given I authenticate using email calculationsGroupTests_d_e_f_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		And I DELETE /calculations/`minimum_a_id`/groups/%2fcalculationsGroupTests%2fd
		Then response code should be 403

	Scenario: Admin of /calculationsGroupTests/d can revoke access to /calculationsGroupTests/d
		Given I authenticate using email calculationsGroupTests_d_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		And I DELETE /calculations/`minimum_a_id`/groups/%2fcalculationsGroupTests%2fd
		Then response code should be 204

	Scenario: Admin of /calculationsGroupTests/d cannot access resource once revoked from /calculationsGroupTests/d
		Given I authenticate using email calculationsGroupTests_d_admin@amazon.com and password p@ssword1
		When I GET /calculations/`minimum_a_id`
		Then response code should be 403

	Scenario: Contributor of /calculationsGroupTests/a can still access resource after revocation from /calculationsGroupTests/d
		Given I authenticate using email calculationsGroupTests_a_contributor@amazon.com and password p@ssword1
		When I GET /calculations/`minimum_a_id`
		Then response code should be 200
		And response body path $.id should be `minimum_a_id`

  	# Clean up resources
	Scenario: Teardown: Delete calculation `minimum_id`
		Given I authenticate using email calculationsGroupTests_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		When I DELETE /calculations/`minimum_id`
		Then response code should be 204
		When I GET /calculations/`minimum_id`
		Then response code should be 404

	Scenario: Teardown: Delete calculation `minimum_a_id` and `minimum_a_alias_id`
		Given I authenticate using email calculationsGroupTests_a_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		When I DELETE /calculations/`minimum_a_id`
		Then response code should be 204
		When I GET /calculations/`minimum_a_id`
		Then response code should be 404
		When I DELETE /calculations/`minimum_a_alias_id`
		Then response code should be 204
		When I GET /calculations/`minimum_a_alias_id`
		Then response code should be 404

	Scenario: Teardown: Delete calculation `minimum_a_b_c_id`
		Given I authenticate using email calculationsGroupTests_a_b_c_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		When I DELETE /calculations/`minimum_a_b_c_id`
		Then response code should be 204
		When I GET /calculations/`minimum_a_b_c_id`
		Then response code should be 404

	Scenario: Teardown: Delete calculation `minimum_d_id`
		Given I authenticate using email calculationsGroupTests_d_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		When I DELETE /calculations/`minimum_d_id`
		Then response code should be 204
		When I GET /calculations/`minimum_d_id`
		Then response code should be 404

	Scenario: Teardown: Revoke users
		Given group /calculationsGroupTests has user calculationsGroupTests_admin@amazon.com revoked
		And group /calculationsGroupTests/a has user calculationsGroupTests_a_admin@amazon.com revoked
		And group /calculationsGroupTests/a has user calculationsGroupTests_a_contributor@amazon.com revoked
		And group /calculationsGroupTests/a/b/c has user calculationsGroupTests_a_b_c_admin@amazon.com revoked
		And group /calculationsGroupTests/a/b/c has user calculationsGroupTests_a_b_c_contributor@amazon.com revoked
		And group /calculationsGroupTests/d has user calculationsGroupTests_a_admin@amazon.com revoked
		And group /calculationsGroupTests/d has user calculationsGroupTests_d_admin@amazon.com revoked
		And group /calculationsGroupTests/d has user calculationsGroupTests_d_contributor@amazon.com revoked
		And group /calculationsGroupTests/d/e/f has user calculationsGroupTests_d_e_f_admin@amazon.com revoked

	Scenario: Teardown: Delete groups
		Given group /calculationsGroupTests/a/b/c has been removed
		And group /calculationsGroupTests/a/b has been removed
		And group /calculationsGroupTests/a has been removed
		And group /calculationsGroupTests/d/e/f has been removed
		And group /calculationsGroupTests/d/e has been removed
		And group /calculationsGroupTests/d has been removed
		And group /calculationsGroupTests has been removed
