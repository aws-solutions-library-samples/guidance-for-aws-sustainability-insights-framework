@setup_accessManagement
Feature:
	Access Management API - hierarchical group tests.

	Scenario: Setup users
		Given group / has user accessManagement_contributor@amazon.com with role contributor and password p@ssword1
		And  group / has user accessManagement_admin@amazon.com with role admin and password p@ssword1

	Scenario: Admin can create a new group
		Given I authenticate using email accessManagement_admin@amazon.com and password p@ssword1
		And I set body to {"name": "accessManagementGroupTests1"}
		When I POST to /groups
		And I pause for 1000ms
		Then response code should be 201
		And response header x-groupid should be /accessmanagementgrouptests1
		And response body path $.id should be /accessmanagementgrouptests1
		And response body path $.name should be accessManagementGroupTests1
		And response body should contain createdBy
		And response body should contain createdAt

	Scenario: Contributor cannot create a new group
		#TODO: need disposal email addresses
		Given I authenticate using email accessManagement_contributor@amazon.com and password p@ssword1
		And I set body to {"name": "accessManagementGroupTests2"}
		When I POST to /groups
		And I pause for 1000ms
		Then response code should be 403

	Scenario: Group names cannot contain spaces
		Given I authenticate using email accessManagement_admin@amazon.com and password p@ssword1
		And I set body to {"name": "accessManagementGroupTests 3"}
		When I POST to /groups
		Then response code should be 400

	Scenario: Active groups cannot be deleted
		Given I authenticate using email accessManagement_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		And I DELETE /groups/%2faccessManagementGroupTests1
		Then response code should be 409

	Scenario: Groups must be disabled before deletion
		Given I authenticate using email accessManagement_admin@amazon.com and password p@ssword1
		And I set body to {"state": "disabled"}
		And I PATCH /groups/%2faccessManagementGroupTests1
		Then response code should be 200
		And response body path $.state should be disabled
		When I remove header Content-Type
		And I DELETE /groups/%2faccessManagementGroupTests1
		Then response code should be 204
		When I set Content-Type header to application/json
		And I GET /groups/%2faccessManagementGroupTests1
		Then response code should be 404

	Scenario: Teardown - delete user
		Given group / has user accessManagement_contributor@amazon.com revoked
		And group / has user accessManagement_admin@amazon.com revoked
