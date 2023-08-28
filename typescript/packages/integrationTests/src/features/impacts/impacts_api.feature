@setup_impacts @impacts
Feature:
	impacts features.

	Scenario: Setup users
		Given group /activitiesApiTests1 exists
		And group /activitiesApiTests1 has user activitiesApiTests1_admin@amazon.com with role admin and password p@ssword1
		And group /activitiesApiTests1 has user activitiesApiTests1_contributor@amazon.com with role contributor and password p@ssword1
		And group /activitiesApiTests2 exists
		And group /activitiesApiTests2 has user activitiesApiTests2_admin@amazon.com with role admin and password p@ssword1
		And group /activitiesApiTests2 has user activitiesApiTests2_contributor@amazon.com with role contributor and password p@ssword1

	# Activity scenarios

	Scenario: Contributor of group should able to create new activity
		Given I authenticate using email activitiesApiTests1_contributor@amazon.com and password p@ssword1
		And I set body to {"name":"activity_contr1","description":"excludes carbon sequestration","attributes":{"ref_unit":"therm"},"tags":{"division":"purchasing","type":"material/metal/steel"},"groups":["/usa/northwest"],"impacts":{"co2e":{"name":"CO2e","attributes":{"unit":"kg"},"components":{"co2e":{"key":"co2","value":5.304733389,"type":"pollutant","description":"","label":""}}}}}
		When I POST to /activities
		Then response code should be 201
		And I store the value of body path $.id as activityContr1 in global scope

	Scenario: Contributor of group should be able to create new impact
		Given I authenticate using email activitiesApiTests1_contributor@amazon.com and password p@ssword1
		And I set body to {"name": "CO2e2","attributes": {"unit": "kg"},"components": {"co22":{"key": "co2","value": 5.304733389,"type": "pollutant","description": "","label": ""}}}
		When I PUT /activities/`activityContr1`/impacts/CO2e2
		Then response code should be 201

	Scenario: Contributor of group should be able to create new component
		Given I authenticate using email activitiesApiTests1_contributor@amazon.com and password p@ssword1
		And I set body to {"key": "co22","value": 5.304733389,"type": "pollutant","description": "","label": ""}
		When I PUT /activities/`activityContr1`/impacts/CO2e2/components/co22
		Then response code should be 201

	Scenario: Admin should not be able to create new component without parent activity
		Given I authenticate using email activitiesApiTests1_admin@amazon.com and password p@ssword1
		And I set body to {"key": "co2","value": 5.304733389,"type": "pollutant","description": "","label": ""}
		When I PUT /activities/1234/impacts/CO2e/components/co2
		Then response code should be 404

	Scenario: Should not be able to create new impact without parent activity
		Given I authenticate using email activitiesApiTests1_admin@amazon.com and password p@ssword1
		And I set body to {"name": "CO2e","attributes": {"unit" : "kg"},"components": {"co2":{"key": "co2","value": 5.304733389,"type": "pollutant","description": "","label": ""}}}
		When I PUT /activities/1234/impacts/CO2e
		Then response code should be 404

	Scenario: Admin of group may create new activity
		Given I authenticate using email activitiesApiTests1_admin@amazon.com and password p@ssword1
		And I set body to {"name":"activity_1","description":"excludes carbon sequestration","attributes":{"ref_unit":"therm"},"tags":{"division":"purchasing","type":"material/metal/steel"},"groups":["/usa/northwest"],"impacts":{"co2e":{"name":"CO2e","attributes":{"unit":"kg"},"components":{"co2":{"key":"co2","value":5.304733389,"type":"pollutant","description":"","label":""}}}}}
		When I POST to /activities
		Then response code should be 201
		And I store the value of body path $.id as activityId1 in global scope
		And I store the value of body path $.id as lastActivityId in global scope

	Scenario: Should throw error when activeAt is not set to the right date time format
		Given I authenticate using email activitiesApiTests1_admin@amazon.com and password p@ssword1
		And I set body to {"name":"activity_1", "activeAt": "invalidDate", "description":"excludes carbon sequestration","attributes":{"ref_unit":"therm"},"tags":{"division":"purchasing","type":"material/metal/steel"},"groups":["/usa/northwest"],"impacts":{"co2e":{"name":"CO2e","attributes":{"unit":"kg"},"components":{"co2":{"key":"co2","value":5.304733389,"type":"pollutant","description":"","label":""}}}}}
		When I POST to /activities
		Then response code should be 400
		And response body path $.message should be body/activeAt must match format "date-time"

	Scenario: activity name has to be unique within the same group
		Given I authenticate using email activitiesApiTests1_admin@amazon.com and password p@ssword1
		And I set body to {"name": "activity_1","description": "excludes carbon sequestration","attributes": {"ref_unit":"therm"},"tags": {"division":"purchasing","type":"material/metal/steel"},"groups": ["/usa/northwest"],"impacts": {"co2e":{"name": "CO2e","attributes": {"unit": "kg"},"components": {"co2":{"key": "co2","value": 5.304733389,"type": "pollutant","description": "","label": ""}}}}}
		When I POST to /activities
		Then response code should be 409
		And response body path $.message should be Name 'activity_1' already in use.

	Scenario: Can create activity data set with the same name on another group
		Given I authenticate using email activitiesApiTests2_admin@amazon.com and password p@ssword1
		And I set body to {"name": "activity_1", "activeAt" : "2023-02-21T14:48:00.000Z", "description": "excludes carbon sequestration","attributes": {"ref_unit":"therm"},"tags": {"division":"purchasing","type":"material/metal/steel"},"groups": ["/usa/northwest"],"impacts": {"co2e":{"name": "CO2e","attributes": {"unit": "kg"},"components": {"co2":{"key": "co2","value": 5.304733389,"type": "pollutant","description": "","label": ""}}}}}
		When I POST to /activities
		Then response code should be 201
		And I store the value of body path $.id as activityId2 in global scope
		And I store the value of body path $.id as lastActivityId in global scope

	Scenario: Should not be able to list activities that belong to another group
		Given I authenticate using email activitiesApiTests2_admin@amazon.com and password p@ssword1
		And I set x-groupcontextid header to /activitiesApiTests1
		When I GET /activities
		Then response code should be 403

	Scenario: Create another activity data set from pagination
		Given I authenticate using email activitiesApiTests2_admin@amazon.com and password p@ssword1
		And I set body to {"name": "activity_2","description": "excludes carbon sequestration","attributes": {"ref_unit":"therm"},"tags": {"division":"purchasing","type":"material/metal/steel"},"groups": ["/usa/northwest"],"impacts": {"co2e":{"name": "CO2e","attributes": {"unit": "kg"},"components": {"co2":{"key": "co2","value": 5.304733389,"type": "pollutant","description": "","label": ""}}}}}
		When I POST to /activities
		Then response code should be 201
		And I store the value of body path $.id as activityId3 in global scope

	Scenario: Should be able to list all activities belong to your group
		Given I authenticate using email activitiesApiTests2_admin@amazon.com and password p@ssword1
		When I GET /activities
		Then response code should be 200
		And response body path $.activities should be of type array with length 2
		And response body path $.activities[0].groups[0] should be /activitiesapitests2

	Scenario: Should be able to list one activity from the group
		Given I authenticate using email activitiesApiTests2_admin@amazon.com and password p@ssword1
		When I GET /activities?count=1
		Then response code should be 200
		And response body path $.activities should be of type array with length 1
		And response body path $.activities[0].groups[0] should be /activitiesapitests2
		And response body path $.activities[0].id should be `activityId2`

	Scenario: Should be able to list one paginated activity
		Given I authenticate using email activitiesApiTests2_admin@amazon.com and password p@ssword1
		When I GET /activities?count=1&fromActivityId=`activityId2`
		Then response code should be 200
		And response body path $.activities should be of type array with length 1
		And response body path $.activities[0].groups[0] should be /activitiesapitests2
		And response body path $.activities[0].id should be `activityId2`

	Scenario: Should be able to list activity by name
		Given I authenticate using email activitiesApiTests1_admin@amazon.com and password p@ssword1
		When I GET /activities?name=activity_1
		Then response code should be 200
		And response body path $.activities should be of type array with length 1
		And response body path $.activities[0].groups[0] should be /activitiesapitests1
		And response body path $.activities[0].name should be activity_1

	Scenario: Contributor of group may get enabled activities
		Given I authenticate using email activitiesApiTests2_contributor@amazon.com and password p@ssword1
		When I GET /activities/`lastActivityId`
		Then response code should be 200
		And response body path $.state should be enabled
		And response body path $.version should be 1

	Scenario: Admin of group may update activities
		Given I authenticate using email activitiesApiTests2_admin@amazon.com and password p@ssword1
		And I set body to {"activeAt" : "2023-02-21T15:48:00.000Z","description": "Updated description","attributes": {"ref_unit":"therm","dummyAttribute":"dummyValue"}}
		When I PATCH /activities/`lastActivityId`
		Then response code should be 200

	Scenario: Contributor of group may update activities
		Given I authenticate using email activitiesApiTests1_contributor@amazon.com and password p@ssword1
		And I set body to {"description": "Updated description by contributor","attributes": {"ref_unit":"therm","dummyAttribute":"dummyValue"}}
		When I PATCH /activities/`activityContr1`
		Then response code should be 200

	Scenario: Should be able to list activity versions based on activation date
		Given I authenticate using email activitiesApiTests2_admin@amazon.com and password p@ssword1
		# should throw error if both versionAsAt and count/fromVersion are specified
		When I GET /activities/`activityId2`/versions?versionAsAt=2023-02-21T14:48:00.000Z&count=1
		Then response code should be 400
		And response body path $.message should be request can only contain versionAsAt or count/fromVersion query parameter, but not both
		When I GET /activities/`activityId2`/versions?versionAsAt=2023-02-21T14:48:00.000Z
		Then response code should be 200
		And response body path $.activities should be of type array with length 1
		And response body path $.activities[0].groups[0] should be /activitiesapitests2
		And response body path $.activities[0].name should be activity_1
		And response body path $.activities[0].version should be 1
		When I GET /activities/`activityId2`/versions?versionAsAt=2023-02-21T15:48:00.000Z
		Then response code should be 200
		And response body path $.activities should be of type array with length 1
		And response body path $.activities[0].groups[0] should be /activitiesapitests2
		And response body path $.activities[0].name should be activity_1
		And response body path $.activities[0].version should be 2

	Scenario: Updating activity state to disabled should override all versions
		Given I authenticate using email activitiesApiTests1_admin@amazon.com and password p@ssword1
		And I set body to {"state": "disabled"}
		When I PATCH /activities/`activityId1`
		Then response code should be 200
		When I GET /activities/`activityId1`/versions/1
		Then response code should be 200
		And response body path $.state should be disabled

	Scenario: Updating activity state to frozen should override all versions
		Given I authenticate using email activitiesApiTests1_admin@amazon.com and password p@ssword1
		And I set body to {"state": "frozen"}
		When I PATCH /activities/`activityId1`
		Then response code should be 200
		When I GET /activities/`activityId1`/versions/1
		Then response code should be 200
		And response body path $.state should be frozen


	Scenario: Contributor of group should be able to get updated activity
		Given I authenticate using email activitiesApiTests2_contributor@amazon.com and password p@ssword1
		When I GET /activities/`activityId2`
		Then response code should be 200
		And response body path $.attributes.dummyAttribute should be dummyValue
		And response body path $.description should be Updated description
		And response body path $.version should be 2

	Scenario: Contributor of group Should be able to list activities based on tags
		Given I authenticate using email activitiesApiTests2_contributor@amazon.com and password p@ssword1
		When I GET /activities?tag=type:material/metal
		Then response code should be 200
		Then response body path $.activities should be of type array with length 2
		And response body path $.activities[?(@.name=='activity_1')].name should be activity_1
		And response body path $.activities[?(@.name=='activity_2')].name should be activity_2

	# Impact scenarios

	Scenario: Should not be able to create new impact in an activity that belongs to another group
		Given I authenticate using email activitiesApiTests1_admin@amazon.com and password p@ssword1
		And I set body to {"name": "dummyImpact","attributes": {"unit": "kg"},"components": {"co2":{"key": "co2","value": 5.304733389,"type": "pollutant","description": "","label": ""}}}
		When I PUT /activities/`activityId2`/impacts/dummyImpact
		Then response code should be 403

	Scenario: Should not be able to update impact in an activity that belongs to another group
		Given I authenticate using email activitiesApiTests1_admin@amazon.com and password p@ssword1
		And I set body to {"name": "CO2e","attributes": {"dummyAttribute": "kg"},"components": {"dummyComponent":{"key": "dummyComponent","value": 5.304733389,"type": "pollutant","description": "","label": ""}}}
		When I PATCH /activities/`activityId2`/impacts/CO2e
		Then response code should be 403

	Scenario: Should not be able to get impact that belong to another group
		Given I authenticate using email activitiesApiTests1_admin@amazon.com and password p@ssword1
		When I GET /activities/`activityId2`/impacts/CO2e
		Then response code should be 403

	Scenario: Should not be able to list impacts that belong to another group
		Given I authenticate using email activitiesApiTests1_admin@amazon.com and password p@ssword1
		When I GET /activities/`activityId2`/impacts
		Then response code should be 403

	Scenario: Should not be able to update impact for an activity that doesnt exist
		Given I authenticate using email activitiesApiTests1_admin@amazon.com and password p@ssword1
		And I set body to {"name": "dummyImpact","attributes": {"unit": "kg"},"components": {"co2":{"key": "co2","value": 5.304733389,"type": "pollutant","description": "","label": ""}}}
		When I PUT /activities/123/impacts/dummyImpact
		Then response code should be 404

	Scenario: Admin of group Should be able to create impact
		Given I authenticate using email activitiesApiTests2_admin@amazon.com and password p@ssword1
		And I set body to {"name": "dummyImpact","attributes": {"unit": "kg"},"components":{"co2":{"key": "co2","value": 5.304733389,"type": "pollutant","description": "","label": ""}}}
		When I PUT /activities/`activityId2`/impacts/dummyImpact
		Then response code should be 201

	Scenario: Contributor of group can get Impact
		Given I authenticate using email activitiesApiTests2_contributor@amazon.com and password p@ssword1
		When I GET /activities/`activityId2`/impacts/dummyImpact
		Then response code should be 200
		And response body path $.attributes.unit should be kg
		And response body path $.components.co2.key should be co2

	Scenario: Impact create should have updated activity
		Given I authenticate using email activitiesApiTests2_contributor@amazon.com and password p@ssword1
		When I GET /activities/`activityId2`
		Then response code should be 200
		And response body path $.impacts.co2e.name should be CO2e
		And response body path $.impacts.dummyimpact.name should be dummyImpact
		And response body path $.impacts.co2e.components.co2.value should be 5.304733389
		And response body path $.description should be Updated description
		And response body path $.version should be 3

	Scenario: Admin of group can update impact
		Given I authenticate using email activitiesApiTests2_admin@amazon.com and password p@ssword1
		And I set body to {"name": "dummyImpact","attributes": {"unit": "kg","dummyAttribute": "dummyValue"}}
		When I PATCH /activities/`activityId2`/impacts/dummyImpact
		Then response code should be 200

	Scenario: Contributor of group can update impact
		Given I authenticate using email activitiesApiTests1_contributor@amazon.com and password p@ssword1
		And I set body to {"name": "c02e2","attributes": {"unit": "kg","dummyAttribute": "dummyValue"}}
		When I PATCH /activities/`activityContr1`/impacts/co2e2
		Then response code should be 200

	Scenario: Contributor of group can get Impact
		Given I authenticate using email activitiesApiTests2_contributor@amazon.com and password p@ssword1
		When I GET /activities/`activityId2`/impacts/dummyImpact
		Then response code should be 200
		And response body path $.attributes.dummyAttribute should be dummyValue
		And response body path $.components.co2.value should be 5.304733389

	Scenario: Contributor of group can list Impacts
		Given I authenticate using email activitiesApiTests2_contributor@amazon.com and password p@ssword1
		When I GET /activities/`activityId2`/impacts
		Then response code should be 200
		And response body path $.co2e.name should be CO2e
		And response body path $.dummyimpact.name should be dummyImpact

	Scenario: Impact update should have updated activity
		Given I authenticate using email activitiesApiTests2_contributor@amazon.com and password p@ssword1
		When I GET /activities/`activityId2`
		Then response code should be 200
		And response body path $.impacts.co2e.name should be CO2e
		And response body path $.impacts.co2e.components.co2.value should be 5.304733389
		And response body path $.impacts.dummyimpact.name should be dummyImpact
		And response body path $.description should be Updated description
		And response body path $.version should be 4

	Scenario: Should not be able to create new component in an activity that belongs to another group
		Given I authenticate using email activitiesApiTests1_admin@amazon.com and password p@ssword1
		And I set body to {"key": "dummyComponent","value": 1.123456,"type": "pollutant","description": "dummy component","label": ""}
		When I PUT /activities/`activityId2`/impacts/dummyImpact/components/dummyComponent
		Then response code should be 403

	Scenario: Should not be able to update component in an activity that belongs to another group
		Given I authenticate using email activitiesApiTests1_admin@amazon.com and password p@ssword1
		And I set body to {"key": "dummyComponent","value": 1.123456,"type": "pollutant","description": "dummy component","label": ""}
		When I PATCH /activities/`activityId2`/impacts/dummyImpact/components/dummyComponent
		Then response code should be 403


	Scenario: Should not be able to get impact that belong to another group
		Given I authenticate using email activitiesApiTests1_admin@amazon.com and password p@ssword1
		When I GET /activities/`activityId2`/impacts/dummyImpact/components/dummyComponent
		Then response code should be 403

	Scenario: Should not be able to list impacts that belong to another group
		Given I authenticate using email activitiesApiTests1_admin@amazon.com and password p@ssword1
		When I GET /activities/`activityId2`/impacts/dummyImpact/components/dummyComponent
		Then response code should be 403

	# Component scenarios

	Scenario: Should not be able to create component for an activity that doesnt exist
		Given I authenticate using email activitiesApiTests1_admin@amazon.com and password p@ssword1
		And I set body to  {"key": "dummyComponent","value": 1.123456,"type": "pollutant","description": "dummy component","label": ""}
		When I PUT /activities/123/impacts/dummyImpact/components/dummyComponent
		Then response code should be 404

	Scenario: Should not be able to create component for an impact that doesnt exist
		Given I authenticate using email activitiesApiTests2_admin@amazon.com and password p@ssword1
		And I set body to {"key": "dummyComponent","value": 1.123456,"type": "pollutant","description": "dummy component","label": ""}
		When I PUT /activities/`activityId2`/impacts/123/components/dummyComponent
		Then response code should be 404

	Scenario: Admin of group should be able to create component
		Given I authenticate using email activitiesApiTests2_admin@amazon.com and password p@ssword1
		And I set body to {"key": "dummyComponent","value": 1.123456,"type": "pollutant","description": "dummy component","label": ""}
		When I PUT /activities/`activityId2`/impacts/dummyImpact/components/dummyComponent
		Then response code should be 201

	Scenario: Admin of group can update component
		Given I authenticate using email activitiesApiTests2_admin@amazon.com and password p@ssword1
		And I set body to {"value": 2,"type": "updated","description": "updated description","label": "updated label"}
		When I PATCH /activities/`activityId2`/impacts/dummyImpact/components/dummyComponent
		Then response code should be 200

	Scenario: Contributor of group can update component
		Given I authenticate using email activitiesApiTests1_contributor@amazon.com and password p@ssword1
		And I set body to {"value": 2,"type": "updated","description by contributor": "updated description","label": "updated label"}
		When I PATCH /activities/`activityContr1`/impacts/co2e2/components/co22
		Then response code should be 200

	Scenario: Contributor of group can get component
		Given I authenticate using email activitiesApiTests2_contributor@amazon.com and password p@ssword1
		When I GET /activities/`activityId2`/impacts/dummyImpact/components/dummyComponent
		Then response code should be 200
		And response body path $.value should be 2
		And response body path $.type should be updated
		And response body path $.description should be updated description
		And response body path $.label should be updated label

	Scenario: Contributor of group can list components
		Given I authenticate using email activitiesApiTests2_contributor@amazon.com and password p@ssword1
		When I GET /activities/`activityId2`/impacts/dummyImpact/components
		Then response code should be 200
		And response body path $.dummycomponent.key should be dummyComponent
		And response body path $.co2.key should be co2

	Scenario: Component update should have updated Impact
		Given I authenticate using email activitiesApiTests2_contributor@amazon.com and password p@ssword1
		When I GET /activities/`activityId2`/impacts/dummyImpact
		Then response code should be 200
		And response body path $.components.dummycomponent.key should be dummyComponent
		And response body path $.components.co2.key should be co2

	Scenario: Component update should have updated activity
		Given I authenticate using email activitiesApiTests2_contributor@amazon.com and password p@ssword1
		When I GET /activities/`activityId2`
		Then response code should be 200
		And response body path $.impacts.dummyimpact.components.dummycomponent.key should be dummyComponent
		And response body path $.impacts.dummyimpact.components.co2.key should be co2
		And response body path $.version should be 6

	Scenario: Teardown: Delete activity `activityContr1`
		Given I authenticate using email activitiesApiTests1_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		When I DELETE /activities/`activityContr1`
		Then response code should be 204
		When I GET /activities/`activityContr1`
		Then response code should be 404

	# Activity Task scenarios

	Scenario: Admin of group Should be able to create activity task
		Given I authenticate using email activitiesApiTests1_admin@amazon.com and password p@ssword1
		And I set body to {"type":"create","activities":[{"name":"activity_3","description":"excludes carbon sequestration","attributes":{"ref_unit":"therm"},"tags":{"level1Hierarchy":"emissions","source":"emissions"},"impacts":{"co2e":{"name":"CO2e","attributes":{"unit":"kg"},"components":{"co2":{"key":"co2","value":5.304733389,"type":"pollutant","description":"","label":""},"ch4":{"key":"ch4","value":0.002799332,"type":"pollutant","description":"","label":""},"n2o":{"key":"n2o","value":0.002649367,"type":"pollutant","description":"","label":""},"ipcc 2013 ar5 gwp 100":{"key":"IPCC 2013 AR5 GWP 100","value":5.310182088,"type":"impactFactor","description":"","label":""},"ipcc 2016 ar4 gwp 100":{"key":"IPCC 2016 AR4 GWP 100","value":4.310182088,"type":"impactFactor","description":"","label":""}}}}},{"name":"activity_4","description":"excludes carbon sequestration","attributes":{"ref_unit":"therm"},"tags":{"level1Hierarchy":"emissions","source":"emissions"},"impacts":{"co2e":{"name":"CO2e","attributes":{"unit":"kg"},"components":{"co2":{"key":"co2","value":5.304733389,"type":"pollutant","description":"","label":""},"ch4":{"key":"ch4","value":0.002799332,"type":"pollutant","description":"","label":""},"n2o":{"key":"n2o","value":0.002649367,"type":"pollutant","description":"","label":""},"ipcc 2013 ar5 gwp 100":{"key":"IPCC 2013 AR5 GWP 100","value":5.310182088,"type":"impactFactor","description":"","label":""},"ipcc 2016 ar4 gwp 100":{"key":"IPCC 2016 AR4 GWP 100","value":4.310182088,"type":"impactFactor","description":"","label":""}}}}}]}
		When I POST to /activityTasks
		Then response code should be 201
		And response body path $.taskStatus should be waiting
		And response body path $.batchesTotal should be 1
		And response body path $.batchesCompleted should be 0
		And response body path $.itemsTotal should be 2
		And response body path $.itemsSucceeded should be 0
		And response body path $.itemsFailed should be 0
		And I store the value of body path $.id as taskId in global scope

	Scenario: Contributor of group may get activityTask
		When I pause for 5000ms
		Given I authenticate using email activitiesApiTests1_contributor@amazon.com and password p@ssword1
		When I GET /activityTasks/`taskId`
		Then response code should be 200
		And response body path $.taskStatus should be success
		And response body path $.batchesTotal should be 1
		And response body path $.batchesCompleted should be 1
		And response body path $.itemsTotal should be 2
		And response body path $.itemsSucceeded should be 2
		And response body path $.itemsFailed should be 0
		And response body path $.progress should be 100

	Scenario: Contributor should be able to list activityTasks
		When I pause for 1000ms
		Given I authenticate using email activitiesApiTests1_contributor@amazon.com and password p@ssword1
		When I GET /activityTasks
		Then response code should be 200
		And response body path $.tasks should be of type array with length 1
		And response body path $.tasks[0].groups[0] should be /activitiesapitests1
		And response body path $.tasks[0].batchesTotal should be 1
		And response body path $.tasks[0].batchesCompleted should be 1

	Scenario: Should be able to list activities
		Given I authenticate using email activitiesApiTests1_contributor@amazon.com and password p@ssword1
		When I GET /activities
		Then response code should be 200
		And response body path $.activities should be of type array with length 3
		And response body path $.activities[0].groups[0] should be /activitiesapitests1
		And response body path $.activities[?(@.name=='activity_1')].name should be activity_1
		And response body path $.activities[?(@.name=='activity_3')].name should be activity_3
		And response body path $.activities[?(@.name=='activity_4')].name should be activity_4

	Scenario: Should be able to list activity by name (activity_3)
		Given I authenticate using email activitiesApiTests1_contributor@amazon.com and password p@ssword1
		When I GET /activities?name=activity_3
		Then response code should be 200
		And response body path $.activities should be of type array with length 1
		And response body path $.activities[0].groups[0] should be /activitiesapitests1
		And response body path $.activities[0].name should be activity_3
		And I store the value of body path $.activities[0].id as activityId4 in global scope

	Scenario: Should be able to list activity by name (activity_4)
		Given I authenticate using email activitiesApiTests1_contributor@amazon.com and password p@ssword1
		When I GET /activities?name=activity_4
		Then response code should be 200
		And response body path $.activities should be of type array with length 1
		And response body path $.activities[0].groups[0] should be /activitiesapitests1
		And response body path $.activities[0].name should be activity_4
		And I store the value of body path $.activities[0].id as activityId5 in global scope


	Scenario: Should be able to list activity task items by taskId
		Given I authenticate using email activitiesApiTests1_contributor@amazon.com and password p@ssword1
		When I GET /activityTasks/`taskId`/taskItems
		Then response code should be 200
		And response body path $.taskItems should be of type array with length 2
		And I store the value of body path $.taskItems[0].name as activityTaskItemName in global scope
		And response body path $.taskItems[?(@.name=='activity_3')].name should be activity_3
		And response body path $.taskItems[?(@.name=='activity_4')].name should be activity_4

	Scenario: Should be able to get activity status
		Given I authenticate using email activitiesApiTests1_contributor@amazon.com and password p@ssword1
		When I GET /activityTasks/`taskId`/taskItems/`activityTaskItemName`
		Then response code should be 200
		And response body path $.status should be success

	Scenario: updating activities with extraneous attributes should not persist those attributes
		Given I authenticate using email activitiesApiTests2_admin@amazon.com and password p@ssword1
		And I set body to {"hello": "world"}
		When I PATCH /activities/`lastActivityId`
		Then response code should be 200
		And response body should not contain $.hello

	Scenario: Teardown: Delete activity `activityId1`
		Given I authenticate using email activitiesApiTests1_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		When I DELETE /activities/`activityId1`
		Then response code should be 204
		When I GET /activities/`activityId1`
		Then response code should be 404

	Scenario: Teardown: Delete activity `activityId2`
		Given I authenticate using email activitiesApiTests2_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		When I DELETE /activities/`activityId2`
		Then response code should be 204
		When I GET /activities/`activityId2`
		Then response code should be 404

	Scenario: Teardown: Delete activity `activityId3`
		Given I authenticate using email activitiesApiTests2_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		When I DELETE /activities/`activityId3`
		Then response code should be 204
		When I GET /activities/`activityId3`
		Then response code should be 404

	Scenario: Teardown: Delete activity `activityId4`
		Given I authenticate using email activitiesApiTests1_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		When I DELETE /activities/`activityId4`
		Then response code should be 204
		When I GET /activities/`activityId4`
		Then response code should be 404

	Scenario: Teardown: Delete activity `activityId5`
		Given I authenticate using email activitiesApiTests1_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		When I DELETE /activities/`activityId5`
		Then response code should be 204
		When I GET /activities/`activityId5`
		Then response code should be 404


	Scenario: Teardown: Delete activity task `taskId`
		Given I authenticate using email activitiesApiTests1_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		When I DELETE /activityTasks/`taskId`
		Then response code should be 204
		When I GET /activityTasks/`taskId`
		Then response code should be 404

	Scenario: Teardown: Revoke users
		Given group /activitiesApiTests1 has user activitiesApiTests1_admin@amazon.com revoked
		And group /activitiesApiTests1 has user activitiesApiTests1_contributor@amazon.com revoked
		And group /activitiesApiTests2 has user activitiesApiTests2_admin@amazon.com revoked
		And group /activitiesApiTests2 has user activitiesApiTests2_contributor@amazon.com revoked

	Scenario: Teardown: Delete groups
		Given group /activitiesApiTests1 has been removed
		And group /activitiesApiTests2 has been removed
