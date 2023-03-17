@setup_accessManagement
Feature: Access Management API - users pagination feature

	Scenario: Setup groups and users
		# setup groups
		Given group /paginationUserTests exists
		And group /paginationUserTests/a exists
		And group /paginationUserTests/b exists
		And group /paginationUserTests/a/b exists
		And group /paginationUserTests/b/x exists
		# setup the users in hierarchy
		And group / has user pagination_users_root@amazon.com with role admin and password p@ssword1
		And group /paginationUserTests/a has user pagination_users_root_a@amazon.com with role admin and password p@ssword1
		And group /paginationUserTests/a/b has user pagination_users_root_a_b_1@amazon.com with role admin and password p@ssword1
		And group /paginationUserTests/a/b has user pagination_users_root_a_b_2@amazon.com with role admin and password p@ssword1
		And group /paginationUserTests/a/b has user pagination_users_root_a_b_3@amazon.com with role admin and password p@ssword1
		And group /paginationUserTests/b has user pagination_users_root_b@amazon.com with role admin and password p@ssword1
		And group /paginationUserTests/b/x has user pagination_users_root_b_x_1@amazon.com with role admin and password p@ssword1
		And group /paginationUserTests/b/x has user pagination_users_root_b_x_2@amazon.com with role admin and password p@ssword1
		And group /paginationUserTests/b/x has user pagination_users_root_b_x_3@amazon.com with role admin and password p@ssword1

  	# listing users from root
	Scenario: List users from root
		Given I authenticate using email pagination_users_root@amazon.com and password p@ssword1
		When I GET /users
		Then response code should be 200
		# this include the root user
		And response body path $.users.length should be 2
		When I GET /users?includeChildGroups=true&includeParentGroups=true
		Then response code should be 200
		And response body path $.users.length should be 10
		# pagination tests
		When I GET /users?includeChildGroups=true&includeParentGroups=true&count=3
		Then response code should be 200
		And response body path $.users.length should be 3
		# this include the root user
		And I store the value of body path $.pagination.lastEvaluatedToken as paginationToken in global scope
		And response body path $.users[?(@.email=='pagination_users_root@amazon.com')].email should be pagination_users_root@amazon.com
		And response body path $.users[?(@.email=='pagination_users_root_a@amazon.com')].email should be pagination_users_root_a@amazon.com
		When I GET /users?includeChildGroups=true&includeParentGroups=true&count=3&fromToken=`paginationToken`
		Then response code should be 200
		And response body path $.users.length should be 3
		And I store the value of body path $.pagination.lastEvaluatedToken as paginationToken in global scope
		And response body path $.users[?(@.email=='pagination_users_root_a_b_1@amazon.com')].email should be pagination_users_root_a_b_1@amazon.com
		And response body path $.users[?(@.email=='pagination_users_root_a_b_2@amazon.com')].email should be pagination_users_root_a_b_2@amazon.com
		And response body path $.users[?(@.email=='pagination_users_root_a_b_3@amazon.com')].email should be pagination_users_root_a_b_3@amazon.com
		When I GET /users?includeChildGroups=true&includeParentGroups=true&count=3&fromToken=`paginationToken`
		Then response code should be 200
		And response body path $.users.length should be 3
		And I store the value of body path $.pagination.lastEvaluatedToken as paginationToken in global scope
		And response body path $.users[?(@.email=='pagination_users_root_b@amazon.com')].email should be pagination_users_root_b@amazon.com
		And response body path $.users[?(@.email=='pagination_users_root_b_x_1@amazon.com')].email should be pagination_users_root_b_x_1@amazon.com
		And response body path $.users[?(@.email=='pagination_users_root_b_x_2@amazon.com')].email should be pagination_users_root_b_x_2@amazon.com
		When I GET /users?includeChildGroups=true&includeParentGroups=true&count=3&fromToken=`paginationToken`
		Then response code should be 200
		And response body path $.users.length should be 1
		And response body path $.users[?(@.email=='pagination_users_root_b_x_3@amazon.com')].email should be pagination_users_root_b_x_3@amazon.com
		And response body should not contain $.pagination.lastEvaluatedToken

	Scenario: List users from /paginationUserTests/a
		Given I authenticate using email pagination_users_root@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /paginationUserTests/a
		When I GET /users?includeChildGroups=true&includeParentGroups=true&count=3
		Then response code should be 200
		And response body path $.users.length should be 3
		# this include the root user
		And I store the value of body path $.pagination.lastEvaluatedToken as paginationToken in global scope
		And response body path $.users[?(@.email=='pagination_users_root@amazon.com')].email should be pagination_users_root@amazon.com
		And response body path $.users[?(@.email=='pagination_users_root_a@amazon.com')].email should be pagination_users_root_a@amazon.com
		When I GET /users?includeChildGroups=true&includeParentGroups=true&count=3&fromToken=`paginationToken`
		Then response code should be 200
		And response body path $.users.length should be 3
		And I store the value of body path $.pagination.lastEvaluatedToken as paginationToken in global scope
		And response body path $.users[?(@.email=='pagination_users_root_a_b_1@amazon.com')].email should be pagination_users_root_a_b_1@amazon.com
		And response body path $.users[?(@.email=='pagination_users_root_a_b_2@amazon.com')].email should be pagination_users_root_a_b_2@amazon.com
		And response body path $.users[?(@.email=='pagination_users_root_a_b_3@amazon.com')].email should be pagination_users_root_a_b_3@amazon.com
		And response body should not contain $.pagination.lastEvaluatedToken
	    # only include child groups
		When I GET /users?includeChildGroups=true&count=3
		Then response code should be 200
		And response body path $.users.length should be 3
		# this include the root user
		And response body path $.users[?(@.email=='pagination_users_root_a@amazon.com')].email should be pagination_users_root_a@amazon.com
		And response body path $.users[?(@.email=='pagination_users_root_a_b_1@amazon.com')].email should be pagination_users_root_a_b_1@amazon.com
		And response body path $.users[?(@.email=='pagination_users_root_a_b_2@amazon.com')].email should be pagination_users_root_a_b_2@amazon.com
		And I store the value of body path $.pagination.lastEvaluatedToken as paginationToken in global scope
		When I GET /users?includeChildGroups=true&includeParentGroups=true&count=3&fromToken=`paginationToken`
		Then response code should be 200
		And response body path $.users.length should be 1
		And I store the value of body path $.pagination.lastEvaluatedToken as paginationToken in global scope
		And response body path $.users[?(@.email=='pagination_users_root_a_b_3@amazon.com')].email should be pagination_users_root_a_b_3@amazon.com
		And response body should not contain $.pagination.lastEvaluatedToken
		# only include parent groups
		When I GET /users?includeParentGroups=true&count=3
		Then response code should be 200
		And response body path $.users.length should be 3
		# this include the root user
		And response body path $.users[?(@.email=='pagination_users_root@amazon.com')].email should be pagination_users_root@amazon.com
		And response body path $.users[?(@.email=='pagination_users_root_a@amazon.com')].email should be pagination_users_root_a@amazon.com
		And response body should not contain $.pagination.lastEvaluatedToken

	Scenario: Teardown: Revoke users
		Given group / has user pagination_users_root@amazon.com revoked
		And group /paginationUserTests/a has user pagination_users_root_a@amazon.com revoked
		And group /paginationUserTests/a/b has user pagination_users_root_a_b_1@amazon.com revoked
		And group /paginationUserTests/a/b has user pagination_users_root_a_b_2@amazon.com revoked
		And group /paginationUserTests/a/b has user pagination_users_root_a_b_3@amazon.com revoked
		And group /paginationUserTests/b has user pagination_users_root_b@amazon.com revoked
		And group /paginationUserTests/b/x has user pagination_users_root_b_x_1@amazon.com revoked
		And group /paginationUserTests/b/x has user pagination_users_root_b_x_2@amazon.com revoked
		And group /paginationUserTests/b/x has user pagination_users_root_b_x_3@amazon.com revoked

	Scenario: Teardown: Delete groups
		And group /paginationUserTests/a/b has been removed
		And group /paginationUserTests/b/x has been removed
		And group /paginationUserTests/a has been removed
		And group /paginationUserTests/b has been removed
		And group /paginationUserTests has been removed
