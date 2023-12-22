# Kinesis Connector Overview

## Introduction

This connector gives organizations the ability to ingest streaming data by creating pipelines that use this connector.

## Walkthrough

### Step

### Step 1: Setting up the Pipeline

For this step you will need to setup your pipeline using the **kinesis-input-connector**

**Example Connector settings**
- `connectorConfig.input[0].parameters.useExistingDataStream` boolean value if true you must also supply dataStreamArn otherwise one will be created with the stack.
- `connectorConfig.input[0].parameters.kinesisDataStreamArn` if provided the connector will make use of the provided dataStream else it will create its own.
- `connectorConfig.input[0].parameters.bufferSize` The buffered record size in MB, must be between 0.2 - 3 .
- `connectorConfig.input[0].parameters.bufferInterval` The buffered record time in seconds, must be between 60 - 900 .
- `connectorConfig.input[0].parameters.handlebarsTemplate` The handlebars template to transform your input data. Refer to the [handlebars website](https://handlebarsjs.com/guide/) for details on how to construct your templates
- `connectorConfig.input[0].parameters.deploymentMethod` The type of deployment method used for this connector can be any of[`managed-sif`,`managed-pipeline`,`provided`].
- `connectorConfig.input[0].parameters.deploymentStatus` The deployment status of the connector can be any of ['deployed','failed'] and will be set during the connector setup
- `connectorConfig.input[0].parameters.blockDeploymentForUpdates` if set to true will block any stack deployments for pipeline updates
 recursive deployments of the connector.



```http request
POST /pipelines

Headers:
    Content-Type: application/json
    Accept: application/json
    Accept-Version: 1.0.0
    Authorization: <REPLACE_WITH_AUTH_TOKEN>

Body:
{
    "name": "pipeline_configured_with_input_connector,
    "description": "Pipeline processor test pipeline",
    "connectorConfig": {
        "input": [
            {
                "name": "sif-kinesis-pipeline-input-connector",
                "parameters": {
                    "deploymentMethod": "managed-pipeline",
                    "useExistingDataStream": false,
                    "handlebarsTemplate": "{ \"reading date\":  \"{{'reading date'}}\", \"a\": {{data}}, \"b\": {{b}}, \"c\": {{c}} }",
                    "bufferSize": 0.2,
                    "bufferInterval": 60
                }
            }
        ]
    },
    "attributes": {
        "type": "integration"
    },
    "transformer": {
        "transforms": [
            {
                "index": 0,
                "formula": "AS_TIMESTAMP(:reading date,'M/d/yy')",
                "outputs": [
                    {
                        "description": "Timestamp of business activity.",
                        "index": 0,
                        "key": "time",
                        "label": "Time",
                        "type": "timestamp"
                    }
                ]
            },
            {
                "index": 1,
                "formula": "AS_TIMESTAMP(:reading date,'M/d/yy', roundDownTo='month')",
                "outputs": [
                    {
                        "description": "Transform date to beginning of month.",
                        "index": 0,
                        "key": "month",
                        "label": "Month",
                        "type": "timestamp",
                        "aggregate": "groupBy"
                    }
                ]
            },
            {
                "index": 2,
                "formula": ":a",
                "outputs": [
                    {
                        "description": "Column A",
                        "index": 0,
                        "key": "a",
                        "label": "Column A",
                        "type": "string",
                        "includeAsUnique": true
                    }
                ]
            },
            {
                "index": 3,
                "formula": ":b*:c",
                "outputs": [
                    {
                        "description": "Column B multiplied by Column C",
                        "index": 0,
                        "key": "b*c",
                        "label": "B x C",
                        "type": "number",
                        "aggregate": "sum"
                    }
                ]
            }
        ],
        "parameters": [
            {
                "index": 0,
                "key": "reading date",
                "type": "string"
            },
            {
                "index": 1,
                "key": "a",
                "label": "A",
                "description": "Column A",
                "type": "string"
            },
            {
                "index": 2,
                "key": "b",
                "label": "Column B",
                "description": "Column B",
                "type": "number"
            },
            {
                "index": 3,
                "key": "c",
                "label": "Column C",
                "description": "Column C",
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
    "name": "pipeline_configured_with_input_connector,
    "description": "Pipeline processor test pipeline",
    "state": "disabled"
    "connectorConfig": {
        "input": [
            {
                "name": "sif-kinesis-pipeline-input-connector",
                "parameters": {
                    "deploymentMethod": "managed-pipeline",
                    "useExistingDataStream": false,
                    "handlebarsTemplate": "{ \"reading date\":  \"{{'reading date'}}\", \"a\": {{data}}, \"b\": {{b}}, \"c\": {{c}} }",
                    "bufferSize": 0.2,
                    "bufferInterval": 60
                }
            }
        ]
    },
    "attributes": {
        "type": "integration"
    },
    "transformer": {
        "transforms": [
            {
                "index": 0,
                "formula": "AS_TIMESTAMP(:reading date,'M/d/yy')",
                "outputs": [
                    {
                        "description": "Timestamp of business activity.",
                        "index": 0,
                        "key": "time",
                        "label": "Time",
                        "type": "timestamp"
                    }
                ]
            },
            {
                "index": 1,
                "formula": "AS_TIMESTAMP(:reading date,'M/d/yy', roundDownTo='month')",
                "outputs": [
                    {
                        "description": "Transform date to beginning of month.",
                        "index": 0,
                        "key": "month",
                        "label": "Month",
                        "type": "timestamp",
                        "aggregate": "groupBy"
                    }
                ]
            },
            {
                "index": 2,
                "formula": ":a",
                "outputs": [
                    {
                        "description": "Column A",
                        "index": 0,
                        "key": "a",
                        "label": "Column A",
                        "type": "string",
                        "includeAsUnique": true
                    }
                ]
            },
            {
                "index": 3,
                "formula": ":b*:c",
                "outputs": [
                    {
                        "description": "Column B multiplied by Column C",
                        "index": 0,
                        "key": "b*c",
                        "label": "B x C",
                        "type": "number",
                        "aggregate": "sum"
                    }
                ]
            }
        ],
        "parameters": [
            {
                "index": 0,
                "key": "reading date",
                "type": "string"
            },
            {
                "index": 1,
                "key": "a",
                "label": "A",
                "description": "Column A",
                "type": "string"
            },
            {
                "index": 2,
                "key": "b",
                "label": "Column B",
                "description": "Column B",
                "type": "number"
            },
            {
                "index": 3,
                "key": "c",
                "label": "Column C",
                "description": "Column C",
                "type": "number"
            }
        ]
    }
    "groups": [ "/" ],
    "createdBy": "<some-email>",
    "createdAt": "2023-06-15T02:14:22.402Z",
    "updatedAt": "2023-06-15T02:14:22.402Z",
    "version": 1
}
```

In the pipeline with kinesis connector created above, the handlebars template `{ \"reading date\":  \"{{'reading date'}}\", \"a\": {{data}}, \"b\": {{b}}, \"c\": {{c}} }` will transform the streaming data input
```json
{
  "reading date" : "1/4/22",
  "data" : "some string",
  "b" : 10,
  "c" : 100
}
```
into
```json
{
  "reading date" : "1/4/22",
  "a" : "some string",
  "b" : 10,
  "c" : 100
}
```

**What happens behind the scene**

The previous API call creates a pipeline with a disabled state.
The pipeline creation triggers an event that sets up the connector stack, once the stack has been setup the pipeline will be transitioned to an enabled state.

![Infrastructure deployment](./docs/kinesis_connector_infra.drawio.png?raw=true "Infrastructure deployment")

### Step 2: Validate the pipeline setup is complete

We need to verify that our connector stack has been setup.
To do this we can query the pipeline API with the pipelineId until its state changes to enabled.

**REQUEST**
```http request
GET /pipelines/<pipelineId>
```

**RESPONSE**

```http request
200 OK

{
    "id": "01h2yda6e2mrk8r4y5z6c4c499",
    "name": "pipeline_configured_with_input_connector,
    "description": "Pipeline processor test pipeline",
    "state": "disabled"
    "connectorConfig": {
        "input": [
            {
                "name": "sif-kinesis-pipeline-input-connector",
                "parameters": {
                    "deploymentMethod": "managed-pipeline",
                    "useExistingDataStream": false,
                    "handlebarsTemplate": "{ \"reading date\":  \"{{'reading date'}}\", \"a\": {{data}}, \"b\": {{b}}, \"c\": {{c}} }",
                    "bufferSize": 0.2,
                    "bufferInterval": 60
                }
            }
        ]
    },
    "attributes": {
        "type": "integration"
    },
    "transformer": {
        "transforms": [
            {
                "index": 0,
                "formula": "AS_TIMESTAMP(:reading date,'M/d/yy')",
                "outputs": [
                    {
                        "description": "Timestamp of business activity.",
                        "index": 0,
                        "key": "time",
                        "label": "Time",
                        "type": "timestamp"
                    }
                ]
            },
            {
                "index": 1,
                "formula": "AS_TIMESTAMP(:reading date,'M/d/yy', roundDownTo='month')",
                "outputs": [
                    {
                        "description": "Transform date to beginning of month.",
                        "index": 0,
                        "key": "month",
                        "label": "Month",
                        "type": "timestamp",
                        "aggregate": "groupBy"
                    }
                ]
            },
            {
                "index": 2,
                "formula": ":a",
                "outputs": [
                    {
                        "description": "Column A",
                        "index": 0,
                        "key": "a",
                        "label": "Column A",
                        "type": "string",
                        "includeAsUnique": true
                    }
                ]
            },
            {
                "index": 3,
                "formula": ":b*:c",
                "outputs": [
                    {
                        "description": "Column B multiplied by Column C",
                        "index": 0,
                        "key": "b*c",
                        "label": "B x C",
                        "type": "number",
                        "aggregate": "sum"
                    }
                ]
            }
        ],
        "parameters": [
            {
                "index": 0,
                "key": "reading date",
                "type": "string"
            },
            {
                "index": 1,
                "key": "a",
                "label": "A",
                "description": "Column A",
                "type": "string"
            },
            {
                "index": 2,
                "key": "b",
                "label": "Column B",
                "description": "Column B",
                "type": "number"
            },
            {
                "index": 3,
                "key": "c",
                "label": "Column C",
                "description": "Column C",
                "type": "number"
            }
        ]
    }
    "groups": [ "/" ],
    "createdBy": "<some-email>",
    "createdAt": "2023-06-15T02:14:22.402Z",
    "updatedAt": "2023-06-15T02:14:22.402Z",
    "version": 1
}
```
Notice that the state changed to enabled. signaling the connector setup is now complete.

### Step 3: Stream data to kinesis data stream
To use the connector you must publish data to the kinesis data stream via a producer. You can find a guide on how to build a producer [here](https://docs.aws.amazon.com/streams/latest/dev/building-producers.html)

**What happens behind the scene**

The following sequence diagram depicts what happens once you start publishing data to the kinesis data stream.

![Kinesis Connector Data Transformation](./docs/kinesis_connector_data_transformation.drawio.png?raw=true "Kinesis Connector Data Transformation")

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
        "sif-kinesis-pipeline-input-connector":{
                "parameters": {
                    "deploymentMethod": "manaed-pipeline",
                    "useExistingDataStream": false,
                    "handlebarsTemplate": "{ \"reading date\":  \"{{'reading date'}}\", \"a\": {{data}}, \"b\": {{b}}, \"c\": {{c}} }",
                    "bufferSize": 0.2,
                    "bufferInterval": 60
                }
        }
    },
    "status": "success",
    "groupContextId": "/",
    "updatedAt": "2023-06-15T02:30:05.046Z",
    "updatedBy": "sif-pipeline-execution"
}
```

### Step 5: Updating the connector
You can update the setting of the connectors at any time by updating the pipeline that created it

> Note: After the initial creation of the pipeline the connector parameter `blockDeploymentForUpdates` will be `true` to prevent changes from the pipeline accidentally updating the connector stack. This flag must be set to `false` to update the connector.

In the following example we want to increase the batch sizes we process this reduce our overall costs by reducing the number of invocations.
We will set our Buffer size to 3 MB and our Buffer interval to 5 Minutes. If you wanted our processing to be quicker set these values to a lower threshold

**REQUEST**

```http request
PATCH /pipelines/<REPLACE_WITH_PIPELINE_ID>

