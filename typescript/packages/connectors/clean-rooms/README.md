# AWS Clean Rooms Connector Overview

## Introduction

[AWS Clean Rooms](https://docs.aws.amazon.com/clean-rooms/latest/userguide/what-is.html) allows organizations to securely share data with approved collaborators without needing to share the underlying data. Examples of this include upstream suppliers, or downstream customers, using Clean Rooms to store and analyze their carbon emission data, then sharing the summary of this emission data with collaborators for use with calculating their scope 3 emissions. In terms of SIF, the use of Clean Rooms is as a collaborator (consumer of the shared data).

This connector allows one to create a pipeline that retrieves its input (activities) directly from an AWS Clean Rooms collaboration.

## Walkthrough

### Step 1: Setting up AWS Clean Rooms

For this step you need to already be part of an AWS Clean Rooms [collaboration](https://docs.aws.amazon.com/clean-rooms/latest/userguide/create-collaboration.html) as a [member](https://docs.aws.amazon.com/clean-rooms/latest/userguide/create-membership.html) (such as if a supplier/customer has already granted you access to a collaboration), or [set up your own](https://docs.aws.amazon.com/clean-rooms/latest/userguide/setting-up.html) AWS Clean Rooms collaboration which can be used just for this walkthrough. Once you have been added as a member to a collaboration you should be provided a `membershipIdentifier` which you will need later.

### Step 2: Defining the AWS Clean Rooms query

The Clean Rooms tables are queried via SQL, and that SQL query is what is needed by SIF. You can use the [Clean Rooms SQL code editor and/or Analysis builder UI](https://docs.aws.amazon.com/clean-rooms/latest/userguide/query-data.html) to first define and test the query to access the data you are after. This query will be specific to the data being shared.

As an example for the purpose of this walkthrough, let's assume that we need to query the daily total of emissions from a **configured table** named **emission** for a particular time range.

**Example Query**

```sql
SELECT SUM("amount") "amount", "date" FROM  "emission" WHERE  "date" > '2022-01-01' AND "date" < '2022-01-03'  GROUP BY "date"
```

**Example Results**
```csv
amount,date
175,2022-01-01
175,2022-01-02
175,2022-01-03
175,2022-01-04
```

### Step 3: Defining the pipeline

In this step we will be creating a pipeline that will query Clean Rooms to retrieve the requested activity data for processing. Some points of interest:

- `connectorConfig.input[0].parameters.query` represents the query from the previous step. As part of this we are defining `#dateTo` and `#dateFrom` parameters which we can inject the value to filter the data returned at point of execution.
- `transformer.parameters` represents the columns being returned from the query.

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
                    // We will make the date range configurable, so user can trigger multiple execution with different time range using the same pipeline
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
    "groups": [ "/" ],
    "createdBy": "<some-email>",
    "createdAt": "2023-06-15T02:14:22.402Z",
    "updatedAt": "2023-06-15T02:14:22.402Z",
    "version": 1,
    "state": "enabled"
}
```

### Step 4: Triggering the pipeline execution for a given date range

Now we will trigger an execution for the pipeline we had just created. What's important here are the parameters values we define as part of `connectorOverrides.sif-cleanRooms-pipeline-input-connector.parameters`:

- `membershipId`: the `membershipIdentifier` from step 1.
- `parameters.dateTo`: the value for the `#dateTo` parameter we defined as part of the SQL query in step 3.
- `parameters.dateFrom`: the value for the `#dateFrom` parameter we defined as part of the SQL query in step 3.

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

### Step 5: Waiting until the pipeline execution finishes

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

### Step 6: Query the activities generated by our pipeline

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
