@setup_pipelines @pipelines
Feature:
	This feature tests the general usage of the pipelines connectors api within the context of a single group.

	Scenario: Setup users
		Given group /pipelinesConnectorsTests exists
		And group /pipelinesConnectorsTests has user pipelinesConnectorsTests_admin@amazon.com with role admin and password p@ssword1
		And group /pipelinesConnectorsTests has user pipelinesConnectorsTests_contributor@amazon.com with role contributor and password p@ssword1
		And group /pipelinesConnectorsTests has user pipelinesConnectorsTests_reader@amazon.com with role reader and password p@ssword1

	Scenario: Admin & Contributor can create a new connector and Reader cannot
		Given I authenticate using email pipelinesConnectorsTests_admin@amazon.com and password p@ssword1
		And I set body to {"name":"connector1","type":"input","description":"version 1 created by admin","tags":{"source":"sap"},"parameters":[{"name":"endpoint","description":"some endpoint which my connector will need to utilize","required":true,"defaultValue":"https://..."}],"attributes":{"key1":"val","key2":"val"}}
		When I POST to /connectors
		Then response code should be 201
		And response body should contain id
		And I store the value of body path $.id as connector1_id in global scope
		And response body path $.description should be version 1 created by admin
		And response body path $.type should be input
		And response body path $.requiresFileUpload should be false
		And response body path $.isManaged should be false
		And response body path $.parameters[0].name should be endpoint
		And response body path $.parameters[0].description should be some endpoint which my connector will need to utilize
		And response body path $.tags.source should be sap
		And response body path $.createdBy should be pipelinesconnectorstests_admin@amazon.com
		Given I authenticate using email pipelinesConnectorsTests_contributor@amazon.com and password p@ssword1
		And I set body to {"name":"connector2","type":"input","description":"version 2 created by contributor","tags":{"source":"sap"},"parameters":[{"name":"endpoint","description":"some endpoint which my connector will need to utilize","required":true,"defaultValue":"https://..."}],"attributes":{"key1":"val","key2":"val"}}
		When I POST to /connectors
		Then response code should be 201
		And response body should contain id
		And I store the value of body path $.id as connector2_id in global scope
		And response body path $.description should be version 2 created by contributor
		And response body path $.type should be input
		And response body path $.requiresFileUpload should be false
		And response body path $.isManaged should be false
		And response body path $.parameters[0].name should be endpoint
		And response body path $.parameters[0].description should be some endpoint which my connector will need to utilize
		And response body path $.tags.source should be sap
		And response body path $.createdBy should be pipelinesconnectorstests_contributor@amazon.com
		Given I authenticate using email pipelinesConnectorsTests_reader@amazon.com and password p@ssword1
		And I set body to {"name":"connector1","type":"input","description":"version 1 created by admin","tags":{"source":"sap"},"parameters":[{"name":"endpoint","description":"some endpoint which my connector will need to utilize","required":true,"defaultValue":"https://..."}],"attributes":{"key1":"val","key2":"val"}}
		When I POST to /connectors
		Then response code should be 403

	Scenario: Admin cannot create a connector with a same name
		Given I authenticate using email pipelinesConnectorsTests_admin@amazon.com and password p@ssword1
		And I set body to {"name":"connector1","type":"input","tags":{"source":"sap"},"attributes":{"key1":"val","key2":"val"}}
		When I POST to /connectors
		Then response code should be 409
		And response body path $.message should be Name 'connector1' already in use.

	Scenario: Only Admin & Contributor can update a connector
		Given I authenticate using email pipelinesConnectorsTests_admin@amazon.com and password p@ssword1
		And I set body to {"name":"connector1","type":"input","description":"updated by admin","tags":{"source":"sap"},"parameters":[{"name":"endpoint","description":"some endpoint which my connector will need to utilize","required":true,"defaultValue":"https://..."}],"attributes":{"key1":"val","key2":"val"}}
		When I PATCH /connectors/`connector1_id`
		Then response code should be 200
		And response body path $.id should be `connector1_id`
		And response body path $.type should be input
		And response body path $.requiresFileUpload should be false
		And response body path $.isManaged should be false
		And response body path $.parameters[0].name should be endpoint
		And response body path $.parameters[0].description should be some endpoint which my connector will need to utilize
		And response body path $.tags.source should be sap
		And response body path $.updatedBy should be pipelinesconnectorstests_admin@amazon.com
		Given I authenticate using email pipelinesConnectorsTests_contributor@amazon.com and password p@ssword1
		And I set body to {"name":"connector1","type":"input","description":"updated by contributor","tags":{"source":"sap"},"parameters":[{"name":"endpoint","description":"some endpoint which my connector will need to utilize","required":true,"defaultValue":"https://..."}],"attributes":{"key1":"val","key2":"val"}}
		When I PATCH /connectors/`connector1_id`
		Then response code should be 200
		And response body path $.id should be `connector1_id`
		And response body path $.type should be input
		And response body path $.requiresFileUpload should be false
		And response body path $.isManaged should be false
		And response body path $.parameters[0].name should be endpoint
		And response body path $.parameters[0].description should be some endpoint which my connector will need to utilize
		And response body path $.tags.source should be sap
		And response body path $.updatedBy should be pipelinesconnectorstests_contributor@amazon.com
		Given I authenticate using email pipelinesConnectorsTests_reader@amazon.com and password p@ssword1
		And I set body to {"name":"connector1","type":"input","description":"updated by reader","tags":{"source":"sap"},"parameters":[{"name":"endpoint","description":"some endpoint which my connector will need to utilize","required":true,"defaultValue":"https://..."}],"attributes":{"key1":"val","key2":"val"}}
		When I PATCH /connectors/`connector1_id`
		Then response code should be 403

	Scenario: Admin, Contributor & Reader can get last updated connector
		Given I authenticate using email pipelinesConnectorsTests_admin@amazon.com and password p@ssword1
		When I GET /connectors/`connector1_id`
		Then response code should be 200
		Given I authenticate using email pipelinesConnectorsTests_contributor@amazon.com and password p@ssword1
		When I GET /connectors/`connector1_id`
		Then response code should be 200
		Given I authenticate using email pipelinesConnectorsTests_reader@amazon.com and password p@ssword1
		When I GET /connectors/`connector1_id`
		Then response code should be 200


	Scenario: Admin, Contributor & Reader can get a connector by its name
		Given I authenticate using email pipelinesConnectorsTests_admin@amazon.com and password p@ssword1
		When I GET /connectors?name=connector1
		Then response code should be 200
		And response body path $.connectors should be of type array with length 1
		And response body path $.connectors[0].type should be input
		And response body path $.connectors[0].requiresFileUpload should be false
		And response body path $.connectors[0].isManaged should be false
		And response body path $.connectors[0].parameters[0].name should be endpoint
		And response body path $.connectors[0].parameters[0].description should be some endpoint which my connector will need to utilize
		And response body path $.connectors[0].tags.source should be sap
		And response body path $.connectors[0].updatedBy should be pipelinesconnectorstests_contributor@amazon.com
		Given I authenticate using email pipelinesConnectorsTests_contributor@amazon.com and password p@ssword1
		When I GET /connectors?name=connector1
		Then response code should be 200
		And response body path $.connectors should be of type array with length 1
		And response body path $.connectors[0].type should be input
		And response body path $.connectors[0].requiresFileUpload should be false
		And response body path $.connectors[0].isManaged should be false
		And response body path $.connectors[0].parameters[0].name should be endpoint
		And response body path $.connectors[0].parameters[0].description should be some endpoint which my connector will need to utilize
		And response body path $.connectors[0].tags.source should be sap
		And response body path $.connectors[0].updatedBy should be pipelinesconnectorstests_contributor@amazon.com
		Given I authenticate using email pipelinesConnectorsTests_reader@amazon.com and password p@ssword1
		When I GET /connectors?name=connector1
		Then response code should be 200
		And response body path $.connectors should be of type array with length 1
		And response body path $.connectors[0].type should be input
		And response body path $.connectors[0].requiresFileUpload should be false
		And response body path $.connectors[0].isManaged should be false
		And response body path $.connectors[0].parameters[0].name should be endpoint
		And response body path $.connectors[0].parameters[0].description should be some endpoint which my connector will need to utilize
		And response body path $.connectors[0].tags.source should be sap
		And response body path $.connectors[0].updatedBy should be pipelinesconnectorstests_contributor@amazon.com

	Scenario: Only Admin can delete a connector, and readers and contributors cannot
		Given I authenticate using email pipelinesConnectorsTests_contributor@amazon.com and password p@ssword1
		When I remove header Content-Type
		When I DELETE /connectors/`connector1_id`
		Then response code should be 403
		Given I authenticate using email pipelinesConnectorsTests_reader@amazon.com and password p@ssword1
		When I remove header Content-Type
		When I DELETE /connectors/`connector1_id`
		Then response code should be 403

	Scenario: Admin can delete a pipeline connector
		Given I authenticate using email pipelinesConnectorsTests_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		When I DELETE /connectors/`connector1_id`
		Then response code should be 204
		When I GET /connectors/`connector1_id`
		Then response code should be 404
		When I DELETE /connectors/`connector2_id`
		Then response code should be 204
		When I GET /connectors/`connector2_id`
		Then response code should be 404

	Scenario: Teardown: delete users and group
		Given group /pipelinesConnectorsTests has user pipelinesConnectorsTests_admin@amazon.com revoked
		And group /pipelinesConnectorsTests has user pipelinesConnectorsTests_contributor@amazon.com revoked
		And group /pipelinesConnectorsTests has user pipelinesConnectorsTests_reader@amazon.com revoked
		And group /pipelinesConnectorsTests has been removed
