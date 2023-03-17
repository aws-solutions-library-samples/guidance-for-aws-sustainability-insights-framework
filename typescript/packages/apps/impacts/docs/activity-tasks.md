# Activity Tasks

## Introduction

This module allows the user to create activities in bulk.

## REST API

Refer to the [Swagger](./swagger.json) for a detailed list of the available REST API endpoints.

## Walkthrough

### Pre-requisite

For this walkthrough, we assume that user had been logged in, has the right permission and the group context is set to `/group1` in the id token generated
by `Cognito`.

For more details access controls and permissions, look at the [Access Management](../../access-management/README.md) module.

### Example 1: Creating an activities Task

#### Request

You can create an activities in bulk as shown below:

```shell
POST /activityTasks
Accept: application/json
Accept-Version: 1.0.0
Authorization: <INSERT TOKEN>

body:
{
	"type": "create",
	"activities": [
		{
			"name": "1000112:Heatec1",
			"attributes": {
				"facilityName": "23rd and 3rd",
				"city": "BROOKLYN",
				"state": "NY",
				"primaryNaicsCode": "221112",
				"reportingYear": "2021",
				"industryTypeSectors": "Power Plants",
				"unitType": "PRH (Process Heater)",
				"unitReportingMethod": "Tier1/2/3"
			},
			"tags": {
				"facilityId": "1000112",
				"frsId": "110043809812",
				"unitName": "Heatec1"
			},
			"impacts": {
				"co2e": {
					"name": "CO2e",
					"components": {
						"co2": {
							"key": "CO2",
							"value": 84.4,
							"type": "pollutant"
						},
						"ch4": {
							"key": "CH4",
							"value": 0,
							"type": "pollutant"
						},
						"n2o": {
							"key": "N2O",
							"value": 0,
							"type": "pollutant"
						}
					}
				}
			}
		},
		{
			"name": "1000112:Heatec2",
			"attributes": {
				"facilityName": "23rd and 3rd",
				"city": "BROOKLYN",
				"state": "NY",
				"primaryNaicsCode": "221112",
				"reportingYear": "2021",
				"industryTypeSectors": "Power Plants",
				"unitType": "PRH (Process Heater)",
				"unitReportingMethod": "Tier1/2/3"
			},
			"tags": {
				"facilityId": "1000112",
				"frsId": "110043809812",
				"unitName": "Heatec2"
			},
			"impacts": {
				"co2e": {
					"name": "CO2e",
					"components": {
						"co2": {
							"key": "CO2",
							"value": 78.9,
							"type": "pollutant"
						},
						"ch4": {
							"key": "CH4",
							"value": 0,
							"type": "pollutant"
						},
						"n2o": {
							"key": "N2O",
							"value": 0,
							"type": "pollutant"
						}
					}
				}
			}
		},
		{
			"name": "1013701:GP-1",
			"attributes": {
				"facilityName": "30-30 Gas Plant",
				"city": "Plains",
				"state": "TX",
				"primaryNaicsCode": "211130",
				"reportingYear": "2021",
				"industryTypeSectors": "Injection of CO2, Petroleum and Natural Gas Systems",
				"unitType": "OCS (Other combustion source)",
				"unitReportingMethod": "Tier1/2/3"
			},
			"tags": {
				"facilityId": "1013701",
				"frsId": "undefined",
				"unitName": "GP-1"
			},
			"impacts": {
				"co2e": {
					"name": "CO2e",
					"components": {
						"co2": {
							"key": "CO2",
							"value": 16015.2,
							"type": "pollutant"
						},
						"ch4": {
							"key": "CH4",
							"value": 7.5,
							"type": "pollutant"
						},
						"n2o": {
							"key": "N2O",
							"value": 8.94,
							"type": "pollutant"
						}
					}
				}
			}
		}
	]
}
```

#### Response

