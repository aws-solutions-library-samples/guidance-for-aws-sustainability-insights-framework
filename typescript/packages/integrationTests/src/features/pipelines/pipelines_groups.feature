@setup_pipelines
Feature:

	This feature tests the granting/revocation of access to pipelines between groups, therefore only focuses on testing
	responses related to that workflow and not general API permissions or pipeline resource attributes.

	Scenario: Setup users

	Sets up test data which results in 2 group hierarchies `/pipelinesGroupTests/a/b/c` and `/pipelinesGroupTests/d/e/f`, with
	users of varying roles created at the different groups. Each user is an explicit member of 1 group wiht the exception of
	`pipelinesGroupTests_a_admin@amazon.com` who has access to both group `/pipelinesGroupTests/a` and `/pipelinesGroupTests/d`.

		Given group /pipelinesGroupTests exists
		And group /pipelinesGroupTests has user pipelinesGroupTests_admin@amazon.com with role admin and password p@ssword1
		And group /pipelinesGroupTests/a exists
		And group /pipelinesGroupTests/a has user pipelinesGroupTests_a_admin@amazon.com with role admin and password p@ssword1
		And group /pipelinesGroupTests/a has user pipelinesGroupTests_a_contributor@amazon.com with role contributor and password p@ssword1
		And group /pipelinesGroupTests/a/b exists
		And group /pipelinesGroupTests/a/b/c exists
		And group /pipelinesGroupTests/a/b/c has user pipelinesGroupTests_a_b_c_admin@amazon.com with role admin and password p@ssword1
		And group /pipelinesGroupTests/a/b/c has user pipelinesGroupTests_a_b_c_contributor@amazon.com with role contributor and password p@ssword1
		And group /pipelinesGroupTests/d exists
		And group /pipelinesGroupTests/d has user pipelinesGroupTests_a_admin@amazon.com granted access with role admin
		And group /pipelinesGroupTests/d has user pipelinesGroupTests_d_admin@amazon.com with role admin and password p@ssword1
		And group /pipelinesGroupTests/d has user pipelinesGroupTests_d_contributor@amazon.com with role contributor and password p@ssword1
		And group /pipelinesGroupTests/d/e exists
		And group /pipelinesGroupTests/d/e/f exists
		And group /pipelinesGroupTests/d/e/f has user pipelinesGroupTests_d_e_f_admin@amazon.com with role admin and password p@ssword1

	Scenario: Setup: Admin creates new resource at level /pipelinesGroupTests
		Given I authenticate using email pipelinesGroupTests_admin@amazon.com and password p@ssword1
		And I set body to {"connectorConfig":{"input": [{"name": "sif-csv-pipeline-input-connector"}]},"name":"pipeline1","transformer":{"transforms":[{"index":0,"formula":"AS_TIMESTAMP(:reading date,'M/d/yy')","outputs":[{"description":"Timestamp of business activity.","index":0,"key":"time","label":"Time","type":"timestamp"}]},{"index":1,"formula":"#VEHCILE_EMISSIONS('vehicle_type', IN(:pin24))","outputs":[{"index":0,"key":"vehicle","label":"Vehicle","description":"some description about pin24","type":"number"}]}],"parameters":[{"index":0,"key":"reading date","type":"string"},{"index":1,"key":"pin24","label":"pin 24","description":"some description about pin24","type":"string"}]},"tags":{"source":"sap"},"attributes":{"key1":"val","key2":"val"},"processorOptions":{"chunkSize":1}}
		When I POST to /pipelines
		Then response code should be 201
		And I store the value of body path $.id as pipeline1_id in global scope

	Scenario: Contributor member of leaf group /pipelinesGroupTests/a/b/c can access resource created at higher level /pipelinesGroupTests
		Given I authenticate using email pipelinesGroupTests_a_b_c_contributor@amazon.com and password p@ssword1
		When I GET /pipelines/`pipeline1_id`
		Then response code should be 200
		And response body path $.id should be `pipeline1_id`

	Scenario: Setup: Admin creates new resource at level /pipelinesGroupTests/a
		Given I authenticate using email pipelinesGroupTests_a_admin@amazon.com and password p@ssword1
		And I set body to {"connectorConfig":{"input": [{"name": "sif-csv-pipeline-input-connector"}]},"name":"pipeline1_a","transformer":{"transforms":[{"index":0,"formula":"AS_TIMESTAMP(:reading date,'M/d/yy')","outputs":[{"description":"Timestamp of business activity.","index":0,"key":"time","label":"Time","type":"timestamp"}]},{"index":1,"formula":"#VEHCILE_EMISSIONS('vehicle_type', IN(:pin24))","outputs":[{"index":0,"key":"vehicle","label":"Vehicle","description":"some description about pin24","type":"number"}]}],"parameters":[{"index":0,"key":"reading date","type":"string"},{"index":1,"key":"pin24","label":"pin 24","description":"some description about pin24","type":"string"}]},"tags":{"source":"sap"},"attributes":{"key1":"val","key2":"val"},"processorOptions":{"chunkSize":1}}
		When I POST to /pipelines
		Then response code should be 201
		And I store the value of body path $.id as pipeline1_a_id in global scope

	Scenario: Admin member of sibling group /pipelinesGroupTests/d cannot access resource created at level /pipelinesGroupTests/a
		Given I authenticate using email pipelinesGroupTests_d_admin@amazon.com and password p@ssword1
		When I GET /pipelines/`pipeline1_a_id`
		Then response code should be 403

	Scenario: Admin member of parent group /pipelinesGroupTests cannot access resource created at level /pipelinesGroupTests/a
		Given I authenticate using email pipelinesGroupTests_admin@amazon.com and password p@ssword1
		When I GET /pipelines/`pipeline1_a_id`
		Then response code should be 403

	Scenario: Admin of another group hierarchy cannot create new pipeline
		Given I authenticate using email pipelinesGroupTests_d_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /pipelinesGroupTests/a
		And I set body to {"connectorConfig":{"input": [{"name": "sif-csv-pipeline-input-connector"}]},"name":"pipeline1_invalid","transformer":{"transforms":[{"index":0,"formula":"AS_TIMESTAMP(:reading date,'M/d/yy')","outputs":[{"description":"Timestamp of business activity.","index":0,"key":"time","label":"Time","type":"timestamp"}]},{"index":1,"formula":"#VEHCILE_EMISSIONS('vehicle_type', IN(:pin24))","outputs":[{"index":0,"key":"vehicle","label":"Vehicle","description":"some description about pin24","type":"number"}]}],"parameters":[{"index":0,"key":"reading date","type":"string"},{"index":1,"key":"pin24","label":"pin 24","description":"some description about pin24","type":"string"}]},"tags":{"source":"sap"},"attributes":{"key1":"val","key2":"val"},"processorOptions":{"chunkSize":1}}
		When I POST to /pipelines
		Then response code should be 403

	Scenario: Creating pipelines with duplicate names within the same group hierarchy is allowed
		Given I authenticate using email pipelinesGroupTests_a_b_c_admin@amazon.com and password p@ssword1
		And I set body to {"connectorConfig":{"input": [{"name": "sif-csv-pipeline-input-connector"}]},"name":"pipeline1","transformer":{"transforms":[{"index":0,"formula":"AS_TIMESTAMP(:reading date,'M/d/yy')","outputs":[{"description":"Timestamp of business activity.","index":0,"key":"time","label":"Time","type":"timestamp"}]},{"index":1,"formula":"#VEHCILE_EMISSIONS('vehicle_type', IN(:pin24))","outputs":[{"index":0,"key":"vehicle","label":"Vehicle","description":"some description about pin24","type":"number"}]}],"parameters":[{"index":0,"key":"reading date","type":"string"},{"index":1,"key":"pin24","label":"pin 24","description":"some description about pin24","type":"string"}]},"tags":{"source":"sap"},"attributes":{"key1":"val","key2":"val"},"processorOptions":{"chunkSize":1}}
		When I POST to /pipelines
		Then response code should be 201
		And I store the value of body path $.id as pipeline1_a_b_c_id in global scope

	Scenario: Creating pipelines with a globally duplicate name but unique within a different group hierarchy is allowed
		Given I authenticate using email pipelinesGroupTests_d_admin@amazon.com and password p@ssword1
		And I set body to {"connectorConfig":{"input": [{"name": "sif-csv-pipeline-input-connector"}]},"name":"pipeline1_a","transformer":{"transforms":[{"index":0,"formula":"AS_TIMESTAMP(:reading date,'M/d/yy')","outputs":[{"description":"Timestamp of business activity.","index":0,"key":"time","label":"Time","type":"timestamp"}]},{"index":1,"formula":"#VEHCILE_EMISSIONS('vehicle_type', IN(:pin24))","outputs":[{"index":0,"key":"vehicle","label":"Vehicle","description":"some description about pin24","type":"number"}]}],"parameters":[{"index":0,"key":"reading date","type":"string"},{"index":1,"key":"pin24","label":"pin 24","description":"some description about pin24","type":"string"}]},"tags":{"source":"sap"},"attributes":{"key1":"val","key2":"val"},"processorOptions":{"chunkSize":1}}
		When I POST to /pipelines
		Then response code should be 201
		And I store the value of body path $.id as pipeline1_d_id in global scope

	Scenario: Creating pipelines with duplicate names within the same group hierarchy is allowed
		Given I authenticate using email pipelinesGroupTests_a_admin@amazon.com and password p@ssword1
		And I set body to {"connectorConfig":{"input": [{"name": "sif-csv-pipeline-input-connector"}]},"name":"pipeline1","transformer":{"transforms":[{"index":0,"formula":"AS_TIMESTAMP(:reading date,'M/d/yy')","outputs":[{"description":"Timestamp of business activity.","index":0,"key":"time","label":"Time","type":"timestamp"}]},{"index":1,"formula":"#VEHCILE_EMISSIONS('vehicle_type', IN(:pin24))","outputs":[{"index":0,"key":"vehicle","label":"Vehicle","description":"some description about pin24","type":"number"}]}],"parameters":[{"index":0,"key":"reading date","type":"string"},{"index":1,"key":"pin24","label":"pin 24","description":"some description about pin24","type":"string"}]},"tags":{"source":"sap"},"attributes":{"key1":"val","key2":"val"},"processorOptions":{"chunkSize":1}}
		When I POST to /pipelines
		Then response code should be 201
		And I store the value of body path $.id as pipeline1_a_alias_id in global scope

	Scenario: Retrieving pipeline with a globally duplicate name should returns the results from the specified group context
	Should return results created in current group /pipelinesgrouptests/a
		Given I authenticate using email pipelinesGroupTests_a_admin@amazon.com and password p@ssword1
		When I GET /pipelines?name=pipeline1_a
		Then response code should be 200
		And response body path $.pipelines.length should be 1
		And response body path $.pipelines[0].groups[0] should be /pipelinesgrouptests/a

	Scenario: Retrieving pipeline with a globally duplicate name should returns the results from the specified group context
	Should return results created in current group /pipelinesgrouptests/d
		Given I authenticate using email pipelinesGroupTests_d_admin@amazon.com and password p@ssword1
		When I GET /pipelines?name=pipeline1_a
		Then response code should be 200
		And response body path $.pipelines.length should be 1
		And response body path $.pipelines[0].groups[0] should be /pipelinesgrouptests/d

	# Listing resources by alias tests
	Scenario: Retrieving pipelines with a globally duplicate name and includeChildGroups/includeParentGroups should return resources up and down the hierarchy.
		Given I authenticate using email pipelinesGroupTests_a_admin@amazon.com and password p@ssword1
		# should only return resource in current group context
		When I GET /pipelines?name=pipeline1
		Then response code should be 200
		And response body path $.pipelines.length should be 1
		And response body path $.pipelines[?(@.id=='`pipeline1_a_alias_id`')].id should be `pipeline1_a_alias_id`
		# should return resource in current group context and parent groups
		When I GET /pipelines?name=pipeline1&includeParentGroups=true
		Then response code should be 200
		And response body path $.pipelines.length should be 2
		And response body path $.pipelines[?(@.id=='`pipeline1_a_alias_id`')].id should be `pipeline1_a_alias_id`
		And response body path $.pipelines[?(@.id=='`pipeline1_id`')].id should be `pipeline1_id`
		# should return resource in current group context and child groups
		When I GET /pipelines?name=pipeline1&includeChildGroups=true
		Then response code should be 200
		And response body path $.pipelines.length should be 2
		And response body path $.pipelines[?(@.id=='`pipeline1_a_alias_id`')].id should be `pipeline1_a_alias_id`
		And response body path $.pipelines[?(@.id=='`pipeline1_a_b_c_id`')].id should be `pipeline1_a_b_c_id`
		# should return resource in current group context, child groups and parent groups
		When I GET /pipelines?name=pipeline1&includeChildGroups=true&includeParentGroups=true
		Then response code should be 200
		And response body path $.pipelines.length should be 3
		And response body path $.pipelines[?(@.id=='`pipeline1_id`')].id should be `pipeline1_id`
		And response body path $.pipelines[?(@.id=='`pipeline1_a_alias_id`')].id should be `pipeline1_a_alias_id`
		And response body path $.pipelines[?(@.id=='`pipeline1_a_b_c_id`')].id should be `pipeline1_a_b_c_id`

	# Listing resources tests
	Scenario: Retrieving pipelines with includeParentGroups and includeChildGroups should return resources up and down the hierarchy.
		Given I authenticate using email pipelinesGroupTests_a_admin@amazon.com and password p@ssword1
		# should only return resource in current group context
		When I GET /pipelines
		Then response code should be 200
		And response body path $.pipelines.length should be 2
		And response body path $.pipelines[?(@.id=='`pipeline1_a_alias_id`')].id should be `pipeline1_a_alias_id`
		And response body path $.pipelines[?(@.id=='`pipeline1_a_id`')].id should be `pipeline1_a_id`
		# should return resource in current group context and parent groups
		When I GET /pipelines?includeParentGroups=true
		Then response code should be 200
		And response body path $.pipelines.length should be 3
		And response body path $.pipelines[?(@.id=='`pipeline1_a_alias_id`')].id should be `pipeline1_a_alias_id`
		And response body path $.pipelines[?(@.id=='`pipeline1_id`')].id should be `pipeline1_id`
		And response body path $.pipelines[?(@.id=='`pipeline1_a_id`')].id should be `pipeline1_a_id`
		# should return resource in current group context and child groups
		When I GET /pipelines?includeChildGroups=true
		Then response code should be 200
		And response body path $.pipelines.length should be 3
		And response body path $.pipelines[?(@.id=='`pipeline1_a_alias_id`')].id should be `pipeline1_a_alias_id`
		And response body path $.pipelines[?(@.id=='`pipeline1_a_b_c_id`')].id should be `pipeline1_a_b_c_id`
		And response body path $.pipelines[?(@.id=='`pipeline1_a_id`')].id should be `pipeline1_a_id`
		# should return resource in current group context, child groups and parent groups
		When I GET /pipelines?includeChildGroups=true&includeParentGroups=true
		Then response code should be 200
		And response body path $.pipelines.length should be 4
		And response body path $.pipelines[?(@.id=='`pipeline1_id`')].id should be `pipeline1_id`
		And response body path $.pipelines[?(@.id=='`pipeline1_a_alias_id`')].id should be `pipeline1_a_alias_id`
		And response body path $.pipelines[?(@.id=='`pipeline1_a_b_c_id`')].id should be `pipeline1_a_b_c_id`
		And response body path $.pipelines[?(@.id=='`pipeline1_a_id`')].id should be `pipeline1_a_id`

	Scenario: Admin of group /pipelinesGroupTests/a can grant access of a resource to /pipelinesGroupTests/d

	Scenario: Admin of group /pipelinesGroupTests/a can grant access of a resource to /pipelinesGroupTests/d
		Given I authenticate using email pipelinesGroupTests_a_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		And I PUT /pipelines/`pipeline1_a_id`/groups/%2fpipelinesGroupTests%2fd
		Then response code should be 204

	Scenario: Contributor of group /pipelinesGroupTests/d can access resource from /pipelinesGroupTests/a once granted
		Given I authenticate using email pipelinesGroupTests_d_contributor@amazon.com and password p@ssword1
		When I GET /pipelines/`pipeline1_a_id`
		Then response code should be 200
		And response body path $.id should be `pipeline1_a_id`

	Scenario: Admin of /pipelinesGroupTests/d/e/f cannot revoke access to higher group /pipelinesGroupTests/d
		Given I authenticate using email pipelinesGroupTests_d_e_f_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		And I DELETE /pipelines/`pipeline1_a_id`/groups/%2fpipelinesGroupTests%2fd
		Then response code should be 403

	Scenario: Admin of /pipelinesGroupTests/d can revoke access to /pipelinesGroupTests/d
		Given I authenticate using email pipelinesGroupTests_d_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		And I DELETE /pipelines/`pipeline1_a_id`/groups/%2fpipelinesGroupTests%2fd
		Then response code should be 204

	Scenario: Admin of /pipelinesGroupTests/d cannot access resource once revoked from /pipelinesGroupTests/d
		Given I authenticate using email pipelinesGroupTests_d_admin@amazon.com and password p@ssword1
		When I GET /pipelines/`pipeline1_a_id`
		Then response code should be 403

	Scenario: Contributor of /pipelinesGroupTests/a can still access resource after revocation from /pipelinesGroupTests/d
		Given I authenticate using email pipelinesGroupTests_a_contributor@amazon.com and password p@ssword1
		When I GET /pipelines/`pipeline1_a_id`
		Then response code should be 200
		And response body path $.id should be `pipeline1_a_id`

	Scenario: Teardown: Delete pipeline `pipeline1_id`
		Given I authenticate using email pipelinesGroupTests_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		When I DELETE /pipelines/`pipeline1_id`
		Then response code should be 204
		When I GET /pipelines/`pipeline1_id`
		Then response code should be 404

	Scenario: Teardown: Delete pipeline `pipeline1_a_id`
		Given I authenticate using email pipelinesGroupTests_a_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		When I DELETE /pipelines/`pipeline1_a_id`
		Then response code should be 204
		When I GET /pipelines/`pipeline1_a_id`
		Then response code should be 404
		When I DELETE /pipelines/`pipeline1_a_alias_id`
		Then response code should be 204
		When I GET /pipelines/`pipeline1_a_alias_id`
		Then response code should be 404

	Scenario: Teardown: Delete pipeline `pipeline1_d_id`
		Given I authenticate using email pipelinesGroupTests_d_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		When I DELETE /pipelines/`pipeline1_d_id`
		Then response code should be 204
		When I GET /pipelines/`pipeline1_d_id`
		Then response code should be 404


	Scenario: Teardown: Delete pipeline `pipeline1_a_b_c_id`
		Given I authenticate using email pipelinesGroupTests_a_b_c_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		When I DELETE /pipelines/`pipeline1_a_b_c_id`
		Then response code should be 204
		When I GET /pipelines/`pipeline1_a_b_c_id`
		Then response code should be 404

	Scenario: Teardown: Revoke users
		Given group /pipelinesGroupTests has user pipelinesGroupTests_admin@amazon.com revoked
		And group /pipelinesGroupTests/a has user pipelinesGroupTests_a_admin@amazon.com revoked
		And group /pipelinesGroupTests/a has user pipelinesGroupTests_a_contributor@amazon.com revoked
		And group /pipelinesGroupTests/a/b/c has user pipelinesGroupTests_a_b_c_admin@amazon.com revoked
		And group /pipelinesGroupTests/a/b/c has user pipelinesGroupTests_a_b_c_contributor@amazon.com revoked
		And group /pipelinesGroupTests/d has user pipelinesGroupTests_a_admin@amazon.com revoked
		And group /pipelinesGroupTests/d has user pipelinesGroupTests_d_admin@amazon.com revoked
		And group /pipelinesGroupTests/d has user pipelinesGroupTests_d_contributor@amazon.com revoked
		And group /pipelinesGroupTests/d/e/f has user pipelinesGroupTests_d_e_f_admin@amazon.com revoked

	Scenario: Teardown: Delete groups
		Given group /pipelinesGroupTests/a/b/c has been removed
		And group /pipelinesGroupTests/a/b has been removed
		And group /pipelinesGroupTests/a has been removed
		And group /pipelinesGroupTests/d/e/f has been removed
		And group /pipelinesGroupTests/d/e has been removed
		And group /pipelinesGroupTests/d has been removed
		And group /pipelinesGroupTests has been removed
