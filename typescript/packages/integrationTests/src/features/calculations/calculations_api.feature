@setup_calculations @calculations
Feature:
	This feature tests the general usage of the api within the context of a single group.

	Scenario: Setup users
		Given group /calculationsApiTests exists
		And group /calculationsApiTests has user calculationsApiTests_admin@amazon.com with role admin and password p@ssword1
		And group /calculationsApiTests has user calculationsApiTests_contributor@amazon.com with role contributor and password p@ssword1
		And group /calculationsApiTests has user calculationsApiTests_reader@amazon.com with role reader and password p@ssword1

	Scenario: Admin can create new calculation
		Given I authenticate using email calculationsApiTests_admin@amazon.com and password p@ssword1
		And I set body to {"name":"custom_add", "activeAt" : "2023-02-21T14:48:00.000Z", "summary":"Adds 2 numbers.","formula":":left+:right","parameters":[{"index":0,"key":"left","label":"left","description":"left side of operand","type":"number"},{"index":1,"key":"right","label":"right","description":"right side of operand","type":"number"}],"outputs":[{"name":"sum","description":"The total.","type":"number"}],"tags":{"datasource":"GHG Protocol","type":"Material/Metal/Steel"}}
		When I POST to /calculations
		Then response code should be 201
		And response body should contain id
		And response body path $.name should be custom_add
		And response body path $.version should be 1
		And response body path $.summary should be Adds 2 numbers
		And response body path $.formula should be :left\+:right
		And response body path $.activeAt should be 2023-02-21T14:48:00.000Z
		And response body path $.parameters.length should be 2
		And response body path $.parameters[?(@.index==0)].key should be left
		And response body path $.parameters[?(@.index==0)].label should be left
		And response body path $.parameters[?(@.index==0)].description should be left side of operand
		And response body path $.parameters[?(@.index==0)].type should be number
		And response body path $.parameters[?(@.index==1)].key should be right
		And response body path $.parameters[?(@.index==1)].label should be right
		And response body path $.parameters[?(@.index==1)].description should be right side of operand
		And response body path $.parameters[?(@.index==1)].type should be number
		And response body path $.outputs.length should be 1
		And response body path $.outputs[?(@.name=='sum')].description should be The total.
		And response body path $.outputs[?(@.name=='sum')].type should be number
		And response body path $.tags.datasource should be GHG Protocol
		And response body path $.tags.type should be Material/Metal/Steel
		And response body path $.createdBy should be calculationsapitests_admin@amazon.com
		And response body should contain createdAt
		And response body should contain activeAt
		And I store the value of body path $.id as custom_add_calculation_id in global scope
		And I store the value of body path $.createdAt as custom_add_calculation_createdAt in global scope

	Scenario: Admin can dry run a calculation before updating
		Given I authenticate using email calculationsApiTests_admin@amazon.com and password p@ssword1
		And I set body to { "dryRunOptions": { "data": [{"left": "10", "right": "10"}] } }
		When I PATCH /calculations/`custom_add_calculation_id`?dryRun=true
		Then response code should be 200
		And response body should contain headers
		And response body should contain data
		And response body path $.headers[0] should be sum
		And response body path $.data[0] should be 20

	Scenario: Should throw error when activeAt is not set to the right date time format
		Given I authenticate using email calculationsApiTests_admin@amazon.com and password p@ssword1
		And I set body to {"name":"custom_add", "activeAt" : "invalidDate", "summary":"Adds 2 numbers.","formula":":left+:right","parameters":[{"index":0,"key":"left","label":"left","description":"left side of operand","type":"number"},{"index":1,"key":"right","label":"right","description":"right side of operand","type":"number"}],"outputs":[{"name":"sum","description":"The total.","type":"number"}],"tags":{"datasource":"GHG Protocol","type":"Material/Metal/Steel"}}
		When I POST to /calculations
		Then response code should be 400
		And response body path $.message should be body/activeAt must match format "date-time"

	Scenario: Contributor can create new calculation
		Given I authenticate using email calculationsApiTests_contributor@amazon.com and password p@ssword1
		And I set body to {"name":"allowed_1","summary":"Adds 2 numbers.","formula":":left+:right","parameters":[{"index":0,"key":"left","label":"left","description":"left side of operand","type":"number"},{"index":1,"key":"right","label":"right","description":"right side of operand","type":"number"}],"outputs":[{"name":"sum","description":"The total.","type":"number"}]}
		When I POST to /calculations
		Then response code should be 201
		And I store the value of body path $.id as contr_calculation in global scope

	Scenario: Reader cannot create new calculation
		Given I authenticate using email calculationsApiTests_reader@amazon.com and password p@ssword1
		And I set body to {"name":"not_allowed_22","summary":"Adds 2 numbers.","formula":":left+:right","parameters":[{"index":0,"key":"left","label":"left","description":"left side of operand","type":"number"},{"index":1,"key":"right","label":"right","description":"right side of operand","type":"number"}],"outputs":[{"name":"sum","description":"The total.","type":"number"}]}
		When I POST to /calculations
		Then response code should be 403

	Scenario: Admin can create a new version of a calculation
		Given I authenticate using email calculationsApiTests_admin@amazon.com and password p@ssword1
		And I set body to {"summary":"Adds 3 numbers.","activeAt" : "2023-02-21T15:48:00.000Z","formula":":left+:right+:another","parameters":[{"index":0,"key":"left","label":"left","description":"left side of operand","type":"number"},{"index":1,"key":"right","label":"right","description":"right side of operand","type":"number"},{"index":2,"key":"another","label":"another","description":"another number","type":"number"}],"outputs":[{"name":"sum","description":"The total.","type":"number"}]}
		When I PATCH /calculations/`custom_add_calculation_id`
		Then response code should be 200
		And response body should contain id
		And response body path $.name should be custom_add
		And response body path $.version should be 2
		And response body path $.summary should be Adds 3 numbers
		And response body path $.formula should be :left\+:right\+:another
		And response body path $.activeAt should be 2023-02-21T15:48:00.000Z
		And response body path $.parameters.length should be 3
		And response body path $.parameters[?(@.index==0)].key should be left
		And response body path $.parameters[?(@.index==0)].label should be left
		And response body path $.parameters[?(@.index==0)].description should be left side of operand
		And response body path $.parameters[?(@.index==0)].type should be number
		And response body path $.parameters[?(@.index==1)].key should be right
		And response body path $.parameters[?(@.index==1)].label should be right
		And response body path $.parameters[?(@.index==1)].description should be right side of operand
		And response body path $.parameters[?(@.index==1)].type should be number
		And response body path $.parameters[?(@.index==2)].key should be another
		And response body path $.parameters[?(@.index==2)].label should be another
		And response body path $.parameters[?(@.index==2)].description should be another number
		And response body path $.parameters[?(@.index==2)].type should be number
		And response body path $.outputs.length should be 1
		And response body path $.outputs[?(@.name=='sum')].description should be The total.
		And response body path $.outputs[?(@.name=='sum')].type should be number
		And response body path $.createdBy should be calculationsapitests_admin@amazon.com
		And response body path $.createdAt should be `custom_add_calculation_createdAt`
		And response body path $.updatedBy should be calculationsapitests_admin@amazon.com
		And response body should contain updatedAt
		And response body should contain activeAt
		And I store the value of body path $.updatedAt as custom_add_calculation_updatedAt in global scope

	Scenario: Admin can list all versions of a calculation
		Given I authenticate using email calculationsApiTests_admin@amazon.com and password p@ssword1
		When I GET /calculations/`custom_add_calculation_id`/versions
		Then response code should be 200
		And response body path $.calculations.length should be 2
		# check version 1 payload
		And response body path $.calculations[?(@.version==1)].id should be `custom_add_calculation_id`
		And response body path $.calculations[?(@.version==1)].name should be custom_add
		And response body path $.calculations[?(@.version==1)].summary should be Adds 2 numbers
		And response body path $.calculations[?(@.version==1)].formula should be :left\+:right
		And response body path $.calculations[?(@.version==1)].parameters.length should be 2
		And response body path $.calculations[?(@.version==1)].parameters[?(@.index==0)].key should be left
		And response body path $.calculations[?(@.version==1)].parameters[?(@.index==0)].label should be left
		And response body path $.calculations[?(@.version==1)].parameters[?(@.index==0)].description should be left side of operand
		And response body path $.calculations[?(@.version==1)].parameters[?(@.index==0)].type should be number
		And response body path $.calculations[?(@.version==1)].parameters[?(@.index==1)].key should be right
		And response body path $.calculations[?(@.version==1)].parameters[?(@.index==1)].label should be right
		And response body path $.calculations[?(@.version==1)].parameters[?(@.index==1)].description should be right side of operand
		And response body path $.calculations[?(@.version==1)].parameters[?(@.index==1)].type should be number
		And response body path $.calculations[?(@.version==1)].outputs.length should be 1
		And response body path $.calculations[?(@.version==1)].outputs[?(@.name=='sum')].description should be The total.
		And response body path $.calculations[?(@.version==1)].outputs[?(@.name=='sum')].type should be number
		And response body path $.calculations[?(@.version==1)].createdBy should be calculationsapitests_admin@amazon.com
		And response body path $.calculations[?(@.version==1)].createdAt should be `custom_add_calculation_createdAt`
		# check version 2 payload
		And response body path $.calculations[?(@.version==2)].id should be `custom_add_calculation_id`
		And response body path $.calculations[?(@.version==2)].name should be custom_add
		And response body path $.calculations[?(@.version==2)].summary should be Adds 3 numbers
		And response body path $.calculations[?(@.version==2)].formula should be :left\+:right\+:another
		And response body path $.calculations[?(@.version==2)].parameters.length should be 3
		And response body path $.calculations[?(@.version==2)].parameters[?(@.index==0)].key should be left
		And response body path $.calculations[?(@.version==2)].parameters[?(@.index==0)].label should be left
		And response body path $.calculations[?(@.version==2)].parameters[?(@.index==0)].description should be left side of operand
		And response body path $.calculations[?(@.version==2)].parameters[?(@.index==0)].type should be number
		And response body path $.calculations[?(@.version==2)].parameters[?(@.index==1)].key should be right
		And response body path $.calculations[?(@.version==2)].parameters[?(@.index==1)].label should be right
		And response body path $.calculations[?(@.version==2)].parameters[?(@.index==1)].description should be right side of operand
		And response body path $.calculations[?(@.version==2)].parameters[?(@.index==1)].type should be number
		And response body path $.calculations[?(@.version==2)].parameters[?(@.index==2)].key should be another
		And response body path $.calculations[?(@.version==2)].parameters[?(@.index==2)].label should be another
		And response body path $.calculations[?(@.version==2)].parameters[?(@.index==2)].description should be another number
		And response body path $.calculations[?(@.version==2)].parameters[?(@.index==2)].type should be number
		And response body path $.calculations[?(@.version==2)].outputs.length should be 1
		And response body path $.calculations[?(@.version==2)].outputs[?(@.name=='sum')].description should be The total.
		And response body path $.calculations[?(@.version==2)].outputs[?(@.name=='sum')].type should be number
		And response body path $.calculations[?(@.version==2)].createdBy should be calculationsapitests_admin@amazon.com
		And response body path $.calculations[?(@.version==2)].createdAt should be `custom_add_calculation_createdAt`
		And response body path $.calculations[?(@.version==2)].updatedBy should be calculationsapitests_admin@amazon.com
		And response body path $.calculations[?(@.version==2)].updatedAt should be `custom_add_calculation_updatedAt`

	Scenario: Contributor can list all versions of a calculation
		Given I authenticate using email calculationsApiTests_contributor@amazon.com and password p@ssword1
		When I GET /calculations/`custom_add_calculation_id`/versions
		Then response code should be 200
		And response body path $.calculations.length should be 2

	Scenario: Reader can list all versions of a calculation
		Given I authenticate using email calculationsApiTests_reader@amazon.com and password p@ssword1
		When I GET /calculations/`custom_add_calculation_id`/versions
		Then response code should be 200
		And response body path $.calculations.length should be 2

	Scenario: Admin can get latest version of a calculation
		Given I authenticate using email calculationsApiTests_admin@amazon.com and password p@ssword1
		When I GET /calculations/`custom_add_calculation_id`
		Then response code should be 200
		And response body path $.id should be `custom_add_calculation_id`
		And response body path $.name should be custom_add
		And response body path $.version should be 2
		And response body path $.summary should be Adds 3 numbers
		And response body path $.formula should be :left\+:right\+:another
		And response body path $.parameters.length should be 3
		And response body path $.parameters[?(@.index==0)].key should be left
		And response body path $.parameters[?(@.index==0)].label should be left
		And response body path $.parameters[?(@.index==0)].description should be left side of operand
		And response body path $.parameters[?(@.index==0)].type should be number
		And response body path $.parameters[?(@.index==1)].key should be right
		And response body path $.parameters[?(@.index==1)].label should be right
		And response body path $.parameters[?(@.index==1)].description should be right side of operand
		And response body path $.parameters[?(@.index==1)].type should be number
		And response body path $.parameters[?(@.index==2)].key should be another
		And response body path $.parameters[?(@.index==2)].label should be another
		And response body path $.parameters[?(@.index==2)].description should be another number
		And response body path $.parameters[?(@.index==2)].type should be number
		And response body path $.outputs.length should be 1
		And response body path $.outputs[?(@.name=='sum')].description should be The total.
		And response body path $.outputs[?(@.name=='sum')].type should be number
		And response body path $.createdBy should be calculationsapitests_admin@amazon.com
		And response body path $.createdAt should be `custom_add_calculation_createdAt`
		And response body path $.updatedBy should be calculationsapitests_admin@amazon.com
		And response body path $.updatedAt should be `custom_add_calculation_updatedAt`

	Scenario: Contributor can get latest version of a calculation
		Given I authenticate using email calculationsApiTests_contributor@amazon.com and password p@ssword1
		When I GET /calculations/`custom_add_calculation_id`
		Then response code should be 200
		And response body path $.id should be `custom_add_calculation_id`
		And response body path $.name should be custom_add
		And response body path $.version should be 2

	Scenario: Reader can get latest version of a calculation
		Given I authenticate using email calculationsApiTests_reader@amazon.com and password p@ssword1
		When I GET /calculations/`custom_add_calculation_id`
		Then response code should be 200
		And response body path $.id should be `custom_add_calculation_id`
		And response body path $.name should be custom_add
		And response body path $.version should be 2

	Scenario: Admin can get specific version of a calculation
		Given I authenticate using email calculationsApiTests_admin@amazon.com and password p@ssword1
		When I GET /calculations/`custom_add_calculation_id`/versions/1
		Then response code should be 200
		And response body path $.id should be `custom_add_calculation_id`
		And response body path $.name should be custom_add
		And response body path $.version should be 1
		And response body path $.summary should be Adds 2 numbers
		And response body path $.formula should be :left\+:right
		And response body path $.parameters.length should be 2
		And response body path $.parameters[?(@.index==0)].key should be left
		And response body path $.parameters[?(@.index==0)].label should be left
		And response body path $.parameters[?(@.index==0)].description should be left side of operand
		And response body path $.parameters[?(@.index==0)].type should be number
		And response body path $.parameters[?(@.index==1)].key should be right
		And response body path $.parameters[?(@.index==1)].label should be right
		And response body path $.parameters[?(@.index==1)].description should be right side of operand
		And response body path $.parameters[?(@.index==1)].type should be number
		And response body path $.outputs.length should be 1
		And response body path $.outputs[?(@.name=='sum')].description should be The total.
		And response body path $.outputs[?(@.name=='sum')].type should be number
		And response body path $.createdBy should be calculationsapitests_admin@amazon.com
		And response body path $.createdAt should be `custom_add_calculation_createdAt`

	Scenario: Should be able to list calculations versions based on activation date
		Given I authenticate using email calculationsApiTests_admin@amazon.com and password p@ssword1
		# should throw error if both versionAsAt and count/fromVersion are specified
		When I GET /calculations/`custom_add_calculation_id`/versions?versionAsAt=2023-02-21T15:48:00.000Z&count=1
		Then response code should be 400
		And response body path $.message should be request can only contain versionAsAt or count/fromVersion query parameter, but not both
		When I GET /calculations/`custom_add_calculation_id`/versions?versionAsAt=2023-02-21T15:48:00.000Z
		Then response code should be 200
		And response body path $.calculations.length should be 1
		And response body path $.calculations[0].id should be `custom_add_calculation_id`
		And response body path $.calculations[0].version should be 2
		And response body path $.calculations[0].activeAt should be 2023-02-21T15:48:00.000Z
		When I GET /calculations/`custom_add_calculation_id`/versions?versionAsAt=2023-02-21T14:48:00.000Z
		Then response code should be 200
		And response body path $.calculations.length should be 1
		And response body path $.calculations[0].id should be `custom_add_calculation_id`
		And response body path $.calculations[0].version should be 1
		And response body path $.calculations[0].activeAt should be 2023-02-21T14:48:00.000Z

	Scenario: Contributor can get specific version of a calculation
		Given I authenticate using email calculationsApiTests_contributor@amazon.com and password p@ssword1
		When I GET /calculations/`custom_add_calculation_id`/versions/1
		Then response code should be 200
		And response body path $.id should be `custom_add_calculation_id`
		And response body path $.name should be custom_add
		And response body path $.version should be 1

	Scenario: Reader can get specific version of a calculation
		Given I authenticate using email calculationsApiTests_reader@amazon.com and password p@ssword1
		When I GET /calculations/`custom_add_calculation_id`/versions/1
		Then response code should be 200
		And response body path $.id should be `custom_add_calculation_id`
		And response body path $.name should be custom_add
		And response body path $.version should be 1

	Scenario: Setup: Admin can create another calculation (to help test list api)
		Given I authenticate using email calculationsApiTests_admin@amazon.com and password p@ssword1
		And I set body to {"formula":":input","name":"another_calculation","outputs":[{"description":"Just an attribute","name":"attribute","type":"string"}],"parameters":[{"description":"input","index":0,"key":"input","label":"input","type":"string"}],"summary":"Another calculation."}
		When I POST to /calculations
		Then response code should be 201
		And response body should contain id
		And response body path $.name should be another_calculation
		And response body path $.version should be 1
		And response body path $.summary should be Another calculation.
		And response body path $.formula should be :input
		And response body path $.parameters.length should be 1
		And response body path $.parameters[?(@.index==0)].key should be input
		And response body path $.parameters[?(@.index==0)].label should be input
		And response body path $.parameters[?(@.index==0)].description should be input
		And response body path $.parameters[?(@.index==0)].type should be string
		And response body path $.outputs.length should be 1
		And response body path $.outputs[?(@.name=='attribute')].description should be Just an attribute
		And response body path $.outputs[?(@.name=='attribute')].type should be string
		And response body path $.createdBy should be calculationsapitests_admin@amazon.com
		And response body should contain createdAt
		And I store the value of body path $.id as another_calculation_calculation_id in global scope

	Scenario: Admin can find calculation by name
		Given I authenticate using email calculationsApiTests_admin@amazon.com and password p@ssword1
		When I GET /calculations?name=custom_add
		Then response code should be 200
		And response body path $.calculations.length should be 1
		And response body path $.calculations[?(@.version==2)].id should be `custom_add_calculation_id`
		And response body path $.calculations[?(@.version==2)].name should be custom_add
		And response body path $.calculations[?(@.version==2)].summary should be Adds 3 numbers
		And response body path $.calculations[?(@.version==2)].formula should be :left\+:right\+:another
		And response body path $.calculations[?(@.version==2)].parameters.length should be 3
		And response body path $.calculations[?(@.version==2)].parameters[?(@.index==0)].key should be left
		And response body path $.calculations[?(@.version==2)].parameters[?(@.index==0)].label should be left
		And response body path $.calculations[?(@.version==2)].parameters[?(@.index==0)].description should be left side of operand
		And response body path $.calculations[?(@.version==2)].parameters[?(@.index==0)].type should be number
		And response body path $.calculations[?(@.version==2)].parameters[?(@.index==1)].key should be right
		And response body path $.calculations[?(@.version==2)].parameters[?(@.index==1)].label should be right
		And response body path $.calculations[?(@.version==2)].parameters[?(@.index==1)].description should be right side of operand
		And response body path $.calculations[?(@.version==2)].parameters[?(@.index==1)].type should be number
		And response body path $.calculations[?(@.version==2)].parameters[?(@.index==2)].key should be another
		And response body path $.calculations[?(@.version==2)].parameters[?(@.index==2)].label should be another
		And response body path $.calculations[?(@.version==2)].parameters[?(@.index==2)].description should be another number
		And response body path $.calculations[?(@.version==2)].parameters[?(@.index==2)].type should be number
		And response body path $.calculations[?(@.version==2)].outputs.length should be 1
		And response body path $.calculations[?(@.version==2)].outputs[?(@.name=='sum')].description should be The total.
		And response body path $.calculations[?(@.version==2)].outputs[?(@.name=='sum')].type should be number
		And response body path $.calculations[?(@.version==2)].createdBy should be calculationsapitests_admin@amazon.com
		And response body path $.calculations[?(@.version==2)].createdAt should be `custom_add_calculation_createdAt`
		And response body path $.calculations[?(@.version==2)].updatedBy should be calculationsapitests_admin@amazon.com
		And response body path $.calculations[?(@.version==2)].updatedAt should be `custom_add_calculation_updatedAt`

	Scenario: Contributor can find calculation by name
		Given I authenticate using email calculationsApiTests_contributor@amazon.com and password p@ssword1
		When I GET /calculations?name=custom_add
		Then response code should be 200
		And response body path $.calculations.length should be 1
		And response body path $.calculations[?(@.version==2)].id should be `custom_add_calculation_id`
		And response body path $.calculations[?(@.version==2)].name should be custom_add

	Scenario: Reader can find calculation by name
		Given I authenticate using email calculationsApiTests_reader@amazon.com and password p@ssword1
		When I GET /calculations?name=custom_add
		Then response code should be 200
		And response body path $.calculations.length should be 1
		And response body path $.calculations[?(@.version==2)].id should be `custom_add_calculation_id`
		And response body path $.calculations[?(@.version==2)].name should be custom_add

	Scenario: Reader cannot delete a calculation
		Given I authenticate using email calculationsApiTests_reader@amazon.com and password p@ssword1
		When I remove header Content-Type
		And I DELETE /calculations/`custom_add_calculation_id`
		Then response code should be 403

	Scenario: Contributor cannot delete a calculation
		Given I authenticate using email calculationsApiTests_contributor@amazon.com and password p@ssword1
		When I remove header Content-Type
		And I DELETE /calculations/`custom_add_calculation_id`
		Then response code should be 403

	Scenario: updating activities with extraneous attributes should not persist those attributes
		Given I authenticate using email calculationsApiTests_admin@amazon.com and password p@ssword1
		And I set body to {"hello": "world"}
		When I PATCH /calculations/`custom_add_calculation_id`
		Then response code should be 200
		And response body should not contain $.hello

	Scenario: Should return error when formula has invalid syntax
		Given I authenticate using email calculationsApiTests_admin@amazon.com and password p@ssword1
		And I set body to { "name": "invalid_calculation_syntax", "summary": "Adds 2 numbers.", "formula": ":left+:right+#invalidFormula(:left)", "parameters": [ { "index": 0, "key": "left", "label": "left", "description": "left side of operand", "type": "number" }, { "index": 1, "key": "right", "label": "right", "description": "right side of operand", "type": "number" } ], "outputs": [ { "name": "sum", "description": "The total.", "type": "number" } ], "tags": { "datasource": "GHG Protocol", "type": "Material/Metal/Steel" }, "dryRunOptions": { "data": [{"left": "10", "right": "10"}] } }
		When I POST to /calculations
		Then response code should be 400
		And response body should contain Calculation with name 'invalidFormula' not found.
		And I set body to { "name": "invalid_calculation_syntax", "summary": "Adds 2 numbers.", "formula": ":left+:right+:undefined_parameter", "parameters": [ { "index": 0, "key": "left", "label": "left", "description": "left side of operand", "type": "number" }, { "index": 1, "key": "right", "label": "right", "description": "right side of operand", "type": "number" } ], "outputs": [ { "name": "sum", "description": "The total.", "type": "number" } ], "tags": { "datasource": "GHG Protocol", "type": "Material/Metal/Steel" }, "dryRunOptions": { "data": [{"left": "10", "right": "10"}] } }
		When I POST to /calculations
		Then response code should be 400
		And response body should contain Provided token 'undefined_parameter' not found as a pipeline parameter or variable.

	Scenario: Should skip calculator validation when dryRunOptions is not specified
		Given I authenticate using email calculationsApiTests_admin@amazon.com and password p@ssword1
		And I set body to { "name": "skip_validation_calculation", "summary": "Adds 2 numbers.", "formula": ":left+:right+#invalidFormula(:undefined_parameter)", "parameters": [ { "index": 0, "key": "left", "label": "left", "description": "left side of operand", "type": "number" }, { "index": 1, "key": "right", "label": "right", "description": "right side of operand", "type": "number" } ], "outputs": [ { "name": "sum", "description": "The total.", "type": "number" } ], "tags": { "datasource": "GHG Protocol", "type": "Material/Metal/Steel" }}
		When I POST to /calculations
		Then response code should be 201
		And response body should contain id
		And I store the value of body path $.id as skip_validation_calculation_id in global scope

	Scenario: Admin Can dry run a calculation successfully before creating
		Given I authenticate using email calculationsApiTests_admin@amazon.com and password p@ssword1
		And I set body to { "name": "custom_add", "summary": "Adds 2 numbers.", "formula": ":left+:right", "parameters": [ { "index": 0, "key": "left", "label": "left", "description": "left side of operand", "type": "number" }, { "index": 1, "key": "right", "label": "right", "description": "right side of operand", "type": "number" } ], "outputs": [ { "name": "sum", "description": "The total.", "type": "number" } ], "tags": { "datasource": "GHG Protocol", "type": "Material/Metal/Steel" }, "dryRunOptions": { "data": [{"left": "10", "right": "10"}] } }
		When I POST to /calculations?dryRun=true
		Then response code should be 200
		And response body should contain headers
		And response body should contain data
		And response body path $.headers[0] should be sum
		And response body path $.data[0] should be 20

	Scenario: Admin Can dry run a calculation unsuccessfully before creating
		Given I authenticate using email calculationsApiTests_admin@amazon.com and password p@ssword1
		And I set body to { "name": "custom_add", "summary": "Adds 2 numbers.", "formula": ":left+:right", "parameters": [ { "index": 0, "key": "left", "label": "left", "description": "left side of operand", "type": "number" }, { "index": 1, "key": "right", "label": "right", "description": "right side of operand", "type": "number" } ], "outputs": [ { "name": "sum", "description": "The total.", "type": "number" } ], "tags": { "datasource": "GHG Protocol", "type": "Material/Metal/Steel" }, "dryRunOptions": { "data": [{"left": "10", "right": "A"}] } }
		When I POST to /calculations?dryRun=true
		Then response code should be 400
		And response body should contain message
#
	Scenario: Admin can delete a calculation
		Given I authenticate using email calculationsApiTests_admin@amazon.com and password p@ssword1
		When I remove header Content-Type

		When I DELETE /calculations/`skip_validation_calculation_id`
		Then response code should be 204
		When I GET /calculations/`skip_validation_calculation_id`
		Then response code should be 404

		When I DELETE /calculations/`custom_add_calculation_id`
		Then response code should be 204
		When I GET /calculations/`custom_add_calculation_id`
		Then response code should be 404

		When I DELETE /calculations/`another_calculation_calculation_id`
		Then response code should be 204
		When I GET /calculations/`another_calculation_calculation_id`
		Then response code should be 404

		When I DELETE /calculations/`contr_calculation`
		Then response code should be 204
		When I GET /calculations/`contr_calculation`
		Then response code should be 404

	Scenario: Teardown: delete users and group
		Given group /calculationsApiTests has user calculationsApiTests_admin@amazon.com revoked
		And group /calculationsApiTests has user calculationsApiTests_contributor@amazon.com revoked
		And group /calculationsApiTests has user calculationsApiTests_reader@amazon.com revoked
		And group /calculationsApiTests has been removed

