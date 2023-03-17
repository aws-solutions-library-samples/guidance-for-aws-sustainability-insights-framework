@setup_referenceDatasets
Feature:

	This feature tests the granting/revocation of access to referenceDatasets between groups, therefore only focuses on testing
	responses related to that workflow and not general API permissions or referenceDataset resource attributes.

	Scenario: Setup users

	Sets up test data which results in 2 group hierarchies `/referenceDatasetsGroupTests/a/b/c` and `/referenceDatasetsGroupTests/d/e/f`, with
	users of varying roles created at the different groups. Each user is an explicit member of 1 group with the exception of
	`referenceDatasetsGroupTests_a_admin@amazon.com` who has access to both group `/referenceDatasetsGroupTests/a` and `/referenceDatasetsGroupTests/d`.

		Given group /referenceDatasetsGroupTests exists
		And group /referenceDatasetsGroupTests has user referenceDatasetsGroupTests_admin@amazon.com with role admin and password p@ssword1
		And group /referenceDatasetsGroupTests/a exists
		And group /referenceDatasetsGroupTests/a has user referenceDatasetsGroupTests_a_admin@amazon.com with role admin and password p@ssword1
		And group /referenceDatasetsGroupTests/a has user referenceDatasetsGroupTests_a_contributor@amazon.com with role contributor and password p@ssword1
		And group /referenceDatasetsGroupTests/a/b exists
		And group /referenceDatasetsGroupTests/a/b/c exists
		And group /referenceDatasetsGroupTests/a/b/c has user referenceDatasetsGroupTests_a_b_c_admin@amazon.com with role admin and password p@ssword1
		And group /referenceDatasetsGroupTests/a/b/c has user referenceDatasetsGroupTests_a_b_c_contributor@amazon.com with role contributor and password p@ssword1
		And group /referenceDatasetsGroupTests/d exists
		And group /referenceDatasetsGroupTests/d has user referenceDatasetsGroupTests_a_admin@amazon.com granted access with role admin
		And group /referenceDatasetsGroupTests/d has user referenceDatasetsGroupTests_d_admin@amazon.com with role admin and password p@ssword1
		And group /referenceDatasetsGroupTests/d has user referenceDatasetsGroupTests_d_contributor@amazon.com with role contributor and password p@ssword1
		And group /referenceDatasetsGroupTests/d/e exists
		And group /referenceDatasetsGroupTests/d/e/f exists
		And group /referenceDatasetsGroupTests/d/e/f has user referenceDatasetsGroupTests_d_e_f_admin@amazon.com with role admin and password p@ssword1

	Scenario: Setup: Admin creates new resource at level /referenceDatasetsGroupTests
		Given I authenticate using email referenceDatasetsGroupTests_admin@amazon.com and password p@ssword1
		And I set body to {"name":"minimum","description":"this dataset contains unit mappings","data":"Type,Multiplier","datasetHeaders":["Type","Multiplier"]}
		When I POST to /referenceDatasets
		Then response code should be 201
		And I store the value of body path $.id as minimum_id in global scope

	Scenario: Contributor member of leaf group /referenceDatasetsGroupTests/a/b/c can access resource created at higher level /referenceDatasetsGroupTests
		Given I authenticate using email referenceDatasetsGroupTests_a_b_c_contributor@amazon.com and password p@ssword1
		When I GET /referenceDatasets/`minimum_id`
		Then response code should be 200
		And response body path $.id should be `minimum_id`

	Scenario: Setup: Admin creates new resource at level /referenceDatasetsGroupTests/a
		Given I authenticate using email referenceDatasetsGroupTests_a_admin@amazon.com and password p@ssword1
		And I set body to {"name":"minimum_a","description":"this dataset contains unit mappings","data":"Type,Multiplier","datasetHeaders":["Type","Multiplier"]}
		When I POST to /referenceDatasets
		Then response code should be 201
		And I store the value of body path $.id as minimum_a_id in global scope

	Scenario: Admin member of sibling group /referenceDatasetsGroupTests/d cannot access resource created at level /referenceDatasetsGroupTests/a
		Given I authenticate using email referenceDatasetsGroupTests_d_admin@amazon.com and password p@ssword1
		When I GET /referenceDatasets/`minimum_a_id`
		Then response code should be 403

	Scenario: Admin member of parent group /referenceDatasetsGroupTests cannot access resource created at level /referenceDatasetsGroupTests/a
		Given I authenticate using email referenceDatasetsGroupTests_admin@amazon.com and password p@ssword1
		When I GET /referenceDatasets/`minimum_a_id`
		Then response code should be 403

	Scenario: Admin of another group hierarchy cannot create new referenceDataset
		Given I authenticate using email referenceDatasetsGroupTests_d_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /referenceDatasetsGroupTests/a
		And I set body to {"name":"minimum_invalid","description":"this dataset contains unit mappings","data":"Type,Multiplier","datasetHeaders":["Type","Multiplier"]}
		When I POST to /referenceDatasets
		Then response code should be 403

	Scenario: Creating referenceDatasets with duplicate names on the same group is not allowed
		Given I authenticate using email referenceDatasetsGroupTests_admin@amazon.com and password p@ssword1
		And I set body to {"name":"minimum","description":"this dataset contains unit mappings","data":"Type,Multiplier","datasetHeaders":["Type","Multiplier"]}
		When I POST to /referenceDatasets
		Then response code should be 409

	Scenario: Creating referenceDatasets with duplicate names within the same group hierarchy is allowed
		Given I authenticate using email referenceDatasetsGroupTests_a_b_c_admin@amazon.com and password p@ssword1
		And I set body to {"name":"minimum","description":"this dataset contains unit mappings","data":"Type,Multiplier","datasetHeaders":["Type","Multiplier"]}
		When I POST to /referenceDatasets
		Then response code should be 201
		And I store the value of body path $.id as minimum_a_b_c_id in global scope

	Scenario: Creating referenceDatasets with a globally duplicate name but unique within a different group hierarchy is allowed
		Given I authenticate using email referenceDatasetsGroupTests_d_admin@amazon.com and password p@ssword1
		And I set body to {"name":"minimum_a","description":"this dataset contains unit mappings","data":"Type,Multiplier","datasetHeaders":["Type","Multiplier"]}
		When I POST to /referenceDatasets
		Then response code should be 201
		And I store the value of body path $.id as minimum_d_id in global scope

	Scenario: Creating referenceDatasets with duplicate names within the same group hierarchy is allowed
		Given I authenticate using email referenceDatasetsGroupTests_a_admin@amazon.com and password p@ssword1
		And I set body to {"name":"minimum","description":"this dataset contains unit mappings","data":"Type,Multiplier","datasetHeaders":["Type","Multiplier"]}
		When I POST to /referenceDatasets
		Then response code should be 201
		And I store the value of body path $.id as minimum_a_alias_id in global scope

	Scenario: Retrieving referenceDatasets with a globally duplicate name should not return resource created in sibling groups.
	Should return resource created under /referencedatasetsgrouptests/a and not its sibling hierarchy /referencedatasetsgrouptests/d
		Given I authenticate using email referenceDatasetsGroupTests_a_admin@amazon.com and password p@ssword1
		When I GET /referenceDatasets?name=minimum_a
		Then response code should be 200
		And response body path $.referenceDatasets.length should be 1
		And response body path $.referenceDatasets[0].groups[0] should be /referencedatasetsgrouptests/a

	Scenario: Retrieving referenceDatasets with a globally duplicate name should not return resource created in sibling groups.
	Should return resource created under /referencedatasetsgrouptests/d and not its sibling hierarchy /referencedatasetsgrouptests/a
		Given I authenticate using email referenceDatasetsGroupTests_d_admin@amazon.com and password p@ssword1
		When I GET /referenceDatasets?name=minimum_a
		Then response code should be 200
		And response body path $.referenceDatasets.length should be 1
		And response body path $.referenceDatasets[0].groups[0] should be /referencedatasetsgrouptests/d

	# Listing resources by alias test
	Scenario: Retrieving reference datasets with a globally duplicate name and includeChildGroups/includeParentGroups should return resources up and down the hierarchy.
		Given I authenticate using email referenceDatasetsGroupTests_a_admin@amazon.com and password p@ssword1
		# should only return resource in current group context
		When I GET /referenceDatasets?name=minimum
		Then response code should be 200
		And response body path $.referenceDatasets.length should be 1
		And response body path $.referenceDatasets[?(@.id=='`minimum_a_alias_id`')].id should be `minimum_a_alias_id`
		# should return resource in current group context and parent groups
		When I GET /referenceDatasets?name=minimum&includeParentGroups=true
		Then response code should be 200
		And response body path $.referenceDatasets.length should be 2
		And response body path $.referenceDatasets[?(@.id=='`minimum_id`')].id should be `minimum_id`
		And response body path $.referenceDatasets[?(@.id=='`minimum_a_alias_id`')].id should be `minimum_a_alias_id`
		# should return resource in current group context and child groups
		When I GET /referenceDatasets?name=minimum&includeChildGroups=true
		Then response code should be 200
		And response body path $.referenceDatasets.length should be 2
		And response body path $.referenceDatasets[?(@.id=='`minimum_a_alias_id`')].id should be `minimum_a_alias_id`
		And response body path $.referenceDatasets[?(@.id=='`minimum_a_b_c_id`')].id should be `minimum_a_b_c_id`
		# should return resource in current group context, child groups and parent groups
		When I GET /referenceDatasets?name=minimum&includeParentGroups=true&includeChildGroups=true
		Then response code should be 200
		And response body path $.referenceDatasets.length should be 3
		And response body path $.referenceDatasets[?(@.id=='`minimum_id`')].id should be `minimum_id`
		And response body path $.referenceDatasets[?(@.id=='`minimum_a_alias_id`')].id should be `minimum_a_alias_id`
		And response body path $.referenceDatasets[?(@.id=='`minimum_a_b_c_id`')].id should be `minimum_a_b_c_id`

  	# Listing resources tests
	Scenario: Retrieving reference datasets with includeParentGroups and includeChildGroups should return resources up and down the hierarchy.
		Given I authenticate using email referenceDatasetsGroupTests_a_admin@amazon.com and password p@ssword1
		# should only return resource in current group context
		When I GET /referenceDatasets
		Then response code should be 200
		And response body path $.referenceDatasets.length should be 2
		And response body path $.referenceDatasets[?(@.id=='`minimum_a_alias_id`')].id should be `minimum_a_alias_id`
		And response body path $.referenceDatasets[?(@.id=='`minimum_a_id`')].id should be `minimum_a_id`
		# should return resource in current group context and parent groups
		When I GET /referenceDatasets?includeParentGroups=true
		Then response code should be 200
		And response body path $.referenceDatasets.length should be 3
		And response body path $.referenceDatasets[?(@.id=='`minimum_id`')].id should be `minimum_id`
		And response body path $.referenceDatasets[?(@.id=='`minimum_a_id`')].id should be `minimum_a_id`
		And response body path $.referenceDatasets[?(@.id=='`minimum_a_alias_id`')].id should be `minimum_a_alias_id`
		# should return resource in current group context and child groups
		When I GET /referenceDatasets?includeChildGroups=true
		Then response code should be 200
		And response body path $.referenceDatasets.length should be 3
		And response body path $.referenceDatasets[?(@.id=='`minimum_a_id`')].id should be `minimum_a_id`
		And response body path $.referenceDatasets[?(@.id=='`minimum_a_alias_id`')].id should be `minimum_a_alias_id`
		And response body path $.referenceDatasets[?(@.id=='`minimum_a_b_c_id`')].id should be `minimum_a_b_c_id`
		# should return resource in current group context, child groups and parent groups
		When I GET /referenceDatasets?includeParentGroups=true&includeChildGroups=true
		Then response code should be 200
		And response body path $.referenceDatasets.length should be 4
		And response body path $.referenceDatasets[?(@.id=='`minimum_a_id`')].id should be `minimum_a_id`
		And response body path $.referenceDatasets[?(@.id=='`minimum_id`')].id should be `minimum_id`
		And response body path $.referenceDatasets[?(@.id=='`minimum_a_alias_id`')].id should be `minimum_a_alias_id`
		And response body path $.referenceDatasets[?(@.id=='`minimum_a_b_c_id`')].id should be `minimum_a_b_c_id`

	Scenario: Admin of group /referenceDatasetsGroupTests/a can grant access of a resource to /referenceDatasetsGroupTests/d
		Given I authenticate using email referenceDatasetsGroupTests_a_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		And I PUT /referenceDatasets/`minimum_a_id`/groups/%2freferenceDatasetsGroupTests%2fd
		Then response code should be 204

	Scenario: Contributor of group /referenceDatasetsGroupTests/d can access resource from /referenceDatasetsGroupTests/a once granted
		Given I authenticate using email referenceDatasetsGroupTests_d_contributor@amazon.com and password p@ssword1
		When I GET /referenceDatasets/`minimum_a_id`
		Then response code should be 200
		And response body path $.id should be `minimum_a_id`

	Scenario: Admin of /referenceDatasetsGroupTests/d/e/f cannot revoke access to higher group /referenceDatasetsGroupTests/d
		Given I authenticate using email referenceDatasetsGroupTests_d_e_f_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		And I DELETE /referenceDatasets/`minimum_a_id`/groups/%2freferenceDatasetsGroupTests%2fd
		Then response code should be 403

	Scenario: Admin of /referenceDatasetsGroupTests/d can revoke access to /referenceDatasetsGroupTests/d
		Given I authenticate using email referenceDatasetsGroupTests_d_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		And I DELETE /referenceDatasets/`minimum_a_id`/groups/%2freferenceDatasetsGroupTests%2fd
		Then response code should be 204

	Scenario: Admin of /referenceDatasetsGroupTests/d cannot access resource once revoked from /referenceDatasetsGroupTests/d
		Given I authenticate using email referenceDatasetsGroupTests_d_admin@amazon.com and password p@ssword1
		When I GET /referenceDatasets/`minimum_a_id`
		Then response code should be 403

	Scenario: Contributor of /referenceDatasetsGroupTests/a can still access resource after revocation from /referenceDatasetsGroupTests/d
		Given I authenticate using email referenceDatasetsGroupTests_a_contributor@amazon.com and password p@ssword1
		When I GET /referenceDatasets/`minimum_a_id`
		Then response code should be 200
		And response body path $.id should be `minimum_a_id`

	Scenario: Teardown: Delete referenceDataset `minimum_id`
		Given I authenticate using email referenceDatasetsGroupTests_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		When I DELETE /referenceDatasets/`minimum_id`
		Then response code should be 204
		When I GET /referenceDatasets/`minimum_id`
		Then response code should be 404

	Scenario: Teardown: Delete referenceDataset `minimum_a_id`
		Given I authenticate using email referenceDatasetsGroupTests_a_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		When I DELETE /referenceDatasets/`minimum_a_id`
		Then response code should be 204
		When I GET /referenceDatasets/`minimum_a_id`
		Then response code should be 404
		When I DELETE /referenceDatasets/`minimum_a_alias_id`
		Then response code should be 204
		When I GET /referenceDatasets/`minimum_a_alias_id`
		Then response code should be 404

	Scenario: Teardown: Delete referenceDataset `minimum_a_b_c_id`
		Given I authenticate using email referenceDatasetsGroupTests_a_b_c_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		When I DELETE /referenceDatasets/`minimum_a_b_c_id`
		Then response code should be 204
		When I GET /referenceDatasets/`minimum_a_b_c_id`
		Then response code should be 404

	Scenario: Teardown: Delete referenceDataset `minimum_d_id`
		Given I authenticate using email referenceDatasetsGroupTests_d_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		When I DELETE /referenceDatasets/`minimum_d_id`
		Then response code should be 204
		When I GET /referenceDatasets/`minimum_d_id`
		Then response code should be 404

	Scenario: Teardown: Revoke users
		Given group /referenceDatasetsGroupTests has user referenceDatasetsGroupTests_admin@amazon.com revoked
		And group /referenceDatasetsGroupTests/a has user referenceDatasetsGroupTests_a_admin@amazon.com revoked
		And group /referenceDatasetsGroupTests/a has user referenceDatasetsGroupTests_a_contributor@amazon.com revoked
		And group /referenceDatasetsGroupTests/a/b/c has user referenceDatasetsGroupTests_a_b_c_admin@amazon.com revoked
		And group /referenceDatasetsGroupTests/a/b/c has user referenceDatasetsGroupTests_a_b_c_contributor@amazon.com revoked
		And group /referenceDatasetsGroupTests/d has user referenceDatasetsGroupTests_a_admin@amazon.com revoked
		And group /referenceDatasetsGroupTests/d has user referenceDatasetsGroupTests_d_admin@amazon.com revoked
		And group /referenceDatasetsGroupTests/d has user referenceDatasetsGroupTests_d_contributor@amazon.com revoked
		And group /referenceDatasetsGroupTests/d/e/f has user referenceDatasetsGroupTests_d_e_f_admin@amazon.com revoked

	Scenario: Teardown: Delete groups
		Given group /referenceDatasetsGroupTests/a/b/c has been removed
		And group /referenceDatasetsGroupTests/a/b has been removed
		And group /referenceDatasetsGroupTests/a has been removed
		And group /referenceDatasetsGroupTests/d/e/f has been removed
		And group /referenceDatasetsGroupTests/d/e has been removed
		And group /referenceDatasetsGroupTests/d has been removed
		And group /referenceDatasetsGroupTests has been removed
