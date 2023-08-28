@setup_referenceDatasets @referenceDatasets
Feature:
	This feature tests the general usage of the api within the context of a single group.

	Scenario: Setup users
		Given group /referenceDatasetsApiTests exists
		And group /referenceDatasetsApiTests has user referenceDatasetsApiTests_admin@amazon.com with role admin and password p@ssword1
		And group /referenceDatasetsApiTests has user referenceDatasetsApiTests_contributor@amazon.com with role contributor and password p@ssword1
		And group /referenceDatasetsApiTests has user referenceDatasetsApiTests_reader@amazon.com with role reader and password p@ssword1

	Scenario: Admin cannot create new referenceDataset by specifying headers that do not match the headers in file
		Given I authenticate using email referenceDatasetsApiTests_admin@amazon.com and password p@ssword1
		And I set form data to
			| name           | value                    | type             |
			| name           | form data sample         |                  |
			| description    | form data description    |                  |
			| data           | ./samples/sampleData.csv | text/csv         |
			| tags           | {"type":"metal"}         | application/json |
			| datasetHeaders | ["COUNTRY_CODE", "ZIP"]  | application/json |
		When Using axios I POST to /referenceDatasets
		Then response code should be 400

	Scenario: Should throw error when activeAt is not set to the right date time format
		Given I authenticate using email referenceDatasetsApiTests_admin@amazon.com and password p@ssword1
		And I set body to {"name":"sample_dataset", "activeAt": "invalidDate", "description":"this dataset contains unit mappings","data":"Type,Multiplier","datasetHeaders":["Type","Multiplier"],"tags":{"datasource":"GHG Protocol","type":"Material/Metal/Steel"}}
		When I POST to /referenceDatasets
		Then response code should be 400
		And response body path $.message should be body/activeAt must match format "date-time"

	Scenario: Admin can create new referenceDataset with form data
		Given I authenticate using email referenceDatasetsApiTests_admin@amazon.com and password p@ssword1
		And I set form data to
			| name           | value                    | type             |
			| name           | form data sample         |                  |
			| description    | form data description    |                  |
			| activeAt       | 2023-02-21T14:48:00.000Z |                  |
			| data           | ./samples/sampleData.csv | text/csv         |
			| tags           | {"type":"metal"}         | application/json |
			| datasetHeaders | ["ZIP", "STATE"]         | application/json |
		When Using axios I POST to /referenceDatasets
		Then response code should be 201
		And response body should contain id
		And response body path $.name should be form data sample
		And response body path $.description should be form data description
		And response body path $.datasetHeaders[?(@ == 'ZIP')] should be ZIP
		And response body path $.datasetHeaders[?(@ == 'STATE')] should be STATE
		And response body path $.tags.type should be metal
		And response body path $.status should be inProgress
		And response body path $.state should be frozen
		And I store the value of body path $.id as form_data_referenceDataset_id in global scope
		And I pause for 5000ms

	Scenario: Contributor can create new referenceDataset with form data
		Given I authenticate using email referenceDatasetsApiTests_contributor@amazon.com and password p@ssword1
		And I set form data to
			| name           | value                    | type             |
			| name           | contr sample             |                  |
			| description    | form data description    |                  |
			| data           | ./samples/sampleData.csv | text/csv         |
			| tags           | {"type":"metal"}         | application/json |
			| datasetHeaders | ["ZIP", "STATE"]         | application/json |
		When Using axios I POST to /referenceDatasets
		Then response code should be 201
		And I store the value of body path $.id as contr_referenceDataset in global scope

	Scenario: Admin can get latest version of a referenceDataset content
		Given I authenticate using email referenceDatasetsApiTests_admin@amazon.com and password p@ssword1
		And I set Accept header to text/csv
		When I GET /referenceDatasets/`form_data_referenceDataset_id`/data
		Then response code should be 200
		And response body should match file ./samples/sampleData.csv

	Scenario: Contributor can get latest version of a referenceDataset content
		Given I authenticate using email referenceDatasetsApiTests_contributor@amazon.com and password p@ssword1
		And I set Accept header to text/csv
		When I GET /referenceDatasets/`form_data_referenceDataset_id`/data
		Then response code should be 200
		And response body should match file ./samples/sampleData.csv

	Scenario: Reader can get latest version of a referenceDataset content
		Given I authenticate using email referenceDatasetsApiTests_reader@amazon.com and password p@ssword1
		And I set Accept header to text/csv
		When I GET /referenceDatasets/`form_data_referenceDataset_id`/data
		Then response code should be 200
		And response body should match file ./samples/sampleData.csv

	Scenario: Admin can get latest version of a referenceDataset content as signed url
		Given I authenticate using email referenceDatasetsApiTests_admin@amazon.com and password p@ssword1
		When I GET /referenceDatasets/`form_data_referenceDataset_id`/data
		Then response code should be 200
		And response body should contain url
		And I store the value of body path $.url as admin_form_data_referenceDataset_data_url in global scope
		And content of signed url `admin_form_data_referenceDataset_data_url` should match file ./samples/sampleData.csv

	Scenario: Contributor can get latest version of a referenceDataset content as signed url
		Given I authenticate using email referenceDatasetsApiTests_contributor@amazon.com and password p@ssword1
		When I GET /referenceDatasets/`form_data_referenceDataset_id`/data
		Then response code should be 200
		And response body should contain url
		And I store the value of body path $.url as contributor_form_data_referenceDataset_data_url in global scope
		And content of signed url `contributor_form_data_referenceDataset_data_url` should match file ./samples/sampleData.csv

	Scenario: Reader can get latest version of a referenceDataset content as signed url
		Given I authenticate using email referenceDatasetsApiTests_reader@amazon.com and password p@ssword1
		When I GET /referenceDatasets/`form_data_referenceDataset_id`/data
		Then response code should be 200
		And response body should contain url
		And I store the value of body path $.url as reader_form_data_referenceDataset_data_url in global scope
		And content of signed url `reader_form_data_referenceDataset_data_url` should match file ./samples/sampleData.csv

	Scenario: Admin can update new referenceDataset with form data
		Given I authenticate using email referenceDatasetsApiTests_admin@amazon.com and password p@ssword1
		And I set form data to
			| name           | value                           | type             |
			| description    | form data description updated   |                  |
			| data           | ./samples/sampleDataUpdated.csv | text/csv         |
			| datasetHeaders | ["STATE", "ZIP"]                | application/json |
			| activeAt       | 2023-02-21T15:48:00.000Z        |                  |
		When Using axios I PATCH /referenceDatasets/`form_data_referenceDataset_id`
		Then response code should be 200
		And response body should contain id
		And response body path $.name should be form data sample
		And response body path $.description should be form data description updated
		And response body path $.datasetHeaders[?(@ == 'ZIP')] should be ZIP
		And response body path $.datasetHeaders[?(@ == 'STATE')] should be STATE
		And response body path $.state should be frozen
		And response body path $.status should be inProgress

	Scenario: Admin can get latest version of a referenceDataset content
		Given I authenticate using email referenceDatasetsApiTests_admin@amazon.com and password p@ssword1
		And I set Accept header to text/csv
		When I GET /referenceDatasets/`form_data_referenceDataset_id`/data
		Then response code should be 200
		And response body should match file ./samples/sampleDataUpdated.csv

	Scenario: Reader can get latest version of a referenceDataset content
		Given I authenticate using email referenceDatasetsApiTests_reader@amazon.com and password p@ssword1
		And I set Accept header to text/csv
		When I GET /referenceDatasets/`form_data_referenceDataset_id`/data
		Then response code should be 200
		And response body should match file ./samples/sampleDataUpdated.csv

	Scenario: Admin can get latest version of a referenceDataset content as signed url
		Given I authenticate using email referenceDatasetsApiTests_admin@amazon.com and password p@ssword1
		When I GET /referenceDatasets/`form_data_referenceDataset_id`/data
		Then response code should be 200
		And response body should contain url
		And I store the value of body path $.url as admin_form_data_referenceDataset_data_url in global scope
		And content of signed url `admin_form_data_referenceDataset_data_url` should match file ./samples/sampleDataUpdated.csv

	Scenario: Should be able to list activity versions based on activation date
		Given I authenticate using email referenceDatasetsApiTests_admin@amazon.com and password p@ssword1
		# should throw error if both versionAsAt and count/fromVersion are specified
		When I GET /referenceDatasets/`form_data_referenceDataset_id`/versions?versionAsAt=2023-02-21T14:48:00.000Z&count=2
		Then response code should be 400
		And response body path $.message should be request can only contain versionAsAt or count/fromVersion query parameter, but not both
		When I GET /referenceDatasets/`form_data_referenceDataset_id`/versions?versionAsAt=2023-02-21T14:48:00.000Z
		Then response code should be 200
		And response body path $.referenceDatasets should be of type array with length 1
		And response body path $.referenceDatasets[0].groups[0] should be /referencedatasetsapitests
		And response body path $.referenceDatasets[0].name should be form data sample
		And response body path $.referenceDatasets[0].version should be 1
		When I GET /referenceDatasets/`form_data_referenceDataset_id`/versions?versionAsAt=2023-02-21T15:48:00.000Z
		Then response code should be 200
		And response body path $.referenceDatasets should be of type array with length 1
		And response body path $.referenceDatasets[0].groups[0] should be /referencedatasetsapitests
		And response body path $.referenceDatasets[0].name should be form data sample
		And response body path $.referenceDatasets[0].version should be 2

	Scenario: Admin cannot update if the headers dont match with the existing file (no datasource or inline data provided)
		Given I authenticate using email referenceDatasetsApiTests_admin@amazon.com and password p@ssword1
		And I set form data to
			| name           | value                         | type             |
			| description    | form data description updated |                  |
			| datasetHeaders | ["COUNTRY_CODE", "ZIP"]       | application/json |
		When Using axios I PATCH /referenceDatasets/`form_data_referenceDataset_id`
		Then response code should be 400

	Scenario: Admin can create new referenceDataset
		Given I authenticate using email referenceDatasetsApiTests_admin@amazon.com and password p@ssword1
		And I set body to {"name":"sample_dataset","description":"this dataset contains unit mappings","data":"Type,Multiplier","datasetHeaders":["Type","Multiplier"],"tags":{"datasource":"GHG Protocol","type":"Material/Metal/Steel"}}
		When I POST to /referenceDatasets
		Then response code should be 201
		And response body should contain id
		And response body path $.name should be sample_dataset
		And response body path $.version should be 1
		And response body path $.description should be this dataset contains unit mappings
		And response body path $.datasetHeaders[0] should be Type
		And response body path $.datasetHeaders[1] should be Multiplier
		And response body path $.tags.datasource should be GHG Protocol
		And response body path $.tags.type should be Material/Metal/Steel
		And response body path $.createdBy should be referencedatasetsapitests_admin@amazon.com
		And response body path $.status should be inProgress
		And response body path $.state should be frozen
		And response body should contain createdAt
		And I store the value of body path $.id as custom_add_referenceDataset_id in global scope
		And I store the value of body path $.createdAt as custom_add_referenceDataset_createdAt in global scope
		And I pause for 3000ms

	Scenario: Reader cannot create new referenceDataset
		Given I authenticate using email referenceDatasetsApiTests_reader@amazon.com and password p@ssword1
		And I set body to {"name":"sample_dataset","description":"this dataset contains unit mappings","data":"Type,Multiplier","datasetHeaders":["Type","Multiplier"],"groups":["/usa/northwest"],"tags":{"division":"purchasing","type":"material/metal/steel"}}
		When I POST to /referenceDatasets
		Then response code should be 403

	Scenario: Admin can create a new version of a referenceDataset
		Given I authenticate using email referenceDatasetsApiTests_admin@amazon.com and password p@ssword1
		And I set body to {"description":"this data set is now updated"}
		When I PATCH /referenceDatasets/`custom_add_referenceDataset_id`
		Then response code should be 200
		And response body should contain id
		And response body path $.name should be sample_dataset
		And response body path $.version should be 2
		And response body path $.description should be this data set is now updated
		And response body path $.datasetHeaders[0] should be Type
		And response body path $.datasetHeaders[1] should be Multiplier
		And response body path $.tags.datasource should be GHG Protocol
		And response body path $.tags.type should be Material/Metal/Steel
		And response body should contain createdAt
		And response body path $.createdBy should be referencedatasetsapitests_admin@amazon.com
		And response body path $.updatedBy should be referencedatasetsapitests_admin@amazon.com
		And I store the value of body path $.id as custom_add_referenceDataset_id in global scope
		And response body should contain updatedAt
		And I store the value of body path $.updatedAt as custom_add_referenceDataset_updatedAt in global scope

	Scenario: Admin can list all versions of a referenceDataset
		Given I authenticate using email referenceDatasetsApiTests_admin@amazon.com and password p@ssword1
		When I GET /referenceDatasets/`custom_add_referenceDataset_id`/versions
		Then response code should be 200
		And response body path $.referenceDatasets.length should be 2
		And response body path $.referenceDatasets[?(@.version==1)].id should be `custom_add_referenceDataset_id`
		And response body path $.referenceDatasets[?(@.version==1)].description should be this dataset contains unit mappings
		And response body path $.referenceDatasets[?(@.version==1)].createdAt should be `custom_add_referenceDataset_createdAt`
		And response body path $.referenceDatasets[?(@.version==1)].status should be success
		And response body path $.referenceDatasets[?(@.version==1)].state should be enabled
		And response body path $.referenceDatasets[?(@.version==2)].id should be `custom_add_referenceDataset_id`
		And response body path $.referenceDatasets[?(@.version==2)].description should be this data set is now updated
		And response body path $.referenceDatasets[?(@.version==2)].updatedAt should be `custom_add_referenceDataset_updatedAt`

	Scenario: Contributor can list all versions of a referenceDataset
		Given I authenticate using email referenceDatasetsApiTests_contributor@amazon.com and password p@ssword1
		When I GET /referenceDatasets/`custom_add_referenceDataset_id`/versions
		Then response code should be 200
		And response body path $.referenceDatasets.length should be 2

	Scenario: Reader can list all versions of a referenceDataset
		Given I authenticate using email referenceDatasetsApiTests_reader@amazon.com and password p@ssword1
		When I GET /referenceDatasets/`custom_add_referenceDataset_id`/versions
		Then response code should be 200
		And response body path $.referenceDatasets.length should be 2

	Scenario: Admin can get latest version of a referenceDataset
		Given I authenticate using email referenceDatasetsApiTests_admin@amazon.com and password p@ssword1
		When I GET /referenceDatasets/`custom_add_referenceDataset_id`
		Then response code should be 200
		And response body path $.id should be `custom_add_referenceDataset_id`
		And response body path $.name should be sample_dataset
		And response body path $.version should be 2
		And response body path $.description should be this data set is now updated
		And response body path $.datasetHeaders[0] should be Type
		And response body path $.datasetHeaders[1] should be Multiplier
		And response body path $.tags.datasource should be GHG Protocol
		And response body path $.tags.type should be Material/Metal/Steel
		And response body should contain createdAt
		And response body path $.createdBy should be referencedatasetsapitests_admin@amazon.com
		And response body should contain updatedAt
		And response body path $.updatedBy should be referencedatasetsapitests_admin@amazon.com

	Scenario: Contributor can get latest version of a referenceDataset
		Given I authenticate using email referenceDatasetsApiTests_contributor@amazon.com and password p@ssword1
		When I GET /referenceDatasets/`custom_add_referenceDataset_id`
		Then response code should be 200
		And response body path $.id should be `custom_add_referenceDataset_id`
		And response body path $.name should be sample_dataset
		And response body path $.version should be 2
		And response body path $.description should be this data set is now updated
		And response body path $.datasetHeaders[0] should be Type
		And response body path $.datasetHeaders[1] should be Multiplier
		And response body path $.tags.datasource should be GHG Protocol
		And response body path $.tags.type should be Material/Metal/Steel
		And response body should contain createdAt
		And response body path $.createdBy should be referencedatasetsapitests_admin@amazon.com
		And response body should contain updatedAt
		And response body path $.updatedBy should be referencedatasetsapitests_admin@amazon.com

	Scenario: Reader can get latest version of a referenceDataset
		Given I authenticate using email referenceDatasetsApiTests_reader@amazon.com and password p@ssword1
		When I GET /referenceDatasets/`custom_add_referenceDataset_id`
		Then response code should be 200
		And response body path $.id should be `custom_add_referenceDataset_id`
		And response body path $.name should be sample_dataset
		And response body path $.version should be 2
		And response body path $.description should be this data set is now updated
		And response body path $.datasetHeaders[0] should be Type
		And response body path $.datasetHeaders[1] should be Multiplier
		And response body path $.tags.datasource should be GHG Protocol
		And response body path $.tags.type should be Material/Metal/Steel
		And response body should contain createdAt
		And response body path $.createdBy should be referencedatasetsapitests_admin@amazon.com
		And response body should contain updatedAt
		And response body path $.updatedBy should be referencedatasetsapitests_admin@amazon.com

	Scenario: Admin can get specific version of a referenceDataset
		Given I authenticate using email referenceDatasetsApiTests_admin@amazon.com and password p@ssword1
		When I GET /referenceDatasets/`custom_add_referenceDataset_id`/versions/1
		Then response code should be 200
		And response body path $.id should be `custom_add_referenceDataset_id`
		And response body path $.name should be sample_dataset
		And response body path $.version should be 1
		And response body path $.description should be this dataset contains unit mappings
		And response body path $.datasetHeaders[0] should be Type
		And response body path $.datasetHeaders[1] should be Multiplier
		And response body path $.tags.datasource should be GHG Protocol
		And response body path $.tags.type should be Material/Metal/Steel
		And response body path $.createdBy should be referencedatasetsapitests_admin@amazon.com
		And response body path $.createdAt should be `custom_add_referenceDataset_createdAt`
		And response body path $.status should be success
		And response body path $.state should be enabled

	Scenario: Contributor can get specific version of a referenceDataset
		Given I authenticate using email referenceDatasetsApiTests_contributor@amazon.com and password p@ssword1
		When I GET /referenceDatasets/`custom_add_referenceDataset_id`/versions/1
		Then response code should be 200
		And response body path $.id should be `custom_add_referenceDataset_id`
		And response body path $.name should be sample_dataset
		And response body path $.version should be 1
		And response body path $.description should be this dataset contains unit mappings
		And response body path $.datasetHeaders[0] should be Type
		And response body path $.datasetHeaders[1] should be Multiplier
		And response body path $.tags.datasource should be GHG Protocol
		And response body path $.tags.type should be Material/Metal/Steel
		And response body path $.createdBy should be referencedatasetsapitests_admin@amazon.com
		And response body path $.createdAt should be `custom_add_referenceDataset_createdAt`
		And response body path $.status should be success
		And response body path $.state should be enabled

	Scenario: Reader can get specific version of a referenceDataset
		Given I authenticate using email referenceDatasetsApiTests_reader@amazon.com and password p@ssword1
		When I GET /referenceDatasets/`custom_add_referenceDataset_id`/versions/1
		Then response code should be 200
		And response body path $.id should be `custom_add_referenceDataset_id`
		And response body path $.name should be sample_dataset
		And response body path $.version should be 1
		And response body path $.description should be this dataset contains unit mappings
		And response body path $.datasetHeaders[0] should be Type
		And response body path $.datasetHeaders[1] should be Multiplier
		And response body path $.tags.datasource should be GHG Protocol
		And response body path $.tags.type should be Material/Metal/Steel
		And response body path $.createdBy should be referencedatasetsapitests_admin@amazon.com
		And response body path $.createdAt should be `custom_add_referenceDataset_createdAt`
		And response body path $.status should be success
		And response body path $.state should be enabled


	Scenario: Setup: Admin can create another referenceDataset (to help test list api)
		Given I authenticate using email referenceDatasetsApiTests_admin@amazon.com and password p@ssword1
		And I set body to {"name":"other_dataset","description":"another data set","data":"newHeader1,newHeader2","datasetHeaders":["newHeader1","newHeader2"]}
		When I POST to /referenceDatasets
		Then response code should be 201
		And response body should contain id
		And response body path $.version should be 1
		And response body path $.name should be other_dataset
		And response body path $.description should be another data set
		And response body path $.datasetHeaders[0] should be newHeader1
		And response body path $.datasetHeaders[1] should be newHeader2
		And I store the value of body path $.id as another_referenceDataset_id in global scope

	Scenario: Admin can find referenceDataset by name
		Given I authenticate using email referenceDatasetsApiTests_admin@amazon.com and password p@ssword1
		When I GET /referenceDatasets?name=sample_dataset
		Then response code should be 200
		And response body path $.referenceDatasets.length should be 1
		And response body path $.referenceDatasets[?(@.version==2)].id should be `custom_add_referenceDataset_id`
		And response body path $.referenceDatasets[?(@.version==2)].name should be sample_dataset
		And response body path $.referenceDatasets[?(@.version==2)].description should be this data set is now updated
		And response body path $.referenceDatasets[?(@.version==2)].datasetHeaders[0] should be Type
		And response body path $.referenceDatasets[?(@.version==2)].datasetHeaders[1] should be Multiplier
		And response body path $.referenceDatasets[?(@.version==2)].tags.datasource should be GHG Protocol
		And response body path $.referenceDatasets[?(@.version==2)].tags.type should be Material/Metal/Steel
		And response body path $.referenceDatasets[?(@.version==2)].createdBy should be referencedatasetsapitests_admin@amazon.com
		And response body path $.referenceDatasets[?(@.version==2)].updatedBy should be referencedatasetsapitests_admin@amazon.com

	Scenario: Contributor can find referenceDataset by name
		Given I authenticate using email referenceDatasetsApiTests_contributor@amazon.com and password p@ssword1
		When I GET /referenceDatasets?name=sample_dataset
		Then response code should be 200
		And response body path $.referenceDatasets.length should be 1
		And response body path $.referenceDatasets[?(@.version==2)].id should be `custom_add_referenceDataset_id`
		And response body path $.referenceDatasets[?(@.version==2)].name should be sample_dataset
		And response body path $.referenceDatasets[?(@.version==2)].description should be this data set is now updated
		And response body path $.referenceDatasets[?(@.version==2)].datasetHeaders[0] should be Type
		And response body path $.referenceDatasets[?(@.version==2)].datasetHeaders[1] should be Multiplier
		And response body path $.referenceDatasets[?(@.version==2)].tags.datasource should be GHG Protocol
		And response body path $.referenceDatasets[?(@.version==2)].tags.type should be Material/Metal/Steel
		And response body path $.referenceDatasets[?(@.version==2)].createdBy should be referencedatasetsapitests_admin@amazon.com
		And response body path $.referenceDatasets[?(@.version==2)].updatedBy should be referencedatasetsapitests_admin@amazon.com

	Scenario: Reader can find referenceDataset by name
		Given I authenticate using email referenceDatasetsApiTests_reader@amazon.com and password p@ssword1
		When I GET /referenceDatasets?name=sample_dataset
		Then response code should be 200
		And response body path $.referenceDatasets.length should be 1
		And response body path $.referenceDatasets[?(@.version==2)].id should be `custom_add_referenceDataset_id`
		And response body path $.referenceDatasets[?(@.version==2)].name should be sample_dataset
		And response body path $.referenceDatasets[?(@.version==2)].description should be this data set is now updated
		And response body path $.referenceDatasets[?(@.version==2)].datasetHeaders[0] should be Type
		And response body path $.referenceDatasets[?(@.version==2)].datasetHeaders[1] should be Multiplier
		And response body path $.referenceDatasets[?(@.version==2)].tags.datasource should be GHG Protocol
		And response body path $.referenceDatasets[?(@.version==2)].tags.type should be Material/Metal/Steel
		And response body path $.referenceDatasets[?(@.version==2)].createdBy should be referencedatasetsapitests_admin@amazon.com
		And response body path $.referenceDatasets[?(@.version==2)].updatedBy should be referencedatasetsapitests_admin@amazon.com

	Scenario: Updating state to disabled should override all versions
		Given I authenticate using email referenceDatasetsApiTests_admin@amazon.com and password p@ssword1
		And I set body to {"state": "disabled"}
		When I PATCH /referenceDatasets/`custom_add_referenceDataset_id`
		Then response code should be 200
		When I GET /referenceDatasets/`custom_add_referenceDataset_id`/versions/1
		Then response code should be 200
		And response body path $.state should be disabled
		And response body path $.version should be 1

	Scenario: Updating activity state to frozen should override all versions
		Given I authenticate using email referenceDatasetsApiTests_admin@amazon.com and password p@ssword1
		And I set body to {"state": "frozen"}
		When I PATCH /referenceDatasets/`custom_add_referenceDataset_id`
		Then response code should be 200
		When I GET /referenceDatasets/`custom_add_referenceDataset_id`/versions/1
		Then response code should be 200
		And response body path $.state should be frozen
		And response body path $.version should be 1

	Scenario: Reader cannot delete a referenceDataset
		Given I authenticate using email referenceDatasetsApiTests_reader@amazon.com and password p@ssword1
		When I remove header Content-Type
		And I DELETE /referenceDatasets/`custom_add_referenceDataset_id`
		Then response code should be 403

	Scenario: Contributor cannot delete a referenceDataset
		Given I authenticate using email referenceDatasetsApiTests_contributor@amazon.com and password p@ssword1
		When I remove header Content-Type
		And I DELETE /referenceDatasets/`custom_add_referenceDataset_id`
		Then response code should be 403

	Scenario: Updating activities with extraneous attributes should not persist those attributes
		Given I authenticate using email referenceDatasetsApiTests_admin@amazon.com and password p@ssword1
		And I set form data to
			| name        | value                         | type |
			| description | form data description updated |      |
			| hello       | world                         |      |
		When Using axios I PATCH /referenceDatasets/`form_data_referenceDataset_id`
		Then response code should be 200
		And response body should not contain $.hello

	Scenario: Contributor can update referenceDataset with form data
		Given I authenticate using email referenceDatasetsApiTests_contributor@amazon.com and password p@ssword1
		And I set form data to
			| name           | value                           | type             |
			| description    | form data description updated   |                  |
			| data           | ./samples/sampleDataUpdated.csv | text/csv         |
			| datasetHeaders | ["STATE", "ZIP"]                | application/json |
		When Using axios I PATCH /referenceDatasets/`form_data_referenceDataset_id`
		Then response code should be 200

	Scenario: Admin can create new referenceDataset using s3 as the datasource
		Given I authenticate using email referenceDatasetsApiTests_admin@amazon.com and password p@ssword1
		And I set body to {"name":"sample_dataset_from_s3","description":"this dataset contains unit mappings" , "datasetSource": "s3" ,"datasetHeaders":["Type","Multiplier"],"tags":{"datasource":"GHG Protocol","type":"Material/Metal/Steel"}}
		When I POST to /referenceDatasets
		Then response code should be 201
		And response body should contain id
		And response body path $.name should be sample_dataset_from_s3
		And response body path $.version should be 1
		And response body path $.description should be this dataset contains unit mappings
		And response body path $.datasetHeaders[0] should be Type
		And response body path $.datasetHeaders[1] should be Multiplier
		And response body path $.tags.datasource should be GHG Protocol
		And response body path $.tags.type should be Material/Metal/Steel
		And response body path $.createdBy should be referencedatasetsapitests_admin@amazon.com
		And response body should contain createdAt
		And response body should contain uploadUrl
		And response body path $.status should be pendingUpload
		And response body path $.state should be frozen
		And I store the value of body path $.uploadUrl as s3_referenceDataset_uploadUrl in global scope
		And I store the value of body path $.id as s3_referenceDataset_id in global scope
		And I store the value of body path $.createdAt as s3_referenceDataset_createdAt in global scope

	Scenario: Admin will get NotFound error when retrieving created reference dataset content before its uploaded
		Given I authenticate using email referenceDatasetsApiTests_admin@amazon.com and password p@ssword1
		When I GET /referenceDatasets/`s3_referenceDataset_id`/data
		Then response code should be 404
		And response body path $.message should be File for Reference Dataset `s3_referenceDataset_id` cannot be found
		When I GET /referenceDatasets/`s3_referenceDataset_id`/versions/1/data
		Then response code should be 404
		And response body path $.message should be File for Reference Dataset `s3_referenceDataset_id` cannot be found

	Scenario: Admin can update the reference dataset by uploading the file using the signed url
		Given I authenticate using email referenceDatasetsApiTests_admin@amazon.com and password p@ssword1
		And I upload an input CSV file to url stored at global variable s3_referenceDataset_uploadUrl with rows
			| Type  | Multiplier     |
			| Type1 | Multiplier1    |
			| Type2 | "Multiplier,2" |
		Then I pause for 10000ms
		When I GET /referenceDatasets/`s3_referenceDataset_id`
		Then response code should be 200
		And response body should contain id
		And response body path $.name should be sample_dataset_from_s3
		And response body path $.version should be 1
		And response body path $.description should be this dataset contains unit mappings
		And response body path $.datasetHeaders[0] should be Type
		And response body path $.datasetHeaders[1] should be Multiplier
		And response body path $.tags.datasource should be GHG Protocol
		And response body path $.tags.type should be Material/Metal/Steel
		And response body path $.createdBy should be referencedatasetsapitests_admin@amazon.com
		And response body path $.status should be success
		And response body path $.state should be enabled

	Scenario: Admin can get the content of reference dataset created by signed url
		Given I authenticate using email referenceDatasetsApiTests_admin@amazon.com and password p@ssword1
		When I GET /referenceDatasets/`s3_referenceDataset_id`/data
		Then response code should be 200
		And response body should contain url
		And I store the value of body path $.url as s3_referenceDataset_downloadUrl in global scope
		When I download the output CSV file from the url stored at global variable s3_referenceDataset_downloadUrl it will match rows
			| Type  | Multiplier     |
			| Type1 | Multiplier1    |
			| Type2 | "Multiplier,2" |

	Scenario: Admin can get the dataset indexed zip file of the reference dataset
		Given I authenticate using email referenceDatasetsApiTests_admin@amazon.com and password p@ssword1
		When I GET /referenceDatasets/`s3_referenceDataset_id`/index
		Then response code should be 200
		And response body should contain url

	Scenario: Admin can get the dataset indexed zip file of the reference dataset of a specific version
		Given I authenticate using email referenceDatasetsApiTests_admin@amazon.com and password p@ssword1
		When I GET /referenceDatasets/`s3_referenceDataset_id`/versions/1/index
		Then response code should be 200
		And response body should contain url


	Scenario: Admin can update reference dataset using s3 as datasource
		Given I authenticate using email referenceDatasetsApiTests_admin@amazon.com and password p@ssword1
		And I set body to {"datasetHeaders":["Column1","Column2"], "datasetSource": "s3" }
		When I PATCH /referenceDatasets/`s3_referenceDataset_id`
		Then response code should be 200
		And response body should contain id
		And response body path $.name should be sample_dataset_from_s3
		And response body path $.version should be 2
		And response body path $.description should be this dataset contains unit mappings
		And response body path $.datasetHeaders[0] should be Column1
		And response body path $.datasetHeaders[1] should be Column2
		And response body path $.tags.datasource should be GHG Protocol
		And response body path $.tags.type should be Material/Metal/Steel
		And response body path $.updatedBy should be referencedatasetsapitests_admin@amazon.com
		And response body should contain updatedAt
		And response body should contain uploadUrl
		And response body path $.status should be pendingUpload
		And response body path $.state should be frozen
		And I store the value of body path $.uploadUrl as s3_referenceDataset_patch_uploadUrl in global scope

	Scenario: Admin can update the reference dataset by uploading the file using the signed url
		Given I authenticate using email referenceDatasetsApiTests_admin@amazon.com and password p@ssword1
		And I upload an input CSV file to url stored at global variable s3_referenceDataset_patch_uploadUrl with rows
			| Column1     | Column2     |
			| Column1Row1 | Column2Row2 |
			| Column1Row2 | Column2Row2 |
		Then I pause for 5000ms
		When I GET /referenceDatasets/`s3_referenceDataset_id`
		Then response code should be 200
		And response body should contain id
		And response body path $.name should be sample_dataset_from_s3
		And response body path $.version should be 2
		And response body path $.status should be success
		And response body path $.state should be enabled

	Scenario: Admin can get the content of reference dataset updated by signed url
		Given I authenticate using email referenceDatasetsApiTests_admin@amazon.com and password p@ssword1
		When I GET /referenceDatasets/`s3_referenceDataset_id`/data
		Then response code should be 200
		And response body should contain url
		And I store the value of body path $.url as s3_referenceDataset_patch_downloadUrl in global scope
		When I download the output CSV file from the url stored at global variable s3_referenceDataset_patch_downloadUrl it will match rows
			| Column1     | Column2     |
			| Column1Row1 | Column2Row2 |
			| Column1Row2 | Column2Row2 |

	Scenario: Admin can delete a referenceDataset
		Given I authenticate using email referenceDatasetsApiTests_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		When I DELETE /referenceDatasets/`custom_add_referenceDataset_id`
		Then response code should be 204
		When I GET /referenceDatasets/`custom_add_referenceDataset_id`
		Then response code should be 404

		When I remove header Content-Type
		When I DELETE /referenceDatasets/`form_data_referenceDataset_id`
		Then response code should be 204
		When I GET /referenceDatasets/`form_data_referenceDataset_id`
		Then response code should be 404

		When I DELETE /referenceDatasets/`another_referenceDataset_id`
		Then response code should be 204
		When I GET /referenceDatasets/`another_referenceDataset_id`
		Then response code should be 404

		When I DELETE /referenceDatasets/`s3_referenceDataset_id`
		Then response code should be 204
		When I GET /referenceDatasets/`s3_referenceDataset_id`
		Then response code should be 404

		When I DELETE /referenceDatasets/`contr_referenceDataset`
		Then response code should be 204
		When I GET /referenceDatasets/`contr_referenceDataset`
		Then response code should be 404

	Scenario: Teardown: delete users and group
		Given group /referenceDatasetsApiTests has user referenceDatasetsApiTests_admin@amazon.com revoked
		And group /referenceDatasetsApiTests has user referenceDatasetsApiTests_contributor@amazon.com revoked
		And group /referenceDatasetsApiTests has user referenceDatasetsApiTests_reader@amazon.com revoked
		And group /referenceDatasetsApiTests has been removed

