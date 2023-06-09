@setup_accessManagement
Feature:
	Access Management API - User Tags

	Scenario: Setup users
		Given  group / has user user_tag_test_admin@amazon.com with role admin and password p@ssword1
        And group /user-tag-test-group exists
		And group /user-tag-test-group/user-tag-test-subgroup exists

	Scenario: Admin can invite new user at user-tag-test-group and tag user
		Given I authenticate using email user_tag_test_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /user-tag-test-group
		And I set body to {"email": "user_tag_test_user_abc@amazon.com", "defaultGroup": "/user-tag-test-group", "role": "contributor", "password": "p@ssword1", "tags": {"type":"integration test","company":"abc"}}
		When I POST to /users
		Then response code should be 201
		And response body path $.email should be user_tag_test_user_abc@amazon.com
		And response body path $.state should be invited
		And response body path $.groups.[/user-tag-test-group] should be contributor
		And response body path $.defaultGroup should be /user-tag-test-group
		And response body should contain createdBy
		And response body should contain createdAt
		And response body path $.tags.type should be integration test
		And response body path $.tags.company should be abc

	Scenario: Admin can invite new user at user-tag-test-subgroup and tag user
		Given I authenticate using email user_tag_test_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /user-tag-test-group/user-tag-test-subgroup
		And I set body to {"email": "user_tag_test_user_xyz@amazon.com", "defaultGroup": "/user-tag-test-group/user-tag-test-subgroup", "role": "contributor", "password": "p@ssword1", "tags": {"type":"integration test","company":"abc"} }
		When I POST to /users
		Then response code should be 201
		And response body path $.email should be user_tag_test_user_xyz@amazon.com
		And response body path $.state should be invited
		And response body path $.groups.[/user-tag-test-group/user-tag-test-subgroup] should be contributor
		And response body path $.defaultGroup should be /user-tag-test-group/user-tag-test-subgroup
		And response body should contain createdBy
		And response body should contain createdAt
		And response body path $.tags.type should be integration test
		And response body path $.tags.company should be abc

	Scenario: User abc can view tags
		Given I authenticate using email user_tag_test_user_abc@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /user-tag-test-group
		And I GET /users/user_tag_test_user_abc%40amazon.com
		Then response code should be 200
		And response body path $.email should be user_tag_test_user_abc@amazon.com
		And response body path $.state should be invited
		And response body path $.groups.[/user-tag-test-group] should be contributor
		And response body path $.defaultGroup should be /user-tag-test-group
		And response body should contain createdBy
		And response body should contain createdAt
		And response body path $.tags.type should be integration test
		And response body path $.tags.company should be abc

	Scenario: Admin can update user tags
		Given I authenticate using email user_tag_test_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /user-tag-test-group/user-tag-test-subgroup
		And I set body to {"tags": {"type":"integration test","company":"xyz"} }
		When I PATCH /users/user_tag_test_user_xyz%40amazon.com
		Then response code should be 204
		When I GET /users/user_tag_test_user_xyz%40amazon.com
		And response body path $.email should be user_tag_test_user_xyz@amazon.com
		And response body path $.state should be invited
		And response body path $.groups.[/user-tag-test-group/user-tag-test-subgroup] should be contributor
		And response body path $.defaultGroup should be /user-tag-test-group/user-tag-test-subgroup
		And response body should contain createdBy
		And response body should contain createdAt
		And response body path $.tags.type should be integration test
		And response body path $.tags.company should be xyz

	Scenario: Admin can list users by tags
		Given I authenticate using email user_tag_test_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /
		And I set query parameters to
			| parameter    			| value                 |
			| includeChildGroups    | true					|
			| tags         			| type:integration test |
			| resourceType 			| user                  |
		When I GET /users
		Then response code should be 200
		And response body path $.users.length should be 2
		And response body path $.users[?(@.email=='user_tag_test_user_abc@amazon.com')].email should be user_tag_test_user_abc@amazon.com
		And response body path $.users[?(@.email=='user_tag_test_user_xyz@amazon.com')].email should be user_tag_test_user_xyz@amazon.com
		When I set query parameters to
			| parameter    			| value                 |
			| includeChildGroups    | true					|
			| tags         			| company:abc           |
			| resourceType 			| user                  |
		And I GET /users
		Then response code should be 200
		And response body path $.users.length should be 1
		And response body path $.users[0].email should be user_tag_test_user_abc@amazon.com
		When I set query parameters to
			| parameter    			| value                 |
			| includeChildGroups    | true					|
			| tags         			| company:xyz           |
			| resourceType 			| user                  |
		And I GET /users
		Then response code should be 200
		And response body path $.users.length should be 1
		And response body path $.users[0].email should be user_tag_test_user_xyz@amazon.com

	Scenario: Admin can list tag values for a given tag key
		Given I authenticate using email user_tag_test_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /user-tag-test-group
		When I GET /tags/type?resourceType=user
		Then response code should be 200
		And response body path $.values.'integration test' should be integration test

	Scenario: Teardown / revoke users
		Given I authenticate using email user_tag_test_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /user-tag-test-group/user-tag-test-subgroup
		When I remove header Content-Type
		And I DELETE /users/user_tag_test_user_xyz%40amazon.com
		Then response code should be 204
		When I remove header x-groupcontextid
		And I set x-groupcontextid header to /user-tag-test-group
		When I DELETE /users/user_tag_test_user_abc%40amazon.com
		Then response code should be 204

	Scenario: Teardown /user-tag-test-group/user-tag-test-subgroup group used for testing
		Given I authenticate using email user_tag_test_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /user-tag-test-group/user-tag-test-subgroup
		And I set body to {"state": "disabled"}
		And I PATCH /groups/%2fuser-tag-test-group%2fuser-tag-test-subgroup
		Then response code should be 200
		And response body path $.state should be disabled
		When I remove header Content-Type
		And I DELETE /groups/%2fuser-tag-test-group%2fuser-tag-test-subgroup
		Then response code should be 204

	Scenario: Teardown /user-tag-test-group group used for testing
		Given I authenticate using email user_tag_test_admin@amazon.com and password p@ssword1
		And I set body to {"state": "disabled"}
		And I PATCH /groups/%2fuser-tag-test-group
		Then response code should be 200
		And response body path $.state should be disabled
		When I remove header Content-Type
		And I DELETE /groups/%2fuser-tag-test-group
		Then response code should be 204

	Scenario: Teardown - delete user
		Given group / has user user_tag_test_admin@amazon.com revoked