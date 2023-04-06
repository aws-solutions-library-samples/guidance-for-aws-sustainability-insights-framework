# Pipeline Connectors

This document explains what are pipeline connectors and how they are configured.

## FAQS

### What are pipeline connectors ?

These connectors are a way to externalize the pre- and post-processing steps of the pipeline. A user could build a custom connector and configure them as pre- / post-processor for a pipeline or use the one managed by SIF itself i.e. sif-csv-pipeline-input-connector and sif-activity-pipeline-input-connector. When a pipeline is defined a connectorConfig specification is required to be configured for the pipeline to create one. The connectorConfig has 2 properties input and output. At least 1 input connector is required to be specified at the time of the creation of a pipeline.

### What are the 2 different types of connectors ?

Pipeline connectors are of 2 types, input and output, consider input connectors as a pre-processor and output connectors as post-processor for the pipeline. Today only input connectors are supported and there can only 1 input connector for a pipeline defined.

### What are the default connectors managed by SIF ?

There are 2 types of default connector managed by SIF which can be used to configure connectors on the pipeline.

- sif-csv-pipeline-input-connector (this connector is a csv pre-processor. If this connector is configured on the pipeline, a csv input file will be processed into sif compatible format before the execution of the pipeline)
- sif-activity-pipeline-input-connector (this connector is a pipeline integration connector. This connector can be used in a cascade type situation where 2 or more pipelines are interconnected together in a cascade )

### How are connectors configured on a pipeline ?

When defining a new pipeline a connector configuration should be specified within the pipeline configuration object.

#### EXAMPLE

```json
{
 ...
 "connectorConfig": {
  "input": [
   {
    "name": "sif-csv-pipeline-input-connector"
   }
  ]
 },
 ...
}
```

### How do I build my own connector ?

To crete a custom connector is fairly easy to do so. The connector integration mechanism involves consuming a connector integration EventBridge request event, uploading the transformed file to a pre-signed url provided in the request event and publishing a connector integration response event from the connector back to SIF.

To develop a new connector you can follow the sample input connector sample implementation at (`sif-core/samples/typescript/connectors/sample-pipeline-input-connector`).

## Walkthrough

### Pre-requisites

### Creating and Registering a new Connector

#### Connector Development

Refer to the [sample input connector documentation](../../../../../samples/typescript/connectors/sample-pipeline-input-connector/README.md) for the actual connector implementation.

#### Registering a Connector

REQUEST

```http
POST <PIPELINES_API>/connectors

Headers:
    Content-Type: application/json
    Accept: application/json
    Accept-Version: 1.0.0
    Authorization: <REPLACE_WITH_AUTH_TOKEN>

Body:
{
    "name": "custom-input-connector",
    "description": "description regarding the connector",
    "requiresFileUpload": "true",
    "type": "input",
    "parameters": [{
		"name": "parameter1",
		"defaultValue": "param1Value",
		"required": true,
		"description": "description related to parameter1"
	}]
}
```

RESPONSE

```sh
HTTP: 201 Created
Content-Type: application/json

{
	"createdAt": "2023-03-24T19:41:41.084Z",
	"createdBy": "someone@somewhere.com",
	"description": "description regarding the connector",
	"groups": [
		"/"
	],
	"isManaged": false,
	"id": "01gwaj87awnqahcdpqdb3ps6zp",
 	"name": "custom-input-connector",
    "parameters": [{
		"name": "parameter1",
		"defaultValue": "param1Value",
		"required": true,
		"description": "description related to parameter1"
	}]
	"requiresFileUpload": true,
	"type": "input"
}
```

### Updating an existing Connector

REQUEST

```shell
PATCH <PIPELINES_API>/connectors/{CONNECTOR_ID}

Headers:
    Content-Type: application/json
    Accept: application/json
    Accept-Version: 1.0.0
    Authorization: <REPLACE_WITH_AUTH_TOKEN>

Body:
{
    "description": "description updated"
}
```

RESPONSE

```sh
HTTP: 200 OK
Content-Type: application/json


{
	"createdAt": "2023-03-24T19:41:41.084Z",
	"createdBy": "someone@somewhere.com",
	"description": "description updated"
	"groups": [
		"/"
	],
	"isManaged": false,
	"id": "01gwaj87awnqahcdpqdb3ps6zp",
 	"name": "custom-input-connector",
    "parameters": [{
		"name": "parameter1",
		"defaultValue": "param1Value",
		"required": true,
		"description": "description related to parameter1"
	}]
	"requiresFileUpload": true,
	"type": "input"
}
```

### Listing Connectors

REQUEST

```shell
GET <PIPELINES_API>/connectors

Headers:
    Content-Type: application/json
    Accept: application/json
    Accept-Version: 1.0.0
    Authorization: <REPLACE_WITH_AUTH_TOKEN>
```

RESPONSE

```sh
HTTP: 200 OK
Content-Type: application/json

{
    "connectors": [{...connector}, {...connector}]
}
```

### Getting an existing Connector

REQUEST

```shell
GET <PIPELINES_API>/connectors/{CONNECTOR_ID}

Headers:
    Content-Type: application/json
    Accept: application/json
    Accept-Version: 1.0.0
    Authorization: <REPLACE_WITH_AUTH_TOKEN>
```

RESPONSE

```sh
HTTP: 200 OK
Content-Type: application/json

{
	"createdAt": "2023-03-24T19:41:41.084Z",
	"createdBy": "someone@somewhere.com",
	"description": "description regarding the connector",
	"groups": [
		"/"
	],
	"id": "01gwaj87awnqahcdpqdb3ps6zp",
 	"name": "custom-input-connector",
    "parameters": [{
		"name": "parameter1",
		"defaultValue": "param1Value",
		"required": true,
		"description": "description related to parameter1"
	}]
	"requiresFileUpload": true,
	"type": "input"
}

```

### Deleting an existing Connector

REQUEST

```shell
DELETE <PIPELINES_API>/connectors/{CONNECTOR_ID}

Headers:
    Content-Type: application/json
    Accept: application/json
    Accept-Version: 1.0.0
    Authorization: <REPLACE_WITH_AUTH_TOKEN>
```

RESPONSE

```sh
HTTP: 204 No Content
Content-Type: application/json

```
