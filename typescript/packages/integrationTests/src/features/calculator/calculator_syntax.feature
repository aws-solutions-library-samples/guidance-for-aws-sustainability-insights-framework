@setup_endToEnd @calculator
Feature:
	This feature tests the different expressions that are supported by the calculator
	Scenario: Setup users
		Given I'm using the accessManagement api
		And group /calculationsApiTests exists
		And group /calculationsApiTests has user calculationsApiTests_admin@amazon.com with role admin and password p@ssword1

	# Create resources which will be referenced by calculator later
	Scenario: Creating ReferenceDataset
		Given I'm using the referenceDatasets api
		Given I authenticate using email calculationsApiTests_admin@amazon.com and password p@ssword1
		And I set body to {"name":"dataset_sample","activeAt":"2023-02-21T01:00:00.000Z","description":"this dataset contains unit mappings","data":"Type,Multiplier\nCar,1\nBus,2","datasetHeaders":["Type","Multiplier"]}
		When I POST to /referenceDatasets
		Then response code should be 201
		And response body should contain id
		And response body path $.version should be 1
		And I store the value of body path $.id as syntax_check_referenceDataset_id in global scope
		And I pause for 15000ms

	Scenario: Create Activities
		Given I'm using the impacts api
		Given I authenticate using email calculationsApiTests_admin@amazon.com and password p@ssword1
		And I set body to {"activeAt" : "2023-02-21T01:00:00.000Z", "name":"activity_sample","attributes":{"refUnit":"kwh"},"tags":{"type":"E2E"},"impacts":{"co2e":{"name":"co2e","attributes":{"refUnit":"kwh","outUnit":"kg CO2eq"},"components":{"co2":{"key":"co2","value":10,"type":"pollutant"},"ch4":{"key":"ch4","value":1,"type":"pollutant"}}}}}
		When I POST to /activities
		Then response code should be 201
		And response body should contain id
		And response body path $.version should be 1
		And I store the value of body path $.id as syntax_check_activity_id in global scope

	Scenario: Creating Calculation
		Given I'm using the calculations api
		Given I authenticate using email calculationsApiTests_admin@amazon.com and password p@ssword1
		And I set body to {"name":"calculator_sample","activeAt":"2023-02-21T01:00:00.000Z","summary":"Sample calculation that will be reference by other calculator.","formula":":input*5555","parameters":[{"index":0,"key":"input","label":"input","description":"input","type":"number"}],"outputs":[{"name":"output","description":"The total.","type":"number"}]}
		When I POST to /calculations
		Then response code should be 201
		And response body should contain id
		And response body path $.version should be 1
		And I store the value of body path $.id as syntax_check_calculation_id in global scope

	Scenario: Updating Activities
		Given I'm using the impacts api
		Given I authenticate using email calculationsApiTests_admin@amazon.com and password p@ssword1
		And I set body to {"activeAt" : "2023-02-24T01:00:00.000Z", "name":"us:electricity:hydro","attributes":{"refUnit":"kwh"},"impacts":{"co2e":{"name":"co2e","attributes":{"refUnit":"kwh","outUnit":"kg CO2eq"},"components":{"co2":{"key":"co2","value":10000,"type":"pollutant"},"ch4":{"key":"ch4","value":1000,"type":"pollutant"}}}}}
		When I PATCH /activities/`syntax_check_activity_id`
		Then response code should be 200

	Scenario: Updating ReferenceDataset
		Given I'm using the referenceDatasets api
		Given I authenticate using email calculationsApiTests_admin@amazon.com and password p@ssword1
		And I set body to {"name":"sample_dataset","activeAt":"2023-02-24T01:00:00.000Z","description":"this dataset contains unit mappings","data":"Type,Multiplier\nCar,-1\nBus,-2","datasetHeaders":["Type","Multiplier"]}
		When I PATCH /referenceDatasets/`syntax_check_referenceDataset_id`
		Then response code should be 200
		And I pause for 15000ms

	Scenario: Updating Calculation
		Given I'm using the calculations api
		Given I authenticate using email calculationsApiTests_admin@amazon.com and password p@ssword1
		And I set body to {"name":"calculator_sample","activeAt":"2023-02-24T01:00:00.000Z","summary":"Sample calculation that will be reference by other calculator.","formula":":input*3333","parameters":[{"index":0,"key":"input","label":"input","description":"input","type":"number"}],"outputs":[{"name":"output","description":"The total.","type":"number"}]}
		When I PATCH /calculations/`syntax_check_calculation_id`
		Then response code should be 200

	# General Syntax Check
	Scenario: Should be able to set local variable to be used in a formula
		Given I'm using the calculations api
		Given I authenticate using email calculationsApiTests_admin@amazon.com and password p@ssword1
		And I set body to { "name": "calculator_syntax_check", "summary": "Sample formula to validate calculator syntax.", "formula": "set :new = 20 \n :left+:right+:new", "parameters": [ { "index": 0, "key": "left", "label": "left", "description": "left side of operand", "type": "number" }, { "index": 1, "key": "right", "label": "right", "description": "right side of operand", "type": "number" } ], "outputs": [ { "name": "sum", "description": "The total.", "type": "number" } ], "tags": { "datasource": "GHG Protocol", "type": "Material/Metal/Steel" }, "dryRunOptions": { "data": [{"left":10,"right":10}] } }
		When I POST to /calculations?dryRun=true
		Then response code should be 200
		And response body should contain headers
		And response body should contain data
		And response body path $.headers[0] should be sum
		And response body path $.data[0] should match stringified json "{\"sum\":40}"

	Scenario: Should be able to use camelCase for variable
		Given I'm using the calculations api
		Given I authenticate using email calculationsApiTests_admin@amazon.com and password p@ssword1
		And I set body to { "name": "calculator_syntax_check", "summary": "Sample formula to validate calculator syntax.", "formula": "set :new = 20 \n :leftSide+:rightSide+:new", "parameters": [ { "index": 0, "key": "leftSide", "label": "leftSide", "description": "left side of operand", "type": "number" }, { "index": 1, "key": "rightSide", "label": "rightSide", "description": "right side of operand", "type": "number" } ], "outputs": [ { "name": "sum", "description": "The total.", "type": "number" } ], "tags": { "datasource": "GHG Protocol", "type": "Material/Metal/Steel" }, "dryRunOptions": { "data": [{"leftSide":10,"rightSide":10}] } }
		When I POST to /calculations?dryRun=true
		Then response code should be 200
		And response body should contain headers
		And response body should contain data
		And response body path $.headers[0] should be sum
		And response body path $.data[0] should match stringified json "{\"sum\":40}"

	Scenario: Should be able to use CAPITAL case for variable
		Given I'm using the calculations api
		Given I authenticate using email calculationsApiTests_admin@amazon.com and password p@ssword1
		And I set body to { "name": "calculator_syntax_check", "summary": "Sample formula to validate calculator syntax.", "formula": "set :new = 20 \n :LEFT+:RIGHT+:new", "parameters": [ { "index": 0, "key": "LEFT", "label": "left", "description": "left side of operand", "type": "number" }, { "index": 1, "key": "RIGHT", "label": "RIGHT", "description": "right side of operand", "type": "number" } ], "outputs": [ { "name": "sum", "description": "The total.", "type": "number" } ], "tags": { "datasource": "GHG Protocol", "type": "Material/Metal/Steel" }, "dryRunOptions": { "data": [{"LEFT":10,"RIGHT":10}] } }
		When I POST to /calculations?dryRun=true
		Then response code should be 200
		And response body should contain headers
		And response body should contain data
		And response body path $.headers[0] should be sum
		And response body path $.data[0] should match stringified json "{\"sum\":40}"

	Scenario: Should be able to use IF for branching condition
		Given I'm using the calculations api
		Given I authenticate using email calculationsApiTests_admin@amazon.com and password p@ssword1
		And I set body to { "name": "calculator_syntax_check", "summary": "Sample formula to validate calculator syntax.", "formula": "IF(:left>:right,:left,:right)", "parameters": [ { "index": 0, "key": "left", "label": "left", "description": "left side of operand", "type": "number" }, { "index": 1, "key": "right", "label": "right", "description": "right side of operand", "type": "number" } ], "outputs": [ { "name": "sum", "description": "The total.", "type": "number" } ], "dryRunOptions": { "data": [{"left":1000,"right":2000}] } }
		When I POST to /calculations?dryRun=true
		Then response code should be 200
		And response body should contain headers
		And response body should contain data
		And response body path $.headers[0] should be sum
		And response body path $.data[0] should match stringified json "{\"sum\":2000}"

	Scenario: Should be able to use concatenate strings
		Given I'm using the calculations api
		Given I authenticate using email calculationsApiTests_admin@amazon.com and password p@ssword1
		And I set body to { "name": "calculator_syntax_check", "summary": "Sample formula to validate calculator syntax.", "formula": "CONCAT(:left,'_',:right)", "parameters": [ { "index": 0, "key": "left", "label": "left", "description": "left side of operand", "type": "string" }, { "index": 1, "key": "right", "label": "right", "description": "right side of operand", "type": "string" } ], "outputs": [ { "name": "sum", "description": "The total.", "type": "number" } ], "dryRunOptions": { "data": [{"left":"left_text","right":"right_text"}] } }
		When I POST to /calculations?dryRun=true
		Then response code should be 200
		And response body should contain headers
		And response body should contain data
		And response body path $.headers[0] should be sum
		And response body path $.data[0] should match stringified json "{\"sum\":\"left_text_right_text\"}"

	Scenario: Should be able return condition based on switch statement
		Given I'm using the calculations api
		Given I authenticate using email calculationsApiTests_admin@amazon.com and password p@ssword1
		And I set body to { "name": "calculator_syntax_check", "summary": "Sample formula to validate calculator syntax.", "formula": "SWITCH(:input, 'first', 'match first', 'second', 'match second')", "parameters": [ { "index": 0, "key": "input", "label": "input", "description": "sample input parameter", "type": "string" }], "outputs": [ { "name": "result", "description": "The result.", "type": "string" } ], "dryRunOptions": { "data": [{"input":"second"}] } }
		When I POST to /calculations?dryRun=true
		Then response code should be 200
		And response body should contain headers
		And response body should contain data
		And response body path $.headers[0] should be result
		And response body path $.data[0] should match stringified json "{\"result\":\"match second\"}"


	Scenario: Should be able to combine multiple syntax
		Given I'm using the calculations api
		Given I authenticate using email calculationsApiTests_admin@amazon.com and password p@ssword1
		And I set body to { "name": "calculator_syntax_check", "summary": "Sample formula to validate calculator syntax.", "formula": "set :value=100\nSWITCH(:input, 'first', 0, 'second', IF(:left>:right,:left*:value,:right*:value))", "parameters": [ { "index": 0, "key": "left", "label": "left", "description": "left side of operand", "type": "number" }, { "index": 1, "key": "right", "label": "right", "description": "right side of operand", "type": "number" } ,  { "index": 2, "key": "input", "label": "input", "description": "text input", "type": "string" }],"outputs": [ { "name": "output", "description": "The total.", "type": "number" } ], "dryRunOptions": { "data": [{"left":1000,"right":2000,"input":"second"}] } }
		When I POST to /calculations?dryRun=true
		Then response code should be 200
		And response body should contain headers
		And response body should contain data
		And response body path $.headers[0] should be output
		And response body path $.data[0] should match stringified json "{\"output\":200000}"
		And I set body to { "name": "calculator_syntax_check", "summary": "Sample formula to validate calculator syntax.", "formula": "set :value=100\nSWITCH(:input, 'first', 0, 'second', IF(:left>:right,:left*:value,:right*:value))", "parameters": [ { "index": 0, "key": "left", "label": "left", "description": "left side of operand", "type": "number" }, { "index": 1, "key": "right", "label": "right", "description": "right side of operand", "type": "number" } ,  { "index": 2, "key": "input", "label": "input", "description": "text input", "type": "string" }],"outputs": [ { "name": "output", "description": "The total.", "type": "number" } ], "dryRunOptions": { "data": [{"left":3000,"right":2000,"input":"second"}] } }
		When I POST to /calculations?dryRun=true
		Then response code should be 200
		And response body should contain headers
		And response body should contain data
		And response body path $.headers[0] should be output
 		And response body path $.data[0] should match stringified json "{\"output\":300000}"
		And I set body to { "name": "calculator_syntax_check", "summary": "Sample formula to validate calculator syntax.", "formula": "set :value=100\nSWITCH(:input, 'first', CONCAT('sif','-','framework'), 'second', IF(:left>:right,:left*:value,:right*:value))", "parameters": [ { "index": 0, "key": "left", "label": "left", "description": "left side of operand", "type": "number" }, { "index": 1, "key": "right", "label": "right", "description": "right side of operand", "type": "number" } ,  { "index": 2, "key": "input", "label": "input", "description": "text input", "type": "string" }],"outputs": [ { "name": "output", "description": "The total.", "type": "string" } ], "dryRunOptions": { "data": [{"left":1000,"right":2000,"input":"first"}] } }
		When I POST to /calculations?dryRun=true
		Then response code should be 200
		And response body should contain headers
		And response body should contain data
		And response body path $.headers[0] should be output
 		And response body path $.data[0] should match stringified json "{\"output\":\"sif-framework\"}"

	Scenario: Testing Calculator syntax that references version 1 of other resources
		Given I'm using the calculations api
		Given I authenticate using email calculationsApiTests_admin@amazon.com and password p@ssword1
		And I set body to {"name":"calculator_syntax_check","summary":"Sample formula to validate calculator syntax.","formula":"(#calculator_sample(:input,version=1) + IMPACT('activity_sample','co2e','co2',version=1)) * LOOKUP('Car','dataset_sample','Type','Multiplier',version=1)","parameters":[{"index":0,"key":"input","label":"input","description":"input data.","type":"string"}],"outputs":[{"name":"output","description":"The total.","type":"number"}],"dryRunOptions":{"data":[{"input":1}]}}
		When I POST to /calculations?dryRun=true
		Then response code should be 200
		And response body should contain headers
		And response body should contain data
		And response body path $.headers[0] should be output
 		And response body path $.data[0] should match stringified json "{\"output\":5565}"

	Scenario: Testing Calculator syntax that references version 2 of other resources
		Given I'm using the calculations api
		Given I authenticate using email calculationsApiTests_admin@amazon.com and password p@ssword1
		And I set body to {"name":"calculator_syntax_check","summary":"Sample formula to validate calculator syntax.","formula":"(#calculator_sample(:input,version=2) + IMPACT('activity_sample','co2e','co2',version=2)) * LOOKUP('Car','dataset_sample','Type','Multiplier',version=2)","parameters":[{"index":0,"key":"input","label":"input","description":"input data.","type":"string"}],"outputs":[{"name":"output","description":"The total.","type":"number"}],"dryRunOptions":{"data":[{"input":1}]}}
		When I POST to /calculations?dryRun=true
		Then response code should be 200
		And response body should contain headers
		And response body should contain data
		And response body path $.headers[0] should be output
 		And response body path $.data[0] should match stringified json "{\"output\":-13333}"

	Scenario: Testing Calculator syntax by specifying versionAsAt 2023-02-21T01:00:00.000Z (resolves to version 1)
		Given I'm using the calculations api
		Given I authenticate using email calculationsApiTests_admin@amazon.com and password p@ssword1
		And I set body to {"name":"calculator_syntax_check","summary":"Sample formula to validate calculator syntax.","formula":"(#calculator_sample(:input,versionAsAt='2023-02-21T01:00:00.000Z') + IMPACT('activity_sample','co2e','co2',versionAsAt='2023-02-21T01:00:00.000Z')) * LOOKUP('Car','dataset_sample','Type','Multiplier',versionAsAt='2023-02-21T01:00:00.000Z')","parameters":[{"index":0,"key":"input","label":"input","description":"input data.","type":"string"}],"outputs":[{"name":"output","description":"The total.","type":"number"}],"dryRunOptions":{"data":[{"input":1}]}}
		When I POST to /calculations?dryRun=true
		Then response code should be 200
		And response body should contain headers
		And response body should contain data
		And response body path $.headers[0] should be output
 		And response body path $.data[0] should match stringified json "{\"output\":5565}"

	Scenario: Testing Calculator syntax by specifying versionAsAt 2023-02-24T01:00:00.000Z (resolves to version 2)
		Given I'm using the calculations api
		Given I authenticate using email calculationsApiTests_admin@amazon.com and password p@ssword1
		And I set body to {"name":"calculator_syntax_check","summary":"Sample formula to validate calculator syntax.","formula":"(#calculator_sample(:input,versionAsAt='2023-02-24T01:00:00.000Z') + IMPACT('activity_sample','co2e','co2',versionAsAt='2023-02-24T01:00:00.000Z')) * LOOKUP('Car','dataset_sample','Type','Multiplier',versionAsAt='2023-02-24T01:00:00.000Z')","parameters":[{"index":0,"key":"input","label":"input","description":"input data.","type":"string"}],"outputs":[{"name":"output","description":"The total.","type":"number"}],"dryRunOptions":{"data":[{"input":1}]}}
		When I POST to /calculations?dryRun=true
		Then response code should be 200
		And response body should contain headers
		And response body should contain data
		And response body path $.headers[0] should be output
 		And response body path $.data[0] should match stringified json "{\"output\":-13333}"

	Scenario: Testing Calculator formula that match product using CaML model
		Given I'm using the calculations api
		Given I authenticate using email calculationsApiTests_admin@amazon.com and password p@ssword1
		And I set body to {"name":"calculator_syntax_check","summary":"Sample formula perform CAML matching.","formula":"CAML(:input)","parameters":[{"index":0,"key":"input","label":"input","description":"input data.","type":"string"}],"outputs":[{"name":"output","description":"The top 5 matches","type":"string"}],"dryRunOptions":{"data":[{"input":"computer keyboard"}]}}
		When I POST to /calculations?dryRun=true
		Then response code should be 200
		And response body should contain headers
		And response body should contain data
		And response body path $.headers[0] should be output
		And response body path $.data[0] should match stringified json "{\"output\":[{\"title\":\"Computer terminals and other computer peripheral equipment manufacturing\",\"naicsCode\":\"334118\",\"beaCode\":\"334118\",\"confidence\":0.663,\"co2ePerDollar\":0.199},{\"title\":\"Business support services\",\"naicsCode\":\"561410\",\"beaCode\":\"561400\",\"confidence\":0.524,\"co2ePerDollar\":0.14300000000000002},{\"title\":\"All other miscellaneous manufacturing\",\"naicsCode\":\"339992\",\"beaCode\":\"339990\",\"confidence\":0.501,\"co2ePerDollar\":0.276},{\"title\":\"Support activities for printing\",\"naicsCode\":\"323120\",\"beaCode\":\"323120\",\"confidence\":0.483,\"co2ePerDollar\":0.30400000000000005},{\"title\":\"Data processing, hosting, and related services\",\"naicsCode\":\"518210\",\"beaCode\":\"518200\",\"confidence\":0.471,\"co2ePerDollar\":0.17500000000000002}]}"

	Scenario: Testing Calculator formula that extract value using GetValue
		Given I'm using the calculations api
		Given I authenticate using email calculationsApiTests_admin@amazon.com and password p@ssword1
		And I set body to {"name":"calculator_syntax_check","summary":"Sample formula perform CAML matching.","formula":"GET_VALUE(CAML(:input),'$[0].title')","parameters":[{"index":0,"key":"input","label":"input","description":"input data.","type":"string"}],"outputs":[{"name":"output","description":"The top 5 matches","type":"string"}],"dryRunOptions":{"data":[{"input":"computer keyboard"}]}}
		When I POST to /calculations?dryRun=true
		Then response code should be 200
		And response body should contain headers
		And response body should contain data
		And response body path $.headers[0] should be output
		And response body path $.data[0] should match stringified json "{\"output\":\"Computer terminals and other computer peripheral equipment manufacturing\"}"
		And I set body to {"name":"calculator_syntax_check","summary":"Sample formula perform CAML matching.","formula":"GET_VALUE(CAML(:input),'$[0].co2ePerDollar')","parameters":[{"index":0,"key":"input","label":"input","description":"input data.","type":"string"}],"outputs":[{"name":"output","description":"The top 5 matches","type":"string"}],"dryRunOptions":{"data":[{"input":"computer keyboard"}]}}
		When I POST to /calculations?dryRun=true
		Then response code should be 200
		And response body should contain headers
		And response body should contain data
		And response body path $.headers[0] should be output
		And response body path $.data[0] should match stringified json "{\"output\":0.199}"

		Scenario: Should be able split string into multiple strings
		Given I'm using the calculations api
		Given I authenticate using email calculationsApiTests_admin@amazon.com and password p@ssword1
		# Happy Path
		And I set body to {"name":"calculator_syntax_check","summary":"Sample formula to split string by comma.","formula":"split(:text,:regex)","parameters":[{"index":0,"key":"text","label":"text","description":"input text","type":"string"},{"index":1,"key":"regex","label":"regex","description":"input regex","type":"string"}],"outputs":[{"name":"first","description":"First item in the string list.","type":"string"}],"dryRunOptions":{"data":[{"text":"a,b,c","regex":","}]}}
		When I POST to /calculations?dryRun=true
		Then response code should be 200
		And response body should contain headers
		And response body should contain data
		And response body path $.headers[0] should be first
		And response body path $.data[0] should match stringified json "{\"first\":[\"a\",\"b\",\"c\"]}"
		# Retrieve item by index
		And I set body to {"name":"calculator_syntax_check","summary":"Sample formula to split string by comma.","formula":"split(:text,:regex)[2]","parameters":[{"index":0,"key":"text","label":"text","description":"input text","type":"string"},{"index":1,"key":"regex","label":"regex","description":"input regex","type":"string"}],"outputs":[{"name":"first","description":"First item in the string list.","type":"string"}],"dryRunOptions":{"data":[{"text":"a,b,c","regex":","}]}}
		When I POST to /calculations?dryRun=true
		Then response code should be 200
		And response body should contain headers
		And response body should contain data
		And response body path $.headers[0] should be first
		And response body path $.data[0] should match stringified json "{\"first\":\"c\"}"
		# Specify regular expression as delimeter
		And I set body to {"name":"calculator_syntax_check","summary":"Sample formula to split string by comma.","formula":"split(:text,:regex)","parameters":[{"index":0,"key":"text","label":"text","description":"input text","type":"string"},{"index":1,"key":"regex","label":"regex","description":"input regex","type":"string"}],"outputs":[{"name":"first","description":"First item in the string list.","type":"string"}],"dryRunOptions":{"data":[{"text":"a,b;c-d","regex":"(,|;|-)"}]}}
		When I POST to /calculations?dryRun=true
		Then response code should be 200
		And response body should contain headers
		And response body should contain data
		And response body path $.headers[0] should be first
		And response body path $.data[0] should match stringified json "{\"first\":[\"a\",\"b\",\"c\",\"d\"]}"
		# Specify the limit variable to limit the results
		And I set body to {"name":"calculator_syntax_check","summary":"Sample formula to split string by comma.","formula":"split(:text,:regex,limit=2)","parameters":[{"index":0,"key":"text","label":"text","description":"input text","type":"string"},{"index":1,"key":"regex","label":"regex","description":"input regex","type":"string"}],"outputs":[{"name":"first","description":"First item in the string list.","type":"string"}],"dryRunOptions":{"data":[{"text":"a,b;c-d","regex":"(,|;|-)"}]}}
		When I POST to /calculations?dryRun=true
		Then response code should be 200
		And response body should contain headers
		And response body should contain data
		And response body path $.headers[0] should be first
		And response body path $.data[0] should match stringified json "{\"first\":[\"a\",\"b;c-d\"]}"

	Scenario: Teardown - Activities
		Given I'm using the impacts api
		Given I authenticate using email calculationsApiTests_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		When I DELETE /activities/`syntax_check_activity_id`
		Then response code should be 204
		When I GET /activities
		Then response code should be 200
		And response body path $.activities.length should be 0

	Scenario: Teardown - Calculations
		Given I'm using the calculations api
		Given I authenticate using email calculationsApiTests_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		When I DELETE /calculations/`syntax_check_calculation_id`
		Then response code should be 204
		When I GET /calculations
		Then response code should be 200
		And response body path $.calculations.length should be 0

	Scenario: Teardown - ReferenceDatasets
		Given I'm using the referenceDatasets api
		Given I authenticate using email calculationsApiTests_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		When I DELETE /referenceDatasets/`syntax_check_referenceDataset_id`
		Then response code should be 204
		When I GET /referenceDatasets
		Then response code should be 200
		And response body path $.referenceDatasets.length should be 0

	Scenario: Teardown: delete users and group
		Given I'm using the accessManagement api
		Given group /calculationsApiTests has user calculationsApiTests_admin@amazon.com revoked
		And group /calculationsApiTests has been removed

