@setup_accessManagement
Feature: Access Management API - groups pagination feature

	Scenario: Setup groups
		Given group /paginationGroupTests exists
		And group /paginationGroupTests/a exists
		And group /paginationGroupTests/b exists
		And group /paginationGroupTests/a/b exists
		And group /paginationGroupTests/a/b/c exists
		And group /paginationGroupTests/a/b/c/d exists
		And group /paginationGroupTests/b/x exists
		And group /paginationGroupTests/b/x/y exists
		And group /paginationGroupTests/b/x/y/z exists
		Given group / has user pagination_groups_admin@amazon.com with role admin and password p@ssword1
		And group /paginationGroupTests/a/b has user pagination_groups_admin@amazon.com granted access with role admin
		And group /paginationGroupTests/b/x has user pagination_groups_admin@amazon.com granted access with role admin

  	# listing groups from root
	Scenario: List groups from root
		Given I authenticate using email pagination_groups_admin@amazon.com and password p@ssword1
		When I GET /groups
		Then response code should be 200
		And response body path $.groups.length should be 1
		When I GET /groups?includeChildGroups=true
		Then response code should be 200
		And response body path $.groups.length should be 9
		When I GET /groups?includeChildGroups=true&includeParentGroups=true
		Then response code should be 200
		And response body path $.groups.length should be 10
		# with pagination
		When I GET /groups?includeChildGroups=true&includeParentGroups=true&count=3
		Then response code should be 200
		And response body path $.groups.length should be 3
		And response body path $.groups[?(@.id=='/')].id should be /
		And response body path $.groups[?(@.id=='/paginationgrouptests')].id should be /paginationgrouptests
		And response body path $.groups[?(@.id=='/paginationgrouptests/a')].id should be /paginationgrouptests/a
		And I store the value of body path $.pagination.lastEvaluatedToken as paginationToken in global scope
		When I GET /groups?includeChildGroups=true&includeParentGroups=true&count=3&fromToken=`paginationToken`
		Then response code should be 200
		And response body path $.groups.length should be 3
		And I store the value of body path $.pagination.lastEvaluatedToken as paginationToken in global scope
		And response body path $.groups[?(@.id=='/paginationgrouptests/b')].id should be /paginationgrouptests/b
		And response body path $.groups[?(@.id=='/paginationgrouptests/a/b')].id should be /paginationgrouptests/a/b
		And response body path $.groups[?(@.id=='/paginationgrouptests/a/b/c')].id should be /paginationgrouptests/a/b/c
		When I GET /groups?includeChildGroups=true&includeParentGroups=true&count=3&fromToken=`paginationToken`
		Then response code should be 200
		And response body path $.groups.length should be 3
		And response body path $.groups[?(@.id=='/paginationgrouptests/b/x')].id should be /paginationgrouptests/b/x
		And response body path $.groups[?(@.id=='/paginationgrouptests/b/x/y')].id should be /paginationgrouptests/b/x/y
		And response body path $.groups[?(@.id=='/paginationgrouptests/a/b/c/d')].id should be /paginationgrouptests/a/b/c/d
		And I store the value of body path $.pagination.lastEvaluatedToken as paginationToken in global scope
		When I GET /groups?includeChildGroups=true&includeParentGroups=true&count=3&fromToken=`paginationToken`
		Then response code should be 200
		And response body path $.groups.length should be 1
		And response body path $.groups[?(@.id=='/paginationgrouptests/b/x/y/z')].id should be /paginationgrouptests/b/x/y/z
		And response body should not contain $.pagination.lastEvaluatedToken

	Scenario: List groups from paginationgrouptests/a
		Given I authenticate using email pagination_groups_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /paginationgrouptests/a/b
		When I GET /groups
		Then response code should be 200
		And response body path $.groups.length should be 1
		And response body path $.groups[?(@.id=='/paginationgrouptests/a/b/c')].id should be /paginationgrouptests/a/b/c
		When I GET /groups?includeChildGroups=true&includeParentGroups=true&count=3
		Then response code should be 200
		And response body path $.groups.length should be 3
		And I store the value of body path $.pagination.lastEvaluatedToken as paginationToken in global scope
		And response body path $.groups[?(@.id=='/')].id should be /
		And response body path $.groups[?(@.id=='/paginationgrouptests')].id should be /paginationgrouptests
		And response body path $.groups[?(@.id=='/paginationgrouptests/a')].id should be /paginationgrouptests/a
		When I GET /groups?includeChildGroups=true&includeParentGroups=true&count=3&fromToken=`paginationToken`
		Then response code should be 200
		And response body path $.groups.length should be 3
		And response body path $.groups[?(@.id=='/paginationgrouptests/a/b')].id should be /paginationgrouptests/a/b
		And response body path $.groups[?(@.id=='/paginationgrouptests/a/b/c')].id should be /paginationgrouptests/a/b/c
		And response body path $.groups[?(@.id=='/paginationgrouptests/a/b/c/d')].id should be /paginationgrouptests/a/b/c/d
		And response body should not contain $.pagination.lastEvaluatedToken

	Scenario: Teardown: Revoke users
		Given group / has user pagination_groups_admin@amazon.com revoked
		And group /paginationGroupTests/a/b has user pagination_groups_admin@amazon.com revoked
		And group /paginationGroupTests/b/x has user pagination_groups_admin@amazon.com revoked

	Scenario: Teardown: Delete groups
		Given group /paginationGroupTests/a/b/c/d has been removed
		And group /paginationGroupTests/a/b/c has been removed
		And group /paginationGroupTests/a/b has been removed
		And group /paginationGroupTests/a has been removed
		And group /paginationGroupTests/b/x/y/z has been removed
		And group /paginationGroupTests/b/x/y has been removed
		And group /paginationGroupTests/b/x has been removed
		And group /paginationGroupTests/b has been removed
		And group /paginationGroupTests has been removed
