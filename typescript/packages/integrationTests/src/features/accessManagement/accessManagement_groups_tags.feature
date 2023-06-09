@setup_accessManagement
Feature:
	Access Management API - Group Tags

	Scenario: Setup users
		Given  group / has user group_tag_test_admin@amazon.com with role admin and password p@ssword1
        And  group / has user group_tag_test_reader@amazon.com with role reader and password p@ssword1

	Scenario: Admin can create a new group with tags
		Given I authenticate using email group_tag_test_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /
		And I set body to {"name":"group-tag-test-group", "tags": {"type":"integration test","level":"1"}}
		When I POST to /groups
		Then response code should be 201
		And response body path $.name should be group-tag-test-group
		And response body path $.tags.type should be integration test
		And response body path $.tags.level should be 1

	Scenario: Admin can create a new subgroup with tags
		Given I authenticate using email group_tag_test_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /group-tag-test-group
		And I set body to {"name":"group-tag-test-subgroup", "tags": {"type":"integration test","level":"2"}}
		When I POST to /groups
		Then response code should be 201
		And response body path $.name should be group-tag-test-subgroup
		And response body path $.tags.type should be integration test
		And response body path $.tags.level should be 2

	Scenario: Admin can view tags via list
		Given I authenticate using email group_tag_test_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /
		And I GET /groups?includeChildGroups=true
		Then response code should be 200
		And response body path $.groups.length should be 2
        And response body path $.groups[?(@.id=='/group-tag-test-group')].id should be /group-tag-test-group
		And response body path $.groups[?(@.id=='/group-tag-test-group')].tags.type should be integration test
		And response body path $.groups[?(@.id=='/group-tag-test-group')].tags.level should be 1
        And response body path $.groups[?(@.id=='/group-tag-test-group/group-tag-test-subgroup')].id should be /group-tag-test-group/group-tag-test-subgroup
		And response body path $.groups[?(@.id=='/group-tag-test-group/group-tag-test-subgroup')].tags.type should be integration test
		And response body path $.groups[?(@.id=='/group-tag-test-group/group-tag-test-subgroup')].tags.level should be 2
        
	Scenario: Admin can view tags via get
		Given I authenticate using email group_tag_test_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /
		And I GET /groups/%2fgroup-tag-test-group
		Then response code should be 200
        And response body path $.id should be /group-tag-test-group
		And response body path $.tags.type should be integration test
		And response body path $.tags.level should be 1
        When I remove header x-groupcontextid
        And I set x-groupcontextid header to /group-tag-test-group
		And I GET /groups/%2fgroup-tag-test-group%2fgroup-tag-test-subgroup
		Then response code should be 200
        And response body path $.id should be /group-tag-test-group/group-tag-test-subgroup
		And response body path $.tags.type should be integration test
		And response body path $.tags.level should be 2

	Scenario: Reader can view tags via list
		Given I authenticate using email group_tag_test_reader@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /
		And I GET /groups?includeChildGroups=true
		Then response code should be 200
		And response body path $.groups.length should be 2
        And response body path $.groups[?(@.id=='/group-tag-test-group')].id should be /group-tag-test-group
		And response body path $.groups[?(@.id=='/group-tag-test-group')].tags.type should be integration test
		And response body path $.groups[?(@.id=='/group-tag-test-group')].tags.level should be 1
        And response body path $.groups[?(@.id=='/group-tag-test-group/group-tag-test-subgroup')].id should be /group-tag-test-group/group-tag-test-subgroup
		And response body path $.groups[?(@.id=='/group-tag-test-group/group-tag-test-subgroup')].tags.type should be integration test
		And response body path $.groups[?(@.id=='/group-tag-test-group/group-tag-test-subgroup')].tags.level should be 2
        
	Scenario: Reader can view tags via get
		Given I authenticate using email group_tag_test_reader@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /
		And I GET /groups/%2fgroup-tag-test-group
		Then response code should be 200
        And response body path $.id should be /group-tag-test-group
		And response body path $.tags.type should be integration test
		And response body path $.tags.level should be 1
        When I remove header x-groupcontextid
        And I set x-groupcontextid header to /group-tag-test-group
		And I GET /groups/%2fgroup-tag-test-group%2fgroup-tag-test-subgroup
		Then response code should be 200
        And response body path $.id should be /group-tag-test-group/group-tag-test-subgroup
		And response body path $.tags.type should be integration test
		And response body path $.tags.level should be 2

	Scenario: Admin can update tags
		Given I authenticate using email group_tag_test_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /
		And I set body to {"tags": {"type":"integration test","level":"one","feature":"group"}}
		When I PATCH /groups/%2fgroup-tag-test-group
		Then response code should be 200
        And response body path $.id should be /group-tag-test-group
		And response body path $.tags.type should be integration test
		And response body path $.tags.level should be one
		And response body path $.tags.feature should be group
        When I remove header x-groupcontextid
		And I set x-groupcontextid header to /group-tag-test-group
		And I set body to {"tags": {"type":"integration test","level":"two","feature":"subgroup"}}
		When I PATCH /groups/%2fgroup-tag-test-group%2fgroup-tag-test-subgroup
		Then response code should be 200
        And response body path $.id should be /group-tag-test-group/group-tag-test-subgroup
		And response body path $.tags.type should be integration test
		And response body path $.tags.level should be two
		And response body path $.tags.feature should be subgroup

	Scenario: Admin can view updated
		Given I authenticate using email group_tag_test_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /
		And I GET /groups/%2fgroup-tag-test-group
		Then response code should be 200
        And response body path $.id should be /group-tag-test-group
		And response body path $.tags.type should be integration test
		And response body path $.tags.level should be one
		And response body path $.tags.feature should be group
        When I remove header x-groupcontextid
        And I set x-groupcontextid header to /group-tag-test-group
		And I GET /groups/%2fgroup-tag-test-group%2fgroup-tag-test-subgroup
		Then response code should be 200
        And response body path $.id should be /group-tag-test-group/group-tag-test-subgroup
		And response body path $.tags.type should be integration test
		And response body path $.tags.level should be two
		And response body path $.tags.feature should be subgroup

	Scenario: Admin can list groups by tags
		Given I authenticate using email group_tag_test_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /
		And I set query parameters to
			| parameter    			| value                 |
			| includeChildGroups    | true					|
			| tags         			| type:integration test |
			| resourceType 			| group                 |
		When I GET /groups
		Then response code should be 200
		And response body path $.groups.length should be 2
        And response body path $.groups[?(@.id=='/group-tag-test-group')].id should be /group-tag-test-group
		And response body path $.groups[?(@.id=='/group-tag-test-group')].tags.type should be integration test
		And response body path $.groups[?(@.id=='/group-tag-test-group')].tags.level should be one
		And response body path $.groups[?(@.id=='/group-tag-test-group')].tags.feature should be group
        And response body path $.groups[?(@.id=='/group-tag-test-group/group-tag-test-subgroup')].id should be /group-tag-test-group/group-tag-test-subgroup
		And response body path $.groups[?(@.id=='/group-tag-test-group/group-tag-test-subgroup')].tags.type should be integration test
		And response body path $.groups[?(@.id=='/group-tag-test-group/group-tag-test-subgroup')].tags.level should be two
		And response body path $.groups[?(@.id=='/group-tag-test-group/group-tag-test-subgroup')].tags.feature should be subgroup
		When I set query parameters to
			| parameter    			| value			|
			| includeChildGroups    | true			|
			| tags         			| level:one		|
			| resourceType 			| group			|
		And I GET /groups
		Then response code should be 200
		And response body path $.groups.length should be 1
		And response body path $.groups[0].id should be /group-tag-test-group
		And response body path $.groups[0].tags.type should be integration test
		And response body path $.groups[0].tags.level should be one
		And response body path $.groups[0].tags.feature should be group
		When I set query parameters to
			| parameter    			| value			|
			| includeChildGroups    | true			|
			| tags         			| level:two		|
			| resourceType 			| group			|
		And I GET /groups
		Then response code should be 200
		And response body path $.groups.length should be 1
		And response body path $.groups[0].id should be /group-tag-test-group/group-tag-test-subgroup
		And response body path $.groups[0].tags.type should be integration test
		And response body path $.groups[0].tags.level should be two
		And response body path $.groups[0].tags.feature should be subgroup

	Scenario: Admin can list tag values for a given tag key
		Given I authenticate using email group_tag_test_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /group-tag-test-group
		When I GET /tags/type?resourceType=group
		Then response code should be 200
		And response body path $.values.'integration test' should be integration test

	Scenario: Teardown /group-tag-test-group/group-tag-test-subgroup group used for testing
		Given I authenticate using email group_tag_test_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /group-tag-test-group
		And I set body to {"state": "disabled"}
		And I PATCH /groups/%2fgroup-tag-test-group%2fgroup-tag-test-subgroup
		Then response code should be 200
		And response body path $.state should be disabled
		When I remove header Content-Type
		And I DELETE /groups/%2fgroup-tag-test-group%2fgroup-tag-test-subgroup
		Then response code should be 204

	Scenario: Teardown /group-tag-test-group group used for testing
		Given I authenticate using email group_tag_test_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /
		And I set body to {"state": "disabled"}
		And I PATCH /groups/%2fgroup-tag-test-group
		Then response code should be 200
		And response body path $.state should be disabled
		When I remove header Content-Type
		And I DELETE /groups/%2fgroup-tag-test-group
		Then response code should be 204

	Scenario: Teardown - delete users
		Given group / has user group_tag_test_admin@amazon.com revoked
        Given group / has user group_tag_test_reader@amazon.com revoked