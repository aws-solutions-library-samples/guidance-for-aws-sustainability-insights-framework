@setup_accessManagement
Feature:
	Access Management API - hierarchical group tests.

	Scenario: Setup users
		Given group / has user accessManagement_contributor@amazon.com with role contributor and password p@ssword1
		And  group / has user accessManagement_admin@amazon.com with role admin and password p@ssword1

	Scenario: Admin should be able to set default configuration in root group
		Given I authenticate using email accessManagement_admin@amazon.com and password p@ssword1
		And I set body to {"configuration":{"preferredGroup":"/","referenceDatasets":{"alwaysUseLatest":false},"pipelineProcessor":{"chunkSize":1}}}
		When I PATCH /groups/%2F
		Then response code should be 200
		And response body path $.configuration.preferredGroup should be /
		And response body path $.configuration.referenceDatasets.alwaysUseLatest should be false
		And response body path $.configuration.pipelineProcessor.chunkSize should be 1

	Scenario: Admin should be able to create a new child group that inherit application configuration from parent
		Given I authenticate using email accessManagement_admin@amazon.com and password p@ssword1
		And I set body to {"name": "accessManagementGroupTests1"}
		When I POST to /groups
		Then response code should be 201
		And response header x-groupid should be /accessmanagementgrouptests1
		And response body path $.id should be /accessmanagementgrouptests1
		And response body path $.name should be accessManagementGroupTests1
		And response body should contain createdBy
		And response body should contain createdAt
		And response body path $.configuration.preferredGroup should be /
		And response body path $.configuration.referenceDatasets.alwaysUseLatest should be false
		And response body path $.configuration.pipelineProcessor.chunkSize should be 1

	Scenario: Admin should be able to create a new child group that overrides application configuration from parent
		Given I authenticate using email accessManagement_admin@amazon.com and password p@ssword1
		And I set body to {"name": "groupOverridde1", "configuration":{"preferredGroup":"/groupoverridde1"}}
		When I POST to /groups
		Then response code should be 201
		And response header x-groupid should be /groupoverridde1
		And response body path $.id should be /groupoverridde1
		And response body path $.name should be groupOverridde1
		And response body should contain createdBy
		And response body should contain createdAt
		And response body path $.configuration.preferredGroup should be /groupoverridde1
		And response body path $.configuration.referenceDatasets.alwaysUseLatest should be false
		And response body path $.configuration.pipelineProcessor.chunkSize should be 1
		When I GET /groups/%2fgroupoverridde1
		And response body path $.configuration.preferredGroup should be /groupoverridde1
		And response body path $.configuration.referenceDatasets.alwaysUseLatest should be false
		And response body path $.configuration.pipelineProcessor.chunkSize should be 1

	Scenario: Admin should be able to create a new child group that overrides application configuration from its immediate parent up to the root
		Given I authenticate using email accessManagement_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /groupoverridde1
		And I set body to {"name": "groupOverridde2", "configuration":{"referenceDatasets":{"alwaysUseLatest":true}}}
		When I POST to /groups
		Then response code should be 201
		And response header x-groupid should be /groupoverridde1/groupoverridde2
		And response body path $.id should be /groupoverridde1/groupoverridde2
		And response body path $.name should be groupOverridde2
		And response body should contain createdBy
		And response body should contain createdAt
		And response body path $.configuration.preferredGroup should be /groupoverridde1
		And response body path $.configuration.referenceDatasets.alwaysUseLatest should be true
		And response body path $.configuration.pipelineProcessor.chunkSize should be 1
		When I GET /groups/%2fgroupoverridde1%2fgroupoverridde2
		And response body path $.configuration.preferredGroup should be /groupoverridde1
		And response body path $.configuration.referenceDatasets.alwaysUseLatest should be true
		And response body path $.configuration.pipelineProcessor.chunkSize should be 1

	Scenario: When Admin modify application configuration on root, the modified configuration that is not overridden by its descendants should cascade
		Given I authenticate using email accessManagement_admin@amazon.com and password p@ssword1
		And I set body to {"configuration":{"pipelineProcessor":{"chunkSize":3}}}
		When I PATCH /groups/%2F
		Then response code should be 200
		And response body path $.configuration.preferredGroup should be /
		And response body path $.configuration.referenceDatasets.alwaysUseLatest should be false
		And response body path $.configuration.pipelineProcessor.chunkSize should be 3
		# Check its direct descendant
		Given I remove header x-groupcontextid
		And I set x-groupcontextid header to /
		When I GET /groups/%2fgroupoverridde1
		Then response body path $.configuration.preferredGroup should be /groupoverridde1
		And response body path $.configuration.referenceDatasets.alwaysUseLatest should be false
		And response body path $.configuration.pipelineProcessor.chunkSize should be 3
		# Check its leaf descendant
		Given I remove header x-groupcontextid
		And I set x-groupcontextid header to /groupoverridde1
		When I GET /groups/%2fgroupoverridde1%2fgroupoverridde2
		Then response body path $.configuration.preferredGroup should be /groupoverridde1
		And response body path $.configuration.referenceDatasets.alwaysUseLatest should be true
		And response body path $.configuration.pipelineProcessor.chunkSize should be 3

	Scenario: When listing group it should not include the configuration field in the payload
		Given I authenticate using email accessManagement_admin@amazon.com and password p@ssword1
		When I GET /groups
		Then response body path $.groups[?(@.id=='/accessmanagementgrouptests1')].id should be /accessmanagementgrouptests1
		Then response body path $.groups[?(@.id=='/accessmanagementgrouptests1')].configuration should be null
		Then response body path $.groups[?(@.id=='/groupoverridde1')].id should be /groupoverridde1
		Then response body path $.groups[?(@.id=='/groupoverridde1')].configuration should be null

	Scenario: Admin should be able to view detail to configuration source from the hierarchies
		Given I authenticate using email accessManagement_admin@amazon.com and password p@ssword1
		Given I remove header x-groupcontextid
		And I set x-groupcontextid header to /groupoverridde1
		When I GET /groups/%2fgroupoverridde1%2fgroupoverridde2?showConfigurationSource=true
		Then response body path $.configuration.preferredGroup should be /groupoverridde1
		And response body path $.configuration.referenceDatasets.alwaysUseLatest should be true
		# Default configuration on root
		And response body path $.configurationSource.['/'].preferredGroup should be /
		And response body path $.configurationSource.['/'].referenceDatasets.alwaysUseLatest should be false
		And response body path $.configurationSource.['/'].pipelineProcessor.chunkSize should be 3
		# Override by parent /groupoverridde1
		Then response body path $.configurationSource.['/groupoverridde1'].preferredGroup should be /groupoverridde1
		Then response body path $.configurationSource.['/groupoverridde1'].referenceDatasets should be null
		Then response body path $.configurationSource.['/groupoverridde1'].pipelineProcessor should be null
		# Override by current group /groupoverridde1/groupoverridde2
		Then response body path $.configurationSource.['/groupoverridde1/groupoverridde2'].referenceDatasets.alwaysUseLatest should be true
		Then response body path $.configurationSource.['/groupoverridde1/groupoverridde2'].preferredGroup should be null
		Then response body path $.configurationSource.['/groupoverridde1/groupoverridde2'].pipelineProcessor should be null

	Scenario: Admin should be able to modify a new child group that overrides application configuration from its immediate parent up to the root
		Given I authenticate using email accessManagement_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /groupoverridde1
		And I set body to {"configuration":{ "preferredGroup"  : "/groupoverridde1/groupoverridde2" , "referenceDatasets":{"alwaysUseLatest":true}}}
		When I PATCH /groups/%2fgroupoverridde1%2fgroupoverridde2
		Then response code should be 200
		And response body path $.configuration.preferredGroup should be /groupoverridde1/groupoverridde2
		And response body path $.configuration.referenceDatasets.alwaysUseLatest should be true
		And response body path $.configuration.pipelineProcessor.chunkSize should be 3
		When I GET /groups/%2fgroupoverridde1%2fgroupoverridde2
		And response body path $.configuration.preferredGroup should be /groupoverridde1/groupoverridde2
		And response body path $.configuration.referenceDatasets.alwaysUseLatest should be true
		And response body path $.configuration.pipelineProcessor.chunkSize should be 3

	Scenario: Admin should be able to create a nested child group
		Given I authenticate using email accessManagement_admin@amazon.com and password p@ssword1
		# Create accessmanagementgrouptests2
		And I set x-groupcontextid header to /accessmanagementgrouptests1
		And I set body to {"name": "accessManagementGroupTests2"}
		When I POST to /groups
		Then response code should be 201
		And response header x-groupid should be /accessmanagementgrouptests1/accessmanagementgrouptests2
		And response body path $.id should be /accessmanagementgrouptests1/accessmanagementgrouptests2
		And response body path $.name should be accessManagementGroupTests2
		And response body should contain createdBy
		And response body should contain createdAt
		# Create accessmanagementgrouptests3
		When I remove header x-groupcontextid
		And I set x-groupcontextid header to /accessmanagementgrouptests1/accessmanagementgrouptests2
		And I set body to {"name": "accessManagementGroupTests3"}
		When I POST to /groups
		Then response code should be 201
		And response header x-groupid should be /accessmanagementgrouptests1/accessmanagementgrouptests2/accessmanagementgrouptests3
		And response body path $.id should be /accessmanagementgrouptests1/accessmanagementgrouptests2/accessmanagementgrouptests3
		And response body path $.name should be accessManagementGroupTests3
		And response body should contain createdBy
		And response body should contain createdAt

	Scenario: Creating a nested group with an invalid parent is not allowed
		Given I authenticate using email accessManagement_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /this-is_an_invalid_group
		And I set body to {"name": "accessManagementGroupTests3"}
		When I POST to /groups
		Then response code should be 404

  	# Listing resources tests
	Scenario: Retrieving reference datasets with includeParentGroups and includeChildGroups should return resources up and down the hierarchy.
		Given I authenticate using email accessManagement_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /accessmanagementgrouptests1
		When I GET /groups
		Then response code should be 200
		And response body path $.groups.length should be 1
		And response body path $.groups[?(@.id=='/accessmanagementgrouptests1/accessmanagementgrouptests2')].id should be /accessmanagementgrouptests1/accessmanagementgrouptests2
		When I GET /groups?includeParentGroups=true
		Then response code should be 200
		And response body path $.groups.length should be 3
		And response body path $.groups[?(@.id=='/')].id should be /
		And response body path $.groups[?(@.id=='/accessmanagementgrouptests1')].id should be /accessmanagementgrouptests1
		And response body path $.groups[?(@.id=='/accessmanagementgrouptests1/accessmanagementgrouptests2')].id should be /accessmanagementgrouptests1/accessmanagementgrouptests2
		When I GET /groups?includeChildGroups=true
		Then response code should be 200
		And response body path $.groups.length should be 2
		And response body path $.groups[?(@.id=='/accessmanagementgrouptests1/accessmanagementgrouptests2')].id should be /accessmanagementgrouptests1/accessmanagementgrouptests2
		And response body path $.groups[?(@.id=='/accessmanagementgrouptests1/accessmanagementgrouptests2/accessmanagementgrouptests3')].id should be /accessmanagementgrouptests1/accessmanagementgrouptests2/accessmanagementgrouptests3
		When I GET /groups?includeChildGroups=true&includeParentGroups=true
		Then response code should be 200
		And response body path $.groups.length should be 4
		And response body path $.groups[?(@.id=='/')].id should be /
		And response body path $.groups[?(@.id=='/accessmanagementgrouptests1')].id should be /accessmanagementgrouptests1
		And response body path $.groups[?(@.id=='/accessmanagementgrouptests1/accessmanagementgrouptests2')].id should be /accessmanagementgrouptests1/accessmanagementgrouptests2
		And response body path $.groups[?(@.id=='/accessmanagementgrouptests1/accessmanagementgrouptests2/accessmanagementgrouptests3')].id should be /accessmanagementgrouptests1/accessmanagementgrouptests2/accessmanagementgrouptests3

	Scenario: Active groups cannot be deleted
		Given I authenticate using email accessManagement_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		And I DELETE /groups/%2faccessmanagementgrouptests1
		Then response code should be 409

	Scenario: Disabled groups cannot be deleted if it contains sub groups
		Given I authenticate using email accessManagement_admin@amazon.com and password p@ssword1
		And I set body to {"state": "disabled"}
		And I PATCH /groups/%2faccessmanagementgrouptests1
		Then response code should be 200
		And response body path $.state should be disabled
		When I remove header Content-Type
		And I DELETE /groups/%2faccessmanagementgrouptests1
		Then response code should be 409

	Scenario: Disabled groups with no sub groups can be deleted
		Given I authenticate using email accessManagement_admin@amazon.com and password p@ssword1
		# Delete accessmanagementgrouptests3
		And I set x-groupcontextid header to /accessmanagementgrouptests1/accessmanagementgrouptests2
		And I set body to {"state": "disabled"}
		And I PATCH /groups/%2faccessmanagementgrouptests1%2faccessmanagementgrouptests2%2faccessmanagementgrouptests3
		Then response code should be 200
		And response body path $.state should be disabled
		When I remove header Content-Type
		And I DELETE /groups/%2faccessmanagementgrouptests1%2faccessmanagementgrouptests2%2faccessmanagementgrouptests3
		Then response code should be 204
		# Delete accessmanagementgrouptests2
		When I set Content-Type header to application/json
		When I remove header x-groupcontextid
		And I set x-groupcontextid header to /accessmanagementgrouptests1
		And I set body to {"state": "disabled"}
		And I PATCH /groups/%2faccessmanagementgrouptests1%2faccessmanagementgrouptests2
		Then response code should be 200
		And response body path $.state should be disabled
		When I remove header Content-Type
		And I DELETE /groups/%2faccessmanagementgrouptests1%2faccessmanagementgrouptests2
		Then response code should be 204
		# Delete accessmanagementgrouptests1
		When I set Content-Type header to application/json
		And I GET /groups/%2faccessmanagementgrouptests1%2faccessmanagementgrouptests2
		Then response code should be 404
		When I remove header Content-Type
		And I DELETE /groups/%2faccessmanagementgrouptests1
		Then response code should be 204
		When I set Content-Type header to application/json
		And I GET /groups/%2faccessmanagementgrouptests1
		Then response code should be 404

	Scenario: Teardown group used in application configuration tests
		# Delete override tests
		Given I authenticate using email accessManagement_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /groupoverridde1
		And I set body to {"state": "disabled"}
		And I PATCH /groups/%2fgroupoverridde1%2fgroupoverridde2
		Then response code should be 200
		And response body path $.state should be disabled
		When I remove header Content-Type
		And I DELETE /groups/%2fgroupoverridde1%2fgroupoverridde2
		Then response code should be 204
		When I set Content-Type header to application/json
		And I GET /groups/%2fgroupoverridde1%2fgroupoverridde2
		Then response code should be 404
		And I remove header x-groupcontextid
		And I set x-groupcontextid header to /
		And I set body to {"state": "disabled"}
		And I PATCH /groups/%2fgroupoverridde1
		Then response code should be 200
		And response body path $.state should be disabled
		When I remove header Content-Type
		And I DELETE /groups/%2fgroupoverridde1
		Then response code should be 204
		When I set Content-Type header to application/json
		And I GET /groups/%2fgroupoverridde1
		Then response code should be 404

	Scenario: Teardown - delete user
		Given group / has user accessManagement_contributor@amazon.com revoked
		And group / has user accessManagement_admin@amazon.com revoked
