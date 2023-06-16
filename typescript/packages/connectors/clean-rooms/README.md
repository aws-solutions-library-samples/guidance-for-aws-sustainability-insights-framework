# AWS Clean Rooms Connector Overview

## Introduction

This module allows one to create a pipeline that sources its input from AWS Clean Rooms query execution.

## Walkthrough

### Step 1: Setting up AWS Clean Rooms

You need to [set up](https://docs.aws.amazon.com/clean-rooms/latest/userguide/setting-up.html) AWS Clean Rooms in the same account where SIF is deployed.

For this walkthrough example, we assume that you want to query the daily sum amount of emission from a **configured table** named **emission** given a particular time range.

**Query**

```sql
SELECT SUM("amount") "amount", "date" FROM  "emission" WHERE  "date" > '2022-01-01' AND "date" < '2022-01-03'  GROUP BY "date"
```

**Results**
```csv
amount,date
175,2022-01-01
175,2022-01-02
175,2022-01-03
175,2022-01-04
```

Make sure that you can run query above successfully as an AWS Clean Rooms [member](https://docs.aws.amazon.com/clean-rooms/latest/userguide/create-membership.html) in a [collaboration](https://docs.aws.amazon.com/clean-rooms/latest/userguide/create-collaboration.html), you need to specify the membershipId when triggering the pipeline execution.

### Step 2: Configuring the pipeline

In this step we will be creating a pipeline that will run `StartProtectedQuery` in AWS CleanRooms and store the results as Activities.

```http request
POST /pipelines

Headers:
    Content-Type: application/json
    Accept: application/json
    Accept-Version: 1.0.0
    Authorization: <REPLACE_WITH_AUTH_TOKEN>

Body:
{
    "name": "pipeline_configured_with_input_connector",
    "connectorConfig": {
        "input": [
            {
                "name": "sif-cleanRooms-pipeline-input-connector",
                "parameters": {
                    // We will make the date range configurable, so user can trigger multiple execution with differen time rannge using the same pipeline
                    "query": "SELECT SUM(\"amount\") \"amount\", \"date\" FROM  \"emission\" WHERE \"date\" < '#dateTo' AND \"date\" > '#dateFrom' GROUP BY \"date\""
                }
            }
        ]
    },
    "transformer": {
        "transforms": [
            {
                "index": 0,
                "formula": "AS_TIMESTAMP(:date,'yyyy-MM-dd')",
                "outputs": [
                    {
                        "description": "Timestamp of business activity.",
                        "index": 0,
                        "key": "date",
                        "label": "date",
                        "type": "timestamp"
                    }
                ]
            },
            {
                "index": 1,
                "formula": ":amount",
                "outputs": [
                    {
                        "index": 0,
                        "key": "sum",
                        "label": "sum",
                        "description": "sum of amount",
                        "type": "number"
                    }
                ]
            }
        ],
        "parameters": [
        	// the parameters will match the AWS Clean Rooms query output
            {
                "index": 0,
                "key": "date",
                "type": "string"
            },
            {
                "index": 1,
                "key": "amount",
                "label": "amount",
                "description": "amount value",
                "type": "number"
            }
        ]
    },
    "tags": {
        "feature": "pipeline_processor_cleanrooms"
    },
    "attributes": {
        "key1": "val",
        "key2": "val"
    }
}
```

**RESPONSE**

```http request
200 OK

{
    "id": "01h2yda6e2mrk8r4y5z6c4c499",
    "name": "pipeline_configured_with_input_connector",
    "connectorConfig": {
        "input": [
            {
                "name": "sif-cleanRooms-pipeline-input-connector",
                "parameters": {
                    "query": "SELECT SUM(\"amount\") \"amount\", \"date\" FROM  \"emission\" WHERE \"date\" < '#dateTo' AND \"date\" > '#dateFrom' GROUP BY \"date\""
                }
            }
        ]
    },
    "transformer": {
        "transforms": [
            {
                "index": 0,
                "formula": "AS_TIMESTAMP(:date,'yyyy-MM-dd')",
                "outputs": [
                    {
                        "description": "Timestamp of business activity.",
                        "index": 0,
                        "key": "date",
                        "label": "date",
                        "type": "timestamp"
                    }
                ]
            },
            {
                "index": 1,
                "formula": ":amount",
                "outputs": [
                    {
                        "index": 0,
                        "key": "sum",
                        "label": "sum",
                        "description": "sum of amount",
                        "type": "number"
                    }
                ]
            }
        ],
        "parameters": [
            {
                "index": 0,
                "key": "date",
                "type": "string"
            },
            {
                "index": 1,
                "key": "amount",
                "label": "amount",
                "description": "amount value",
                "type": "number"
            }
        ]
    },
    "tags": {
        "feature": "pipeline_processor_cleanrooms"
    },
    "attributes": {
        "key1": "val",
        "key2": "val"
    },

    "groups": [
        "/"
    ],
    "createdBy": "<some-email>",
    "createdAt": "2023-06-15T02:14:22.402Z",
    "updatedAt": "2023-06-15T02:14:22.402Z",
    "version": 1,
    "state": "enabled"
}
```

### Step 3: Triggering the pipeline execution for a given date range

Now we will trigger an execution for the pipeline we had just created.

**REQUEST**

```http request
POST /pipelines/<REPLACE_WITH_PIPELINE_ID>/executions

Headers:
    Content-Type: application/json
    Accept: application/json
    Accept-Version: 1.0.0
    Authorization: <REPLACE_WITH_AUTH_TOKEN>

Body:
{
    "actionType": "create",
    "mode": "job",
    "connectorOverrides" : {
        "sif-cleanRooms-pipeline-input-connector": {
            // Specify the membership id and the date range for the query
            "parameters" : {
                "membershipId": "<AWS Clean Rooms membership id>",
                "parameters" : {
                    "dateTo": "<dateTo>"
                    "dateFrom": "<dateFrom>"
                }
            }
        }
    }
}
```

**RESPONSE**

```http request
201 CREATED

{
    "actionType": "create",
    "createdAt": "2023-06-14T06:29:21.903Z",
    "createdBy": "<some-email>",,
    "id": "01h2w9gcbfphsbkqzjchkyjcpn",
    "pipelineId": "01h2yda6e2mrk8r4y5z6c4c499",
    "pipelineVersion": 1,
    "connectorOverrides": {
        "sif-cleanRooms-pipeline-input-connector": {
            "parameters": {
                "membershipId": "<AWS Clean Rooms membership id>",
                "parameters" : {
                    "dateTo": "<dateTo>"
                    "dateFrom": "<dateFrom>"
                }
            }
        }
    },
    "status": "waiting",
    "groupContextId": "/"
}
```

### Step 4: Waiting until the pipeline execution finishes

We query the pipeline execution endpoint to check for its completion status.

**REQUEST**

```shell
GET /pipelines/<REPLACE_WITH_PIPELINE_ID>/executions/<REPLACE_WITH_EXECUTION_ID>
Accept: application/json
Accept-Version: 1.0.0
Authorization: <INSERT TOKEN>
```

**RESPONSE**

```http request
200 OK

{
    "actionType": "create",
    "createdAt": "2023-06-15T02:28:47.914Z",
     "createdBy": "<some-email>",,
    "id": "01h2w9gcbfphsbkqzjchkyjcpn",
    "pipelineId": "01h2yda6e2mrk8r4y5z6c4c499",
    "pipelineVersion": 1,
    "connectorOverrides": {
        "sif-cleanRooms-pipeline-input-connector": {
            "parameters": {
                "membershipId": "<AWS Clean Rooms membership id>",
                "parameters" : {
                    "dateTo": "<dateTo>"
                    "dateFrom": "<dateFrom>"
                }
            }
        }
    },
    "status": "success",
    "groupContextId": "/cleanroomstest",
    "updatedAt": "2023-06-15T02:30:05.046Z",
    "updatedBy": "sif-pipeline-execution"
}
```

### Step 4: Query the activities generated by our pipeline

We query the activities endpoint to get the pipeline execution results.

**REQUEST**

```shell
GET /activities/pipelineId=<REPLACE_WITH_PIPELINE_ID>&dateFrom=<REPLACE_WITH_START_DATE>
Accept: application/json
Accept-Version: 1.0.0
Authorization: <INSERT TOKEN>
```

**RESPONSE**

```http request
200 OK

{
    "activities": [
        {
            "activityId": 348,
            "date": "2022-01-01T00:00:00.000Z",
            "pipelineId": "01h2yda6e2mrk8r4y5z6c4c499",
            "executionId": "01h2w9gcbfphsbkqzjchkyjcpn",
            "auditId": "f8e44e6f-9303-475e-ba14-1c7a88db6026",
            "createdAt": "2023-06-15T02:29:44.462Z",
            "sum": "175.000000"
        },
        {
            "activityId": 349,
            "date": "2022-01-02T00:00:00.000Z",
            "pipelineId": "01h2yda6e2mrk8r4y5z6c4c499",
            "executionId": "01h2w9gcbfphsbkqzjchkyjcpn",
            "auditId": "7de249b5-3261-45ed-883e-66bc91b0b63c",
            "createdAt": "2023-06-15T02:29:44.456Z",
            "sum": "175.000000"
        },
        {
            "activityId": 350,
            "date": "2022-01-03T00:00:00.000Z",
            "pipelineId": "01h2yda6e2mrk8r4y5z6c4c499",
            "executionId": "01h2w9gcbfphsbkqzjchkyjcpn",
            "auditId": "2c79562c-afd3-4eed-98e8-757ad213f0b9",
            "createdAt": "2023-06-15T02:30:13.355Z",
            "sum": "175.000000"
        },
        {
            "activityId": 351,
            "date": "2022-01-04T00:00:00.000Z",
            "pipelineId": "01h2yda6e2mrk8r4y5z6c4c499",
            "executionId": "01h2w9gcbfphsbkqzjchkyjcpn",
            "auditId": "7fbf9969-654a-4b10-b286-5b2b8b2ea577",
            "createdAt": "2023-06-15T02:30:13.353Z",
            "sum": "175.000000"
        }
    ]
}
```