Headers:
    Content-Type: application/json
    Accept: application/json
    Accept-Version: 1.0.0
    Authorization: <REPLACE_WITH_AUTH_TOKEN>

Body:
{
    "name": "pipeline_configured_with_input_connector,
    "description": "Pipeline processor test pipeline",
    "connectorConfig": {
        "input": [
            {
                "name": "sif-kinesis-pipeline-input-connector",
                "parameters": {
                    "deploymentMethod": "managed-pipeline",
                    "useExistingDataStream": false,
                    "handlebarsTemplate": "{ \"reading date\":  \"{{'reading date'}}\", \"a\": {{data}}, \"b\": {{b}}, \"c\": {{c}} }",
                    "bufferSize": 3,
                    "bufferInterval": 300,
                    "blockDeploymentForUpdates": false
                }
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
    "name": "pipeline_configured_with_input_connector,
    "description": "Pipeline processor test pipeline",
	"state": "disabled"
    "connectorConfig": {
        "input": [
            {
                "name": "sif-kinesis-pipeline-input-connector",
                "parameters": {
                    "deploymentMethod": "managed-pipeline",
                    "useExistingDataStream": false,
                    "handlebarsTemplate": "{ \"reading date\":  \"{{'reading date'}}\", \"a\": {{data}}, \"b\": {{b}}, \"c\": {{c}} }",
                    "bufferSize": 0.5,
                    "bufferInterval": 120,
					"blockDeploymentForUpdates": false
                }
            }
        ]
    },
    "attributes": {
        "type": "integration"
    },
    "transformer": {
        "transforms": [
            {
                "index": 0,
                "formula": "AS_TIMESTAMP(:reading date,'M/d/yy')",
                "outputs": [
                    {
                        "description": "Timestamp of business activity.",
                        "index": 0,
                        "key": "time",
                        "label": "Time",
                        "type": "timestamp"
                    }
                ]
            },
            {
                "index": 1,
                "formula": "AS_TIMESTAMP(:reading date,'M/d/yy', roundDownTo='month')",
                "outputs": [
                    {
                        "description": "Transform date to beginning of month.",
                        "index": 0,
                        "key": "month",
                        "label": "Month",
                        "type": "timestamp",
                        "aggregate": "groupBy"
                    }
                ]
            },
            {
                "index": 2,
                "formula": ":a",
                "outputs": [
                    {
                        "description": "Column A",
                        "index": 0,
                        "key": "a",
                        "label": "Column A",
                        "type": "string",
                        "includeAsUnique": true
                    }
                ]
            },
            {
                "index": 3,
                "formula": ":b*:c",
                "outputs": [
                    {
                        "description": "Column B multiplied by Column C",
                        "index": 0,
                        "key": "b*c",
                        "label": "B x C",
                        "type": "number",
                        "aggregate": "sum"
                    }
                ]
            }
        ],
        "parameters": [
            {
                "index": 0,
                "key": "reading date",
                "type": "string"
            },
            {
                "index": 1,
                "key": "a",
                "label": "A",
                "description": "Column A",
                "type": "string"
            },
            {
                "index": 2,
                "key": "b",
                "label": "Column B",
                "description": "Column B",
                "type": "number"
            },
            {
                "index": 3,
                "key": "c",
                "label": "Column C",
                "description": "Column C",
                "type": "number"
            }
        ]
    }
    "groups": [ "/" ],
    "createdBy": "<some-email>",
    "createdAt": "2023-06-15T02:14:22.402Z",
    "updatedAt": "2023-06-15T02:16:22.402Z",
    "version": 3
}
```

### Step 5: Deleting the connector

To delete the connector you will need to delete its corresponding pipeline

**REQUEST**

```http
DELETE /pipelines/<REPLACE_WITH_PIPELINE_ID>>
Accept: application/json
Accept-Version: 1.0.0
Authorization: <INSERT TOKEN>
```
