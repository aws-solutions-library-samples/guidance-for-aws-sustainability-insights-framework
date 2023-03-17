@setup_accessManagement
Feature:
	Access Management API - user tests.

	Scenario: Setup users
		Given  group / has user accessManagement_admin@amazon.com with role admin and password p@ssword1

	Scenario: Setup
		Given I authenticate using email accessManagement_admin@amazon.com and password p@ssword1
		And I set body to {"name": "accessManagementUserTests"}
		When I POST to /groups
		And I pause for 1000ms
		Then response code should be 201
		And response body path $.id should be /accessmanagementusertests
		And I set x-groupcontextid header to /accessmanagementusertests
		And I set body to {"name": "childGroup"}
		When I POST to /groups
		And I pause for 1000ms
		Then response code should be 201
		And response body path $.id should be /accessmanagementusertests/childgroup

	Scenario: Admin can invite new user (contributor)
		Given I authenticate using email accessManagement_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /accessmanagementusertests
		And I set body to {"email": "accessManagementUserTestsContributor@amazon.com", "defaultGroup": "/accessmanagementusertests", "role": "contributor", "password": "p@ssword1" }
		When I POST to /users
		Then response code should be 201
		And response body path $.email should be accessmanagementusertestscontributor@amazon.com
		And response body path $.state should be invited
		And response body path $.groups.[/accessmanagementusertests] should be contributor
		And response body path $.defaultGroup should be /accessmanagementusertests
		And response body should contain createdBy
		And response body should contain createdAt
		And I save cognito group /accessmanagementusertests|||contributor for user accessmanagementusertestscontributor@amazon.com

	Scenario: Admin can invite new user (contributor) to child of current group context
		Given I authenticate using email accessManagement_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /accessmanagementusertests
		And I set body to {"email": "accessManagementTestsContributorChild@amazon.com", "defaultGroup": "/accessmanagementusertests/childgroup", "role": "contributor", "password": "p@ssword1" }
		When I POST to /users
		Then response code should be 201
		And response body path $.email should be accessmanagementtestscontributorchild@amazon.com
		And response body path $.state should be invited
		And response body path $.defaultGroup should be /accessmanagementusertests/childgroup
		And response body path $.groups.[/accessmanagementusertests] should be contributor
		And response body should contain createdBy
		And response body should contain createdAt
		And I save cognito group /accessmanagementusertests|||contributor for user accessmanagementtestscontributorchild@amazon.com

	Scenario: Admin cannot create user in a non-existent child of current group context
		Given I authenticate using email accessManagement_admin@amazon.com and password p@ssword1
		And I set body to {"email": "accessManagementUserTestsInvalid@amazon.com", "defaultGroup": "/invalidGroup", "role": "contributor", "password": "p@ssword1" }
		When I POST to /users
		Then response code should be 404

	Scenario: Granting access to existing users appends existing rather than creating a new duplicate one
		Given I authenticate using email accessManagement_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /accessmanagementusertests
		And I set body to {"email": "accessManagementUserTestsContributor@amazon.com", "role": "contributor"}
		When I POST to /users
		Then response code should be 201
		And I GET /users/accessManagementUserTestsContributor%40amazon.com
		Then response code should be 200

	Scenario: Create another user (reader) to use for testing
		Given I authenticate using email accessManagement_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /accessmanagementusertests
		And I set body to {"email": "accessManagementUserTestsReader@amazon.com", "defaultGroup": "/accessmanagementusertests", "role": "reader", "password": "p@ssword1" }
		When I POST to /users
		Then response code should be 201
		And I save cognito group /accessmanagementusertests|||reader for user accessmanagementusertestsreader@amazon.com

	Scenario: Contributor cannot create new users
		Given I authenticate using email accessManagementUserTestsContributor@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /accessmanagementusertests
		And I set body to {"email": "this_should_fail@amazon.com", "role": "reader"}
		When I POST to /users
		Then response code should be 403

	Scenario: Admin cannot create user in a non-existent child group
		Given I authenticate using email accessManagement_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /something_that_does_not_exist
		And I set body to {"email": "this_should_fail@amazon.com", "role": "contributor", "password": "p@ssword1" }
		When I POST to /users
		Then response code should be 404

	Scenario: Admin can update state
		Given I authenticate using email accessManagement_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /accessmanagementusertests
		And I set body to {"state": "disabled"}
		When I PATCH /users/accessManagementUserTestsReader%40amazon.com
		Then response code should be 204
		And I GET /users/accessManagementUserTestsReader%40amazon.com
		Then response code should be 200
		And response body path $.state should be disabled

	Scenario: Users cannot access groups they don't belong to
		Given I authenticate using email accessManagementUserTestsContributor@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /
		When I GET /users/accessManagementUserTestsContributor%40amazon.com
		Then response code should be 403

	Scenario: Contributor cannot update state
		Given I authenticate using email accessManagementUserTestsContributor@amazon.com and password p@ssword1
		And I set body to {"state": "active"}
		When I PATCH /users/accessManagementUserTestsReader%40amazon.com
		Then response code should be 403

	Scenario: Disabled users cannot log in
		Given I clear authorization token for email accessManagementUserTestsReader@amazon.com
		And I authenticate using email accessManagementUserTestsReader@amazon.com and password p@ssword1
		Then accessManagementUserTestsReader@amazon.com should be unauthorized in group /accessmanagementusertests

	Scenario: Reactivated users can log in
		Given I authenticate using email accessManagement_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /accessmanagementusertests
		And I set body to {"state": "active"}
		When I PATCH /users/accessManagementUserTestsReader%40amazon.com
		Then response code should be 204
		And I GET /users/accessManagementUserTestsReader%40amazon.com
		Then response code should be 200
		And response body path $.state should be active
		Then I pause for 1000ms
		Given I authenticate using email accessManagementUserTestsReader@amazon.com and password p@ssword1
		When I GET /users/accessManagementUserTestsReader%40amazon.com
		Then response code should be 200

	Scenario: Users can change their own password
		Given I authenticate using email accessManagementUserTestsContributor@amazon.com and password p@ssword1
		And I set body to {"password": "myn3wp@ssw0rd"}
		When I PATCH /users/accessManagementUserTestsContributor%40amazon.com
		Then response code should be 204
		Given I authenticate using email accessManagementUserTestsContributor@amazon.com and password myn3wp@ssw0rd
		When I GET /users/accessManagementUserTestsContributor%40amazon.com
		Then response code should be 200

	Scenario: Users cannot change the password of others
		Given I authenticate using email accessManagementUserTestsContributor@amazon.com and password myn3wp@ssw0rd
		And I set body to {"password": "myn3wp@ssw0rd"}
		When I PATCH /users/accessManagementUserTestsReader%40amazon.com
		Then response code should be 403

	Scenario: Users can be listed for a group
		Given I authenticate using email accessManagementUserTestsReader@amazon.com and password myn3wp@ssw0rd
		When I GET /users
		Then response code should be 200
		And response body path $.users.length should be 3

	Scenario: Admin can revoke users
		Given I authenticate using email accessManagement_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /accessmanagementusertests
		When I remove header Content-Type
		And I DELETE /users/accessManagementUserTestsContributor%40amazon.com
		Then response code should be 204
		When I DELETE /users/accessManagementUserTestsReader%40amazon.com
		Then response code should be 204
		When I set Content-Type header to application/json
		And I GET /users/accessManagementUserTestContributor%40amazon.com
		Then response code should be 404
		When I GET /users/accessManagementUserTestsReader%40amazon.com
		Then response code should be 404

	Scenario: Admin can revoke users in child group
		Given I authenticate using email accessManagement_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /accessmanagementusertests
		When I remove header Content-Type
		When I DELETE /users/accessManagementTestsContributorChild%40amazon.com
		Then response code should be 204
		When I set Content-Type header to application/json
		When I GET /users/accessManagementTestsContributorChild%40amazon.com
		Then response code should be 404

	Scenario: Teardown /accessmanagementusertests/childgroup group used for testing
		Given I authenticate using email accessManagement_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /accessmanagementusertests
		And I set body to {"state": "disabled"}
		And I PATCH /groups/%2faccessmanagementusertests%2fchildgroup
		Then response code should be 200
		And response body path $.state should be disabled
		When I remove header Content-Type
		And I DELETE /groups/%2faccessmanagementusertests%2fchildgroup
		Then response code should be 204
		When I set Content-Type header to application/json
		And I GET /groups/%2faccessmanagementusertests%2fchildgroup
		Then response code should be 404

	Scenario: Teardown /accessmanagementusertests group used for testing
		Given I authenticate using email accessManagement_admin@amazon.com and password p@ssword1
		And I set body to {"state": "disabled"}
		And I PATCH /groups/%2faccessmanagementusertests
		Then response code should be 200
		And response body path $.state should be disabled
		When I remove header Content-Type
		And I DELETE /groups/%2faccessmanagementusertests
		Then response code should be 204
		When I set Content-Type header to application/json
		And I GET /groups/%2faccessmanagementusertests
		Then response code should be 404

	Scenario: Teardown - delete user
		Given group / has user accessManagement_admin@amazon.com revoked

