@setup_pipelines @pipelines
Feature:

	This feature tests the granting/revocation of access to connectors between groups, therefore only focuses on testing
	responses related to that workflow and not general API permissions or pipeline connector resource attributes.

	Scenario: Setup users

	Sets up test data which results in 2 group hierarchies `/connectorsGroupTests/a/b/c` and `/connectorsGroupTests/d/e/f`, with
	users of varying roles created at the different groups. Each user is an explicit member of 1 group with the exception of
	`connectorsGroupTests_a_admin@amazon.com` who has access to both group `/connectorsGroupTests/a` and `/connectorsGroupTests/d`.

		Given group /connectorsGroupTests exists
		And group /connectorsGroupTests has user connectorsGroupTests_admin@amazon.com with role admin and password p@ssword1
		And group /connectorsGroupTests/a exists
		And group /connectorsGroupTests/a has user connectorsGroupTests_a_admin@amazon.com with role admin and password p@ssword1
		And group /connectorsGroupTests/a has user connectorsGroupTests_a_contributor@amazon.com with role contributor and password p@ssword1
		And group /connectorsGroupTests/a/b exists
		And group /connectorsGroupTests/a/b/c exists
		And group /connectorsGroupTests/a/b/c has user connectorsGroupTests_a_b_c_admin@amazon.com with role admin and password p@ssword1
		And group /connectorsGroupTests/a/b/c has user connectorsGroupTests_a_b_c_contributor@amazon.com with role contributor and password p@ssword1
		And group /connectorsGroupTests/d exists
		And group /connectorsGroupTests/d has user connectorsGroupTests_a_admin@amazon.com granted access with role admin
		And group /connectorsGroupTests/d has user connectorsGroupTests_d_admin@amazon.com with role admin and password p@ssword1
		And group /connectorsGroupTests/d has user connectorsGroupTests_d_contributor@amazon.com with role contributor and password p@ssword1
		And group /connectorsGroupTests/d/e exists
		And group /connectorsGroupTests/d/e/f exists
		And group /connectorsGroupTests/d/e/f has user connectorsGroupTests_d_e_f_admin@amazon.com with role admin and password p@ssword1

	Scenario: Setup: Admin creates new resource at level /connectorsGroupTests
		Given I authenticate using email connectorsGroupTests_admin@amazon.com and password p@ssword1
		And I set body to {"name":"pipeline_connector1","type":"input","tags":{"source":"sap"},"parameters":[{"name":"endpoint","description":"some endpoint which my connector will nee to utilize","required":true,"defaultValue":"https://..."}],"attributes":{"key1":"val","key2":"val"}}
		When I POST to /connectors
		Then response code should be 201
		And I store the value of body path $.id as pipeline_connector1_id in global scope

	Scenario: Contributor member of leaf group /connectorsGroupTests/a/b/c can access resource created at higher level /connectorsGroupTests
		Given I authenticate using email connectorsGroupTests_a_b_c_contributor@amazon.com and password p@ssword1
		When I GET /connectors/`pipeline_connector1_id`
		Then response code should be 200
		And response body path $.id should be `pipeline_connector1_id`

	Scenario: Setup: Admin creates new resource at level /connectorsGroupTests/a
		Given I authenticate using email connectorsGroupTests_a_admin@amazon.com and password p@ssword1
		And I set body to {"name":"pipeline_connector1_a","tags":{"source":"sap"},"type":"input","parameters":[{"name":"endpoint","description":"some endpoint which my connector will nee to utilize","required":true,"defaultValue":"https://..."}],"attributes":{"key1":"val","key2":"val"}}
		When I POST to /connectors
		Then response code should be 201
		And I store the value of body path $.id as pipeline_connector1_a_id in global scope

	Scenario: Admin member of sibling group /connectorsGroupTests/d cannot access resource created at level /connectorsGroupTests/a
		Given I authenticate using email connectorsGroupTests_d_admin@amazon.com and password p@ssword1
		When I GET /connectors/`pipeline_connector1_a_id`
		Then response code should be 403

	Scenario: Admin member of parent group /connectorsGroupTests cannot access resource created at level /connectorsGroupTests/a
		Given I authenticate using email connectorsGroupTests_admin@amazon.com and password p@ssword1
		When I GET /connectors/`pipeline_connector1_a_id`
		Then response code should be 403

	Scenario: Admin of another group hierarchy cannot create new pipeline_connector
		Given I authenticate using email connectorsGroupTests_d_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /connectorsGroupTests/a
		And I set body to {"name":"pipeline_connector1_invalid","tags":{"source":"sap"},"type":"input","parameters":[{"name":"endpoint","description":"some endpoint which my connector will nee to utilize","required":true,"defaultValue":"https://..."}],"attributes":{"key1":"val","key2":"val"}}
		When I POST to /connectors
		Then response code should be 403

	Scenario: Creating connectors with duplicate names within the same group hierarchy is allowed
		Given I authenticate using email connectorsGroupTests_a_b_c_admin@amazon.com and password p@ssword1
		And I set body to {"name":"pipeline_connector1","tags":{"source":"sap"},"type":"input","parameters":[{"name":"endpoint","description":"some endpoint which my connector will nee to utilize","required":true,"defaultValue":"https://..."}],"attributes":{"key1":"val","key2":"val"}}
		When I POST to /connectors
		Then response code should be 201
		And I store the value of body path $.id as pipeline_connector1_a_b_c_id in global scope

	Scenario: Creating connectors with a globally duplicate name but unique within a different group hierarchy is allowed
		Given I authenticate using email connectorsGroupTests_d_admin@amazon.com and password p@ssword1
		And I set body to {"name":"pipeline_connector1_a","tags":{"source":"sap"},"type":"input","parameters":[{"name":"endpoint","description":"some endpoint which my connector will nee to utilize","required":true,"defaultValue":"https://..."}],"attributes":{"key1":"val","key2":"val"}}
		When I POST to /connectors
		Then response code should be 201
		And I store the value of body path $.id as pipeline_connector1_d_id in global scope

	Scenario: Creating connectors with duplicate names within the same group hierarchy is allowed
		Given I authenticate using email connectorsGroupTests_a_admin@amazon.com and password p@ssword1
		And I set body to {"name":"pipeline_connector1","tags":{"source":"sap"},"type":"input","parameters":[{"name":"endpoint","description":"some endpoint which my connector will nee to utilize","required":true,"defaultValue":"https://..."}],"attributes":{"key1":"val","key2":"val"}}
		When I POST to /connectors
		Then response code should be 201
		And I store the value of body path $.id as pipeline_connector1_a_alias_id in global scope

	Scenario: Retrieving pipeline_connector with a globally duplicate name should returns the results from the specified group context
	Should return results created in current group /connectorsgrouptests/a
		Given I authenticate using email connectorsGroupTests_a_admin@amazon.com and password p@ssword1
		When I GET /connectors?name=pipeline_connector1_a
		Then response code should be 200
		And response body path $.connectors.length should be 1
		And response body path $.connectors[0].groups[0] should be /connectorsgrouptests/a

	Scenario: Retrieving pipeline_connector with a globally duplicate name should returns the results from the specified group context
	Should return results created in current group /connectorsgrouptests/d
		Given I authenticate using email connectorsGroupTests_d_admin@amazon.com and password p@ssword1
		When I GET /connectors?name=pipeline_connector1_a
		Then response code should be 200
		And response body path $.connectors.length should be 1
		And response body path $.connectors[0].groups[0] should be /connectorsgrouptests/d

	# Listing resources by alias tests
	Scenario: Retrieving connectors with a globally duplicate name and includeChildGroups/includeParentGroups should return resources up and down the hierarchy.
		Given I authenticate using email connectorsGroupTests_a_admin@amazon.com and password p@ssword1
		# should only return resource in current group context
		When I GET /connectors?name=pipeline_connector1
		Then response code should be 200
		And response body path $.connectors.length should be 1
		And response body path $.connectors[?(@.id=='`pipeline_connector1_a_alias_id`')].id should be `pipeline_connector1_a_alias_id`
		# should return resource in current group context and parent groups
		When I GET /connectors?name=pipeline_connector1&includeParentGroups=true
		Then response code should be 200
		And response body path $.connectors.length should be 2
		And response body path $.connectors[?(@.id=='`pipeline_connector1_a_alias_id`')].id should be `pipeline_connector1_a_alias_id`
		And response body path $.connectors[?(@.id=='`pipeline_connector1_id`')].id should be `pipeline_connector1_id`
		# should return resource in current group context and child groups
		When I GET /connectors?name=pipeline_connector1&includeChildGroups=true
		Then response code should be 200
		And response body path $.connectors.length should be 2
		And response body path $.connectors[?(@.id=='`pipeline_connector1_a_alias_id`')].id should be `pipeline_connector1_a_alias_id`
		And response body path $.connectors[?(@.id=='`pipeline_connector1_a_b_c_id`')].id should be `pipeline_connector1_a_b_c_id`
		# should return resource in current group context, child groups and parent groups
		When I GET /connectors?name=pipeline_connector1&includeChildGroups=true&includeParentGroups=true
		Then response code should be 200
		And response body path $.connectors.length should be 3
		And response body path $.connectors[?(@.id=='`pipeline_connector1_id`')].id should be `pipeline_connector1_id`
		And response body path $.connectors[?(@.id=='`pipeline_connector1_a_alias_id`')].id should be `pipeline_connector1_a_alias_id`
		And response body path $.connectors[?(@.id=='`pipeline_connector1_a_b_c_id`')].id should be `pipeline_connector1_a_b_c_id`

	# Listing resources tests
	Scenario: Retrieving connectors with includeParentGroups and includeChildGroups should return resources up and down the hierarchy.
		Given I authenticate using email connectorsGroupTests_a_admin@amazon.com and password p@ssword1
		# should only return resource in current group context
		When I GET /connectors
		Then response code should be 200
		And response body path $.connectors.length should be 2
		And response body path $.connectors[?(@.id=='`pipeline_connector1_a_alias_id`')].id should be `pipeline_connector1_a_alias_id`
		And response body path $.connectors[?(@.id=='`pipeline_connector1_a_id`')].id should be `pipeline_connector1_a_id`
		# should return resource in current group context and parent groups
		When I GET /connectors?includeParentGroups=true
		Then response code should be 200
		# should include the cleanrooms, kinesis, csv and sif connector created by the deployment
		And response body path $.connectors.length should be 7
		And response body path $.connectors[?(@.id=='`pipeline_connector1_a_alias_id`')].id should be `pipeline_connector1_a_alias_id`
		And response body path $.connectors[?(@.id=='`pipeline_connector1_id`')].id should be `pipeline_connector1_id`
		And response body path $.connectors[?(@.id=='`pipeline_connector1_a_id`')].id should be `pipeline_connector1_a_id`
		# should return resource in current group context and child groups
		When I GET /connectors?includeChildGroups=true
		Then response code should be 200
		And response body path $.connectors.length should be 3
		And response body path $.connectors[?(@.id=='`pipeline_connector1_a_alias_id`')].id should be `pipeline_connector1_a_alias_id`
		And response body path $.connectors[?(@.id=='`pipeline_connector1_a_b_c_id`')].id should be `pipeline_connector1_a_b_c_id`
		And response body path $.connectors[?(@.id=='`pipeline_connector1_a_id`')].id should be `pipeline_connector1_a_id`
		# should return resource in current group context, child groups, parent groups and kinesis csv sif connectors
		When I GET /connectors?includeChildGroups=true&includeParentGroups=true
		Then response code should be 200
		And response body path $.connectors.length should be 8
		And response body path $.connectors[?(@.id=='`pipeline_connector1_id`')].id should be `pipeline_connector1_id`
		And response body path $.connectors[?(@.id=='`pipeline_connector1_a_alias_id`')].id should be `pipeline_connector1_a_alias_id`
		And response body path $.connectors[?(@.id=='`pipeline_connector1_a_b_c_id`')].id should be `pipeline_connector1_a_b_c_id`
		And response body path $.connectors[?(@.id=='`pipeline_connector1_a_id`')].id should be `pipeline_connector1_a_id`

	Scenario: Admin of group /connectorsGroupTests/a can grant access of a resource to /connectorsGroupTests/d

	Scenario: Admin of group /connectorsGroupTests/a can grant access of a resource to /connectorsGroupTests/d
		Given I authenticate using email connectorsGroupTests_a_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		And I PUT /connectors/`pipeline_connector1_a_id`/groups/%2fconnectorsGroupTests%2fd
		Then response code should be 204

	Scenario: Contributor of group /connectorsGroupTests/d can access resource from /connectorsGroupTests/a once granted
		Given I authenticate using email connectorsGroupTests_d_contributor@amazon.com and password p@ssword1
		When I GET /connectors/`pipeline_connector1_a_id`
		Then response code should be 200
		And response body path $.id should be `pipeline_connector1_a_id`

	Scenario: Admin of group /connectorsGroupTests/d cannot delete resource pipeline_connector1
	because it does not belong to all groups that are associated with pipeline_connector1 (/connectorsGroupTests/a)
		Given I authenticate using email connectorsGroupTests_d_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		When I DELETE /connectors/`pipeline_connector1_a_id`
		Then response code should be 403
		And response body path $.message should be connectorsgrouptests_d_admin@amazon.com is not an admin on the groups {"/connectorsgrouptests/d":"admin"}

	Scenario: Admin of /connectorsGroupTests/d/e/f cannot revoke access to higher group /connectorsGroupTests/d
		Given I authenticate using email connectorsGroupTests_d_e_f_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		And I DELETE /connectors/`pipeline_connector1_a_id`/groups/%2fconnectorsGroupTests%2fd
		Then response code should be 403

	Scenario: Admin of /connectorsGroupTests/d can revoke access to /connectorsGroupTests/d
		Given I authenticate using email connectorsGroupTests_d_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		And I DELETE /connectors/`pipeline_connector1_a_id`/groups/%2fconnectorsGroupTests%2fd
		Then response code should be 204

	Scenario: Admin of /connectorsGroupTests/d cannot access resource once revoked from /connectorsGroupTests/d
		Given I authenticate using email connectorsGroupTests_d_admin@amazon.com and password p@ssword1
		When I GET /connectors/`pipeline_connector1_a_id`
		Then response code should be 403

	Scenario: Contributor of /connectorsGroupTests/a can still access resource after revocation from /connectorsGroupTests/d
		Given I authenticate using email connectorsGroupTests_a_contributor@amazon.com and password p@ssword1
		When I GET /connectors/`pipeline_connector1_a_id`
		Then response code should be 200
		And response body path $.id should be `pipeline_connector1_a_id`

	Scenario: Teardown: Delete pipeline_connector `pipeline_connector1_id`
		Given I authenticate using email connectorsGroupTests_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		When I DELETE /connectors/`pipeline_connector1_id`
		Then response code should be 204
		When I GET /connectors/`pipeline_connector1_id`
		Then response code should be 404

	Scenario: Teardown: Delete pipeline_connector `pipeline_connector1_a_id`
		Given I authenticate using email connectorsGroupTests_a_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		When I DELETE /connectors/`pipeline_connector1_a_id`
		Then response code should be 204
		When I GET /connectors/`pipeline_connector1_a_id`
		Then response code should be 404
		When I DELETE /connectors/`pipeline_connector1_a_alias_id`
		Then response code should be 204
		When I GET /connectors/`pipeline_connector1_a_alias_id`
		Then response code should be 404

	Scenario: Teardown: Delete pipeline_connector `pipeline_connector1_d_id`
		Given I authenticate using email connectorsGroupTests_d_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		When I DELETE /connectors/`pipeline_connector1_d_id`
		Then response code should be 204
		When I GET /connectors/`pipeline_connector1_d_id`
		Then response code should be 404


	Scenario: Teardown: Delete pipeline_connector `pipeline_connector1_a_b_c_id`
		Given I authenticate using email connectorsGroupTests_a_b_c_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		When I DELETE /connectors/`pipeline_connector1_a_b_c_id`
		Then response code should be 204
		When I GET /connectors/`pipeline_connector1_a_b_c_id`
		Then response code should be 404

	Scenario: Teardown: Revoke users
		Given group /connectorsGroupTests has user connectorsGroupTests_admin@amazon.com revoked
		And group /connectorsGroupTests/a has user connectorsGroupTests_a_admin@amazon.com revoked
		And group /connectorsGroupTests/a has user connectorsGroupTests_a_contributor@amazon.com revoked
		And group /connectorsGroupTests/a/b/c has user connectorsGroupTests_a_b_c_admin@amazon.com revoked
		And group /connectorsGroupTests/a/b/c has user connectorsGroupTests_a_b_c_contributor@amazon.com revoked
		And group /connectorsGroupTests/d has user connectorsGroupTests_a_admin@amazon.com revoked
		And group /connectorsGroupTests/d has user connectorsGroupTests_d_admin@amazon.com revoked
		And group /connectorsGroupTests/d has user connectorsGroupTests_d_contributor@amazon.com revoked
		And group /connectorsGroupTests/d/e/f has user connectorsGroupTests_d_e_f_admin@amazon.com revoked

	Scenario: Teardown: Delete groups
		Given group /connectorsGroupTests/a/b/c has been removed
		And group /connectorsGroupTests/a/b has been removed
		And group /connectorsGroupTests/a has been removed
		And group /connectorsGroupTests/d/e/f has been removed
		And group /connectorsGroupTests/d/e has been removed
		And group /connectorsGroupTests/d has been removed
		And group /connectorsGroupTests has been removed
