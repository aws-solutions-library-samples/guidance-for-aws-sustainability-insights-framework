# Pipeline Processors Overview

## Introduction

This module handles the orchestration of processing the steps through a data pipeline. This includes verification of the format of the input data file and headers, mapping out calculation tasks to the Calculation Engine, and processing the
results. The module provides an API for the user to request a pre-signed S3 URL for upload of an input data file. The API also allows the user to query the status of the execution of the pipeline.

Once activities have been processed by a pipeline, the results as well as any related metrics can be queries using this module too.

## High-Level Architecture

Below is the high-level AWS architecture of the pipeline processor:

![hla](docs/images/PipelineProcessor.drawio.svg)

The above architecture shows the components of the pipeline processor. An API allowing the user to request pre-signed URLs for input file upload and errors file download are provided by API Gateway, Lambda, and DynamoDB. Execution of the
pipeline is carried out as multiple tasks within a StepFunction. An EventBridge event starts pipeline processing when an input file is uploaded. Pipeline calculations are executed through calls to the Calculation Engine module. The
activities processed by the Calculation Module have metrics (KPI's) pre-calculated per each organizational group.

The processor stepfunction defintion is shown below:

![stepfunction](docs/images/StepFunctionDefinition.drawio.svg)

The step function includes 4 tasks:

* `VerificationTask` - retrieval and validation of the input file versus the pipeline definition
* `CalculationTask` - delegating calculation tasks to multiple instances of the Calculator module running in parallel
* `ResultProcessingTask` - uploads error file to S3
* `AggregationTask` - calculates configured metrics (KPI's) configured as part of the pipeline definition, then rolls them up to the organizational group boundaries

## Processing Flow

Processing of a pipeline requires a pipeline to be defined using the [pipelines API](../pipelines/README.md). When a pipeline is created it is given a unique ID. Given this ID, the user can request an upload URL to upload a data file for
processing. When a file is uploaded an S3 event is published via an EventBridge Event Rule. This event is processed by a bucket events Lambda which filters for appropriate S3 events and starts the pipeline processor StepFunction.

Each execution of a pipeline is given a unique ID. This ID can be used by the pipeline processor API to track the status of the pipeline to completion. Once complete, the resulting output file can be retrieved from S3 by requesting a
download link from the pipeline processor API by supplying the pipeline ID and execution ID.

## Example API Calls

The swagger doc for the processor API can be found [here](docs/swagger.json). A swagger page can also be found by running the module locally (see [Developer Quickstart](../../../../docs/development/developer-quickstart.md)) and navigating
to `http://localhost:<SERVICE PORT>/swagger-docs`.

### Prerequisites

These examples are assumed to be executed against a deployed service with auth handled by Cognito. In order to invoke the API a user will first need to obtain a token with the desired group context.
See [Access Management](../access-management/README.md) for steps to obtain a token.

The steps below assume the user is operating with group context `/group1`.

### Executing a pipeline

You can run the pipeline in either `INLINE` or `JOB` pipeline mode. `INLINE` mode will run the pipeline synchronously and returns the result, but it has as limit of 100 (you can [configure](./src/api/executions/schemas.ts#L163) this limit but make sure that you size your lambda accordingly to avoid timeout)rows of data. You should use the `job` mode to process dataset larger
than that. The default execution mode is `JOB`.

#### Inline Mode

You can the command below to execute the `INLINE` mode:

```
POST /pipelines/<PIPELINE_ID_GOES_HERE>/executions

Headers:
    Accept-Version: 1.0.0
    Authorization: Bearer COGNITO_TOKEN_GOES_HERE

Body:

{
    "actionType": "create",
    "mode": "inline",
    "inlineExecutionOptions": {
        "inputs": [
            // list of your input data, object key should match the transformer parameter key
            {
                "date": "1/4/22",
                "type": "natural gas",
                "therms": 4510,
            }
        ]
    }
}
```

Returned payload will contain the outputs and errors when applying the transform function to the input rows:

```
{
	"actionType": "create",
	"createdAt": "2023-03-23T18:03:43.725Z",
	"createdBy": "someone@somewhere.com",
	"id": "01gw7t84qd9b9c8sd8xv4ec86t",
	"pipelineId": "01gw7t7pz6ehfhs60ea11qs21j",
	"pipelineVersion": 1,
	"connectorOverrides": {
		"my-custom-connector": {
			"parameters": {
				"key1": "val1"
			}
		}
	},
	"inlineExecutionOutputs": {
		// list of error encountered when processing the rows
	 	"errors": [],
	 	// list of output created by applying the transformation function to the input rows
	 	"outputs": []
	},
	"status": "success",
	"groupContextId": "/"
}
```

#### Job Mode

In job mode, the user can request a pre-signed URL to use to upload a data file for processing by that pipeline. There is an optional parameter to specify the expiry (in seconds) of the signed URL.

```
POST /pipelines/<PIPELINE_ID_GOES_HERE>/executions

Headers:
    Accept-Version: 1.0.0
    Authorization: Bearer COGNITO_TOKEN_GOES_HERE

Body:

{
    "expiration": 900,
    // optional
	"connectorOverrides": {
        "my-custom-connector": {
            "parameters": {
                "key1": "val1"
            }
        }
    }
}
```

Returned is the S3 URL to use in a file upload:

```json
{
	"actionType": "create",
	"createdAt": "2023-03-23T18:03:43.725Z",
	"createdBy": "someone@somewhere.com",
	"id": "01gw7t84qd9b9c8sd8xv4ec86t",
	"inputUploadUrl": "https://<bucket>.s3.us-east-1.amazonaws.com/pipelines/01gw7t7pz6ehfhs60ea11qs21j/executions/01gw7t84qd9b9c8sd8xv4ec86t/input/raw?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-C...",
	"pipelineId": "01gw7t7pz6ehfhs60ea11qs21j",
	"pipelineVersion": 1,
	"connectorOverrides": {
		"my-custom-connector": {
			"parameters": {
				"key1": "val1"
			}
		}
	},
	"status": "waiting",
	"groupContextId": "/"
}
```

*(example results - signed URL will be longer and contain actual credentials)*

An example cURL command to upload:

```sh
curl --upload-file ./my_local_data_file.csv 'https://s3-presigned-url-goes-here'
```

### List Executions for a Pipeline

Given the pipeline ID a user can list the executions of that pipeline. This will return execution IDs which can be used to track execution status as well as request a download URL to retrieve the output data file on successful pipeline
completion.

```
GET /pipelines/<PIPELINE_ID_GOES_HERE>/executions

Headers:
    Accept-Version: 1.0.0
    Authorization: Bearer COGNITO_TOKEN_GOES_HERE
```

Returned is a list of executions for the pipeline along with their execution IDs and status.

```json
{
	"executions": [
		{
			"id": "88b38bsvh",
			"createdAt": "2022-10-24T22:28:53.009Z",
			"updatedAt": "2022-10-24T22:29:12.115Z",
			"createdBy": "someone@example.com",
			"updatedBy": "someone@example.com",
			"status": "success"
		},
		{
			"id": "tqpjebdp9",
			"createdAt": "2022-10-24T22:31:16.702Z",
			"createdBy": "someone@example.com",
			"updatedBy": "someone@example.com",
			"status": "in_progress"
		}
	]
}
```

### Get Execution Status for an Execution of a Pipeline

Given the pipeline ID and execution ID a user can request the execution status.

```
GET /pipelines/<PIPELINE_ID_GOES_HERE>/executions/<PIPELINE_EXECUTION_ID_GOES_HERE>

Headers:
    Accept-Version: 1.0.0
    Authorization: Bearer COGNITO_TOKEN_GOES_HERE
```

Returned is pipeline metadata along with the executions status.

```json
{
	"id": "88b38bsvh",
	"createdAt": "2022-10-24T22:28:53.009Z",
	"updatedAt": "2022-10-24T22:29:12.115Z",
	"createdBy": "someone@example.com",
	"updatedBy": "someone@example.com",
	"status": "success"
}
```

### Viewing Pipeline Results

To view the results of a specific pipeline execution:

```
GET /activities
	?executionId=<PIPELINE_EXECUTION_ID>

Headers:
    Accept-Version: 1.0.0
    Authorization: Bearer COGNITO_TOKEN_GOES_HERE
```

Other variations of querying include:

- viewing the results of all executions for a pipeline, filtered by date:

```
GET /activities
	?pipelineId=<PIPELINE_ID>
	&dateFrom=01/12/22
	&dateTo=31/12/22
```

- viewing the results of all executions for a pipeline, filtered by specific attributes:

```
GET /activities
	?pipelineId=<PIPELINE_ID>
	&attributes=fuel:Lignite Coal,equipmentType:furnace
	&dateFrom=1/1/2022
```

Response includes processed pipeline activities:

```json
{
	"activities": [
		{
			"activityId": "",
			"date": "2022-01-02",
			"fuel": "Lignite Coal",
			"equipmentId": "furnace9",
			"equipmentType": "furnace",
			"co2": 101.0,
			"pipelineId": "",
			"executionId": "",
			"version": 3
		},
		...
	],
	"pagination": {
		"lastEvaluatedToken": "AJCUAOWSJKK..."
	}
}
```

- viewing the aggregated results of your pipeline execution (e.g. the pipeline is configured to sum the total of co2 emission for all equipments per month):

```
GET /activities
	?pipelineId=<PIPELINE_ID>
	&date=1/1/22
	&showAggregate=true
```

Response includes processed pipeline activities:

```json
{
	"activities": [
		{
			"activityId": "",
			"date": "2022-01-01",
			"co2": 10000,
			"pipelineId": "",
			"executionId": "",
			"version": 3
		},
		...
	],
	"pagination": {
		"lastEvaluatedToken": "AJCUAOWSJKK..."
	}
}
```

## Things to Note

- The pipeline csv input processing is tuned to handle ~1Mil rows of data comfortably. It could be further tuned based on the size of the input csv data files.

## Local Testing

Follow this [instruction](https://docs.aws.amazon.com/step-functions/latest/dg/sfn-local.html) to test the state machine locally.