```sh
HTTP: 201 OK
Content-Type: application/json

{
    "type": "create",
    "id": "01ght23j2ra2dspc9ak50a01e3",
 	"taskStatus": "waiting",
    "batchesTotal": 1,
    "batchesCompleted": 0,
    "itemsTotal": 3,
    "itemsSucceeded": 0,
    "itemsFailed": 0,
    "progress": 0,
    "groups": [
        "/"
    ],
    "createdAt": "2022-11-14T03:14:41.881Z",
    "createdBy": "someone@example.com"
}
```

### Example 2: Retrieving The Newly Created activities task

Using the activities creation task id from the previous example, you can then retrieve the activities creation task by issuing the following request:

#### Request

```shell
GET /activityTask/<taskId>
Accept: application/json
Accept-Version: 1.0.0
Authorization: <INSERT TOKEN>
```

#### Response

```shell
HTTP: 200 OK
Content-Type: application/json

{
    "type": "create",
    "id": "01ght23j2ra2dspc9ak50a01e3",
 	"taskStatus": "success",
    "batchesTotal": 1,
    "batchesCompleted": 1,
    "itemsTotal": 3,
    "itemsSucceeded": 1,
    "itemsFailed": 0,
    "progress": 100,
    "groups": [
        "/"
    ],
    "createdAt": "2022-11-14T03:14:41.881Z",
    "createdBy": "someone@example.com",
    "updatedAt": "2022-11-14T03:16:17.578Z",
    "updatedBy": "someone@example.com"
}

```

### Example 3: Listing Activities Task Items

The task items refers to the resolution to a particular task item to learn more about its status. For the above activities there will 3 task items created which can provide more insight into individual item status

#### Request
```shell
GET /activityTasks/<REPLACE_WITH_TASK_ID>/taskItems
Accept: application/json
Accept-Version: 1.0.0
Authorization: <INSERT TOKEN>
```

#### Response
```shell
HTTP: 200 OK
Content-Type: application/json

{
    "taskItems": [
        {
            "name": "test:activity:1",
            "taskId": "test:activity:1",
            "status": "failure",
            "statusMessage": "Name 'test:activity:1' already in use."
        },
        {...},
        ...
    ],
    "pagination": {
        "count": 20,
        "lastEvaluatedId": "test:activity:20"
    }
}
```

You can also filter the task items by its status, this is useful if you want to only know which task items failed or succeeded.

#### Request
```shell
GET /activityTasks/<REPLACE_WITH_TASK_ID>/taskItems?status=failure&count=20
Accept: application/json
Accept-Version: 1.0.0
Authorization: <INSERT TOKEN>
```

#### Response
```shell
HTTP: 200 OK
Content-Type: application/json

{
    "taskItems": [
        {
            "name": "test:activity:1",
            "taskId": "test:activity:1",
            "status": "failure",
            "statusMessage": "Name 'test:activity:1' already in use."
        },
        {...},
        ...
    ],
    "pagination": {
        "count": 20,
        "lastEvaluatedId": "test:activity:20"
    }
}
```

### Example 4: Listing All Activity tasks

If you create multiple activities tasks, you can list all of them by issuing the following commands:

#### Request

```shell
GET /activityTasks
Accept: application/json
Accept-Version: 1.0.0
Authorization: <INSERT TOKEN>
```

#### Response

```shell
HTTP: 200 OK
Content-Type: application/json
{
    "tasks": [{
    "type": "create",
    "id": "01ght23j2ra2dspc9ak50a01e3",
 	"taskStatus": "waiting",
    "batchesTotal": 1,
    "batchesCompleted": 0,
    "itemsTotal": 3,
    "itemsSucceeded": 0,
    "itemsFailed": 0,
    "progress": 0,
    "groups": [
        "/"
    ],
    "createdAt": "2022-11-14T03:14:41.881Z",
    "createdBy": "someone@example.com",
    "updatedAt": "2022-11-14T03:16:17.578Z",
    "updatedBy": "someone@example.com"
	}],
    "pagination": {
        "count": 1
    }
}

```
