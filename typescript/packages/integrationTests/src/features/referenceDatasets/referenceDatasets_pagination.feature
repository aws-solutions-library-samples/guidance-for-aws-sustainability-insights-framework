@setup_referenceDatasets @referenceDatasets
Feature:
	Scenario: Setup users
		Given group /paginationReferenceDatasetTests exists
		And group /paginationReferenceDatasetTests/a exists
		And group /paginationReferenceDatasetTests/b exists
		And group /paginationReferenceDatasetTests/a/b exists
		And group /paginationReferenceDatasetTests/a/b/c exists
		And group /paginationReferenceDatasetTests has user paginationReferenceDatasetTests_admin@amazon.com with role admin and password p@ssword1
		And group /paginationReferenceDatasetTests/a has user paginationReferenceDatasetTests_admin@amazon.com granted access with role admin
		And group /paginationReferenceDatasetTests/b has user paginationReferenceDatasetTests_admin@amazon.com granted access with role admin
		And group /paginationReferenceDatasetTests/a/b/c has user paginationReferenceDatasetTests_admin@amazon.com granted access with role admin

	Scenario: Setup: Admin creates resources up and down the hierarchy
		Given I authenticate using email paginationReferenceDatasetTests_admin@amazon.com and password p@ssword1
		Given I remove header x-groupcontextid
		And I set x-groupcontextid header to /paginationReferenceDatasetTests
		And I set body to {"name":"test01","description":"this dataset contains unit mappings","data":"Type,Multiplier","datasetHeaders":["Type","Multiplier"]}
		When I POST to /referenceDatasets
		Then response code should be 201
		And I store the value of body path $.id as reference_dataset_id_1 in global scope
		And I set body to {"name":"test02","description":"this dataset contains unit mappings","data":"Type,Multiplier","datasetHeaders":["Type","Multiplier"]}
		When I POST to /referenceDatasets
		Then response code should be 201
		And I store the value of body path $.id as reference_dataset_id_2 in global scope
		And I set body to {"name":"test03","description":"this dataset contains unit mappings","data":"Type,Multiplier","datasetHeaders":["Type","Multiplier"]}
		When I POST to /referenceDatasets
		Then response code should be 201
		And I store the value of body path $.id as reference_dataset_id_3 in global scope
		Given I remove header x-groupcontextid
		And I set x-groupcontextid header to /paginationReferenceDatasetTests/a
		And I set body to {"name":"test04","description":"this dataset contains unit mappings","data":"Type,Multiplier","datasetHeaders":["Type","Multiplier"]}
		When I POST to /referenceDatasets
		Then response code should be 201
		And I store the value of body path $.id as reference_dataset_id_4 in global scope
		And I set body to {"name":"test05","description":"this dataset contains unit mappings","data":"Type,Multiplier","datasetHeaders":["Type","Multiplier"]}
		When I POST to /referenceDatasets
		Then response code should be 201
		And I store the value of body path $.id as reference_dataset_id_5 in global scope
		Given I remove header x-groupcontextid
		And I set x-groupcontextid header to /paginationReferenceDatasetTests
		And I set body to {"name":"test06","description":"this dataset contains unit mappings","data":"Type,Multiplier","datasetHeaders":["Type","Multiplier"]}
		When I POST to /referenceDatasets
		Then response code should be 201
		And I store the value of body path $.id as reference_dataset_id_6 in global scope
		And I set body to {"name":"test07","description":"this dataset contains unit mappings","data":"Type,Multiplier","datasetHeaders":["Type","Multiplier"]}
		When I POST to /referenceDatasets
		Then response code should be 201
		And I store the value of body path $.id as reference_dataset_id_7 in global scope
		Given I remove header x-groupcontextid
		And I set x-groupcontextid header to /paginationReferenceDatasetTests/a/b/c
		And I set body to {"name":"test08","description":"this dataset contains unit mappings","data":"Type,Multiplier","datasetHeaders":["Type","Multiplier"]}
		When I POST to /referenceDatasets
		Then response code should be 201
		And I store the value of body path $.id as reference_dataset_id_8 in global scope
		And I set body to {"name":"test09","description":"this dataset contains unit mappings","data":"Type,Multiplier","datasetHeaders":["Type","Multiplier"]}
		When I POST to /referenceDatasets
		Then response code should be 201
		And I store the value of body path $.id as reference_dataset_id_9 in global scope
		And I set body to {"name":"test10","description":"this dataset contains unit mappings","data":"Type,Multiplier","datasetHeaders":["Type","Multiplier"]}
		When I POST to /referenceDatasets
		Then response code should be 201
		And I store the value of body path $.id as reference_dataset_id_10 in global scope
		Given I remove header x-groupcontextid
		And I set x-groupcontextid header to /paginationReferenceDatasetTests/b
		And I set body to {"name":"testb","description":"this dataset contains unit mappings","data":"Type,Multiplier","datasetHeaders":["Type","Multiplier"]}
		When I POST to /referenceDatasets
		Then response code should be 201
		And I store the value of body path $.id as reference_dataset_id_b in global scope

	# List resources by current security group context
	Scenario: List reference datasets with /paginationReferenceDatasetTests as current group
		Given I authenticate using email paginationReferenceDatasetTests_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /paginationReferenceDatasetTests
		When I GET /referenceDatasets?count=3
		And response body path $.referenceDatasets.length should be 3
		And I store the value of body path $.pagination.lastEvaluatedToken as paginationToken in global scope
		When I GET /referenceDatasets?count=3&fromToken=`paginationToken`
		And response body path $.referenceDatasets.length should be 2
		And response body should not contain $.pagination.lastEvaluatedToken

  	# List resources and includes parent and child groups
	Scenario: List reference datasets with root / as current group
		Given I authenticate using email paginationReferenceDatasetTests_admin@amazon.com and password p@ssword1
		When I GET /referenceDatasets?includeChildGroups=true&includeParentGroups=true&count=3
		And response body path $.referenceDatasets.length should be 3
		And response body path $.referenceDatasets[?(@.id=='`reference_dataset_id_1`')].id should be `reference_dataset_id_1`
		And response body path $.referenceDatasets[?(@.id=='`reference_dataset_id_2`')].id should be `reference_dataset_id_2`
		And response body path $.referenceDatasets[?(@.id=='`reference_dataset_id_3`')].id should be `reference_dataset_id_3`
		And I store the value of body path $.pagination.lastEvaluatedToken as paginationToken in global scope
		When I GET /referenceDatasets?includeChildGroups=true&includeParentGroups=true&count=3&fromToken=`paginationToken`
		And response body path $.referenceDatasets.length should be 3
		And response body path $.referenceDatasets[?(@.id=='`reference_dataset_id_6`')].id should be `reference_dataset_id_6`
		And response body path $.referenceDatasets[?(@.id=='`reference_dataset_id_7`')].id should be `reference_dataset_id_7`
		# it should iterate all the resources under /paginationReferenceDatasetTests first before /paginationReferenceDatasetTests/a
		And response body path $.referenceDatasets[?(@.id=='`reference_dataset_id_4`')].id should be `reference_dataset_id_4`
		And I store the value of body path $.pagination.lastEvaluatedToken as paginationToken in global scope
		When I GET /referenceDatasets?includeChildGroups=true&includeParentGroups=true&count=3&fromToken=`paginationToken`
		And response body path $.referenceDatasets.length should be 3
		And response body path $.referenceDatasets[?(@.id=='`reference_dataset_id_5`')].id should be `reference_dataset_id_5`
		And response body path $.referenceDatasets[?(@.id=='`reference_dataset_id_8`')].id should be `reference_dataset_id_8`
		And response body path $.referenceDatasets[?(@.id=='`reference_dataset_id_9`')].id should be `reference_dataset_id_9`
		And I store the value of body path $.pagination.lastEvaluatedToken as paginationToken in global scope
		When I GET /referenceDatasets?includeChildGroups=true&includeParentGroups=true&count=3&fromToken=`paginationToken`
		And response body path $.referenceDatasets.length should be 2
		And response body path $.referenceDatasets[?(@.id=='`reference_dataset_id_10`')].id should be `reference_dataset_id_10`
		# Should include resources in /paginationReferenceDatasetTests/b
		And response body path $.referenceDatasets[?(@.id=='`reference_dataset_id_b`')].id should be `reference_dataset_id_b`
		And response body should not contain $.pagination.lastEvaluatedToken

	Scenario: List reference datasets with /paginationReferenceDatasetTests/a as current group
		Given I authenticate using email paginationReferenceDatasetTests_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /paginationReferenceDatasetTests/a
		# Include Child Groups
		When I GET /referenceDatasets?includeChildGroups=true&count=3
		And response body path $.referenceDatasets.length should be 3
		And response body path $.referenceDatasets[?(@.id=='`reference_dataset_id_4`')].id should be `reference_dataset_id_4`
		And response body path $.referenceDatasets[?(@.id=='`reference_dataset_id_5`')].id should be `reference_dataset_id_5`
		And response body path $.referenceDatasets[?(@.id=='`reference_dataset_id_8`')].id should be `reference_dataset_id_8`
		And I store the value of body path $.pagination.lastEvaluatedToken as paginationToken in global scope
		When I GET /referenceDatasets?includeChildGroups=true&count=3&fromToken=`paginationToken`
		And response body path $.referenceDatasets.length should be 2
		And response body path $.referenceDatasets[?(@.id=='`reference_dataset_id_9`')].id should be `reference_dataset_id_9`
		And response body path $.referenceDatasets[?(@.id=='`reference_dataset_id_10`')].id should be `reference_dataset_id_10`
		And response body should not contain $.pagination.lastEvaluatedToken
		# Include Parent Groups
		When I GET /referenceDatasets?includeParentGroups=true&count=3
		And response body path $.referenceDatasets.length should be 3
		And response body path $.referenceDatasets[?(@.id=='`reference_dataset_id_1`')].id should be `reference_dataset_id_1`
		And response body path $.referenceDatasets[?(@.id=='`reference_dataset_id_2`')].id should be `reference_dataset_id_2`
		And response body path $.referenceDatasets[?(@.id=='`reference_dataset_id_3`')].id should be `reference_dataset_id_3`
		And I store the value of body path $.pagination.lastEvaluatedToken as paginationToken in global scope
		When I GET /referenceDatasets?includeParentGroups=true&count=3&fromToken=`paginationToken`
		And response body path $.referenceDatasets.length should be 3
		And response body path $.referenceDatasets[?(@.id=='`reference_dataset_id_6`')].id should be `reference_dataset_id_6`
		And response body path $.referenceDatasets[?(@.id=='`reference_dataset_id_7`')].id should be `reference_dataset_id_7`
		And response body path $.referenceDatasets[?(@.id=='`reference_dataset_id_4`')].id should be `reference_dataset_id_4`
		And I store the value of body path $.pagination.lastEvaluatedToken as paginationToken in global scope
		When I GET /referenceDatasets?includeParentGroups=true&count=3&fromToken=`paginationToken`
		And response body path $.referenceDatasets.length should be 1
		And response body path $.referenceDatasets[?(@.id=='`reference_dataset_id_5`')].id should be `reference_dataset_id_5`
		And response body should not contain $.pagination.lastEvaluatedToken
		# Include both Child and Parent Groups
		When I GET /referenceDatasets?includeChildGroups=true&includeParentGroups=true&count=3
		And response body path $.referenceDatasets.length should be 3
		And response body path $.referenceDatasets[?(@.id=='`reference_dataset_id_1`')].id should be `reference_dataset_id_1`
		And response body path $.referenceDatasets[?(@.id=='`reference_dataset_id_2`')].id should be `reference_dataset_id_2`
		And response body path $.referenceDatasets[?(@.id=='`reference_dataset_id_3`')].id should be `reference_dataset_id_3`
		And I store the value of body path $.pagination.lastEvaluatedToken as paginationToken in global scope
		When I GET /referenceDatasets?includeChildGroups=true&includeParentGroups=true&count=3&fromToken=`paginationToken`
		And response body path $.referenceDatasets.length should be 3
		And response body path $.referenceDatasets[?(@.id=='`reference_dataset_id_6`')].id should be `reference_dataset_id_6`
		And response body path $.referenceDatasets[?(@.id=='`reference_dataset_id_7`')].id should be `reference_dataset_id_7`
		# it should iterate all the resources under /paginationReferenceDatasetTests first before /paginationReferenceDatasetTests/a
		And response body path $.referenceDatasets[?(@.id=='`reference_dataset_id_4`')].id should be `reference_dataset_id_4`
		And I store the value of body path $.pagination.lastEvaluatedToken as paginationToken in global scope
		When I GET /referenceDatasets?includeChildGroups=true&includeParentGroups=true&count=3&fromToken=`paginationToken`
		And response body path $.referenceDatasets.length should be 3
		And response body path $.referenceDatasets[?(@.id=='`reference_dataset_id_5`')].id should be `reference_dataset_id_5`
		And response body path $.referenceDatasets[?(@.id=='`reference_dataset_id_8`')].id should be `reference_dataset_id_8`
		And response body path $.referenceDatasets[?(@.id=='`reference_dataset_id_9`')].id should be `reference_dataset_id_9`
		And I store the value of body path $.pagination.lastEvaluatedToken as paginationToken in global scope
		When I GET /referenceDatasets?includeChildGroups=true&includeParentGroups=true&count=3&fromToken=`paginationToken`
		# should not include resources under /paginationReferenceDatasetTests/b
		And response body path $.referenceDatasets.length should be 1
		And response body path $.referenceDatasets[?(@.id=='`reference_dataset_id_10`')].id should be `reference_dataset_id_10`
		And response body should not contain $.pagination.lastEvaluatedToken

	Scenario: Remove resources
		Given I authenticate using email paginationReferenceDatasetTests_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
	  	# Delete everything under /paginationReferenceDatasetTests
		And I set x-groupcontextid header to /paginationReferenceDatasetTests
		When I DELETE /referenceDatasets/`reference_dataset_id_1`
		Then response code should be 204
		When I GET /referenceDatasets/`reference_dataset_id_1`
		Then response code should be 404
		When I DELETE /referenceDatasets/`reference_dataset_id_2`
		Then response code should be 204
		When I GET /referenceDatasets/`reference_dataset_id_2`
		Then response code should be 404
		When I DELETE /referenceDatasets/`reference_dataset_id_3`
		Then response code should be 204
		When I GET /referenceDatasets/`reference_dataset_id_3`
		Then response code should be 404
		When I DELETE /referenceDatasets/`reference_dataset_id_6`
		Then response code should be 204
		When I GET /referenceDatasets/`reference_dataset_id_6`
		Then response code should be 404
		When I DELETE /referenceDatasets/`reference_dataset_id_7`
		Then response code should be 204
		When I GET /referenceDatasets/`reference_dataset_id_7`
		Then response code should be 404
		# Delete everything under /paginationReferenceDatasetTests/a
		When I remove header x-groupcontextid
		And I set x-groupcontextid header to /paginationReferenceDatasetTests/a
		When I DELETE /referenceDatasets/`reference_dataset_id_4`
		Then response code should be 204
		When I GET /referenceDatasets/`reference_dataset_id_4`
		Then response code should be 404
		When I DELETE /referenceDatasets/`reference_dataset_id_5`
		Then response code should be 204
		When I GET /referenceDatasets/`reference_dataset_id_5`
		Then response code should be 404
		# Delete everything under /paginationReferenceDatasetTests/b
		When I remove header x-groupcontextid
		And I set x-groupcontextid header to /paginationReferenceDatasetTests/b
		When I DELETE /referenceDatasets/`reference_dataset_id_b`
		Then response code should be 204
		When I GET /referenceDatasets/`reference_dataset_id_b`
		Then response code should be 404
		# Delete everything under /paginationReferenceDatasetTests/a/b/c
		When I remove header x-groupcontextid
		And I set x-groupcontextid header to /paginationReferenceDatasetTests/a/b/c
		When I DELETE /referenceDatasets/`reference_dataset_id_8`
		Then response code should be 204
		When I GET /referenceDatasets/`reference_dataset_id_8`
		Then response code should be 404
		When I DELETE /referenceDatasets/`reference_dataset_id_9`
		Then response code should be 204
		When I GET /referenceDatasets/`reference_dataset_id_9`
		Then response code should be 404
		When I DELETE /referenceDatasets/`reference_dataset_id_10`
		Then response code should be 204
		When I GET /referenceDatasets/`reference_dataset_id_10`
		Then response code should be 404

	Scenario: Teardown: Revoke users
		Given group /paginationReferenceDatasetTests has user paginationReferenceDatasetTests_admin@amazon.com revoked
		And group /paginationReferenceDatasetTests/a has user paginationReferenceDatasetTests_admin@amazon.com revoked
		And group /paginationReferenceDatasetTests/b has user paginationReferenceDatasetTests_admin@amazon.com revoked
		And group /paginationReferenceDatasetTests/a/b/c has user paginationReferenceDatasetTests_admin@amazon.com revoked

	Scenario: Teardown: Delete groups
		Given group /paginationReferenceDatasetTests/a/b/c has been removed
		And group /paginationReferenceDatasetTests/a/b has been removed
		And group /paginationReferenceDatasetTests/a has been removed
		And group /paginationReferenceDatasetTests/b has been removed
		And group /paginationReferenceDatasetTests has been removed
